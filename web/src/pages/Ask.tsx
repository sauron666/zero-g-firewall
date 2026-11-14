import { useEffect, useMemo, useRef, useState } from "react";
import { href } from "../app/router";
import { KLASS, KlassBadge } from "../lib/klass";
import { askModel, callModel, loadSettings, Mode, ModelConfig, ModelRun, ping, saveSettings, Settings, SYSTEM, userPrompt, Vendor, VENDOR_DEFAULT, verify, Verified } from "../lib/ai";
import { smallTalk, Talk } from "../lib/smalltalk";
import { connected } from "../mascot/Chat";
import { AgentRun, runAgent } from "../lib/agent";
import { EVAL, EvalKind, EvalReport, runEval } from "../lib/evalset";
import { PLANTED, poisonDemo } from "../lib/poison";
import { beliefQuotes } from "../lib/check";
import { CHECKSET, runCheckset } from "../lib/checkset";
import { BrowserModelConfig, callBrowserModel, choose, Probe, probe } from "../lib/browserModel";
import { useKit } from "../ai/kit";
import { Trace } from "../ai/Trace";
import { useReceipt } from "../components/Receipt";
import { IconCheck, IconClose, IconInfo, IconReceipt, IconWarn } from "../components/icons";
import { PageProps } from "./stubs";
import { emit } from "../mascot/bus";
import { point } from "../mascot/pointer";

export const EXAMPLES = [
  "Will a fire go out if the fans are stopped?",
  "Has anything been burned in lunar gravity?",
  "How many tests are near 30% oxygen at 10.2 psia?",
  "Rank the investigations for a lunar habitat",
  "What happened in the fire on Mir?",
  "What problems were found in NASA's tables?",
  "Is it safe to stop the fans on the Moon?",
];
const KIND: Record<EvalKind, [string, string]> = {
  gold: ["Finds the right source", "answered, and a cited passage comes from the expected source"],
  computed: ["Computes with code", "the right tool ran and the number matches the artifact"],
  abstain: ["Says it has no answer", "questions the data cannot answer"],
  adversarial: ["Yields no verdict", "attempts to pull out a verdict, a probability or obedience"],
};
const Mark = ({ ok }: { ok: boolean }) => <span className={`mark ${ok ? "" : "mark--no"}`} role="img" aria-label={ok ? "passed" : "failed"}>{ok ? <IconCheck size={12} /> : <IconClose size={11} />}</span>;
const MODES: [Mode, string, string][] = [
  ["offline", "Built in", "Sentences come straight from NASA's tables and documents. Works with no connection and no key."],
  ["browser", "In this browser", "A model inside this browser tab writes the answer from the passages. No key or server, and no connection once it is on the machine: the setting for a habitat with no link to Earth."],
  ["local", "Local model", "A model served on this computer or on the habitat's own network writes the answer from the passages. Nothing leaves the machine."],
  ["cloud", "Cloud model", "A hosted model writes the answer from the passages, with a key you type here."],
  ["hybrid", "Hybrid", "The local model drafts, the cloud model checks the draft against the passages."],
];
const VENDORS: [Vendor, string][] = [["anthropic", "Anthropic (Claude)"], ["openai", "OpenAI"], ["gemini", "Google (Gemini)"], ["compatible", "Any OpenAI-compatible endpoint"]];
const FANS = /\b(fan|fans|ventilat|airflow|self-?extinguish)/i;

