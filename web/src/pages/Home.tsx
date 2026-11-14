import { useState } from "react";
import { href } from "../app/router";
import { Manifest, fmtBytes, fmtInt, fmtUtc } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { FlameCanvas } from "../components/FlameCanvas";
import { Porthole } from "../components/Porthole";
import { FanSwitch } from "../components/FanSwitch";
import { BODIES, buoyantSpeedRange } from "../physics/scaling";

const PATH: { to: string; verb: string; text: string }[] = [
  { to: "/myths", verb: "Interpret", text: "Read both halves of the answer, each row with its NASA source." },
  { to: "/paradox", verb: "Model", text: "Run two realities that differ only in ventilation and scrub time through both." },
  { to: "/envelope", verb: "Find", text: "See where every real test sits in oxygen and pressure, and where nobody has tested." },
  { to: "/rank", verb: "Rank", text: "Rank the investigations for a lunar habitat and check how stable the ranking is." },
  { to: "/evidence", verb: "Summarize", text: "Open an investigation: what varied, what stayed constant, which sensors, which files." },
  { to: "/physics", verb: "Check", text: "Compare the flame model with NASA's own numbers, and gravity with the worst fan speed." },
  { to: "/alarm", verb: "Control", text: "Decide whether an alarm is real: smoke, dust, a failing sensor or tampered data." },
  { to: "/ledger", verb: "Trace", text: "Open the receipt behind any number and verify the signed release in your browser." },
];

export function Home({ manifest }: { manifest: Manifest | null }) {
  const [fans, setFans] = useState(true);
  const nasa = manifest?.nasa ?? null;
  const [mLo, mHi] = buoyantSpeedRange(BODIES.moon.g);

  return (
    <div>
      <section className="split" style={{ minHeight: "min(72vh, 720px)" }}>
        <div className="stack" style={{ ["--gap" as string]: "26px" }}>
          <h1 className="claim claim--hero">Kill the fans?</h1>
          <p className="lede">
            On the space station, the first answer to a fire is to stop the ventilation. When NASA cut the airflow under a flame in the BASS-II experiment, it went out within two seconds.
            NASA's own guide still lists <q>A fire will self-extinguish if ventilation is shut off</q> as a misconception. And on the Moon, gravity is a fan nobody can switch off.
          </p>
          <div className="row" style={{ ["--gap" as string]: "12px" }}>
            <a className="btn btn--primary" href={href("/myths")}>Read both halves</a>
            <a className="btn btn--quiet" href={href("/paradox")}>Run the two realities</a>
          </div>
          <p className="note" style={{ maxWidth: "62ch" }}>
            Sources: BASS-II Summary Report (NTRS 20210011385); A Researcher's Guide to: Combustion Science, p. 35; Lunar Combustion Investigation (NTRS 20250010653).
            {nasa ? " Each is stored in the ledger with its hash, and every quotation is checked against the stored text." : " Receipts appear here once the NASA sync has been derived."}
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
          <div className="row" style={{ justifyContent: "center", marginTop: 26, ["--gap" as string]: "22px" }}>
            <FanSwitch on={fans} onChange={setFans} />
            <KlassBadge k="illustrative" note="shape follows the cube root of gravity" />
          </div>
        </div>
      </section>

      <section className="section" aria-label="What is loaded">
        <div className="statline">
          <div>
            <div className="stat__label">Investigations from the PSI search</div>
            <div className="stat__value">{nasa ? fmtInt(nasa.search_hits) : "–"}</div>
            <div className="stat__note">{nasa ? `${nasa.investigations_in_scope} in scope, ${nasa.investigations_excluded} excluded with reasons` : "after the NASA sync"}</div>
          </div>
          <div>
            <div className="stat__label">Test rows in NASA's tables</div>
            <div className="stat__value">{nasa ? fmtInt(nasa.table_rows) : "–"}</div>
            <div className="stat__note">{nasa ? `${nasa.tables} experimental tables` : "after the NASA sync"}</div>
          </div>
          <div>
            <div className="stat__label">Official resources used</div>
            <div className="stat__value">{nasa ? `${nasa.official_resources_used} of ${nasa.official_resources_total}` : "–"}</div>
            <div className="stat__note">the challenge's own list</div>
          </div>
          <div>
            <div className="stat__label">Bytes with a receipt</div>
            <div className="stat__value">{nasa ? fmtBytes(nasa.bytes_in_ledger) : "–"}</div>
            <div className="stat__note">{nasa ? `${fmtInt(nasa.files_in_ledger)} files, chain ${nasa.ledger_chain_ok ? "verified" : "broken"}` : "address, hash and time for each file"}</div>
          </div>
          <div>
            <div className="stat__label">Fetched from NASA</div>
            <div className="stat__value" style={{ fontSize: "var(--t-18)", paddingTop: 8 }}>{nasa ? fmtUtc(nasa.synced_at_utc) : "not yet"}</div>
            <div className="stat__note">during the event</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="claim claim--l">From the question to the evidence, in eight steps</h2>
        </div>
        <ol className="grid cols-2" style={{ ["--gap" as string]: "0 40px" }}>
          {PATH.map((p, i) => (
            <li key={p.to} style={{ borderTop: "1px solid var(--hairline)" }}>
              <a href={href(p.to)} style={{ display: "grid", gridTemplateColumns: "28px 92px minmax(0,1fr)", gap: 10, padding: "14px 0", textDecoration: "none", alignItems: "baseline" }}>
                <span className="num" style={{ color: "var(--ink-3)" }}>{i + 1}</span>
                <span style={{ fontWeight: 700 }}>{p.verb}</span>
                <span className="claim" style={{ fontSize: "1.06rem", lineHeight: 1.4, fontWeight: 400, color: "var(--ink-2)" }}>{p.text}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
