import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { GapsDoc } from "../lib/types";
import { Readings, Tile } from "../dash/widgets";
import { OxygenCover } from "../viz/OxygenCover";
import { Item } from "./Myths";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/gaps");

export function Gaps({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const d = useData<GapsDoc>(ready ? "gaps.json" : null);
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
            <Tile label="In partial gravity" value={c.regimes.find((r) => r.id === "partial")?.rows ?? 0} sub="lunar or Martian" tone="partial" />
            <Tile label="Measured gaps" value={d.data.items.length} sub="each with NASA's plan" />
          </Readings>
        );
      })()}
      <p className="note"><KlassBadge k="derived" note="counted from NASA's tables" /> {d.data.note}</p>
      {d.data.coverage && <OxygenCover c={d.data.coverage} />}
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
