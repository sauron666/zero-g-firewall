import { useEffect, useMemo, useRef, useState } from "react";
import { href } from "../app/router";
import { useData } from "../lib/data";
import { KLASS, KlassBadge } from "../lib/klass";
import { askModel, loadSettings, Mode, ModelConfig, ModelRun, saveSettings, Settings, Vendor, VENDOR_DEFAULT } from "../lib/ai";
import { Answer, buildIndex, extractive, Hit } from "../lib/search";
import type { IndexDoc } from "../lib/types";
import { useReceipt } from "../components/Receipt";
import { IconInfo, IconReceipt, IconWarn } from "../components/icons";
import { PageProps } from "./stubs";

const EXAMPLES = [
  "Will a fire go out if the fans are stopped?",
  "Has anything been burned in lunar gravity?",
  "What happened in the fire on Mir?",
  "Do materials burn at lower oxygen in space than on Earth?",
  "What did FLEX find about cool flames?",
  "Which experiments measured smoke particles?",
];
const MODES: [Mode, string, string][] = [
  ["offline", "Offline engine", "No model. The answer is made of sentences taken from the evidence. Works with no connection at all."],
  ["local", "Local model", "A model on this computer writes the answer from the passages. Nothing leaves the machine: the setting for a habitat with no link to Earth."],
  ["cloud", "Cloud model", "A hosted model writes the answer from the passages, with a key you type here."],
  ["hybrid", "Hybrid", "The local model drafts, the cloud model checks the draft against the passages."],
];
const VENDORS: [Vendor, string][] = [["anthropic", "Anthropic (Claude)"], ["openai", "OpenAI"], ["gemini", "Google (Gemini)"], ["compatible", "Any OpenAI-compatible endpoint"]];
const FANS = /\b(fan|fans|ventilat|airflow|self-?extinguish)/i;

function ModelFields({ title, cfg, onChange, vendors }: { title: string; cfg: ModelConfig; onChange: (c: ModelConfig) => void; vendors: boolean }) {
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
    </fieldset>
  );
}