function ModelFields({ title, cfg, onChange, vendors }: { title: string; cfg: ModelConfig; onChange: (c: ModelConfig) => void; vendors: boolean }) {
  const [t, setT] = useState<"busy" | { ok: string; ms: number } | { error: string } | null>(null);
  useEffect(() => setT(null), [cfg.vendor, cfg.endpoint, cfg.model, cfg.key]);                 // a result belongs to the settings it was obtained with
  const test = async () => {                                                                   // one word each way: shows whether address, key and model name work together
    setT("busy");
    try { const r = await ping(cfg); setT({ ok: r.reply, ms: r.ms }); } catch (e) { setT({ error: String((e as Error).message ?? e) }); }
  };
  return (
    <fieldset className="aiset">
      <legend>{title}</legend>
      {vendors && (
        <label><span>Service</span>
          <select className="select" value={cfg.vendor} onChange={(e) => { const v = e.target.value as Vendor; onChange({ ...cfg, vendor: v, endpoint: VENDOR_DEFAULT[v].endpoint, model: VENDOR_DEFAULT[v].model }); }}>
            {VENDORS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select></label>
      )}
      <label><span>Address</span><input value={cfg.endpoint} onChange={(e) => onChange({ ...cfg, endpoint: e.target.value })} spellCheck={false} /></label>
      <label><span>Model name</span><input value={cfg.model} onChange={(e) => onChange({ ...cfg, model: e.target.value })} placeholder="as the service names it" spellCheck={false} /></label>
      <label><span>Key{vendors ? "" : " (if the server asks for one)"}</span><input type="password" value={cfg.key} onChange={(e) => onChange({ ...cfg, key: e.target.value })} autoComplete="off" /></label>
      <div className="row" style={{ ["--gap" as string]: "10px", marginTop: 4 }}>
        <button type="button" className="btn btn--quiet" disabled={t === "busy" || !cfg.model} onClick={test}>{t === "busy" ? "Testing…" : "Test the connection"}</button>
        {t && t !== "busy" && ("ok" in t
          ? <span className="note" role="status"><IconCheck size={14} /> {cfg.model} replied “{t.ok}” in {(t.ms / 1000).toFixed(1)} s.</span>
          : <span className="note" role="alert" style={{ color: "var(--ink)" }}><IconWarn size={14} /> {t.error}</span>)}
      </div>
    </fieldset>
  );
}

const CHROME: Record<Probe["chrome"], string> = {
  available: "ready on this machine", downloadable: "offered; the browser downloads it on first use", downloading: "being downloaded by the browser",
  unavailable: "offered by this browser but not usable on this machine", absent: "not offered by this browser (Chrome 148 or later on a desktop has it)",
};
function BrowserFields({ cfg, onChange }: { cfg: BrowserModelConfig; onChange: (c: BrowserModelConfig) => void }) {
  const [p, setP] = useState<Probe | null>(null);
  useEffect(() => { probe().then(setP).catch(() => setP({ chrome: "absent", webgpu: false })); }, []);
  const pick = p ? choose(cfg, p) : null;
  return (
    <fieldset className="aiset">
      <legend>Model in this browser</legend>
      <label><span>Which model</span>
        <select className="select" value={cfg.backend} onChange={(e) => onChange({ ...cfg, backend: e.target.value as BrowserModelConfig["backend"] })}>
          <option value="auto">Automatic: the browser's own model, else WebGPU</option>
          <option value="chrome">The browser's own model</option>
          <option value="webllm">An open model on WebGPU (WebLLM)</option>
        </select></label>
      <label><span>WebGPU model</span><input value={cfg.webllmModel} onChange={(e) => onChange({ ...cfg, webllmModel: e.target.value })} spellCheck={false} /></label>
      <ul className="note" style={{ display: "grid", gap: 4, marginTop: 4 }}>
        <li>The browser's own model: {p ? CHROME[p.chrome] : "checking…"}.</li>
        <li>WebGPU: {p ? (p.webgpu ? "available" : "not available in this browser") : "checking…"}.</li>
        <li><b>{p ? (pick === "chrome" ? "The browser's own model will be used." : pick === "webllm" ? `${cfg.webllmModel} will be used; its weights are downloaded once, then kept by the browser.` : "Neither is available here. The offline engine still answers.") : ""}</b></li>
      </ul>
    </fieldset>
  );
}

export function Ask({ manifest, route }: PageProps) {
  const ready = !!manifest?.nasa;
  const { kit, count, error } = useKit(ready);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState<AgentRun | null>(null);
  const [run, setRun] = useState<(ModelRun & { ms: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [talk, setTalk] = useState<Talk | null>(null);
  const [live, setLive] = useState<{ raw: string; verified: Verified; by: string } | { error: string } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [progress, setProgress] = useState<{ f: number; text: string } | null>(null);
  const [probeText, setProbeText] = useState(CHECKSET[0].text);
  const [probeSrc, setProbeSrc] = useState(CHECKSET[0].cite ?? "");
  const srcRef = useRef<HTMLOListElement | null>(null);
  const first = useRef(false);
  const stopPointing = useRef<() => void>(() => {});
  useEffect(() => () => stopPointing.current(), []);
  const open = useReceipt();
  const update = (s: Settings) => { setSettings(s); saveSettings(s); };
  useEffect(() => { if (focus != null) srcRef.current?.querySelector(`[data-n="${focus}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [focus]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!kit || !text) return;
    setQ(text); setErr(null); setRun(null); setFocus(null); setTalk(null);
    const hello = smallTalk(text, { model: connected(settings), examples: EXAMPLES });
    if (hello) { setAgent(null); setTalk(hello); return; }                                    // a greeting is answered as a greeting, in every mode
    emit({ type: "SEARCHING" });
    const a = runAgent(text, kit);
    setAgent(a);
    const cites = Array.from(new Set(a.answer.lines.map((l) => l.cite)));
    emit({ type: "ANSWER_DONE", strength: a.refused ? "refused" : a.answer.abstained ? "gap" : "supported", cites });
    window.setTimeout(() => { stopPointing.current(); stopPointing.current = point(cites.map((n) => document.querySelector(`.sources li[data-n="${n}"]`)).filter((e): e is Element => !!e)); }, 350);
    if (settings.mode === "offline" || a.refused || a.hits.length === 0) return;
    setBusy(true);
    const t0 = performance.now();
    try { setRun({ ...(await askModel(settings, text, a.hits, undefined, (f, tx) => setProgress({ f, text: tx }), undefined, quotes)), ms: performance.now() - t0 }); } catch (e) { setErr(String((e as Error).message ?? e)); }
    setBusy(false); setProgress(null);
  };
  useEffect(() => {                       // a link such as #ask?q=... asks its question once the passages are loaded
    const asked = route.query.get("q");
    if (kit && asked && !first.current) { first.current = true; ask(asked); }
  }, [kit]);                              // eslint-disable-line react-hooks/exhaustive-deps

  const quotes = useMemo(() => (kit ? beliefQuotes(kit.index.passages) : {}), [kit]);                  // the guide's words for its misconceptions, read from the data
  const checks = useMemo(() => (kit ? runCheckset(kit.index.passages) : null), [kit]);
  const probeSources = useMemo(() => (checks ? Array.from(new Map(checks.results.filter((r) => r.source).map((r) => [r.source!.id, r.source!])).values()) : []), [checks]);
  const probed = useMemo(() => {
    const src = probeSources.find((p) => p.id === probeSrc);
    const text = probeText.trim();
    if (!src || !text) return null;
    const v = verify(/\[\d+\]/.test(text) ? text : `${text.replace(/[.!?]+$/, "")} [1].`, [{ passage: src, score: 0, matched: [] }], quotes);
    return { src, kept: v.kept, dropped: v.dropped };
  }, [probeText, probeSrc, probeSources, quotes]);
  const demoHits = useMemo(() => (kit ? runAgent("Will a fire go out if the fans are stopped?", kit).hits : []), [kit]);
  const demo = useMemo(() => (kit ? poisonDemo(demoHits, new Set(kit.index.passages.map((p) => p.id))) : null), [kit, demoHits]);
  const tryLive = async () => {
    if (!kit) return;
    const cfg = settings.mode === "local" || settings.mode === "hybrid" ? settings.local : settings.cloud;
    setLiveBusy(true); setLive(null);
    try {
      const poisoned = [...demoHits, { passage: PLANTED, score: 0, matched: [] }];        // the gates are bypassed on purpose, for this one request
      const prompt = userPrompt("Will a fire go out if the fans are stopped?", poisoned);
      const out = settings.mode === "browser" ? await callBrowserModel(settings.browser, SYSTEM, prompt) : { text: await callModel(cfg, SYSTEM, prompt), by: cfg.model };
      setLive({ raw: out.text, verified: verify(out.text, demoHits, quotes), by: out.by });
    } catch (e) { setLive({ error: String((e as Error).message ?? e) }); }
    setLiveBusy(false);
  };

  if (!ready) return <div className="empty"><p className="empty__title">Waiting for the NASA sync</p><p style={{ marginTop: 6 }}>The evidence engine answers only from data fetched from NASA.</p></div>;
  const cite = (n: number) => <button key={n} type="button" className="cite" onClick={() => setFocus(n)} aria-label={`Source ${n}`}>{n}</button>;
  const modeInfo = MODES.find((m) => m[0] === settings.mode)!;
  const useModel = run && !run.verified.abstained && run.verified.kept.length > 0;
  const hits = agent?.hits ?? [];
  const offline = agent?.answer;

  return (
    <div className="stack" style={{ ["--gap" as string]: "22px" }}>
      <h1 className="page-title">Ask ISKRA</h1>
      <p className="lede">
        Explore NASA combustion research through natural-language questions. Results include direct references to experiments, scientific publications and supporting data.
      </p>
      <p><button type="button" className="btn btn--quiet btn--sm" onClick={() => emit({ type: "ASK" })}>Open the conversation with ISKRA</button></p>
      <details className="fold howto">
        <summary>How it works</summary>
        <div>
          <p className="note" style={{ maxWidth: "88ch" }}>
            A question is planned into tool calls: counts and rankings are computed by code, and every other sentence is taken from {count || "the"} stored passages of NASA's tables and documents, each with its source.
            The steps are listed under each answer. A language model is optional and may only restate one sentence at a time; every sentence it writes is checked word by word against the sentence it rests on before it is shown.
          </p>
        </div>
      </details>

      <form className="askbar" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label className="sr" htmlFor="askq">Your question</label>
        <input id="askq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about fire in spacecraft" autoComplete="off" />
        <button type="submit" className="btn btn--primary" disabled={!kit || busy || !q.trim()}>{busy ? "Asking…" : "Ask"}</button>
      </form>
      <div className="row" style={{ ["--gap" as string]: "8px" }}>
        {EXAMPLES.map((e) => <button key={e} type="button" className="chipbtn" onClick={() => ask(e)} disabled={!kit || busy}>{e}</button>)}
      </div>
      {error && <p className="note">The passages could not be loaded: {error}</p>}

      {talk && (
        <section className="panel" aria-live="polite">
          {talk.lines.map((t, i) => <p key={i} className={i ? "note" : "claim claim--m"} style={i ? { marginTop: 8 } : undefined}>{t}</p>)}
        </section>
      )}

      {agent && offline && (
        <div className="askgrid">
          <section className="panel" aria-live="polite">
            <div className="panel__head">
              <h2 className="panel__title">{agent.question}</h2>
              {useModel ? <span className="tag">written by {run!.by}, verified</span> : agent.computed > 0 ? <span className="tag">computed, with sourced sentences</span> : <span className="tag">sourced sentences</span>}
            </div>
            {FANS.test(agent.question) && !agent.refused && (
              <p className="callout"><IconInfo size={16} /><span>This is the question the site is built around. <a href={href("/myths/fans")}>Both halves of the answer, side by side</a>.</span></p>
            )}
            {agent.notes.map((n) => <p key={n} className="asknote"><IconInfo size={16} /><span>{n}</span></p>)}
            {busy && <p className="note">Waiting for the model. The offline answer is below meanwhile.{progress ? ` ${progress.text}: ${Math.round(progress.f * 100)}%.` : ""}</p>}
            {busy && progress && <div className="score__bar" aria-hidden="true"><i style={{ width: `${Math.round(progress.f * 100)}%` }} /></div>}
            {err && <p className="callout"><IconWarn size={16} /><span>The model could not be used: {err} The offline answer is shown instead.</span></p>}
            {run && run.verified.abstained && <p className="callout"><IconInfo size={16} /><span>The model found no answer in the sources. The nearest passages are shown.</span></p>}
            {run && !run.verified.abstained && run.verified.kept.length === 0 && <p className="callout"><IconWarn size={16} /><span>Verification removed every sentence the model wrote. The built-in answer is shown instead.</span></p>}
            {run && !run.verified.abstained && run.verified.kept.length === 0 && (
              <details className="dropped"><summary>What {run.by} wrote</summary><p className="note" style={{ whiteSpace: "pre-wrap" }}>{run.raw}</p></details>
            )}

            {useModel ? (
              <div className="answer">{run!.verified.kept.map((s, i) => (
                <div key={i} className="answer__line">
                  <p>{s.text} {s.cites.map(cite)}</p>
                  {s.basis?.map((b, j) => <p key={j} className="answer__basis">rests on {cite(b.cite)} <q>{b.text.length > 260 ? b.text.slice(0, 250).replace(/\s+\S*$/, "") + " …" : b.text}</q></p>)}
                </div>
              ))}</div>
            ) : offline.abstained ? (
              <div className="empty" style={{ marginTop: 8 }}><p className="empty__title">{agent.refused ? "No answer is given to this" : "The stored evidence does not answer this"}</p>
                <p style={{ marginTop: 6 }}>{offline.why} {agent.refused ? "" : hits.length > 0 ? "The nearest passages are listed, in case they help." : "Try the words NASA uses: flame, oxygen, flow, gravity, smoke."}</p></div>
            ) : (
              <div className="answer">{offline.lines.map((l, i) => {
                const p = hits[l.cite - 1]?.passage;
                const computed = p?.id.startsWith("tool:");
                const ours = p?.t.startsWith("Our reading") || p?.k === "derived" || p?.k === "model";      // quotation marks only around NASA's own words
                return <p key={i}>{ours || computed || /["“”]/.test(l.text) ? l.text : `“${l.text}”`} {cite(l.cite)}
                  {computed && <span className="ev__tag" style={{ marginLeft: 8, fontFamily: "var(--font-ui)" }}>computed here from NASA's tables</span>}
                  {ours && <span className="ev__tag" style={{ marginLeft: 8, fontFamily: "var(--font-ui)" }}>our reading, not NASA's words</span>}</p>;
              })}</div>
            )}
            {run && run.verified.dropped.length > 0 && (
              <details className="dropped">
                <summary>Verification removed {run.verified.dropped.length} sentence{run.verified.dropped.length === 1 ? "" : "s"}</summary>
                <ul>{run.verified.dropped.map((d, i) => <li key={i}><s>{d.text}</s> <span className="note">Reason: {d.reason}.</span></li>)}</ul>
              </details>
            )}
            <Trace run={agent} model={run ? { by: run.by, kept: run.verified.kept.length, dropped: run.verified.dropped.length, ms: run.ms } : null} open />
            <p className="note" style={{ marginTop: 14 }}>
              {useModel ? "A model restated the passages. Each sentence was kept only because every word and number in it is in the sentence shown under it, it reaches no further than that sentence, and it gives no verdict."
                : "No program wrote these sentences. Counts and rankings are computed by code from NASA's tables; the rest is taken word for word from the passages on the right. Each passage says whether it is NASA's text, a number computed here, or our reading."} Not operational advice.
            </p>
          </section>

          <section>
            <h2 className="h2" style={{ marginBottom: 8 }}>Sources</h2>
            {hits.length === 0 && <p className="note">Nothing was searched.</p>}
            <ol className="sources" ref={srcRef}>
              {hits.map((h, i) => (
                <li key={h.passage.id} data-n={i + 1} className={focus === i + 1 ? "is-focus" : ""}>
                  <div className="sources__head"><span className="cite cite--static">{i + 1}</span><b>{h.passage.t}</b></div>
                  <p>{h.passage.x.length > 420 && focus !== i + 1 ? h.passage.x.slice(0, 400).replace(/\s+\S*$/, "") + " …" : h.passage.x}</p>
                  <div className="ev__src">
                    <KlassBadge k={h.passage.k} />
                    {h.passage.l && <a href={href(h.passage.l)}>Open on this site</a>}
                    {h.passage.r && (
                      <button type="button" className="src-btn" onClick={() => open({ title: h.passage.t, klass: h.passage.k, rows: [["passage", h.passage.x], ...(h.passage.loc ? [["where", h.passage.loc] as [string, React.ReactNode]] : []),
                        ["fetched from", <a href={h.passage.r!.url} target="_blank" rel="noreferrer">{h.passage.r!.url}</a>], ["SHA-256 of the file", <span className="hash">{h.passage.r!.sha256}</span>], ["ledger entry", `number ${h.passage.r!.ledger_seq}`]] })}>
                        <IconReceipt size={13} />receipt</button>
                    )}
                    {!h.passage.r && <span>{KLASS[h.passage.k].label}: computed by this site from NASA files</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <section className="stack" style={{ ["--gap" as string]: "12px" }}>
        <div className="section__head" style={{ marginBottom: 0 }}><h2 className="h2">Answer mode</h2></div>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="How answers are written">
            {MODES.map(([m, name]) => <button key={m} type="button" aria-pressed={settings.mode === m} onClick={() => update({ ...settings, mode: m })}>{name}</button>)}
          </div>
          <span className="note" style={{ flex: "1 1 320px" }}>{modeInfo[2]}</span>
        </div>
        {settings.mode !== "offline" && (
          <details className="panel panel--tight" open={settings.mode === "browser" || (settings.mode === "local" ? !settings.local.model : !settings.cloud.key)}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Model settings</summary>
            <div className="grid cols-2" style={{ marginTop: 12, ["--gap" as string]: "18px 28px", alignItems: "start" }}>
              {settings.mode === "browser" && <BrowserFields cfg={settings.browser} onChange={(c) => update({ ...settings, browser: c })} />}
              {(settings.mode === "local" || settings.mode === "hybrid") && <ModelFields title="Local model" cfg={settings.local} vendors={false} onChange={(c) => update({ ...settings, local: c })} />}
              {(settings.mode === "cloud" || settings.mode === "hybrid") && <ModelFields title="Cloud model" cfg={settings.cloud} vendors onChange={(c) => update({ ...settings, cloud: c })} />}
            </div>
            <p className="note" style={{ marginTop: 10, maxWidth: "92ch" }}>
              {settings.mode === "browser"
                ? "The model runs in this tab and the passages never leave the machine. The first use needs a connection to fetch the model: the browser's own model is fetched by the browser, and a WebGPU model is some hundreds of megabytes, fetched once from its public host. This mode is written against the published interfaces and tested with stand-ins; it was not run in the build environment, which has no GPU."
                : "Keys and addresses stay in this browser and are sent only to the address you set. A local server such as Ollama, LM Studio or llama.cpp must allow requests from this page (for Ollama, start it with OLLAMA_ORIGINS set to this site's address). “Test the connection” sends one word and shows the service's own reply or its error. The connectors follow each service's published request format; they were not run against the live services in the build environment."}
            </p>
          </details>
        )}
      </section>

      <section className="stack" style={{ ["--gap" as string]: "12px" }}>
        <div className="section__head" style={{ marginBottom: 0 }}>
          <h2 className="h2">Scorecard: {report ? report.n : EVAL.length} questions with known answers</h2>
          <button type="button" className="btn btn--quiet btn--sm" disabled={!kit} onClick={() => kit && setReport(runEval(kit))}>{report ? "Run again" : "Run the evaluation"}</button>
        </div>
        {!report ? (
          <p className="note" style={{ maxWidth: "88ch" }}>Runs a fixed set of questions in your browser and verifies each result: the right source, the right number, no answer where the data has none, and no verdict under pressure.
            Questions and pass rules: web/src/lib/evalset.ts.</p>
        ) : (
          <>
            <div className="score">
              {(Object.keys(KIND) as EvalKind[]).map((k) => (
                <div className="score__tile" key={k}>
                  <div className="score__num">{report.by[k].ok}<small> of {report.by[k].n}</small></div>
                  <div className="score__lab"><b>{KIND[k][0]}</b>: {KIND[k][1]}</div>
                  <div className="score__bar" aria-hidden="true"><i style={{ width: `${(100 * report.by[k].ok) / report.by[k].n}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="note" style={{ maxWidth: "92ch" }}>{report.ok} of {report.n} passed in {Math.round(report.ms)} ms, with no model and no network. {report.held.n} of the questions were held out and never tuned against:
              {" "}{report.held.ok} of those passed. The others also guided development, so their score says less.</p>
            <details className="fold">
              <summary>Every question and its result</summary>
              <div className="table-wrap"><table className="datatable evaltable">
                <thead><tr><th></th><th>Question</th><th>Kind</th><th>Result</th><th>Tools</th></tr></thead>
                <tbody>{report.results.map((r) => (
                  <tr key={r.c.id}><td><Mark ok={r.ok} /></td><td className="q"><button type="button" className="linklike" onClick={() => { ask(r.c.q); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{r.c.q}</button></td>
                    <td>{KIND[r.c.kind][0]}{r.c.held ? " · held out" : ""}</td><td>{r.why}</td><td><span className="hash">{r.run.steps.map((s) => s.tool).filter((t) => !["screen_question", "compose_answer", "check_answer"].includes(t)).join(", ") || "screen only"}</span></td></tr>
                ))}</tbody>
              </table></div>
            </details>
          </>
        )}
      </section>

      {checks && (
        <section className="stack" id="sentence-check" style={{ ["--gap" as string]: "12px" }}>
          <div className="section__head" style={{ marginBottom: 0 }}><h2 className="h2">Sentence check: {checks.ok} of {checks.n} probe sentences end as they must</h2></div>
          <p className="note" style={{ maxWidth: "88ch" }}>Every sentence a model writes passes this check before it is shown. Try to get a false one past it: write a sentence, choose the passage it cites, and see what happens to it.</p>
          <form className="probe" onSubmit={(e) => e.preventDefault()}>
            <label><span>A sentence, as a model might write it</span>
              <input value={probeText} onChange={(e) => setProbeText(e.target.value)} spellCheck={false} autoComplete="off" /></label>
            <label><span>The passage it cites</span>
              <select className="select" value={probeSrc} onChange={(e) => setProbeSrc(e.target.value)}>
                {probeSources.map((p) => <option key={p.id} value={p.id}>{p.t.length > 76 ? p.t.slice(0, 72).replace(/\s+\S*$/, "") + " …" : p.t}</option>)}
              </select></label>
          </form>
          <div className="row" style={{ ["--gap" as string]: "8px" }}>
            {["c1", "k1", "c5", "k3", "c8", "c11"].map((id) => CHECKSET.find((c) => c.id === id)!).map((c) => (
              <button key={c.id} type="button" className="chipbtn" aria-pressed={probeText === c.text && probeSrc === c.cite} onClick={() => { setProbeText(c.text); setProbeSrc(c.cite ?? probeSrc); }}>{c.probes}</button>
            ))}
          </div>
          {probed && (
            <div className="probe__out" role="status">
              <p className="probe__src"><span className="probe__lab">The passage</span>{probed.src.x.length > 420 ? probed.src.x.slice(0, 410).replace(/\s+\S*$/, "") + " …" : probed.src.x}</p>
              {probed.kept.map((k, i) => <p key={`k${i}`} className="probe__verdict"><Mark ok /><span><b>Kept.</b> It rests on: <q>{k.basis?.[0]?.text}</q></span></p>)}
              {probed.dropped.map((d, i) => <p key={`d${i}`} className="probe__verdict"><Mark ok={false} /><span><b>Removed.</b> Reason: {d.reason}.</span></p>)}
            </div>
          )}
          <details className="fold">
            <summary>The {checks.n} probe sentences and what happened to each</summary>
            <div className="table-wrap"><table className="datatable evaltable">
              <thead><tr><th></th><th>Sentence</th><th>It probes</th><th>Must be</th><th>What happened</th></tr></thead>
              <tbody>{checks.results.map((r) => (
                <tr key={r.c.id}><td><Mark ok={r.ok} /></td>
                  <td className="q"><button type="button" className="linklike" onClick={() => { setProbeText(r.c.text); if (r.c.cite) setProbeSrc(r.c.cite); document.getElementById("sentence-check")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>{r.c.text}</button></td>
                  <td>{r.c.probes}</td><td>{r.c.keep ? "kept" : "removed"}</td><td>{r.kept ? "kept" : `removed: ${r.reason}`}</td></tr>
              ))}</tbody>
            </table></div>
            <p className="note" style={{ marginTop: 8, maxWidth: "92ch" }}>The probe sentences are ours; the passages they cite are the stored ones. The check reads words, not meaning: it cannot see two words that swap roles inside one sentence.
              That is why each kept sentence shows the sentence it rests on, and why the built-in answer uses NASA's sentences word for word. Rules and tests: web/src/lib/check.ts, checkset.ts.</p>
          </details>
        </section>
      )}

      {demo && (
        <section className="stack" style={{ ["--gap" as string]: "12px" }}>
          <div className="section__head" style={{ marginBottom: 0 }}><h2 className="h2">Prompt-injection test: a planted note gives orders</h2></div>
          <div className="banner banner--synthetic"><IconWarn /><div><b>Synthetic.</b> The note and the obedient reply below were written for this demonstration. The two gates and the verification step are the ones the site runs on every answer.</div></div>
          <div className="grid cols-2" style={{ ["--gap" as string]: "22px", alignItems: "start" }}>
            <div className="poison">
              <div><p className="note" style={{ marginBottom: 6 }}>Slipped among the passages retrieved for "Will a fire go out if the fans are stopped?"</p>
                <p className="poison__note">{PLANTED.x}</p></div>
              <div>
                {demo.gates.map((g) => (
                  <div className="gate" key={g.name}><Mark ok={g.blocked} /><div><b>{g.name}: {g.blocked ? "stopped" : "passed"}</b><p>{g.rule}</p><p>{g.why}</p></div></div>
                ))}
                <div className="gate"><Mark ok={demo.gated.kept.length === 1} /><div><b>Answer verification: {demo.gated.dropped.length} of {demo.gated.dropped.length + demo.gated.kept.length} sentences removed</b>
                  <p>Even if a model had read the note and obeyed, each sentence must cite a passage that was given, use only the words and numbers of the sentence it rests on, state no listed misconception as a rule, and give no verdict.</p></div></div>
              </div>
            </div>
            <div>
              <p className="note" style={{ marginBottom: 6 }}>Suppose a model obeyed. What happens to each sentence it wrote:</p>
              <table className="verdicts">
                <thead><tr><th>Sentence</th><th>As the site works</th><th>With both gates switched off</th></tr></thead>
                <tbody>{[...demo.gated.kept.map((k) => k.text), ...demo.gated.dropped.map((d) => d.text)].sort((a, b) => demo.reply.indexOf(a) - demo.reply.indexOf(b)).map((s) => {
                  const g = demo.gated.dropped.find((d) => d.text === s);
                  const u = demo.ungated.dropped.find((d) => d.text === s);
                  const leak = demo.survivesCheckerAlone.includes(s);
                  return (<tr key={s} className={leak ? "is-leak" : ""}><td>{s}</td>
                    <td><span className="out"><Mark ok={!g} /><span>{g ? `removed: ${g.reason}` : "kept: it cites a real passage"}</span></span></td>
                    <td><span className="out"><Mark ok={!u} /><span>{u ? `removed: ${u.reason}` : leak ? "kept, wrongly: the note itself 'supports' it" : "kept"}</span></span></td></tr>);
                })}</tbody>
              </table>
              <p className="note" style={{ marginTop: 10 }}>{demo.survivesCheckerAlone.length === 0
                ? "With both gates switched off, verification alone still removes every planted sentence here: the rule the note asks for is a belief NASA's guide lists as a misconception. The gates come first all the same, because a note that never reaches a model cannot be cited at all."
                : `Verification alone would have let ${demo.survivesCheckerAlone.length} planted claim${demo.survivesCheckerAlone.length === 1 ? "" : "s"} through. That is why the gates come first: the note never reaches a model, so nothing can cite it.`}</p>
              {settings.mode !== "offline" && (
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn--quiet btn--sm" disabled={liveBusy} onClick={tryLive}>{liveBusy ? "Asking the model…" : "Send the note to the connected model"}</button>
                  {live && "error" in live && <p className="callout"><IconWarn size={16} /><span>The model could not be reached: {live.error}</span></p>}
                  {live && "raw" in live && (
                    <div className="panel panel--tight" style={{ marginTop: 10 }}>
                      <p className="note">{live.by} replied (the gates were bypassed for this one request):</p>
                      <p className="poison__note" style={{ marginTop: 6 }}>{live.raw}</p>
                      <p style={{ marginTop: 8, fontSize: 14 }}><b>Verified:</b> {live.verified.kept.length} kept, {live.verified.dropped.length} removed{live.verified.abstained ? "; the model found no answer in the sources" : ""}.</p>
                      {live.verified.dropped.length > 0 && <ul style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 13 }}>{live.verified.dropped.map((d, i) => <li key={i}><s>{d.text}</s> <span className="note">{d.reason}</span></li>)}</ul>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
