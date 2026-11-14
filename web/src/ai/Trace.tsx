import { AgentRun, TOOLS } from "../lib/agent";

/** The steps the agent took, as they ran: tool, arguments, result, time. Nothing here is narration added afterwards. */
export function Trace({ run, model, open = false }: { run: AgentRun; model?: { by: string; kept: number; dropped: number; ms?: number } | null; open?: boolean }) {
  const n = run.steps.length + (model ? 2 : 0);
  return (
    <details className="trace" open={open}>
      <summary>
        <span className="trace__title">Steps taken</span>
        <span className="trace__meta">{n} steps · {run.ms < 1 ? "under 1" : Math.round(run.ms)} ms · planner: {model ? "rules, then a model writes" : "rules, no model"}</span>
      </summary>
      <ol className="trace__steps">
        {run.steps.map((s, i) => (
          <li key={i} className="trace__step" data-empty={s.found === 0}>
            <div className="trace__head">
              <code className="trace__tool">{s.tool}</code>
              <span className="trace__what">{TOOLS[s.tool].title}</span>
              <span className="trace__ms">{s.ms < 1 ? "<1" : Math.round(s.ms)} ms</span>
            </div>
            <div className="trace__args">
              {Object.entries(s.args).map(([k, v]) => <span key={k} className="trace__arg">{k} = {typeof v === "string" && v.length > 60 ? v.slice(0, 57) + "…" : String(v)}</span>)}
              <span className="trace__reads">reads {TOOLS[s.tool].reads}</span>
            </div>
            <p className="trace__why">Why: {s.why}{/[.?!]$/.test(s.why) ? "" : "."}</p>
            <p className="trace__out">{s.out}</p>
          </li>
        ))}
        {model && (
          <>
            <li className="trace__step"><div className="trace__head"><code className="trace__tool">write_with_model</code><span className="trace__what">A model rephrases the passages</span>{model.ms != null && <span className="trace__ms">{Math.round(model.ms)} ms</span>}</div>
              <div className="trace__args"><span className="trace__arg">model = {model.by}</span><span className="trace__reads">reads the passages found, as data</span></div>
              <p className="trace__out">The model received numbered passages and the rule that every sentence must cite one.</p></li>
            <li className="trace__step"><div className="trace__head"><code className="trace__tool">verify_model_answer</code><span className="trace__what">Each sentence is verified against its source</span></div>
              <p className="trace__out">{model.kept} kept, {model.dropped} removed. A sentence is removed if it cites nothing that was given, carries a number its source lacks, or gives a verdict or a probability.</p></li>
          </>
        )}
      </ol>
    </details>
  );
}
