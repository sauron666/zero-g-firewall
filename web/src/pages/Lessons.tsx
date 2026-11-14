import { href } from "../app/router";
import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { LessonCard, LessonsDoc } from "../lib/types";
import { SourceBtn } from "../components/Source";
import { IconCheck } from "../components/icons";
import { Item } from "./Myths";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/lessons");
const PAGE_NAME: Record<string, string> = { "/evidence": "Investigations", "/envelope": "Atmosphere map", "/rank": "Rank for a mission", "/data": "Data and models", "/ledger": "Evidence ledger",
  "/myths": "Myths and evidence", "/gaps": "Gaps and plans", "/falsify": "Try to refute it", "/ask": "Ask the evidence", "/lessons": "this page" };

function Card({ c }: { c: LessonCard }) {
  return (
    <article className="lesson" id={c.id}>
      <header>
        <div className="note">{c.when ? `${c.when} · ` : ""}official resource {c.resource}</div>
        <h3 className="claim claim--m" style={{ marginTop: 4 }}>{c.title}</h3>
      </header>
      <div className="balance" style={{ marginTop: 6 }}>
        <section className="evgroup"><h4 className="evgroup__title"><span className="tag">NASA's words</span></h4>{c.what.map((it, i) => <Item key={i} it={it} />)}</section>
        <section className="evgroup"><h4 className="evgroup__title"><span className="tag">On this site</span><span>What the evidence adds</span></h4>{c.ties.map((it, i) => <Item key={i} it={it} />)}</section>
      </div>
    </article>
  );
}

export function Lessons({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const d = useData<LessonsDoc>(ready ? "lessons.json" : null);
  if (!ready) return <Waiting route={route} manifest={manifest} />;
  if (d.error) return <div className="empty"><p className="empty__title">Could not load</p><p style={{ marginTop: 6 }}>{d.error}</p></div>;
  if (!d.data) return <p className="note">Loading…</p>;
  const used = d.data.resources.filter((r) => r.in_ledger && r.used_in.length > 0).length;
  return (
    <div className="stack" style={{ ["--gap" as string]: "26px" }}>
      <h1 className="page-title">Incidents and Earth uses</h1>
      <p className="lede">
        Three times a fire or an oxygen system nearly ended, or did end, a mission. Three times what was learned about fire in space went into the gear of people who fight it on Earth.
        Each is told in NASA's sentences and tied to the evidence on this site.
      </p>
      <p className="note"><KlassBadge k="literature" note="quotations checked against the stored pages" /> {d.data.note}</p>
      {d.data.video && (
        <p className="callout" style={{ maxWidth: 760 }}><IconCheck size={16} />
          <span>To begin with: <a href={d.data.video.url} target="_blank" rel="noreferrer">{d.data.video.title}</a>, by {d.data.video.by} (official resource {d.data.video.resource}; title and author from the stored record). The video opens on YouTube.</span></p>
      )}
      <section className="stack" style={{ ["--gap" as string]: "18px" }}>
        <h2 className="h2">Incidents</h2>
        {d.data.incidents.map((c) => <Card key={c.id} c={c} />)}
      </section>
      <section className="stack" style={{ ["--gap" as string]: "18px" }}>
        <h2 className="h2">On Earth</h2>
        {d.data.earth.map((c) => <Card key={c.id} c={c} />)}
      </section>

      <section id="coverage">
        <div className="section__head"><h2 className="h2">The challenge's ten resources, and where each is used</h2><span className="tag"><IconCheck size={13} />{used} of {d.data.resources.length} used</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>No.</th><th>Resource</th><th>In the ledger</th><th>Used on</th></tr></thead>
            <tbody>
              {d.data.resources.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td style={{ minWidth: 220 }}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></td>
                  <td>{r.receipts[0] ? <SourceBtn title={`${r.id}: ${r.title}`} sref={r.receipts[0]} klass="literature" label="receipt" /> : <span className="note">not fetched</span>}</td>
                  <td>{r.used_in.length === 0 ? <span className="note">not used yet</span> : (
                    <ul style={{ display: "grid", gap: 3 }}>{r.used_in.map((u, i) => <li key={i} style={{ fontSize: 13 }}><a href={href(u.page)}>{PAGE_NAME[u.page] ?? u.page}</a><span className="note">: {u.what}</span></li>)}</ul>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8 }}>A resource counts as used only when its file is in the ledger and a page of this site draws on it.</p>
      </section>
    </div>
  );
}
