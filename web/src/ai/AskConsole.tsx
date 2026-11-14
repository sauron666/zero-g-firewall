import { useState } from "react";
import { href } from "../app/router";
import { AgentRun, runAgent } from "../lib/agent";
import { IconArrow, IconAsk } from "../components/icons";
import { useKit } from "./kit";

const STARTERS = ["Will a fire go out if the fans are stopped?", "Has anything been burned in lunar gravity?", "How many tests are near 30% oxygen at 10.2 psia?"];
export const askLink = (q: string) => `#ask?q=${encodeURIComponent(q)}`;

/** The evidence agent on the opening page: ask, see the first sentences with their sources and the tools that ran. */
export function AskConsole({ ready }: { ready: boolean }) {
  const { kit, count } = useKit(ready);
  const [q, setQ] = useState("");
  const [run, setRun] = useState<AgentRun | null>(null);
  const ask = (text: string) => { const t = text.trim(); if (!kit || !t) return; setQ(t); setRun(runAgent(t, kit)); };
  const tools = run ? run.steps.map((s) => s.tool) : [];

  return (
    <section className="console__ask" aria-label="Ask the evidence">
      <header className="console__head"><IconAsk size={18} /><h2>Ask the evidence</h2><span className="console__meta">{count ? `${count} passages · no key · works offline` : "after the NASA sync"}</span></header>
      <form className="askbar" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label className="sr" htmlFor="homeq">Your question</label>
        <input id="homeq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about fire in spacecraft" autoComplete="off" />
        <button type="submit" className="btn btn--primary" disabled={!kit || !q.trim()}>Ask</button>
      </form>
      <div className="row" style={{ ["--gap" as string]: "6px", marginTop: 10 }}>
        {STARTERS.map((s) => <button key={s} type="button" className="chipbtn" onClick={() => ask(s)} disabled={!kit}>{s}</button>)}
      </div>
      {run && (
        <div className="console__answer" aria-live="polite">
          {run.notes.map((n) => <p key={n} className="note">{n}</p>)}
          {run.answer.abstained
            ? <p className="console__line">{run.answer.why}</p>
            : run.answer.lines.slice(0, 3).map((l, i) => {
              const p = run.hits[l.cite - 1]?.passage;
              const plain = p?.id.startsWith("tool:") || p?.t.startsWith("Our reading") || /["“”]/.test(l.text);   // a sentence that already quotes NASA gets no second pair of marks
              return <p key={i} className="console__line">{plain ? l.text : `“${l.text}”`} <span className="console__src">{p?.id.startsWith("tool:") ? "computed here" : p?.t}</span></p>;
            })}
          <div className="console__trace">
            <span>{tools.join(" → ")}</span>
            <span>{run.ms < 1 ? "under 1" : Math.round(run.ms)} ms · no model</span>
          </div>
          <a className="btn btn--quiet btn--sm" href={askLink(run.question)}>Sources, receipts and the full trace <IconArrow size={14} /></a>
        </div>
      )}
    </section>
  );
}
