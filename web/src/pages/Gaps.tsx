import { href } from "../app/router";
import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { GapsDoc, MythItem, ReportedDoc } from "../lib/types";
import { Readings, Tile } from "../dash/widgets";
import { OxygenCover } from "../viz/OxygenCover";
import { DocBtn, LunarRates } from "../viz/Reported";
import { Item } from "./Myths";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/gaps");
const has = (it: MythItem, keys: string[]) => it.kind === "quote" && keys.some((k) => it.quote.includes(k));
/** The quotations shown first, in the order asked for; the others stay one click away. */
const pickQ = (items: MythItem[], keys: string[]) => keys.map((k) => items.find((it) => has(it, [k]))).filter((x): x is MythItem => !!x);
const restQ = (items: MythItem[], keys: string[]) => items.filter((it) => !has(it, keys));

export function Gaps({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const d = useData<GapsDoc>(ready ? "gaps.json" : null);
  const rep = useData<ReportedDoc>(ready && manifest?.artifacts["reported.json"] ? "reported.json" : null);
  if (!ready) return <Waiting route={route} manifest={manifest} />;
  if (d.error) return <div className="empty"><p className="empty__title">Could not load</p><p style={{ marginTop: 6 }}>{d.error}</p></div>;
  if (!d.data) return <p className="note">Loading…</p>;
  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <h1 className="page-title">Gaps and plans</h1>
      <p className="lede">Where NASA's open combustion data ends, counted from the tables, with the experiment planned or flown to fill each gap.</p>
      {d.data.coverage && (() => {
        const c = d.data.coverage;
        const solid = c.kinds.find((k) => k.id === "solid");
        return (
          <Readings>
            <Tile label="Rows placed by oxygen" value={c.placed} of={`of ${c.total.toLocaleString("en-US")}`} sub="test rows of NASA's tables" />
            <Tile label="Solids, most oxygen" value={solid?.max != null ? 100 * solid.max : null} decimals={1} unit="%" sub="exploration plans 30% and 34%" tone="flame" />
            <Tile label="Any fuel, most oxygen" value={100 * c.top} unit="%" sub="a suit holds pure oxygen" tone="flame" />
            <Tile label="In partial gravity" value={c.regimes.find((r) => r.id === "partial")?.rows ?? 0} sub="rows in PSI's tables" tone="partial" />
            {rep.data
              ? <Tile label="Planned on the Moon" value={rep.data.fm2.tests.length} sub={`tests at ${rep.data.fm2.tests[0].p_psia} psia, FM2`} tone="partial" />
              : <Tile label="Measured gaps" value={d.data.items.length} sub="each with NASA's plan" />}
          </Readings>
        );
      })()}
      <p className="note"><KlassBadge k="derived" note="counted from NASA's tables" /> {d.data.note}</p>
      {d.data.coverage && <OxygenCover c={d.data.coverage} reported={rep.data} />}
      {rep.data && (() => {
        const r = rep.data, fabric = r.luci.rows.find((x) => x.id === "fabric_base"), t = r.fm2.tests;
        return (
          <section className="panel" data-klass="literature" id="reported">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">Outside PSI: what NASA has measured in lunar gravity</h2>
                <p className="panel__sub">One flight on a spinning rocket. {fabric ? `The fabric's flame moved at ${fabric.lunar} ${fabric.unit} where the same test on Earth gave ${fabric.earth}, and it burned longer.` : ""}</p>
              </div>
              <KlassBadge k="literature" note={`${r.n_checks} cross-checks pass`} />
            </div>
            <LunarRates doc={r} />
            <div className="balance" style={{ marginTop: 16 }}>
              <section className="evgroup">
                <h3 className="evgroup__title"><span className="tag">Flown</span><span>LUCI, on a rocket spun to lunar gravity{r.luci.launched ? `; launched ${r.luci.launched.as_stated}` : ""}</span></h3>
                {pickQ(r.quotes.luci, ["45 seconds sooner", "Coriolis"]).map((it, i) => <Item key={i} it={it} />)}
                <details className="howto"><summary>More from the slides</summary>{restQ(r.quotes.luci, ["45 seconds sooner", "Coriolis"]).map((it, i) => <Item key={i} it={it} />)}</details>
              </section>
              <section className="evgroup">
                <h3 className="evgroup__title"><span className="tag">Planned</span><span>FM2, on the Moon</span></h3>
                <div className="ev ev--data">
                  <p style={{ maxWidth: "70ch" }}>{t.length} tests of one fabric at {t[0].p_psia} psia, starting at {t.map((x) => `${x.o2_pct}%`).join(", ")} oxygen. They are the green diamonds on the chart above and on the <a href={href("/envelope")}>atmosphere map</a>.</p>
                  <div className="ev__src"><KlassBadge k="literature" /><DocBtn r={r.fm2.ref} title={r.fm2.title} /></div>
                </div>
                {pickQ(r.quotes.lunar, ["potentially worse than even 1-g", "late 2026"]).map((it, i) => <Item key={i} it={it} />)}
                <details className="howto"><summary>More from NASA's 2026 abstract and slides</summary>
                  {[...restQ(r.quotes.lunar, ["potentially worse than even 1-g", "late 2026"]), ...r.quotes.fm2].map((it, i) => <Item key={i} it={it} />)}
                </details>
              </section>
            </div>
          </section>
        );
      })()}
      {d.data.items.map((g) => (
        <article key={g.id} className="gap" id={g.id}>
          <header className="gap__head">
            <div className="gap__measure"><span className="gap__num num">{g.measure}</span><span className="gap__unit">{g.unit}</span></div>
            <div>
              <h2 className="claim claim--m">{g.title}</h2>
              <p className="doc" style={{ fontSize: "1rem", marginTop: 6 }}>{g.why}</p>
            </div>
          </header>
          <div className="balance">
            <section className="evgroup">
              <h3 className="evgroup__title"><span className="tag">Measured</span><span>How we know</span></h3>
              {g.evidence.map((it, i) => <Item key={i} it={it} />)}
            </section>
            <div className="stack" style={{ ["--gap" as string]: "18px" }}>
              {g.plans.map((p) => (
                <section key={p.name} className="evgroup">
                  <h3 className="evgroup__title"><span className="tag">{p.state}</span><span>{p.name}</span></h3>
                  {p.items.map((it, i) => <Item key={i} it={it} />)}
                </section>
              ))}
            </div>
          </div>
        </article>
      ))}
      {d.data.outside_the_combustion_search.length > 0 && (
        <section className="evgroup evgroup--open">
          <h3 className="evgroup__title"><span className="tag">Outside the search</span><span>Fire-related records the combustion search does not return</span></h3>
          <p className="ev ev--data">{d.data.outside_the_combustion_search.join(", ")}. {d.data.outside_note}</p>
          <p className="note">Other searches run during the sync: {Object.entries(d.data.searches).map(([k, v]) => `"${k}" ${v}`).join(", ")}.</p>
        </section>
      )}
    </div>
  );
}
