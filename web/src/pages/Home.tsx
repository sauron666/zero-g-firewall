import { useEffect, useMemo, useState } from "react";
import { ALL_ITEMS, NAV } from "../app/nav";
import { href } from "../app/router";
import { Manifest, fmtBytes, fmtInt, fmtUtc, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { DropletDoc, GapsDoc, MatrixDoc, MythsDoc, RankDoc, ValidationDoc } from "../lib/types";
import { FlameCanvas } from "../components/FlameCanvas";
import { Porthole } from "../components/Porthole";
import { FanSwitch } from "../components/FanSwitch";
import { NavIcon } from "../components/NavIcon";
import { SourceBtn } from "../components/Source";
import { IconArrow, IconTour } from "../components/icons";
import { AlarmSpark, Chain, MiniCover, MiniParity, Ring, Tile, TopFive } from "../dash/widgets";
import { BODIES, buoyantSpeedRange } from "../physics/scaling";
import { emit, on } from "../mascot/bus";
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

export function Home({ manifest }: { manifest: Manifest | null }) {
  const [fans, setFansState] = useState(true);
  const [offAt, setOffAt] = useState<number | null>(null);          // the flame in ISKRA's lantern follows the same switch
  useEffect(() => { setOffAt(fans ? null : performance.now()); }, [fans]);
  const setFans = (v: boolean) => { setFansState(v); emit({ type: "CONTEXT", fans: v }); };
  useEffect(() => on((e) => { if (e.type === "FANS") setFansState(e.on); }), []);       // the guided tour flips the switch
  const nasa = manifest?.nasa ?? null;
  const mx = useData<MatrixDoc>(nasa ? "matrix.json" : null);
  const myths = useData<MythsDoc>(nasa ? "myths.json" : null);
  const gaps = useData<GapsDoc>(nasa ? "gaps.json" : null);
  const rank = useData<RankDoc>(nasa ? "rank_features.json" : null);
  const val = useData<ValidationDoc>(nasa ? "validation.json" : null);
  const drops = useData<DropletDoc>(nasa ? "droplets.json" : null);
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

  return (
    <div className="deck">
      <div className="deck__strip" aria-label="State of the evidence">
        <Tile label="Investigations" value={nasa?.investigations_in_scope ?? null} of={nasa ? `of ${nasa.search_hits}` : undefined} sub="combustion records in PSI" to={href("/evidence")} />
        <Tile label="Test rows" value={nasa?.table_rows ?? null} sub={nasa ? `in ${nasa.tables} NASA tables` : "after the NASA sync"} to={href("/envelope")} />
        <Tile label="Measured, station" value={mx.data?.coverage.iss.evidence ?? null} of={mx.data ? `of ${mx.data.cells.length}` : undefined} sub="fire behaviours" to={href("/playbooks")} />
        <Tile label="Measured, Moon" value={mx.data?.coverage.lunar.evidence ?? null} of={mx.data ? `of ${mx.data.cells.length}` : undefined} sub="fire behaviours" to={`${href("/playbooks")}?habitat=lunar`} tone="partial" />
        <Tile label="Model against NASA" value={nasa?.validation_mean_abs_K ?? null} decimals={1} unit="K" sub={nasa ? `mean gap over ${nasa.validation_rows} rows` : "after the NASA sync"} to={href("/physics")} tone="flame" />
        <Tile label="Files with receipt" value={nasa?.files_in_ledger ?? null} sub={nasa?.ledger_chain_ok ? "hash chain verified" : "evidence ledger"} to={href("/ledger")} tone="ok" led={!!nasa?.ledger_chain_ok} />
      </div>

      <div className="deck__row">
        <section className="dpanel span-8" aria-label="The question">
          <h1 className="hero__title">Kill the fans?</h1>
          <div className="hero">
            <div>
              <p className="hero__lede">
                In microgravity, airflow can decide how a flame burns.{brief ? " On the space station, a fire alarm stops the ventilation in the affected module." : ""}{" "}
                <b>In NASA's BASS-II experiment, a flame went out within two seconds once its airflow was cut.</b>
              </p>
              <p className="hero__ask">
                Does the same hold for other fuels, atmospheres and gravity levels?
                {myth?.myth_verified ? <> NASA's own guide files <q>{myth.myth.replace(/\.$/, "")}</q> under misconceptions.</> : " NASA's own guide files that belief under misconceptions."}
              </p>
              <div className="hero__cta">
                <a className="btn btn--primary" href={href("/myths/fans")}>Explore the evidence</a>
                <a className="btn btn--quiet" href={href("/paradox")}>Compare conditions</a>
                <a className="btn btn--quiet" href="#?tour=1"><IconTour size={16} />90-second tour</a>
              </div>
              <p className="hero__src">
                <span>Sources:</span>
                {brief && brief.kind === "quote" && <SourceBtn title={brief.source} sref={{ ...brief.ref, page: brief.ref.loc }} klass="literature" label="the station's response" extra={[["quotation", brief.quote]]} />}
                {bass && bass.kind === "quote" && <SourceBtn title={bass.source} sref={{ ...bass.ref, page: bass.ref.loc }} klass="literature" label="BASS-II report" extra={[["quotation", bass.quote]]} />}
                {myth && <SourceBtn title="A Researcher's Guide to: Combustion Science" sref={{ ...myth.myth_ref, page: myth.myth_ref.loc }} klass="literature" label="NASA's guide, p. 35" extra={[["quotation", myth.myth]]} />}
                {!nasa && <span>appear after the NASA sync</span>}
              </p>
            </div>
            <div>
              <div className="windows">
                <figure>
                  <Porthole tag="schematic">
                    <FlameCanvas g={0} flow={fans ? 0.1 : 0} strength={fans ? 1 : 0} seed={3} label="Schematic flame on the space station" />
                  </Porthole>
                  <figcaption className="window-cap">
                    <div className="window-cap__name">Space station</div>
                    <div className="window-cap__g">free fall, air at 21% oxygen</div>
                    <p className="window-cap__state">{fans ? "Air passes the fuel at about 10 cm/s. The flame burns blue and steady." : "The flame shrinks and goes out, as it did in one BASS-II test."}</p>
                  </figcaption>
                </figure>
                <figure>
                  <Porthole tag="schematic">
                    <FlameCanvas g={BODIES.moon.g} flow={fans ? 0.1 : 0} strength={fans ? 1 : 0.8} uncertain={!fans} seed={11} label="Schematic flame in lunar gravity" />
                  </Porthole>
                  <figcaption className="window-cap">
                    <div className="window-cap__name">Lunar habitat</div>
                    <div className="window-cap__g">0.165 g, richer in oxygen</div>
                    <p className="window-cap__state">
                      {fans ? "Fan flow and buoyant flow add up." : `Buoyancy still draws air through the flame, about ${(mLo * 100).toFixed(0)} to ${(mHi * 100).toFixed(0)} cm/s by scaling. Unmeasured: it may keep burning.`}
                    </p>
                  </figcaption>
                </figure>
              </div>
              <div className="hero__switch">
                <FanSwitch on={fans} onChange={setFans} />
                <KlassBadge k="illustrative" note="shape follows the cube root of gravity" />
              </div>
            </div>
          </div>
        </section>

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
      </div>

      <div className="deck__row">
        <section className="dpanel span-5" aria-label="Where NASA has tested">
          <header className="dpanel__head"><span className="led" /><h2>Where NASA has tested</h2><a className="dpanel__more" href={href("/gaps")}>Gaps and plans <IconArrow size={13} /></a></header>
          {cover ? <MiniCover c={cover} /> : <p className="note">Appears after the NASA sync.</p>}
          {cover && solid && (
            <p className="dpanel__say">
              Solid materials stop at <b>{pc(solid.max)}</b> oxygen{far.length > 0 && <>; exploration atmospheres hold {far.join(" and ")}</>}. Nothing above <b>{pc(cover.top)}</b>. Nothing in lunar gravity.
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
          <header className="dpanel__head"><span className="led led--warn" /><h2>Can you trust the alarm?</h2><a className="dpanel__more" href={href("/alarm/fire_fans_off")}>Alarm lab <IconArrow size={13} /></a></header>
          <AlarmSpark />
          <p className="dpanel__foot"><KlassBadge k="synthetic" note="made here to test the alarm" /> Nine such situations in the lab, every reading signed and checked.</p>
        </section>
      </div>

      <div className="deck__row">
        <section className="dpanel span-5" aria-label="Models checked against NASA">
          <header className="dpanel__head"><span className="led" /><h2>Models checked against NASA</h2><a className="dpanel__more" href={href("/physics")}>Flame physics <IconArrow size={13} /></a></header>
          <div className="checks2">
            <a className="check" href={href("/physics")}>
              <MiniParity pts={tad} lo={1300} hi={2900} label="Flame temperature: model against NASA's column" />
              <div><div className="check__num">{nasa?.validation_mean_abs_K != null ? `${nasa.validation_mean_abs_K.toFixed(1)} K` : "–"}</div><div className="check__lab">flame temperature, mean gap to NASA's own column over {nasa?.validation_rows ? fmtInt(nasa.validation_rows) : "–"} tests</div></div>
            </a>
            <a className="check" href={`${href("/physics")}`}>
              <MiniParity pts={d2} lo={0} hi={40} label="Droplet burn time: d-squared law against NASA's column" />
              <div><div className="check__num">{drops.data ? `${drops.data.within["10"]} / ${drops.data.n_usable}` : "–"}</div><div className="check__lab">droplet tests where the d² law gives NASA's burn time within 10%</div></div>
            </a>
          </div>
        </section>

        <section className="dpanel span-4" aria-label="Read first for a lunar habitat">
          <header className="dpanel__head"><span className="led led--partial" /><h2>Read first for a lunar habitat</h2><a className="dpanel__more" href={href("/rank/lunar")}>Rank <IconArrow size={13} /></a></header>
          {rank.data ? <TopFive doc={rank.data} lens="lunar" /> : <p className="note">Appears after the NASA sync.</p>}
          <p className="dpanel__foot">Score out of 100 from ten stated factors. Change the mission or the weights on the ranking page.</p>
        </section>

        <section className="dpanel span-3" aria-label="Evidence ledger">
          <header className="dpanel__head"><span className={`led ${nasa?.ledger_chain_ok ? "led--ok" : "led--warn"}`} /><h2>Evidence ledger</h2><a className="dpanel__more" href={href("/ledger")}>Verify <IconArrow size={13} /></a></header>
          {nasa ? <Chain head={nasa.ledger_head} /> : <p className="note">Appears after the NASA sync.</p>}
          {nasa && <p className="dpanel__foot">{fmtInt(nasa.files_in_ledger)} files, {fmtBytes(nasa.bytes_in_ledger)}, fetched from NASA {fmtUtc(nasa.synced_at_utc)}. {nasa.quotes_verified} of {nasa.quotes} quotations match the stored text.</p>}
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
