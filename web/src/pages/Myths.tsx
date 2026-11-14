import { href } from "../app/router";
import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { MythCard, MythGroup, MythItem, MythsDoc } from "../lib/types";
import { SourceBtn } from "../components/Source";
import { IconCheck, IconInfo, IconWarn } from "../components/icons";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/myths");
const SIDE: Record<MythGroup["side"], { label: string; icon: React.ReactNode }> = {
  holds: { label: "Where it held", icon: <IconCheck size={14} /> },
  warns: { label: "NASA's caution", icon: <IconInfo size={14} /> },
  fails: { label: "Where it may fail", icon: <IconWarn size={14} /> },
  open: { label: "Open", icon: <span aria-hidden="true" style={{ fontWeight: 700 }}>?</span> },
};

export function Item({ it }: { it: MythItem }) {
  if (it.kind === "quote") {
    const loc = it.ref.loc ? `, ${it.ref.loc}` : "";
    return (
      <div className="ev">
        {it.says && <div className="ev__says">{it.says}</div>}
        {it.quote_verified
          ? <blockquote className="ev__quote">“{it.quote}”</blockquote>
          : <p className="ev__quote">{it.quote} <span className="note">(paraphrase: not found word for word in the stored document)</span></p>}
        <div className="ev__src">
          <span>{it.source}{loc}</span>
          <SourceBtn title={`Quotation from ${it.source}`} sref={{ ...it.ref, page: it.ref.loc }} klass="literature" label="receipt"
                     extra={[["quotation", it.quote], ["checked", it.quote_verified ? `found in the stored document${it.ref.match ? " (" + it.ref.match + ")" : ""}, at ${it.ref.loc ?? "the page text"}` : "not found word for word"]]} />
        </div>
      </div>
    );
  }
  if (it.kind === "reading") return <p className="ev ev--reading"><span className="ev__tag">Our reading</span>{it.text}</p>;
  return (
    <div className="ev ev--data">
      <p style={{ maxWidth: "70ch" }}>{it.text}</p>
      {it.rows && it.columns && (() => {
        const table = (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="datatable">
              <thead><tr>{it.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{it.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return it.rows.length > 9 ? <details className="brief__how" style={{ marginTop: 6 }}><summary>Show the {it.rows.length} rows, as NASA wrote them</summary>{table}</details> : table;      // a long table waits behind one line
      })()}
      <div className="ev__src">
        <KlassBadge k={it.klass} />
        {it.accession && <a href={href(`/evidence/${it.accession}`)}>{it.accession}</a>}
        {(it.also ?? []).map((a) => <a key={a} href={href(`/evidence/${a}`)}>{a}</a>)}
        {it.link && <a href={href(it.link)}>{it.link === "/physics" ? "See the model" : it.link === "/envelope" ? "See the map" : it.link === "/data" ? "See the report" : it.link === "/evidence/measured" ? "See what was measured" : "See the records"}</a>}
        {it.sha256 && it.ledger_seq != null && it.accession && <SourceBtn title={`${it.accession}: table`} sref={{ ledger_seq: it.ledger_seq, sha256: it.sha256, url: `https://psi.nasa.gov/physci/repo/data/investigations/${it.accession}`, accession: it.accession }} label="receipt" />}
      </div>
    </div>
  );
}

function Group({ g }: { g: MythGroup }) {
  return (
    <section className={`evgroup evgroup--${g.side}`}>
      <h3 className="evgroup__title"><span className="tag">{SIDE[g.side].icon}{SIDE[g.side].label}</span><span>{g.title}</span></h3>
      {g.items.map((it, i) => <Item key={i} it={it} />)}
    </section>
  );
}

function Card({ c, open }: { c: MythCard; open: boolean }) {
  const fails = c.groups.filter((g) => g.side === "fails");
  const rest = c.groups.filter((g) => g.side !== "fails");
  const wide = fails.length >= rest.length;        // the longer list takes the right-hand column
  const left = wide ? rest : fails;
  const right = wide ? fails : rest;
  return (
    <details className="myth" open={open} id={c.id}>
      <summary>
        <span className="myth__n">Misconception {c.n} of 3 in NASA's guide</span>
        <span className="claim claim--l myth__text">“{c.myth}”</span>
      </summary>
      <div className="myth__body">
        <div className="row" style={{ ["--gap" as string]: "10px" }}>
          <span className="note">{c.myth_verified ? "Quoted from A Researcher's Guide to: Combustion Science" : "From A Researcher's Guide to: Combustion Science"}{c.myth_ref.loc ? `, ${c.myth_ref.loc}` : ""}</span>
          <SourceBtn title="The misconception, as NASA lists it" sref={{ ...c.myth_ref, page: c.myth_ref.loc }} klass="literature" extra={[["quotation", c.myth]]} label="receipt" />
        </div>
        <div className="myth__answer">
          <h2 className="h2">{c.question}</h2>
          <p className="lede" style={{ maxWidth: "62ch", color: "var(--ink)" }}>{c.answer}</p>
          <p className="note">The short answer is our reading of the sources below, not a NASA conclusion or operational advice.</p>
        </div>
        <div className="balance">
          <div className="stack" style={{ ["--gap" as string]: "22px" }}>{left.map((g, i) => <Group key={i} g={g} />)}</div>
          <div className="stack" style={{ ["--gap" as string]: "22px" }}>{right.map((g, i) => <Group key={i} g={g} />)}</div>
        </div>
      </div>
    </details>
  );
}

export function Myths({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const m = useData<MythsDoc>(ready ? "myths.json" : null);
  if (!ready) return <Waiting route={route} manifest={manifest} />;
  if (m.error) return <div className="empty"><p className="empty__title">The evidence cards could not be loaded</p><p style={{ marginTop: 6 }}>{m.error}</p></div>;
  if (!m.data) return <p className="note">Loading…</p>;
  const want = route.segs[1];
  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <h1 className="page-title">Myths and evidence</h1>
      <p className="lede">
        NASA's guide to combustion science names three beliefs about fire in spacecraft and calls them misconceptions. Here each one meets NASA's own documents and tables:
        where it held, where it may fail, and what nobody has measured.
      </p>
      <p className="note">
        <KlassBadge k="literature" note={`${m.data.quotes_verified} of ${m.data.quotes} quotations found word for word in the stored documents`} /> {m.data.note}
      </p>
      {m.data.items.map((c, i) => <Card key={c.id} c={c} open={want ? want === c.id : i === 0} />)}
    </div>
  );
}