export function Ask({ manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const doc = useData<IndexDoc>(ready ? "index.json" : null);
  const index = useMemo(() => (doc.data ? buildIndex(doc.data.chunks) : null), [doc.data]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [offline, setOffline] = useState<Answer | null>(null);
  const [run, setRun] = useState<ModelRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const srcRef = useRef<HTMLOListElement | null>(null);
  const open = useReceipt();
  const update = (s: Settings) => { setSettings(s); saveSettings(s); };
  useEffect(() => { if (focus != null) srcRef.current?.querySelector(`[data-n="${focus}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [focus]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!index || !text) return;
    setQ(text); setAsked(text); setErr(null); setRun(null); setFocus(null);
    const h = index.search(text, 8);
    setHits(h);
    const off = extractive(text, h, index);
    setOffline(off);
    if (settings.mode === "offline" || off.abstained && h.length === 0) return;
    setBusy(true);
    try { setRun(await askModel(settings, text, h)); } catch (e) { setErr(String((e as Error).message ?? e)); }
    setBusy(false);
  };

  if (!ready) return <div className="empty"><p className="empty__title">Waiting for the NASA sync</p><p style={{ marginTop: 6 }}>The evidence engine answers only from data fetched from NASA.</p></div>;
  const cite = (n: number) => <button key={n} type="button" className="cite" onClick={() => setFocus(n)} aria-label={`Source ${n}`}>{n}</button>;
  const modeInfo = MODES.find((m) => m[0] === settings.mode)!;
  const useModel = run && !run.verified.abstained && run.verified.kept.length > 0;

  return (
    <div className="stack" style={{ ["--gap" as string]: "22px" }}>
      <h1 className="page-title">Ask the evidence</h1>
      <p className="lede">
        Ask in plain words. The answer is built from {doc.data ? doc.data.count : "the"} passages of NASA's tables and documents, and every sentence carries its source.
        A language model is optional: it may rephrase the passages, and a checker throws out anything it cannot trace.
      </p>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="How answers are written">
          {MODES.map(([m, name]) => <button key={m} type="button" aria-pressed={settings.mode === m} onClick={() => update({ ...settings, mode: m })}>{name}</button>)}
        </div>
        <span className="note" style={{ flex: "1 1 320px" }}>{modeInfo[2]}</span>
      </div>

      {settings.mode !== "offline" && (
        <details className="panel panel--tight" open={settings.mode === "local" ? !settings.local.model : !settings.cloud.key}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Model settings</summary>
          <div className="grid cols-2" style={{ marginTop: 12, ["--gap" as string]: "18px 28px", alignItems: "start" }}>
            {settings.mode !== "cloud" && <ModelFields title="Local model" cfg={settings.local} vendors={false} onChange={(c) => update({ ...settings, local: c })} />}
            {settings.mode !== "local" && <ModelFields title="Cloud model" cfg={settings.cloud} vendors onChange={(c) => update({ ...settings, cloud: c })} />}
          </div>
          <p className="note" style={{ marginTop: 10, maxWidth: "92ch" }}>
            Keys and addresses stay in this browser and are sent only to the address you set. A local server such as Ollama, LM Studio or llama.cpp must allow requests from this page
            (for Ollama, start it with OLLAMA_ORIGINS set to this site's address). The connectors are tested against each service's request and reply format, not against the live services.
          </p>
        </details>
      )}

      <form className="askbar" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label className="sr" htmlFor="askq">Your question</label>
        <input id="askq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about fire in spacecraft" autoComplete="off" />
        <button type="submit" className="btn btn--primary" disabled={!index || busy || !q.trim()}>{busy ? "Asking…" : "Ask"}</button>
      </form>
      <div className="row" style={{ ["--gap" as string]: "8px" }}>
        {EXAMPLES.map((e) => <button key={e} type="button" className="chipbtn" onClick={() => ask(e)} disabled={!index || busy}>{e}</button>)}
      </div>
      {doc.error && <p className="note">The passages could not be loaded: {doc.error}</p>}

      {asked && offline && (
        <div className="askgrid">
          <section className="panel" aria-live="polite">
            <div className="panel__head">
              <h2 className="panel__title">{asked}</h2>
              {useModel ? <span className="tag">written by {run!.by}, checked</span> : <span className="tag">made of sentences from the evidence</span>}
            </div>
            {FANS.test(asked) && (
              <p className="callout"><IconInfo size={16} /><span>This is the question the site is built around. <a href={href("/myths/fans")}>Both halves of the answer, side by side</a>.</span></p>
            )}
            {busy && <p className="note">Waiting for the model. The offline answer is below meanwhile.</p>}
            {err && <p className="callout"><IconWarn size={16} /><span>The model could not be used: {err} The offline answer is shown instead.</span></p>}
            {run && run.verified.abstained && <p className="callout"><IconInfo size={16} /><span>The model said the evidence does not answer this. The nearest passages are shown.</span></p>}
            {run && !run.verified.abstained && run.verified.kept.length === 0 && <p className="callout"><IconWarn size={16} /><span>The checker removed every sentence the model wrote. The offline answer is shown instead.</span></p>}

            {useModel ? (
              <div className="answer">{run!.verified.kept.map((s, i) => <p key={i}>{s.text} {s.cites.map(cite)}</p>)}</div>
            ) : offline.abstained ? (
              <div className="empty" style={{ marginTop: 8 }}><p className="empty__title">The stored evidence does not answer this</p>
                <p style={{ marginTop: 6 }}>{offline.why} {hits.length > 0 ? "The nearest passages are listed, in case they help." : "Try the words NASA uses: flame, oxygen, flow, gravity, smoke."}</p></div>
            ) : (
              <div className="answer">{offline.lines.map((l, i) => {
                const ours = hits[l.cite - 1]?.passage.t.startsWith("Our reading");
                return <p key={i}>{ours ? l.text : `“${l.text}”`} {cite(l.cite)}{ours && <span className="ev__tag" style={{ marginLeft: 8, fontFamily: "var(--font-ui)" }}>our reading, not NASA's words</span>}</p>;
              })}</div>
            )}
            {run && run.verified.dropped.length > 0 && (
              <details className="dropped">
                <summary>The checker removed {run.verified.dropped.length} sentence{run.verified.dropped.length === 1 ? "" : "s"}</summary>
                <ul>{run.verified.dropped.map((d, i) => <li key={i}><s>{d.text}</s> <span className="note">Reason: {d.reason}.</span></li>)}</ul>
              </details>
            )}
            <p className="note" style={{ marginTop: 14 }}>
              {useModel ? "A model rephrased the passages. Each sentence was kept only because it cites a passage that was given, its numbers are in that passage, and it gives no verdict."
                : "No program wrote these sentences. They are taken from the passages on the right, chosen by word match; each passage says whether it is NASA's text, a number computed here, or our reading."} Not operational advice.
            </p>
          </section>

          <section>
            <h2 className="h2" style={{ marginBottom: 8 }}>Sources</h2>
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
    </div>
  );
}
