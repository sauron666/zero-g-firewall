import { useEffect, useMemo, useState } from "react";
import { href } from "../app/router";
import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { missionBrief } from "../lib/brief";
import { comparability, normalise, rankAll, stability } from "../lib/rank";
import type { GapsDoc, RankDoc } from "../lib/types";
import { emit } from "../mascot/bus";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/rank");
const DRAWS = 500;
const pct = (x: number) => `${Math.round(100 * x)}%`;
/** A share that is not exactly one must never read as 100%. */
const share = (x: number) => (x === 1 ? "100%" : x > 0.995 ? `${(Math.floor(1000 * x) / 10).toFixed(1)}%` : pct(x));

export function Rank({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const d = useData<RankDoc>(ready ? "rank_features.json" : null);
  const gaps = useData<GapsDoc>(ready ? "gaps.json" : null);
  const [copied, setCopied] = useState(false);
  const [lensId, setLensId] = useState(route.segs[1] ?? "lunar");
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const lens = d.data?.lenses.find((l) => l.id === lensId) ?? d.data?.lenses[0];
  const lensGravity = lens?.gravity;
  useEffect(() => { if (lensGravity) emit({ type: "CONTEXT", g: lensGravity === "partial" ? (lensId === "mars" ? 0.3794 : 0.1654) : 0, source: "mission" }); }, [lensGravity, lensId]);
  useEffect(() => { if (lens) setWeights({ ...lens.weights }); }, [lens?.id]);
  const w = weights ?? lens?.weights ?? {};
  const ranked = useMemo(() => (d.data && lens ? rankAll(d.data, lens.id, w) : []), [d.data, lens?.id, w]);
  const stab = useMemo(() => (d.data && lens ? stability(d.data, lens.id, w, DRAWS) : null), [d.data, lens?.id, w]);

  if (!ready) return <Waiting route={route} manifest={manifest} />;
  if (d.error) return <div className="empty"><p className="empty__title">The ranking features could not be loaded</p><p style={{ marginTop: 6 }}>{d.error}</p></div>;
  if (!d.data || !lens) return <p className="note">Loading…</p>;
  const doc = d.data;
  const wn = normalise(w);
  const always = ranked.filter((r) => (stab?.get(r.item.accession)?.top ?? 0) === 1).slice(0, 5);
  const shaky = ranked.slice(0, 5).filter((r) => (stab?.get(r.item.accession)?.top ?? 0) < 1);
  const noneFull = lens.gravity === "partial";
  const cmp = ranked.filter((r) => picked.includes(r.item.accession));
  const changed = Object.keys(lens.weights).some((k) => Math.abs((w[k] ?? 0) - lens.weights[k]) > 1e-9);
  const brief = () => missionBrief({ doc, lens, weights: w, ranked, stab, draws: DRAWS, gaps: gaps.data, manifest, changed });

  return (
    <div className="stack" style={{ ["--gap" as string]: "22px" }}>
      <h1 className="page-title">Rank for a mission</h1>
      <p className="lede">
        Which investigations should the designer of a mission read first? The order below is a weighted sum of ten stated factors, each computed from NASA's tables and records.
        Change the mission or the weights and see what moves, and how firmly the top five hold.
      </p>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Mission">
          {doc.lenses.map((l) => <button key={l.id} type="button" aria-pressed={l.id === lens.id} onClick={() => { setLensId(l.id); setOpen(null); emit({ type: "NOTE", text: `Ranked for: ${l.name.toLowerCase()}.` }); }}>{l.name}</button>)}
        </div>
      </div>
      <p className="note" style={{ fontSize: 14 }}>
        {lens.about} Atmosphere{lens.atmospheres.length > 1 ? "s" : ""} looked for: {lens.atmospheres.map((a) => `${a[0]} (${a[2].toFixed(1)} kPa)`).join(" or ")}.
        {noneFull && " No record can score 1 on gravity here: PSI holds no test in lunar or Martian gravity."}
        {" "}<a href={`${href("/envelope")}?mission=${lens.id}`}>See {lens.atmospheres.length > 1 ? "these atmospheres" : "this atmosphere"} among the tests</a>
      </p>
      <div className="row" style={{ ["--gap" as string]: "8px" }}>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => {
          const url = URL.createObjectURL(new Blob([brief()], { type: "text/markdown" }));
          const a = document.createElement("a");
          a.href = url; a.download = `zgf_brief_${lens.id}.md`;
          document.body.appendChild(a); a.click(); a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        }}>Save a brief for this mission</button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => { navigator.clipboard?.writeText(brief()).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => setCopied(false)); }}>{copied ? "Copied" : "Copy it"}</button>
        <span className="note">Markdown: what to read first and why, what is unmeasured, the weights, the ledger head.</span>
      </div>

      <div className="rankgrid">
        <section>
          <div className="rankrow rankrow--head"><span>No.</span><span>Investigation</span><span>Score, out of 100</span><span className="r" title={`Share of ${DRAWS} seeded changes of the weights in which the record stays in the top five`}>Stays in top 5</span><span className="r">Compare</span></div>
          {ranked.map((r) => {
            const s = stab?.get(r.item.accession);
            const isOpen = open === r.item.accession;
            return (
              <div key={r.item.accession} className={`rankitem ${r.rank === 5 ? "rankitem--cut" : ""}`}>
                <div className="rankrow">
                  <span className="num rank__no">{r.rank}</span>
                  <button type="button" className="rank__name" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.item.accession)}>
                    <span className={`gdot gdot--${r.item.gravity}`} aria-hidden="true" />
                    <span><b>{r.item.acronym || r.item.accession}</b> <span className="rec__acc">{r.item.accession}</span><br /><span className="rec__sub">{r.item.title}</span></span>
                  </button>
                  <span className="rank__bar" title={`${(100 * r.total).toFixed(1)} of 100`}><i style={{ width: pct(r.total) }} /><span className="num">{(100 * r.total).toFixed(0)}</span></span>
                  <span className="r num rec__sub" title={s ? `Rank between ${s.best} and ${s.worst} over ${DRAWS} draws` : ""}>{s ? (s.top > 0 ? share(s.top) : `${s.best} to ${s.worst}`) : ""}</span>
                  <span className="r"><input type="checkbox" aria-label={`Compare ${r.item.accession}`} checked={picked.includes(r.item.accession)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.item.accession].slice(-4) : p.filter((x) => x !== r.item.accession)))} /></span>
                </div>
                {isOpen && (
                  <div className="rank__detail">
                    <table className="table">
                      <thead><tr><th>Factor</th><th className="r">Weight</th><th className="r">Value</th><th className="r">Adds</th><th style={{ paddingLeft: 16 }}>Why</th></tr></thead>
                      <tbody>{[...r.parts].sort((a, b) => b.contribution - a.contribution).map((p) => (
                        <tr key={p.id}>
                          <td>{p.label}</td><td className="r num">{pct(p.weight)}</td><td className="r num">{p.score.toFixed(2)}</td>
                          <td className="r num strong">{(100 * p.contribution).toFixed(1)}</td><td style={{ paddingLeft: 16 }} className="note">{p.why}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    <p className="note" style={{ marginTop: 8 }}>
                      Not covered: {r.parts.filter((p) => p.score === 0).map((p) => p.label.toLowerCase()).join("; ") || "nothing scores zero"}.
                      {" "}<a href={href(`/evidence/${r.item.accession}`)}>Open the record</a>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <aside className="stack" style={{ ["--gap" as string]: "18px" }}>
          <section className="panel panel--tight">
            <div className="panel__head" style={{ marginBottom: 10 }}>
              <h2 className="panel__title">Weights</h2>
              <button type="button" className="btn btn--quiet btn--sm" disabled={!changed} onClick={() => setWeights({ ...lens.weights })}>Reset</button>
            </div>
            {doc.factors.map((f) => (
              <label key={f.id} className="wslider" title={f.rule}>
                <span>{f.label}</span><span className="num">{pct(wn[f.id] ?? 0)}</span>
                <input type="range" min={0} max={0.5} step={0.01} value={w[f.id] ?? 0} onChange={(e) => setWeights({ ...w, [f.id]: Number(e.target.value) })} aria-label={`Weight of: ${f.label}`} />
              </label>
            ))}
            <p className="note" style={{ marginTop: 8 }}>Weights always add up to 100%. Hover a factor for its rule.</p>
          </section>
          <section className="panel panel--tight" data-klass="derived">
            <h2 className="panel__title">How firmly the top five hold</h2>
            <p className="doc" style={{ fontSize: "1rem", marginTop: 8 }}>
              Each weight was multiplied by a random factor between one half and two, {DRAWS} times.
              {always.length > 0 ? ` ${always.map((r) => r.item.acronym || r.item.accession).join(", ")} stayed in the top five every time.` : " No record stayed in the top five every time."}
              {shaky.length > 0 ? ` ${shaky.map((r) => `${r.item.acronym || r.item.accession} in ${share(stab?.get(r.item.accession)?.top ?? 0)}`).join(", ")}.` : ""}
            </p>
            <p className="note" style={{ marginTop: 8 }}>Seeded, so the figures repeat. A record whose place depends on the weights should be read as "near the cut", not as fifth.</p>
          </section>
        </aside>
      </div>

      {cmp.length >= 2 && (
        <section>
          <div className="section__head"><h2 className="h2">Side by side</h2><button type="button" className="btn btn--quiet btn--sm" onClick={() => setPicked([])}>Clear</button></div>
          <ul className="cautions" aria-label="Before comparing">
            {comparability(cmp.map((r) => r.item)).map((c, i) => <li key={i} className={`caution caution--${c.level}`}><span className="tag">{c.level === "warn" ? "Mind this" : "Note"}</span><span>{c.text}</span></li>)}
          </ul>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Factor</th>{cmp.map((r) => <th key={r.item.accession}><a href={href(`/evidence/${r.item.accession}`)}>{r.item.acronym || r.item.accession}</a> · rank {r.rank}</th>)}</tr></thead>
              <tbody>
                {doc.factors.map((f) => (
                  <tr key={f.id}><td className="strong">{f.label}</td>{cmp.map((r) => { const p = r.parts.find((x) => x.id === f.id)!; return <td key={r.item.accession}><span className="num strong">{p.score.toFixed(2)}</span> <span className="note">{p.why}</span></td>; })}</tr>
                ))}
                <tr><td className="strong">Score</td>{cmp.map((r) => <td key={r.item.accession} className="num strong">{(100 * r.total).toFixed(1)}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <div className="section__head"><h2 className="h2">The ten factors and their rules</h2><KlassBadge k="derived" note="computed from NASA's tables and records" /></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Factor</th><th>Rule</th><th className="r">Default weight here</th></tr></thead>
            <tbody>{doc.factors.map((f) => <tr key={f.id}><td className="strong" style={{ whiteSpace: "nowrap" }}>{f.label}</td><td>{f.rule}</td><td className="r num">{pct(lens.weights[f.id] ?? 0)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8, maxWidth: "90ch" }}>{doc.note} "Near" an atmosphere means {doc.near_rule}. Blue marks flight experiments in free fall, orange marks ground work.</p>
      </section>
    </div>
  );
}
