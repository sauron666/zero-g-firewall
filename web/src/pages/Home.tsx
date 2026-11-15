import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ALL_ITEMS, NAV } from "../app/nav";
import { href } from "../app/router";
import { Manifest, fmtBytes, fmtInt, fmtUtc, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { DropletDoc, GapsDoc, InventoryDoc, MatrixDoc, MythsDoc, RankDoc, ValidationDoc, RecordedDoc } from "../lib/types";
import { FlameCanvas } from "../components/FlameCanvas";
import { Porthole } from "../components/Porthole";
import { FanSwitch } from "../components/FanSwitch";
import { NavIcon } from "../components/NavIcon";
import { SourceBtn } from "../components/Source";
import { IconArrow, IconTour } from "../components/icons";
import { AlarmSpark, Chain, MiniCover, MiniParity, Ring, Tile, TopFive } from "../dash/widgets";
import { BODIES, buoyantSpeedRange } from "../physics/scaling";
import { emit, on } from "../mascot/bus";
import { RecordedFire } from "../viz/Recorded";
import { Lantern } from "../mascot/Lantern";
import { pc } from "../viz/OxygenCover";

/** The challenge's verbs, each with the page that serves it. The same order is the guided tour. */
const STOPS: { to: string; verb: string; text: string }[] = [
  { to: "/myths/fans", verb: "Interpret", text: "Both halves of the answer, with NASA's sources" },
  { to: "/paradox", verb: "Model", text: "One cabin, fans on and fans off" },
  { to: "/envelope", verb: "Find", text: "Every test by oxygen and pressure" },
  { to: "/rank/lunar", verb: "Rank", text: "What to read first for a lunar habitat" },
  { to: "/evidence", verb: "Summarize", text: "Each record: what varied, what was held" },
  { to: "/playbooks", verb: "Map", text: "Fire behaviours and what is measured" },
  { to: "/alarm", verb: "Control", text: "Is the alarm real?" },
  { to: "/ledger", verb: "Trace", text: "The receipt behind any number" },
];
const STARTERS = ["Will a fire go out if the fans are stopped?", "Has anything been burned in lunar gravity?", "What is the most oxygen any solid material was burned at?"];

const FAN_FLOW = 0.1;
const HERO_G: [number, string][] = [[0, "Free fall"], [BODIES.moon.g, "Moon"], [1, "Earth"]];
const MODES = [
  { to: "/lab", name: "Fire Lab", tag: "Simulate", text: "A FLEX droplet, a concept habitat with the transport solution, and gravity side by side." },
  { to: "/material", name: "Material Evidence", tag: "Compare", text: "Your habitat question against NASA's recorded PMMA tests, condition by condition." },
  { to: "/model", name: "Model Lab", tag: "Predict", text: "A regressor trained on FLEX droplets, scored on regimes it never saw, refusing the rest." },
  { to: "/alarm", name: "Alarm Trust", tag: "Defend", text: "A validly signed old reading rejected while the fire alarm stays latched." },
];

/** The opening composition: one message, one question, one scene, one primary action. */
function Hero({ manifest, fans, setFans, sources }: { manifest: Manifest | null; fans: boolean; setFans: (on: boolean) => void; sources: ReactNode }) {
  const [g, setG] = useState(BODIES.moon.g);
  const ml = (manifest as (Manifest & { ml?: { flex_k?: { mae_selected: number; mae_fuel_median: number; groups: number } } }) | null)?.ml?.flex_k;
  const nasa = manifest?.nasa;
  const label = HERO_G.find(([x]) => x === g)?.[1] ?? "";
  return (
    <>
      <section className="hero2" aria-label="Zero-G Firewall">
        <div className="hero2__text">
          <p className="hero2__eyebrow">NASA Space Apps 2026 · Flame in Freefall</p>
          <h1 className="hero2__title">Fire behaves differently in freefall.</h1>
          <p className="hero2__lede">Explore NASA experiments, compare conditions and see what the evidence supports, and where it stops.</p>
          <p className="hero2__q">Stopping the ventilation is an established step against a fire in a spacecraft. <b>Kill the fans?</b> The answer depends on conditions NASA has and has not tested.</p>
          <div className="hero2__cta">
            <a className="btn btn--primary hero2__go" href={href("/lab")}>Enter the lab</a>
            <a className="btn btn--quiet" href={href("/evidence")}>Explore NASA evidence</a>
          </div>
          <a className="hero2__methods" href={href("/about")}>Methods, classes of evidence and limits</a>
        </div>
        <div className="hero2__scene">
          <div className="hero2__chamber">
            <div className="hero2__badges"><KlassBadge k="illustrative" note="shape follows the gravity scaling" /></div>
            <div className="hero2__flames">
              <figure><Porthole tag="0 g"><FlameCanvas g={0} flow={fans ? FAN_FLOW : 0} strength={fans ? 1 : 0} seed={3} label="Schematic flame in free fall" /></Porthole><figcaption>free fall</figcaption></figure>
              <figure><Porthole tag={`${g === 0 ? "0" : g.toFixed(3)} g`}><FlameCanvas g={g} flow={fans ? FAN_FLOW : 0} strength={fans ? 1 : g > 0 ? 0.8 : 0} seed={11} uncertain={g > 0 && g < 1} label={`Schematic flame at ${label}`} /></Porthole><figcaption>{label === "Moon" ? "lunar gravity" : label.toLowerCase()}</figcaption></figure>
            </div>
            <div className="hero2__ctl">
              <FanSwitch on={fans} onChange={setFans} />
              <span className="label">Gravity on the right</span>
              <div className="seg" role="group" aria-label="Gravity of the right-hand flame">{HERO_G.map(([x, l]) => <button key={l} type="button" aria-pressed={g === x} onClick={() => setG(x)}>{l}</button>)}</div>
              <a className="hero2__open" href={`${href("/lab")}?scene=gravity&g=${g || 0.165}`}>Open in 3D</a>
            </div>
            <p className="hero2__cap">{!fans
              ? (g === 0 ? "Fans off, both in free fall: in one NASA test the flame went out within two seconds of its airflow being cut."
                : g < 1 ? "Fans off. In free fall the flame NASA tested went out within two seconds. In lunar gravity buoyancy still draws air through the flame: no test exists, and it may keep burning."
                  : "Fans off. At 1 g buoyancy feeds the flame without any fan.")
              : g === 0 ? "Both in free fall: no buoyancy, a round blue flame." : g < 1 ? "Lunar gravity: buoyancy returns, about half the 1 g flow speed by the cube-root scaling. No PSI table holds a partial-gravity test; LUCI is the nearest NASA evidence." : "At 1 g buoyancy stretches the flame and feeds it from below."}</p>

          </div>
          {sources}
        </div>
      </section>
      <section className="hero2__facts" aria-label="Three results">
        <a href={href("/evidence")}><span className="stat__value num">{nasa ? fmtInt(nasa.table_rows) : "–"}</span><span className="label">NASA test rows from {nasa?.investigations_in_scope ?? "–"} investigations, each with a receipt</span></a>
        <a href={href("/model")}><span className="stat__value num">{ml ? `${(ml.mae_fuel_median / ml.mae_selected).toFixed(1)}×` : "–"}</span><span className="label">lower error than a per-fuel median on {ml?.groups ?? "–"} droplet regimes the model never saw</span></a>
        <a href={`${href("/alarm")}--replay`}><span className="stat__value num">0</span><span className="label">fire alarms lowered by tampered data in the seeded synthetic runs of Alarm Trust</span></a>
      </section>
      <nav className="hero2__modes" aria-label="Laboratory modes">
        {MODES.map((m) => <a key={m.to} href={href(m.to)}><span className="hero2__mtag">{m.tag}</span><b>{m.name}</b><span>{m.text}</span></a>)}
      </nav>
    </>
  );
}                                              // m/s: the forced flow drawn in both windows while the fans run

export function Home({ manifest }: { manifest: Manifest | null }) {
  const [fans, setFansState] = useState(true);
  const [offAt, setOffAt] = useState<number | null>(null);          // the flame in ISKRA's lantern follows the same switch
  useEffect(() => { setOffAt(fans ? null : performance.now()); }, [fans]);
  const setFans = (v: boolean) => { setFansState(v); emit({ type: "CONTEXT", fans: v }); emit({ type: "NOTE", text: v ? "Fans on. Both flames are fed." : "Fans off. Watch the two flames." }); };
  useEffect(() => on((e) => { if (e.type === "FANS") setFansState(e.on); }), []);       // the guided tour flips the switch
  const nasa = manifest?.nasa ?? null;
  const mx = useData<MatrixDoc>(nasa ? "matrix.json" : null);
  const myths = useData<MythsDoc>(nasa ? "myths.json" : null);
  const gaps = useData<GapsDoc>(nasa ? "gaps.json" : null);
  const rank = useData<RankDoc>(nasa ? "rank_features.json" : null);
  const val = useData<ValidationDoc>(nasa ? "validation.json" : null);
  const drops = useData<DropletDoc>(nasa ? "droplets.json" : null);
  const rec = useData<RecordedDoc>(manifest?.artifacts["recorded.json"] ? "recorded.json" : null);
  const inv = useData<InventoryDoc>(manifest?.artifacts["inventory.json"] ? "inventory.json" : null);      // what the BASS-II table itself says, in words, about how its tests ended
  const words = inv.data?.flow_words.tables.find((w) => w.accession === "PSI-25");
  const wOut = words?.classes.find((c) => c.id === "went_out"), wZero = words?.classes.find((c) => c.id === "zero");
  const noEnding = !!inv.data && !inv.data.items.find((i) => i.accession === "PSI-25")?.cells.ending;            // the table has no column for how a test ended
  const [q, setQ] = useState("");
  const ask = (text: string) => { const t = text.trim(); if (t) { emit({ type: "ASK", q: t }); setQ(""); } };

  const [mLo, mHi] = buoyantSpeedRange(BODIES.moon.g);
  const myth = myths.data?.items.find((c) => c.id === "fans");
  const vent = mx.data?.playbook.find((s) => s.id === "ventilation");
  // The station's own procedure is stated only when a stored NASA document says it.
  const brief = vent?.documented.find((d) => d.kind === "quote" && d.quote_verified && d.source.startsWith("NASA-STD-3001"));
  const bass = vent?.documented.find((d) => d.kind === "quote" && d.quote_verified && d.source.startsWith("Burning and Suppression"));
  const cover = gaps.data?.coverage;
  const solid = cover?.kinds.find((k) => k.id === "solid");
  const far = cover?.atmospheres.filter((a) => a.pct > 22 && a.pct < 100).map((a) => `${a.pct}%`) ?? [];
  const tad = useMemo(() => {
    const d = val.data;
    if (!d) return [] as [number, number][];
    const closer = new Map(d.tables.map((t) => [t.table, t.Tad.closer]));
    return d.points.map((p) => [p.T, closer.get(p.t) === "row_pressure" ? p.Tr : p.Ta] as [number, number]);
  }, [val.data]);
  const d2 = useMemo(() => (drops.data?.points ?? []).filter((p) => p.td != null).map((p) => [p.tb as number, p.td as number] as [number, number]), [drops.data]);
  const tech = NAV.find((g) => g.technical)?.items ?? [];

  const sources = (
    <p className="hero__src">
      <span>Sources:</span>
      {brief && brief.kind === "quote" && <SourceBtn title={brief.source} sref={{ ...brief.ref, page: brief.ref.loc }} klass="literature" label="the station's response" extra={[["quotation", brief.quote]]} />}
      {bass && bass.kind === "quote" && <SourceBtn title={bass.source} sref={{ ...bass.ref, page: bass.ref.loc }} klass="literature" label="BASS-II report" extra={[["quotation", bass.quote]]} />}
      {myth && <SourceBtn title="A Researcher's Guide to: Combustion Science" sref={{ ...myth.myth_ref, page: myth.myth_ref.loc }} klass="literature" label={`NASA's guide${myth.myth_ref.loc ? ", " + myth.myth_ref.loc : ""}`} extra={[["quotation", myth.myth]]} />}
      {!nasa && <span>appear after the NASA sync</span>}
    </p>
  );
  return (
    <div className="deck">
      <Hero manifest={manifest} fans={fans} setFans={setFans} sources={sources} />
      <div className="deck__strip" role="group" aria-label="State of the evidence">
        <Tile label="Investigations" value={nasa?.investigations_in_scope ?? null} of={nasa ? `of ${nasa.search_hits}` : undefined} sub="combustion records in PSI" to={href("/evidence")} />
        <Tile label="Test rows" value={nasa?.table_rows ?? null} sub={nasa ? `in ${nasa.tables} NASA tables` : "after the NASA sync"} to={href("/envelope")} />
        <Tile label="Measured on station" value={mx.data?.coverage.iss.evidence ?? null} of={mx.data ? `of ${mx.data.cells.length}` : undefined} sub="fire behaviours" to={href("/playbooks")} />
        <Tile label="Measured on Moon" value={mx.data?.coverage.lunar.evidence ?? null} of={mx.data ? `of ${mx.data.cells.length}` : undefined} sub="fire behaviours" to={`${href("/playbooks")}?habitat=lunar`} tone="partial" />
        <Tile label="Model against NASA's tabulated Tad" value={nasa?.validation_mean_abs_K ?? null} decimals={1} unit="K" sub={nasa ? `mean gap over ${nasa.validation_rows} rows, pressure convention per table` : "after the NASA sync"} to={href("/physics")} tone="flame" />
        <Tile label="Files with receipt" value={nasa?.files_in_ledger ?? null} sub={nasa?.ledger_chain_ok ? "hash chain verified" : "evidence ledger"} to={href("/ledger")} tone="ok" led={!!nasa?.ledger_chain_ok} />

      </div>

      <div className="deck__row">
        <section className="dpanel span-4" aria-label="Ask ISKRA">
          <header className="dpanel__head"><span className="led" /><h2>Ask ISKRA</h2><a className="dpanel__more" href={href("/ask")}>Full search <IconArrow size={13} /></a></header>
          <button type="button" className="iskra-hero" onClick={() => emit({ type: "ASK" })} aria-label="Open the conversation with ISKRA">
            <Lantern g={0} fansOffAt={offAt} klass="illustrative" size={112} />
          </button>
          <p className="dpanel__say" style={{ textAlign: "center" }}>Ask about fire in spacecraft. I answer from NASA's tables and documents, with the source beside each sentence.</p>
          <form className="askbar" style={{ gridTemplateColumns: "minmax(0, 1fr)" }} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <label className="sr" htmlFor="homeq">Your question</label>
            <input id="homeq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a question" autoComplete="off" />
          </form>
          <div className="msg__chips">{STARTERS.map((s) => <button key={s} type="button" className="chipbtn" onClick={() => ask(s)}>{s}</button>)}</div>
          <p className="dpanel__foot">{nasa?.passages ? `${fmtInt(nasa.passages)} passages on board. Works with no network and no key.` : "Works with no network and no key."}</p>
        </section>
        <section className="dpanel span-5" aria-label="Where NASA has tested">
          <header className="dpanel__head"><span className="led" /><h2>Where NASA has tested</h2><a className="dpanel__more" href={href("/gaps")}>Gaps and plans <IconArrow size={13} /></a></header>
          {cover ? <MiniCover c={cover} /> : <p className="note">Appears after the NASA sync.</p>}
          {cover && solid && (
            <p className="dpanel__say">
              Solid materials stop at <b>{pc(solid.max)}</b> oxygen{far.length > 0 && <>; oxygen-rich cabins hold {far.join(" and ")}</>}. No row above <b>{pc(cover.top)}</b>, and none in lunar gravity.
            </p>
          )}
        </section>

        <section className="dpanel span-3" aria-label="Fire behaviours measured">
          <header className="dpanel__head"><span className="led led--partial" /><h2>Behaviours measured</h2><a className="dpanel__more" href={href("/playbooks")}>Matrix <IconArrow size={13} /></a></header>
          {mx.data ? (
            <div className="rings">
              <Ring value={mx.data.coverage.iss.evidence} total={mx.data.cells.length} tone="var(--g-micro)" title="Station" cap="free fall" />
              <Ring value={mx.data.coverage.lunar.evidence} total={mx.data.cells.length} tone="var(--g-partial)" title="Moon" cap="one sixth g" />
            </div>
          ) : <p className="note">Appears after the NASA sync.</p>}
          {mx.data && <p className="dpanel__foot">{mx.data.coverage.lunar.bounded} lunar behaviours are bounded by a model or a related test; {mx.data.coverage.lunar.gap} have nothing.</p>}
        </section>

        <section className="dpanel span-4" aria-label="Alarm trust">
          <header className="dpanel__head"><span className="led led--warn" /><h2>Can you trust the alarm?</h2><a className="dpanel__more" href={href("/alarm")}>Alarm lab <IconArrow size={13} /></a></header>
          {rec.data ? (
            <>
              <RecordedFire doc={rec.data} compact />
              <div className="spark__legend">
                <span><i style={{ ["--c" as string]: "var(--g-micro)" }} />flame, four radiometers</span>
                <span><i style={{ ["--c" as string]: "var(--ink)" }} />smoke detector of the vehicle</span>
              </div>
              <p className="dpanel__say" style={{ fontSize: "0.98rem" }}>
                Recorded in a cargo vehicle, {new Date(rec.data.zero.utc).getUTCFullYear()}: a puff from a smoke wire read <b>{rec.data.derived.scatter.wire.peak}</b>, a burning sheet of fabric <b>{rec.data.derived.scatter.fire.peak}</b>.
                Time told them apart: {rec.data.derived.scatter.wire.above_mark_s} s against {rec.data.derived.scatter.fire.above_mark_s} s.
              </p>
              <p className="dpanel__foot"><KlassBadge k="observed" note="raw data of PSI-100" /> Play the recording in the lab, then fourteen synthetic situations with signed readings.</p>
            </>
          ) : (
            <>
              <AlarmSpark />
              <p className="dpanel__foot"><KlassBadge k="synthetic" note="made here to test the alarm" /> Fourteen such situations in the lab, every reading signed and checked.</p>
            </>
          )}
        </section>
        <section className="dpanel span-5" aria-label="Models checked against NASA">
          <header className="dpanel__head"><span className="led" /><h2>Models checked against NASA</h2><a className="dpanel__more" href={href("/physics")}>Flame physics <IconArrow size={13} /></a></header>
          <div className="checks2">
            <a className="check" href={href("/physics")}>
              <MiniParity pts={tad} lo={1300} hi={2900} label="Flame temperature: model against NASA's column" />
              <div><div className="check__num">{nasa?.validation_mean_abs_K != null ? `${nasa.validation_mean_abs_K.toFixed(1)} K` : "–"}</div><div className="check__lab">flame temperature: mean gap to NASA's tabulated Tad over {nasa?.validation_rows ? fmtInt(nasa.validation_rows) : "–"} tests, pressure convention per table{val.data?.overall.row_pressure.mean_abs != null ? ` (${val.data.overall.row_pressure.mean_abs.toFixed(1)} K with the row's pressure throughout)` : ""}</div></div>
            </a>
            <a className="check" href={`${href("/physics")}`}>
              <MiniParity pts={d2} lo={0} hi={40} label="Droplet burn time: d-squared law against NASA's column" />
              <div><div className="check__num">{drops.data ? `${drops.data.within["10"]} / ${drops.data.n_usable}` : "–"}</div><div className="check__lab">droplet tests where the d² law gives NASA's burn time within 10%</div></div>
            </a>
          </div>
        </section>

        <section className="dpanel span-3" aria-label="Read first for a lunar habitat">
          <header className="dpanel__head"><span className="led led--partial" /><h2>Read first for a lunar habitat</h2><a className="dpanel__more" href={href("/rank/lunar")}>Rank <IconArrow size={13} /></a></header>
          {rank.data ? <TopFive doc={rank.data} lens="lunar" /> : <p className="note">Appears after the NASA sync.</p>}
          <p className="dpanel__foot">Score out of 100 from ten stated factors. Change the mission or the weights on the ranking page.</p>
        </section>

      </div>

      <section aria-label="Guided tour">
        <ol className="stops">
          {STOPS.map((p) => {
            const item = ALL_ITEMS.find((it) => it.path === "/" + p.to.split("/")[1]);
            return (
              <li key={p.to}>
                <a className="stop" href={href(p.to)}>
                  <NavIcon name={item?.icon ?? "Info"} size={18} />
                  <b>{p.verb}</b>
                  <span>{p.text}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="techrow">
        <span>For engineers:</span>
        {tech.map((it) => <a key={it.path} href={href(it.path)}><NavIcon name={it.icon} size={14} />{it.label}</a>)}
        <a href="https://github.com/sauron666/zero-g-firewall" target="_blank" rel="noreferrer">Repository</a>
      </p>
    </div>
  );
}
