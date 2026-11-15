import { ReleaseCheck } from "../components/ReleaseCheck";
import { useEffect, useMemo, useState } from "react";
import { fmtBytes, fmtInt, fmtUtc, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { canHash, ChainResult, parseLedger, Tamper, tamper, verifyChain } from "../lib/ledger";
import { emit } from "../mascot/bus";
import type { LedgerEntry, LedgerIndex } from "../lib/types";
import { useReceipt } from "../components/Receipt";
import { IconCheck, IconWarn } from "../components/icons";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/ledger");
const KIND: Record<string, string> = {
  psi_search: "PSI search result", psi_meta: "PSI metadata record", psi_file: "PSI data file", psi_thumb: "PSI thumbnail",
  official: "Official resource of the challenge", official_child: "Page linked from an official resource", extra: "Supporting NASA page",
  ntrs_record: "NASA technical report record", ntrs_fulltext: "NASA technical report, full text",
};
const PAGE = 50;
const what = (e: LedgerEntry) => e.file_name ?? e.doc_id ?? (e.accession ? `${e.accession} record` : e.ntrs_id ? `NTRS ${e.ntrs_id}` : e.term ? `search "${e.term}"` : e.key);

async function sha256Bytes(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Ledger({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const idx = useData<LedgerIndex>(ready ? "ledger_index.json" : null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [files, setFiles] = useState<{ ok: number; bad: string[]; total: number } | null>(null);
  const [filesBusy, setFilesBusy] = useState(false);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [usedOnly, setUsedOnly] = useState(false);
  const [forged, setForged] = useState<{ what: string; result: ChainResult; how: Tamper } | null>(null);
  const [forging, setForging] = useState(false);
  const [page, setPage] = useState(0);
  const open = useReceipt();

  useEffect(() => {
    if (!ready) return;
    let live = true;
    fetch("./data/v1/ledger.jsonl", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => live && setText(t)).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [ready]);

  const parsed = useMemo(() => (text ? parseLedger(text) : null), [text]);
  const used = useMemo(() => new Set(idx.data?.used ?? []), [idx.data]);
  const rows = useMemo(() => {
    if (!parsed) return [];
    const needle = q.trim().toLowerCase();
    return parsed.entries.filter((e) => (kind === "all" || e.kind === kind) && (!usedOnly || used.has(e.seq)) &&
      (!needle || `${e.key} ${e.url} ${e.sha256}`.toLowerCase().includes(needle)));
  }, [parsed, kind, q, usedOnly, used]);
  useEffect(() => setPage(0), [kind, q, usedOnly]);

  if (!ready) return <Waiting route={route} manifest={manifest} />;
  const head = idx.data?.head ?? manifest?.nasa?.ledger_head ?? "";

  const runChain = async () => {
    if (!parsed) return;
    setChain(null);
    setProgress(0);
    const r = await verifyChain(parsed.lines, setProgress);
    setProgress(null);
    setChain(r);
    if (r.ok) emit({ type: "SUCCESS", text: "The chain holds." });
  };
  const runTamper = async (how: Tamper) => {
    if (!parsed) return;
    setForging(true);
    const at = Math.floor(parsed.lines.length / 2);                       // an entry in the middle, so that half the chain holds and half does not
    const t = await tamper(parsed.lines, at, how);
    setForged({ what: t.what, how, result: await verifyChain(t.lines) });
    setForging(false);
  };
  const runFiles = async () => {
    if (!manifest) return;
    setFilesBusy(true);
    const names = Object.keys(manifest.artifacts);
    const bad: string[] = [];
    let ok = 0;
    for (const n of names) {
      try {
        const r = await fetch("./data/v1/" + n, { cache: "no-cache" });
        if (r.ok && (await sha256Bytes(await r.arrayBuffer())) === manifest.artifacts[n].sha256) ok++;
        else bad.push(n);
      } catch { bad.push(n); }
      setFiles({ ok, bad: [...bad], total: names.length });
    }
    setFilesBusy(false);
  };
  const receipt = (e: LedgerEntry) => open({
    title: `Ledger entry ${e.seq}: ${what(e)}`, klass: "observed",
    rows: [
      ["what", KIND[e.kind] ?? e.kind], ...(e.accession ? [["PSI record", e.accession] as [string, React.ReactNode]] : []),
      ["fetched from", <a href={e.url} target="_blank" rel="noreferrer">{e.url}</a>],
      ...(e.final_url && e.final_url !== e.url ? [["served from", e.final_url] as [string, React.ReactNode]] : []),
      ["fetched at", fmtUtc(e.retrieved_at_utc)], ["server said", `${e.status ?? ""} ${e.content_type ?? ""}`.trim()],
      ...(e.last_modified ? [["last modified at NASA", e.last_modified] as [string, React.ReactNode]] : []),
      ["size", `${fmtInt(e.size)} bytes`], ["SHA-256 of the file", <span className="hash">{e.sha256}</span>],
      ...(e.psi_file_version != null ? [["PSI file version", String(e.psi_file_version)] as [string, React.ReactNode]] : []),
      ...(e.doi ? [["DOI of the record", e.doi] as [string, React.ReactNode]] : []),
      ["previous entry's hash", <span className="hash">{e.prev_hash}</span>], ["this entry's hash", <span className="hash">{e.entry_hash}</span>],
      ["used by the site", used.has(e.seq) ? "yes, this build read it" : "no; it stays in the ledger as fetched"],
    ],
  });

  return (
    <div className="stack" style={{ ["--gap" as string]: "22px" }}>
      <h1 className="page-title">Evidence ledger</h1>
      <p className="lede">
        Every NASA file behind this site was fetched during the event and written to a ledger: address, time and SHA-256, each entry chained to the one before.
        Change one byte anywhere and the chain breaks. You can re-compute it here.
      </p>
      <ReleaseCheck />

      <section className="panel" data-klass="observed">
        <div className="statline" style={{ marginBottom: 18 }}>
          <div><div className="stat__label">Entries</div><div className="stat__value">{idx.data ? fmtInt(idx.data.entries) : "…"}</div><div className="stat__note">{idx.data ? `${fmtInt(idx.data.used.length)} read by this build` : ""}</div></div>
          <div><div className="stat__label">Bytes with a receipt</div><div className="stat__value">{manifest?.nasa ? fmtBytes(manifest.nasa.bytes_in_ledger) : "…"}</div><div className="stat__note">as fetched from NASA</div></div>
          <div><div className="stat__label">First fetch</div><div className="stat__value" style={{ fontSize: "var(--t-18)", paddingTop: 8 }}>{idx.data ? fmtUtc(idx.data.first_utc) : "…"}</div><div className="stat__note">during the event</div></div>
          <div><div className="stat__label">Last fetch</div><div className="stat__value" style={{ fontSize: "var(--t-18)", paddingTop: 8 }}>{idx.data ? fmtUtc(idx.data.last_utc) : "…"}</div><div className="stat__note">{idx.data ? `${fmtInt(idx.data.not_in_cache)} early fetches are not used` : ""}</div></div>
        </div>
        <dl className="kv" style={{ marginBottom: 16 }}>
          <dt>Head of the chain</dt><dd className="hash">{head}</dd>
          <dt>Rule</dt><dd>{idx.data?.hash_rule ?? ""}</dd>
        </dl>
        <div className="row" style={{ ["--gap" as string]: "12px" }}>
          <button type="button" className="btn btn--primary" disabled={!parsed || progress != null || !canHash()} onClick={runChain}>Re-compute the chain in this browser</button>
          <button type="button" className="btn btn--quiet" disabled={!manifest || filesBusy || !canHash()} onClick={runFiles}>Check the site's data files against their hashes</button>
          <a className="src-btn" href="./data/v1/ledger.jsonl" target="_blank" rel="noreferrer">Open the raw ledger</a>
        </div>
        {!canHash() && <p className="note" style={{ marginTop: 10 }}>This page is not in a secure context, so the browser cannot hash here. The pipeline verified the chain when the site was built.</p>}
        {err && <p className="note" style={{ marginTop: 10 }}>The ledger file could not be loaded: {err}</p>}
        {progress != null && parsed && <div className="progress" style={{ marginTop: 14 }}><i style={{ width: `${(100 * progress) / parsed.lines.length}%` }} /></div>}
        {chain && (
          <p className="verdict-line" style={{ marginTop: 14 }} role="status">
            {chain.ok ? <IconCheck size={20} /> : <IconWarn size={20} />}
            {chain.ok
              ? <span><b>{fmtInt(chain.checked)} of {fmtInt(chain.checked)} entries re-computed in this browser.</b> The head {chain.head === head ? "matches the one recorded when the site was built" : "differs from the one recorded when the site was built"}.</span>
              : <span><b>The chain breaks at entry {chain.brokenAt}:</b> {chain.reason}. {fmtInt(chain.checked)} entries before it hold.</span>}
          </p>
        )}
        {files && (
          <p className="verdict-line" style={{ marginTop: 10 }} role="status">
            {files.bad.length === 0 ? <IconCheck size={20} /> : <IconWarn size={20} />}
            <span><b>{files.ok} of {files.total} data files match the hashes in the manifest{filesBusy ? " so far" : ""}.</b>{files.bad.length > 0 ? ` Not matching: ${files.bad.slice(0, 5).join(", ")}.` : ""}</span>
          </p>
        )}
      </section>

      <section className="panel" data-klass="synthetic">
        <div className="panel__head"><div><h2 className="panel__title">Try to tamper with it</h2>
          <p className="panel__sub">A copy of the ledger is changed in this browser's memory and checked again. The real ledger and NASA's files are not touched.</p></div><KlassBadge k="synthetic" note="a changed copy" /></div>
        <div className="row" style={{ ["--gap" as string]: "10px" }}>
          <button type="button" className="btn btn--quiet btn--sm" disabled={!parsed || forging || !canHash()} onClick={() => runTamper("byte")}>Change one character of a file hash</button>
          <button type="button" className="btn btn--quiet btn--sm" disabled={!parsed || forging || !canHash()} onClick={() => runTamper("remove")}>Remove an entry</button>
          <button type="button" className="btn btn--quiet btn--sm" disabled={!parsed || forging || !canHash()} onClick={() => runTamper("rehash")}>Change it and recompute that entry's hash</button>
        </div>
        {forged && (
          <p className="verdict-line" style={{ marginTop: 14 }} role="status">
            <IconWarn size={20} />
            <span>{forged.what} <b>The chain breaks at entry {forged.result.brokenAt}:</b> {forged.result.reason}. {fmtInt(forged.result.checked)} entries before it still hold; the {parsed ? fmtInt(parsed.lines.length - forged.result.checked) : ""} after it are no longer anchored.
              {forged.how === "rehash" ? " Recomputing one entry is not enough: every later entry would have to be rewritten too, and the head recorded in the site's manifest would no longer match." : ""}</span>
          </p>
        )}
      </section>

      {idx.data && (
        <section>
          <div className="section__head"><h2 className="h2">What was fetched</h2><KlassBadge k="observed" note="counts from the ledger" /></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kind</th><th className="r">Entries</th><th className="r">Size</th></tr></thead>
              <tbody>{Object.entries(idx.data.by_kind).map(([k, v]) => (
                <tr key={k}><td>{KIND[k] ?? k}</td><td className="r num">{fmtInt(v.entries)}</td><td className="r num">{fmtBytes(v.bytes)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 8, maxWidth: "88ch" }}>{idx.data.note}</p>
        </section>
      )}

      <section>
        <div className="section__head"><h2 className="h2">Entries</h2><span className="note">{fmtInt(rows.length)} shown</span></div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <label className="search"><span className="sr">Search the ledger</span>
            <input type="search" placeholder="Search a record, a file name, an address or a hash" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label><span className="sr">Kind</span>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All kinds</option>
              {Object.keys(idx.data?.by_kind ?? {}).map((k) => <option key={k} value={k}>{KIND[k] ?? k}</option>)}
            </select></label>
          <label className="row" style={{ ["--gap" as string]: "8px", fontSize: 13 }}><input type="checkbox" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} />Only files this build read</label>
        </div>
        {!parsed && !err && <p className="note">Loading the ledger…</p>}
        {parsed && (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>No.</th><th>Fetched, UTC</th><th>What</th><th>Kind</th><th className="r">Size</th><th>SHA-256</th><th>Read</th></tr></thead>
                <tbody>
                  {rows.slice(page * PAGE, (page + 1) * PAGE).map((e) => (
                    <tr key={e.seq}>
                      <td className="num"><button type="button" className="linkish" onClick={() => receipt(e)} title="Open the receipt">{e.seq}</button></td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{e.retrieved_at_utc.replace("T", " ").replace("Z", "")}</td>
                      <td style={{ maxWidth: 420, overflowWrap: "anywhere" }}>{what(e)}</td>
                      <td className="note">{KIND[e.kind] ?? e.kind}</td>
                      <td className="r num">{fmtBytes(e.size)}</td>
                      <td className="hash" title={e.sha256}>{e.sha256.slice(0, 16)}…</td>
                      <td>{used.has(e.seq) ? <IconCheck size={15} /> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--quiet btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Earlier</button>
              <span className="num">{rows.length ? page * PAGE + 1 : 0} to {Math.min((page + 1) * PAGE, rows.length)} of {fmtInt(rows.length)}</span>
              <button type="button" className="btn btn--quiet btn--sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Later</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
