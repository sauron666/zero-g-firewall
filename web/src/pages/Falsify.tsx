import { useMemo, useState } from "react";
import { href } from "../app/router";
import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { firstPass } from "../lib/falsify";
import { buildIndex } from "../lib/search";
import type { FalsifyClaim, FalsifyDoc, IndexDoc } from "../lib/types";
import { IconCheck, IconInfo, IconWarn } from "../components/icons";
import { Item } from "./Myths";
import { PageProps } from "./stubs";

const GLYPH: Record<FalsifyClaim["verdict"], React.ReactNode> = {
  holds: <IconCheck size={18} />, limited: <IconInfo size={18} />, contradicted: <IconWarn size={18} />, untested: <span style={{ fontWeight: 700 }}>?</span>,
};

function Detail({ c }: { c: FalsifyClaim }) {
  return (
    <article className="stack" style={{ ["--gap" as string]: "22px" }}>
      <div className={`verdictbox verdictbox--${c.verdict}`}>
        <div className="verdictbox__head">{GLYPH[c.verdict]}<span>{c.verdict_label}</span></div>
        <blockquote className="claim claim--m" style={{ maxWidth: "40ch" }}>“{c.claim}”</blockquote>
        <p className="doc" style={{ fontSize: "1.04rem" }}>{c.summary}</p>
        <div className="row" style={{ ["--gap" as string]: "8px" }}>
          <span className="note">Scope its evidence covers:</span>
          {c.scope.map((s) => <span key={s} className="tag" style={{ height: "auto", minHeight: 24, whiteSpace: "normal", padding: "2px 8px" }}>{s}</span>)}
        </div>
        <p className="note">The verdict and the summary are our reading of the items below. <a href={href(c.origin)}>Where the site uses this conclusion</a></p>
      </div>
      <div className="balance">
        <section className="evgroup">
          <h3 className="evgroup__title"><span className="tag"><IconCheck size={14} />For it</span><span>Evidence within that scope</span></h3>
          {c.holds.map((it, i) => <Item key={i} it={it} />)}
        </section>
        <div className="stack" style={{ ["--gap" as string]: "20px" }}>
          {c.fails.map((g, i) => (
            <section key={i} className="evgroup">
              <h3 className="evgroup__title"><span className="tag"><IconWarn size={14} />Against it</span><span>{g.title}</span></h3>
              {g.items.map((it, k) => <Item key={k} it={it} />)}
            </section>
          ))}
        </div>
      </div>
      <div className="balance">
        <section className="evgroup evgroup--open">
          <h3 className="evgroup__title"><span className="tag"><span style={{ fontWeight: 700 }}>?</span>Never tested</span><span>Where nobody can say</span></h3>
          {c.untested.map((it, i) => <Item key={i} it={it} />)}
        </section>
        <section className="evgroup evgroup--open">
          <h3 className="evgroup__title"><span className="tag"><IconInfo size={14} />Next</span><span>What would test it</span></h3>
          {c.next.map((it, i) => <Item key={i} it={it} />)}
        </section>
      </div>
    </article>
  );
}

