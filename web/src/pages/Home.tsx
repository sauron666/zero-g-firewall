import { useEffect, useState } from "react";
import { ALL_ITEMS } from "../app/nav";
import { href } from "../app/router";
import { Manifest, fmtBytes, fmtInt, fmtUtc, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { MatrixDoc, MythsDoc } from "../lib/types";
import { AskConsole } from "../ai/AskConsole";
import { CoverageRows } from "../components/CoverageRows";
import { FlameCanvas } from "../components/FlameCanvas";
import { Porthole } from "../components/Porthole";
import { FanSwitch } from "../components/FanSwitch";
import { NavIcon } from "../components/NavIcon";
import { SourceBtn } from "../components/Source";
import { IconArrow, IconGrid, IconShield, IconTour } from "../components/icons";
import { BODIES, buoyantSpeedRange } from "../physics/scaling";
import { emit, on } from "../mascot/bus";

/** The challenge's verbs, each with the page that serves it. The same order is the judge tour. */
const PATH: { to: string; verb: string; text: string }[] = [
  { to: "/myths/fans", verb: "Interpret", text: "Both halves of the answer, each row with its NASA source." },
  { to: "/paradox", verb: "Model", text: "Two realities that differ only in ventilation." },
  { to: "/envelope", verb: "Find", text: "Every real test by oxygen and pressure, and where nobody has tested." },
  { to: "/rank/lunar", verb: "Rank", text: "The investigations ranked for a lunar habitat, with a stability check." },
  { to: "/evidence", verb: "Summarize", text: "What varied, what stayed constant, which files, in each record." },
  { to: "/playbooks", verb: "Map", text: "Twenty-two fire behaviours, and what is measured for each." },
  { to: "/alarm", verb: "Control", text: "Is the alarm real: smoke, dust, a failing sensor or tampered data." },
  { to: "/ledger", verb: "Trace", text: "The receipt behind any number, verified in your browser." },
];

export function Home({ manifest }: { manifest: Manifest | null }) {
  const [fans, setFansState] = useState(true);
  const setFans = (v: boolean) => { setFansState(v); emit({ type: "CONTEXT", fans: v }); };
  useEffect(() => on((e) => { if (e.type === "FANS") setFansState(e.on); }), []);       // the guided tour flips the switch
  const nasa = manifest?.nasa ?? null;
  const mx = useData<MatrixDoc>(nasa ? "matrix.json" : null);
  const myths = useData<MythsDoc>(nasa ? "myths.json" : null);
  const [mLo, mHi] = buoyantSpeedRange(BODIES.moon.g);
  const myth = myths.data?.items.find((c) => c.id === "fans");
  const vent = mx.data?.playbook.find((s) => s.id === "ventilation");
  // The station's own procedure is stated only when a stored NASA document says it; until then the sentence rests on the test and the guide.
  const brief = vent?.documented.find((d) => d.kind === "quote" && d.quote_verified && d.source.startsWith("NASA-STD-3001"));
  const bass = vent?.documented.find((d) => d.kind === "quote" && d.quote_verified && d.source.startsWith("Burning and Suppression"));

  return (
    <div className="home">
      <section className="split home__hero">
        <div className="stack" style={{ ["--gap" as string]: "22px" }}>
          <h1 className="claim claim--hero">Kill the fans?</h1>
          <p className="lede">
            {brief ? "On the space station, a fire alarm stops the ventilation in the affected module. " : "Stop the air, and a flame in free fall should starve. "}
            When NASA cut the airflow under a flame in the BASS-II experiment, it went out within two seconds.
            {myth?.myth_verified ? <> NASA's own guide still lists <q>{myth.myth.replace(/\.$/, "")}</q> as a misconception.</> : " NASA's own guide still lists that belief as a misconception."}
            {" "}And on the Moon, gravity is a fan nobody can switch off.
          </p>
          <div className="row" style={{ ["--gap" as string]: "10px" }}>
            <a className="btn btn--primary" href={href("/myths/fans")}>Read both halves</a>
            <a className="btn btn--quiet" href="#?tour=1"><IconTour size={16} />Take the 90-second tour</a>
          </div>
          <p className="note home__sources">
            <span>Sources, each with a receipt:</span>
            {brief && brief.kind === "quote" && <SourceBtn title={brief.source} sref={{ ...brief.ref, page: brief.ref.loc }} klass="literature" label="the station's response" extra={[["quotation", brief.quote]]} />}
            {bass && bass.kind === "quote" && <SourceBtn title={bass.source} sref={{ ...bass.ref, page: bass.ref.loc }} klass="literature" label="BASS-II report" extra={[["quotation", bass.quote]]} />}
            {myth && <SourceBtn title="A Researcher's Guide to: Combustion Science" sref={{ ...myth.myth_ref, page: myth.myth_ref.loc }} klass="literature" label="NASA's guide, p. 35" extra={[["quotation", myth.myth]]} />}
            {!nasa && <span>Receipts appear here once the NASA sync has been derived.</span>}
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
                <p className="window-cap__state">
                  {fans
                    ? "Air moves past the fuel at about 10 cm/s. The flame burns blue and steady."
                    : "The flame shrinks and goes out, as one did in BASS-II. Not a rule."}
                </p>
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
                  {fans
                    ? "The fan flow and the buoyant flow add up."
                    : `Buoyancy still draws air through the flame, at about ${(mLo * 100).toFixed(0)} to ${(mHi * 100).toFixed(0)} cm/s by simple scaling. It may keep burning. Not yet measured.`}
                </p>
              </figcaption>
            </figure>
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 22, ["--gap" as string]: "22px" }}>
            <FanSwitch on={fans} onChange={setFans} />
            <KlassBadge k="illustrative" note="shape follows the cube root of gravity" />
          </div>
        </div>
      </section>

      <section className="console" aria-label="Mission console">
        <AskConsole ready={!!nasa} />
        <div className="console__side">
          <section className="console__panel" aria-label="What is measured">
            <header className="console__head"><IconGrid size={18} /><h2>What NASA has measured</h2><a className="console__more" href={href("/playbooks")}>Open the matrix <IconArrow size={13} /></a></header>
            {mx.data ? <CoverageRows mx={mx.data} /> : <p className="note">Appears after the NASA sync.</p>}
            <p className="console__say">{mx.data ? `${mx.data.cells.length} fire behaviours, from a cabin ready to burn to the air after the flame. Each square is one. On the Moon the row empties.` : ""}</p>
          </section>
          <section className="console__panel" aria-label="Alarm trust">
            <header className="console__head"><IconShield size={18} /><h2>Can you trust the alarm?</h2><a className="console__more" href={href("/alarm/replay")}>Open the lab <IconArrow size={13} /></a></header>
            <p className="console__say">Nine situations, from a quiet cabin to a real fire hidden behind replayed "all clear" readings. Every reading is signed. In the test runs no tampering lowered a fire alarm. Synthetic, and labelled so.</p>
          </section>
        </div>
      </section>

      <section className="section" aria-label="What is loaded" style={{ marginTop: 28 }}>
        <div className="statline">
          <a href={href("/evidence")}>
            <div className="stat__label">Investigations from the PSI search</div>
            <div className="stat__value">{nasa ? fmtInt(nasa.search_hits) : "–"}</div>
            <div className="stat__note">{nasa ? `${nasa.investigations_in_scope} in scope, ${nasa.investigations_excluded} excluded with reasons` : "after the NASA sync"}</div>
          </a>
          <a href={href("/envelope")}>
            <div className="stat__label">Test rows in NASA's tables</div>
            <div className="stat__value">{nasa ? fmtInt(nasa.table_rows) : "–"}</div>
            <div className="stat__note">{nasa ? `${nasa.tables} experimental tables` : "after the NASA sync"}</div>
          </a>
          <a href={href("/myths")}>
            <div className="stat__label">Quotations checked against the stored text</div>
            <div className="stat__value">{nasa?.quotes ? `${nasa.quotes_verified} of ${nasa.quotes}` : "–"}</div>
            <div className="stat__note">{nasa ? `${nasa.official_resources_used} of ${nasa.official_resources_total} official resources used` : "the challenge's own list"}</div>
          </a>
          <a href={href("/ledger")}>
            <div className="stat__label">Bytes with a receipt</div>
            <div className="stat__value">{nasa ? fmtBytes(nasa.bytes_in_ledger) : "–"}</div>
            <div className="stat__note">{nasa ? `${fmtInt(nasa.files_in_ledger)} files, chain ${nasa.ledger_chain_ok ? "verified" : "broken"}` : "address, hash and time for each file"}</div>
          </a>
          <a href={href("/ledger")}>
            <div className="stat__label">Fetched from NASA</div>
            <div className="stat__value" style={{ fontSize: "var(--t-18)", paddingTop: 8 }}>{nasa ? fmtUtc(nasa.synced_at_utc) : "not yet"}</div>
            <div className="stat__note">during the event</div>
          </a>
        </div>
      </section>

      <section className="section" style={{ marginTop: 40 }}>
        <div className="section__head">
          <h2 className="claim claim--l">From the question to the evidence</h2>
          <a className="btn btn--quiet btn--sm" href="#?tour=1"><IconTour size={15} />Guided tour</a>
        </div>
        <ol className="routes">
          {PATH.map((p, i) => {
            const item = ALL_ITEMS.find((it) => it.path === "/" + p.to.split("/")[1]);
            return (
              <li key={p.to}>
                <a className="route" href={href(p.to)}>
                  <span className="route__n">{i + 1}</span>
                  <span className="route__icon"><NavIcon name={item?.icon ?? "Info"} size={20} /></span>
                  <span className="route__verb">{p.verb}</span>
                  <span className="route__text">{p.text}</span>
                  <span className="route__go">{item?.label} <IconArrow size={13} /></span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
