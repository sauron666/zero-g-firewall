import { useEffect, useRef, useState } from "react";
import { ALL_ITEMS } from "../app/nav";
import { href } from "../app/router";
import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { Coverage, Habitat, MatrixCell, MatrixDoc, PlaybookStep, RankDoc, StepBadge } from "../lib/types";
import { IconCheck, IconInfo } from "../components/icons";
import { Item } from "./Myths";
import { PageProps, stub } from "./stubs";
import { emit } from "../mascot/bus";

const Waiting = stub("/playbooks");
const HABITAT: Record<Habitat, { label: string; short: string; about: string }> = {
  iss: { label: "Space station", short: "Station", about: "free fall" },
  lunar: { label: "Lunar habitat", short: "Moon", about: "one sixth of Earth gravity" },
};
const COVER: Record<Coverage, string> = { evidence: "Measured there", bounded: "Bounded", gap: "Nothing measured", na: "Does not apply" };
const BADGE: Record<StepBadge, string> = { supported: "Supported", uncertain: "Uncertain", gap: "Gap" };
const SCENARIO: Record<string, string> = { pyrolysis: "an overheated wire", dust: "dust", fire_fans_off: "a fire with the fans stopped", replay: "replayed readings" };

/** The coverage mark: a square drawn full, half or empty. Its hue is the gravity regime of the habitat. */
export function CoverMark({ c, size = 12 }: { c: Coverage; size?: number }) {
  return <span className={`cmark cmark--${c}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

function linkLabel(path: string): string {
  const [top, sub] = path.split("/").filter(Boolean);
  if (top === "evidence" && sub) return sub;
  if (top === "alarm" && sub) return `Alarm lab: ${SCENARIO[sub] ?? sub}`;
  if (top === "myths" && sub) return "The misconception, with both sides";
  if (top === "falsify") return "Try to refute it";
  return ALL_ITEMS.find((i) => i.path === "/" + top)?.label ?? path;
}

function Tile({ c, hab, on, dim, pick }: { c: MatrixCell; hab: Habitat; on: boolean; dim: boolean; pick: (id: string) => void }) {
  return (
    <button type="button" className={`mx__tile mx__tile--${c[hab]}`} aria-pressed={on} data-dim={dim} onClick={() => pick(c.id)}
            title={`${c.name}. ${HABITAT[hab].label}: ${COVER[c[hab]].toLowerCase()}`}>
      <CoverMark c={c[hab]} />
      <span className="mx__name">{c.name}</span>
    </button>
  );
}

function Detail({ c, doc, pickStep }: { c: MatrixCell; doc: MatrixDoc; pickStep: (id: string) => void }) {
  const phase = doc.phases.find((p) => p.id === c.phase);
  return (
    <section className="panel mx__detail" data-klass="derived" aria-live="polite">
      <div className="row" style={{ ["--gap" as string]: "10px", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <p className="note">{phase?.name} · pillar: {c.pillar}</p>
          <h2 className="claim claim--m" style={{ marginTop: 2 }}>{c.name}</h2>
        </div>
        <KlassBadge k="derived" />
      </div>
      <dl className="mx__both">
        {(["iss", "lunar"] as Habitat[]).map((h) => (
          <div key={h} className={`mx__hab mx__hab--${h}`}>
            <dt>{HABITAT[h].label} <span className="note">{HABITAT[h].about}</span></dt>
            <dd><CoverMark c={c[h]} size={14} /> <b>{COVER[c[h]]}</b>{c[h] === "bounded" && <span className="note"> by a model or a related test</span>}</dd>
          </div>
        ))}
      </dl>
      <div className="mx__items">{c.items.map((it, i) => <Item key={i} it={it} />)}</div>
      <div className="mx__foot">
        {c.steps.length > 0 && (
          <p><span className="note">Response steps that meet it: </span>
            {c.steps.map((s) => { const st = doc.playbook.find((p) => p.id === s)!; return <button key={s} type="button" className="chip chip--btn" onClick={() => pickStep(s)}>{st.n}. {st.step}</button>; })}</p>
        )}
        {c.links.length > 0 && <p><span className="note">Go deeper: </span>{c.links.map((l) => <a key={l} className="chip" href={href(l)}>{linkLabel(l)}</a>)}</p>}
      </div>
    </section>
  );
}

function Badge({ b, hab, basis }: { b: StepBadge; hab: Habitat; basis?: string }) {
  return (
    <div className={`sbadge sbadge--${b} sbadge--${hab}`}>
      <span className="sbadge__hab">{HABITAT[hab].label}</span>
      <span className="sbadge__word">{b === "supported" ? <IconCheck size={14} /> : b === "uncertain" ? <span aria-hidden="true" className="sbadge__q">?</span> : <span aria-hidden="true" className="sbadge__o" />}{BADGE[b]}</span>
      {basis && <span className="sbadge__basis">evidence from {basis}</span>}
    </div>
  );
}

function Step({ s, doc, open, pick }: { s: PlaybookStep; doc: MatrixDoc; open: boolean; pick: (id: string) => void }) {
  return (
    <li className="pstep" id={`step-${s.id}`} data-open={open}>
      <div className="pstep__n" aria-hidden="true">{s.n}</div>
      <div className="pstep__main">
        <h3 className="pstep__title">{s.step}</h3>
        <div className="pstep__badges"><Badge b={s.iss} hab="iss" /><Badge b={s.lunar} hab="lunar" basis={s.lunar_basis} /></div>
        <p className="prose pstep__why">{s.why}</p>
        {s.adds && <p className="ev ev--reading" style={{ padding: 0, border: 0 }}><span className="ev__tag">Our reading</span>{s.adds}</p>}
        <details className="fold" open={open}>
          <summary>Where NASA documents this step ({s.documented.length})</summary>
          <div>{s.documented.map((it, i) => <Item key={i} it={it} />)}</div>
        </details>
        <p className="pstep__cells"><span className="note">Behaviours it meets: </span>
          {s.cells.map((id) => { const c = doc.cells.find((x) => x.id === id)!; return <button key={id} type="button" className="chip chip--btn" onClick={() => pick(id)}><CoverMark c={c.iss} size={9} />{c.name}</button>; })}</p>
      </div>
    </li>
  );
}

const CONTROL: Record<string, { title: string; does: string }> = {
  prevention: { title: "Prevent", does: "Choose materials and an atmosphere in which a fire is hard to start" },
  detection: { title: "Detect", does: "See smoke and gases early, and tell a fire from dust" },
  suppression: { title: "Suppress", does: "Put the flame out, and deal with what it leaves in the air" },
};

/** The three controls, each with the fire behaviours it must answer and the NASA records that inform it. */
function Controls({ doc, rank, onPillar }: { doc: MatrixDoc; rank: RankDoc; onPillar: (p: string) => void }) {
  return (
    <section className="stack" style={{ ["--gap" as string]: "12px" }} id="controls">
      <div className="section__head"><h2 className="h2">Controls, and the research that informs each</h2><KlassBadge k="derived" note="sorted by written rules" /></div>
      <div className="ctl">
        {doc.pillars.map((p) => {
          const cells = doc.cells.filter((c) => c.pillar === p);
          const recs = rank.items.filter((i) => i.facets.pillars.includes(p)).sort((a, b) => b.rows - a.rows);
          const n = (h: Habitat) => cells.filter((c) => c[h] === "evidence").length;
          return (
            <article key={p} className="dpanel ctl__col">
              <header className="dpanel__head"><span className="led" /><h2>{CONTROL[p]?.title ?? p}</h2><button type="button" className="dpanel__more linklike" onClick={() => onPillar(p)}>Show in the matrix</button></header>
              <p className="dpanel__say">{CONTROL[p]?.does}.</p>
              {(["iss", "lunar"] as Habitat[]).map((h) => (
                <div key={h} className={`ctl__row mx__hab--${h}`}>
                  <span className="ctl__name">{HABITAT[h].short}</span>
                  <span className="ctl__marks">{cells.map((c) => <a key={c.id} className={`cmark cmark--${c[h]}`} href={href(`/playbooks/${c.id}`)} title={`${c.name}: ${COVER[c[h]].toLowerCase()}`} aria-label={`${c.name}: ${COVER[c[h]].toLowerCase()}`} />)}</span>
                  <span className="ctl__num"><b>{n(h)}</b> of {cells.length} measured</span>
                </div>
              ))}
              <div>
                <p className="ctl__lab">{recs.length} NASA records inform it</p>
                <ul className="ctl__recs">
                  {recs.map((r) => <li key={r.accession}><a href={href(`/evidence/${r.accession}`)} title={r.title}>{r.acronym || r.accession}</a><span className="num">{r.rows ? `${r.rows.toLocaleString("en-US")} rows` : "no table"}</span></li>)}
                </ul>
              </div>
              <p className="dpanel__foot">A record is listed when {rank.facet_rules.pillars[p]}. <a href={`${href("/evidence")}?pillar=${p}`}>Open these records</a></p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function Playbooks(props: PageProps) {
  const ready = !!props.manifest?.nasa;
  const mx = useData<MatrixDoc>(ready ? "matrix.json" : null);
  const rank = useData<RankDoc>(ready ? "rank_features.json" : null);
  const grid = useRef<HTMLDivElement>(null);
  const want = props.route.segs[1] ?? "";
  const [hab, setHab] = useState<Habitat>(props.route.query.get("habitat") === "lunar" ? "lunar" : "iss");
  const [pillar, setPillar] = useState<string>("all");
  const [sel, setSel] = useState<string>(want && !want.startsWith("step-") ? want : "fans-off");
  const [step, setStep] = useState<string>(want.startsWith("step-") ? want.slice(5) : "");
  const detail = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  useEffect(() => { emit({ type: "CONTEXT", g: hab === "lunar" ? 0.1654 : 0, source: "habitat" }); }, [hab]);
  useEffect(() => {
    if (!mx.data) return;
    if (step) document.getElementById(`step-${step}`)?.scrollIntoView({ block: "start", behavior: moved.current ? "smooth" : "auto" });
  }, [mx.data, step]);

  if (!ready || !mx.data) return <Waiting {...props} />;
  const doc = mx.data;
  const cell = doc.cells.find((c) => c.id === sel) ?? doc.cells[0];
  const cov = doc.coverage[hab];
  const pick = (id: string) => {
    moved.current = true;
    setSel(id); setStep("");
    try { history.replaceState(null, "", href(`/playbooks/${id}`)); } catch { /* the address is a convenience */ }
    requestAnimationFrame(() => detail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const pickStep = (id: string) => {
    moved.current = true;
    setStep(id);
    try { history.replaceState(null, "", href(`/playbooks/step-${id}`)); } catch { /* same */ }
    document.getElementById(`step-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const total = doc.cells.length;

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <h1 className="page-title">Fire behaviour matrix</h1>
      <p className="lede">Security teams map an attack as phases and techniques, then mark what they can see. This is the same map for a cabin fire: {doc.phases.length} phases, {total} behaviours, and for each one what NASA's evidence covers. Switch to the Moon and watch it empty.</p>

      <div className="controls">
        <div className="seg seg--habitat" role="group" aria-label="Habitat">
          {(["iss", "lunar"] as Habitat[]).map((h) => (
            <button key={h} type="button" aria-pressed={hab === h} className={`seg__hab seg__hab--${h}`} onClick={() => setHab(h)}>{HABITAT[h].label}<span className="seg__sub">{HABITAT[h].about}</span></button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Pillar">
          {["all", ...doc.pillars].map((p) => <button key={p} type="button" aria-pressed={pillar === p} onClick={() => setPillar(p)}>{p === "all" ? "All pillars" : p[0].toUpperCase() + p.slice(1)}</button>)}
        </div>
      </div>

      <div className={`mx mx--${hab}`} ref={grid} style={{ scrollMarginTop: 130 }}>
        <div className="mx__tally" role="status">
          {(["evidence", "bounded", "gap", "na"] as Coverage[]).filter((c) => cov[c] > 0 || c !== "na").map((c) => (
            <div key={c} className="mx__count"><span className="mx__num">{cov[c]}</span><span className="mx__lab"><CoverMark c={c} />{COVER[c]}{c === "bounded" && <span className="note"> by a model or a related test</span>}</span></div>
          ))}
          <p className="mx__say claim claim--m">{hab === "lunar"
            ? `Of ${total} behaviours, none has been measured on the Moon.`
            : `Of ${total} behaviours, ${cov.evidence} have been measured in free fall.`}</p>
        </div>
        <div className="mx__grid" style={{ ["--cols" as string]: doc.phases.length }}>
          {doc.phases.map((p) => (
            <section key={p.id} className="mx__col" aria-label={p.name}>
              <header className="mx__phase"><h2>{p.name}</h2><p>{p.about}</p></header>
              {doc.cells.filter((c) => c.phase === p.id).map((c) => <Tile key={c.id} c={c} hab={hab} on={c.id === cell.id} dim={pillar !== "all" && c.pillar !== pillar} pick={pick} />)}
            </section>
          ))}
        </div>
      </div>

      <div ref={detail} style={{ scrollMarginTop: 64 }}><Detail c={cell} doc={doc} pickStep={pickStep} /></div>

      {rank.data && <Controls doc={doc} rank={rank.data} onPillar={(p) => { setPillar(p); grid.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }} />}

      <section className="stack" style={{ ["--gap" as string]: "12px" }}>
        <div className="section__head"><h2 className="h2">Response playbook: {doc.playbook.length} documented steps, two habitats</h2></div>
        <p className="lede" style={{ fontSize: "1.05rem" }}>Each step is a response that a NASA page documents. Beside it: what the evidence says about that step on the station, and what is left of that evidence in lunar gravity.</p>
        <div className="mx__pbtally">
          {(["iss", "lunar"] as Habitat[]).map((h) => (
            <p key={h} className={`mx__pbline mx__hab--${h}`}><b>{HABITAT[h].label}</b>
              {(["supported", "uncertain", "gap"] as StepBadge[]).map((b) => <span key={b}><span className="mx__num mx__num--s">{doc.playbook_coverage[h][b]}</span> {BADGE[b].toLowerCase()}</span>)}</p>
          ))}
        </div>
        <ol className="pb">{doc.playbook.map((s) => <Step key={s.id} s={s} doc={doc} open={step === s.id} pick={pick} />)}</ol>
        <p className="callout"><IconInfo size={16} /><span>{doc.note}</span></p>
        {doc.waiting_for_sync.length > 0 && (
          <p className="note">Not yet in the evidence ledger: {doc.waiting_for_sync.map((w) => w.name).join("; ")}. Its quotations appear here after the next sync from NASA; until then the steps rest on the documents shown.</p>
        )}
      </section>
    </div>
  );
}