export function Falsify({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const d = useData<FalsifyDoc>(ready ? "falsify.json" : null);
  const ix = useData<IndexDoc>(ready ? "index.json" : null);
  const index = useMemo(() => (ix.data ? buildIndex(ix.data.chunks) : null), [ix.data]);
  const [sel, setSel] = useState<string>(route.segs[1] ?? "bass-flow-off");
  const [typed, setTyped] = useState("");
  const [own, setOwn] = useState<string | null>(null);
  const pass = useMemo(() => (own && index ? firstPass(own, index) : null), [own, index]);
  if (!ready) return <div className="empty"><p className="empty__title">Waiting for the NASA sync</p></div>;
  if (d.error) return <div className="empty"><p className="empty__title">Could not load</p><p style={{ marginTop: 6 }}>{d.error}</p></div>;
  if (!d.data) return <p className="note">Loading…</p>;
  const cur = d.data.items.find((c) => c.id === sel) ?? d.data.items[0];
  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <h1 className="page-title">Try to refute it</h1>
      <p className="lede">
        A conclusion is only as good as the search for its exceptions. Pick one, including the ones this site draws about itself, and see the evidence for it, the conditions under which NASA's
        own documents and tables say it fails, what has never been tested, and what would test it.
      </p>
      <p className="note"><KlassBadge k="derived" note={`${d.data.quotes_verified} of ${d.data.quotes} quotations found word for word in the stored documents`} /> {d.data.note}</p>

      <div className="claimlist" role="tablist" aria-label="Conclusions">
        {d.data.items.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={!own && c.id === cur.id} className="claimlist__item" onClick={() => { setSel(c.id); setOwn(null); }}>
            <span className="claimlist__verdict">{GLYPH[c.verdict]}{c.verdict_label}</span>
            <span className="claimlist__text">{c.claim}</span>
          </button>
        ))}
      </div>

      <form className="askbar" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) setOwn(typed.trim()); }}>
        <label className="sr" htmlFor="ownclaim">A conclusion of your own</label>
        <input id="ownclaim" type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a conclusion of your own, for example: fabric is safe in a lunar habitat once the fans stop" />
        <button type="submit" className="btn btn--quiet" disabled={!index || !typed.trim()}>Look for exceptions</button>
      </form>

      {own && pass ? (
        <article className="stack" style={{ ["--gap" as string]: "20px" }}>
          <div className="verdictbox verdictbox--untested">
            <div className="verdictbox__head"><span style={{ fontWeight: 700 }}>?</span><span>A first pass by word match. It cannot judge the claim; it shows where to look.</span></div>
            <blockquote className="claim claim--m" style={{ maxWidth: "44ch" }}>“{own}”</blockquote>
          </div>
          {pass.untested.length > 0 && (
            <section className="evgroup evgroup--open">
              <h3 className="evgroup__title"><span className="tag"><span style={{ fontWeight: 700 }}>?</span>Never tested</span><span>Regimes this claim touches where PSI has no data</span></h3>
              {pass.untested.map((u) => <p key={u} className="ev ev--data">{u}</p>)}
            </section>
          )}
          <div className="balance">
            <section className="evgroup">
              <h3 className="evgroup__title"><span className="tag"><IconWarn size={14} />Read these first</span><span>Passages on the subject that limit or negate something ({pass.against.length})</span></h3>
              {pass.against.map((h) => (
                <div key={h.passage.id} className="ev"><div className="ev__says">{h.passage.t} · carries the phrase "{h.cue}"</div><p style={{ fontSize: 14, maxWidth: "70ch" }}>{h.passage.x.slice(0, 420)}{h.passage.x.length > 420 ? " …" : ""}</p>
                  <div className="ev__src"><KlassBadge k={h.passage.k} />{h.passage.l && <a href={href(h.passage.l)}>Open on this site</a>}</div></div>
              ))}
              {pass.against.length === 0 && <p className="note" style={{ paddingTop: 10 }}>No stored passage on this subject carries a limiting phrase. That is not support for the claim.</p>}
            </section>
            <section className="evgroup">
              <h3 className="evgroup__title"><span className="tag"><IconInfo size={14} />Also on the subject</span><span>Other passages that share its words ({pass.alongside.length})</span></h3>
              {pass.alongside.slice(0, 5).map((h) => (
                <div key={h.passage.id} className="ev"><div className="ev__says">{h.passage.t}</div><p style={{ fontSize: 14, maxWidth: "70ch" }}>{h.passage.x.slice(0, 300)}{h.passage.x.length > 300 ? " …" : ""}</p>
                  <div className="ev__src"><KlassBadge k={h.passage.k} />{h.passage.l && <a href={href(h.passage.l)}>Open on this site</a>}</div></div>
              ))}
              {pass.alongside.length === 0 && pass.against.length === 0 && <p className="note" style={{ paddingTop: 10 }}>The stored evidence holds nothing in these words. An absence of evidence here settles nothing.</p>}
            </section>
          </div>
        </article>
      ) : <Detail c={cur} />}
    </div>
  );
}
