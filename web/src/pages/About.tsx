import { href } from "../app/router";
import { Manifest, fmtInt, fmtUtc, useData } from "../lib/data";
import { KLASS, Klass, KlassBadge } from "../lib/klass";
import type { InvestigationsDoc, LessonsDoc } from "../lib/types";

const REPO = "https://github.com/sauron666/zero-g-firewall";
const TYPE: Record<string, string> = { data: "data", document: "document", page: "web page", video: "video", guide: "guide" };

export function About({ manifest }: { manifest: Manifest | null }) {
  const classes = Object.keys(KLASS) as Klass[];
  const nasa = manifest?.nasa;
  const inv = useData<InvestigationsDoc>(nasa ? "investigations.json" : null);
  const res = useData<{ items: LessonsDoc["resources"] }>(nasa ? "official_resources.json" : null);
  const aside = (inv.data?.items ?? []).filter((i) => !i.scope.in_scope);
  const listed = (inv.data?.items ?? []).filter((i) => i.scope.in_scope).reduce((a, i) => a + (i.files?.bytes_listed ?? 0), 0);
  return (
    <div className="stack" style={{ ["--gap" as string]: "28px" }}>
      <div className="stack">
        <h1 className="page-title">Method and limits</h1>
        <p className="lede">
          Zero-G Firewall reads NASA's public microgravity combustion data, checks its models against NASA's own numbers and shows where the measurements end.
        </p>
      </div>

      <section className="panel">
        <h2 className="h2">Eight classes of content</h2>
        <p className="panel__sub">Every number and sentence carries one class, drawn as a glyph and a border style.</p>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead><tr><th>Mark</th><th>Code</th><th>What it means</th></tr></thead>
            <tbody>
              {classes.map((k) => (
                <tr key={k}><td><KlassBadge k={k} /></td><td className="mono">{KLASS[k].code}</td><td>{KLASS[k].meaning}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="panel">
          <h2 className="h2">Limits of the conclusions</h2>
          <ul className="prose" style={{ fontSize: "1.02rem", marginTop: 12, paddingLeft: 18, listStyle: "disc" }}>
            <li>Lunar and Martian gravity are bounded, not predicted: PSI holds no partial-gravity data yet.</li>
            <li>Results are observations and model bounds. No safety rating or probability is derived from them.</li>
            <li>No stored NASA document states what set off the smoke alarm on Artemis II, so the site leaves it open.</li>
            <li>A missing value stays missing.</li>
            <li>Alarm and cyber scenarios are synthetic and control nothing.</li>
          </ul>
        </div>
        <div className="panel">
          <h2 className="h2">How the data gets here</h2>
          <ol className="prose" style={{ fontSize: "1.02rem", marginTop: 12, paddingLeft: 20, listStyle: "decimal" }}>
            <li>A script fetches the PSI combustion search, each investigation, its experimental table and the official resources from NASA's servers.</li>
            <li>Every response is stored byte for byte with its address, SHA-256 and time, in a hash-chained ledger.</li>
            <li>Derived values are computed by code in the public repository. Models and scenarios are labelled as such.</li>
            <li>The site is static: it works offline, with no key and no server.</li>
          </ol>
        </div>
      </section>

      {nasa && (
        <section className="grid cols-2" id="scope">
          <div className="panel" data-klass="derived">
            <h2 className="h2">In scope</h2>
            <ul className="prose" style={{ fontSize: "1.02rem", marginTop: 12, paddingLeft: 18, listStyle: "disc" }}>
              <li>The {nasa.investigations_in_scope} combustion-science records among the {nasa.search_hits} that NASA's PSI repository returns for "combustion".{aside.length > 0 && <> Set aside, and still listed: {aside.map((i, k) => <span key={i.accession}>{k ? "; " : ""}<a href={href(`/evidence/${i.accession}`)}>{i.accession}</a> ({i.scope.reason})</span>)}.</>}</li>
              <li>Their {nasa.tables} experimental tables, {fmtInt(nasa.table_rows)} rows, as NASA wrote them.</li>
              <li>The {nasa.official_resources_total} resources of the challenge's own list, and the NASA pages and reports named on the pages that quote them.</li>
              <li>Models whose inputs and assumptions are on the page, each checked against NASA's numbers where NASA gives any.</li>
            </ul>
          </div>
          <div className="panel">
            <h2 className="h2">Out of scope</h2>
            <ul className="prose" style={{ fontSize: "1.02rem", marginTop: 12, paddingLeft: 18, listStyle: "disc" }}>
              <li>The image and video archives behind the records{listed > 0 ? `, ${(listed / 1e12).toFixed(1)} terabytes as PSI lists them` : ""}. The site shows each record's file list and size and does not fetch the archives.</li>
              <li>Experiments that are not in PSI. The <a href={href("/gaps")}>gaps page</a> names the ones NASA plans or has flown.</li>
              <li>Anything not published by NASA, and any copy of NASA's data from another team or mirror.</li>
              <li>Fire behaviour in lunar or Martian gravity. Nothing in PSI was measured there, so the site bounds it and predicts nothing.</li>
            </ul>
          </div>
        </section>
      )}

      {res.data && (
        <section className="panel" id="sources" data-klass="literature">
          <h2 className="h2">Sources</h2>
          <p className="panel__sub">The challenge's Resources list. A resource counts as used only if its file is in the ledger and a page draws on it.</p>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead><tr><th>No.</th><th>Resource</th><th>Kind</th><th className="r">Ledger entry</th><th style={{ paddingLeft: 18 }}>Used on</th></tr></thead>
              <tbody>
                {res.data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.id}</td>
                    <td className="strong"><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></td>
                    <td>{TYPE[r.type] ?? r.type}</td>
                    <td className="r num">{r.in_ledger ? r.receipts.map((x) => x.ledger_seq).slice(0, 3).join(", ") + (r.receipts.length > 3 ? ` and ${r.receipts.length - 3} more` : "") : "not fetched"}</td>
                    <td style={{ paddingLeft: 18 }}>{r.used_in.map((u, k) => <span key={u.page + k}>{k ? ", " : ""}<a href={href(u.page)} title={u.what}>{u.page.replace("/", "")}</a></span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            All {fmtInt(nasa?.files_in_ledger ?? 0)} files fetched from NASA are in the <a href={href("/ledger")}>evidence ledger</a> with address, SHA-256 and time.
            {nasa?.quotes ? ` ${nasa.quotes_verified} of ${nasa.quotes} quotations on this site were found word for word in the stored documents at the last build.` : ""}
          </p>
        </section>
      )}

      <section className="panel">
        <h2 className="h2">Development and methodology</h2>
        <p className="prose" style={{ fontSize: "1.02rem", marginTop: 10 }}>
          Zero-G Firewall combines NASA experimental datasets, reproducible computational models and interactive visualizations. AI-assisted development tools were used during implementation.
          Source data, derived results and simulated scenarios are identified separately.
        </p>
        <p className="note" style={{ marginTop: 10 }}>
          Full methodology and development notes are in the <a href={`${REPO}/tree/main/docs`} target="_blank" rel="noreferrer">repository</a>: design, data contracts, decisions, test status and <a href={`${REPO}/blob/main/docs/AI_USE.md`} target="_blank" rel="noreferrer">AI use</a>.
        </p>
      </section>

      <section className="panel">
        <h2 className="h2">This build</h2>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Built</dt><dd>{manifest ? fmtUtc(manifest.built_at_utc) : "unknown"}</dd>
          <dt>Data schema</dt><dd className="mono">{manifest?.schema ?? "unknown"}</dd>
          <dt>NASA sync</dt><dd>{manifest?.nasa ? fmtUtc(manifest.nasa.synced_at_utc) : "not yet derived in this build"}</dd>
          <dt>Artifacts</dt><dd>{manifest ? Object.keys(manifest.artifacts).length : 0} files, each listed with its SHA-256 in manifest.json</dd>
        </dl>
      </section>
    </div>
  );
}
