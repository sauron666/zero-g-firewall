import { useEffect, useRef, useState } from "react";
import { ALL_ITEMS } from "../app/nav";
import { go, href } from "../app/router";
import { useKit } from "../ai/kit";
import { AgentRun, runAgent } from "../lib/agent";
import { askModel, loadSettings, Sentence, Settings } from "../lib/ai";
import { smallTalk, Talk } from "../lib/smalltalk";
import { IconClose, IconTour } from "../components/icons";
import { KLASS } from "../lib/klass";
import { emit, on } from "./bus";
import { IskraState, isHidden, setHidden } from "./Iskra";
import { Lantern } from "./Lantern";

/** What a visitor might ask from where they stand. ISKRA knows the page, so the first questions are about it. */
export const SUGGEST: Record<string, string[]> = {
  "/": ["Will a fire go out if the fans are stopped?", "Has anything been burned in lunar gravity?", "Rank the investigations for a lunar habitat"],
  "/paradox": ["Will a fire go out if the fans are stopped?", "What happened in the BASS-II test when the flow was cut?", "Why can a detector in the duct miss a fire?"],
  "/myths": ["Are materials that pass the test on Earth acceptable in space?", "Will a fire go out if the fans are stopped?", "What did the Mir fire show?"],
  "/evidence": ["What did BASS-II study?", "Which records recorded how the flame ended?", "Which records measured carbon monoxide?"],
  "/rank": ["Rank the investigations for a lunar habitat", "Rank the investigations for a spacesuit", "What did FLEX study?"],
  "/envelope": ["How many tests are near 30% oxygen at 10.2 psia?", "How many tests are near 34% oxygen at 8.2 psia?", "Was anything burned above 40% oxygen?"],
  "/gaps": ["How fast does a flame spread in lunar gravity?", "What will FM2 test on the Moon?", "What is the most oxygen any solid material was burned at?"],
  "/lessons": ["What did the Mir fire show?", "What killed the Apollo 1 crew?", "What reached firefighters on Earth?"],
  "/physics": ["How well does the d-squared law fit the FLEX tests?", "How was the flame model checked against NASA's numbers?", "Why does gravity matter to a flame?"],
  "/alarm": ["What did the smoke detector record during Saffire-III?", "How much carbon monoxide did the Saffire fires produce?", "Why can a detector in the duct miss a fire?"],
  "/playbooks": ["What has not been measured in lunar gravity?", "What is the first response to a fire on the station?", "What follows a fire once it is out?"],
  "/ask": ["How many tests are near 30% oxygen at 10.2 psia?", "What is the oxygen range of the tests?", "What problems are there in NASA's tables?"],
  "/falsify": ["Will a fire go out if the fans are stopped?", "Are materials that pass the test on Earth acceptable in space?", "Has anything been burned in lunar gravity?"],
  "/ledger": ["What problems are there in NASA's tables?", "How was the flame model checked against NASA's numbers?", "What did BASS-II study?"],
  "/data": ["What problems are there in NASA's tables?", "How was the flame model checked against NASA's numbers?", "How well does the d-squared law fit the FLEX tests?"],
  "/about": ["Has anything been burned in lunar gravity?", "What is the oxygen range of the tests?", "What did BASS-II study?"],
};

/** What a connected model added to an answer: sentences that passed the check, or why none is shown. */
type ModelNote = { by: string; kept: Sentence[]; dropped: number; found: boolean } | { error: string };
type Msg =
  | { who: "you"; text: string }
  | { who: "iskra"; kind: "hello"; page: string }
  | { who: "iskra"; kind: "went"; label: string }
  | { who: "iskra"; kind: "talk"; talk: Talk }
  | { who: "iskra"; kind: "answer"; run: AgentRun; model?: ModelNote };

/** The model that would write the answer, as the visitor named it; null when answers are built in. */
export function connected(s: Settings): string | null {
  if (s.mode === "offline") return null;
  if (s.mode === "browser") return "the model in this browser";
  if (s.mode === "hybrid") return `${s.local.model || "a local model"} with ${s.cloud.model || "a cloud model"}`;
  return (s.mode === "local" ? s.local.model : s.cloud.model) || "no model name yet";
}

/** "open the atmosphere map", "go to gaps": a request to move, answered by moving. */
export function placeIn(text: string): { path: string; label: string } | null {
  const m = text.trim().match(/^(?:please\s+)?(?:go to|open|show me|show|take me to|bring up)\s+(?:the\s+)?(.+?)[.!?]*$/i);
  if (!m) return null;
  const want = m[1].toLowerCase().replace(/\s+page$/, "");
  const hit = ALL_ITEMS.find((it) => it.label.toLowerCase() === want) ?? ALL_ITEMS.find((it) => it.label.toLowerCase().includes(want) || it.path.slice(1) === want.replace(/\s+/g, ""));
  return hit ? { path: hit.path, label: hit.label } : null;
}

function Answer({ run, model }: { run: AgentRun; model?: ModelNote }) {
  const computed = run.steps.some((s) => ["count_tests_near", "oxygen_range", "rank_for_mission", "matrix_coverage"].includes(s.tool));
  if (model && "kept" in model && model.kept.length > 0) {                      // a connected model wrote it, and every sentence shown passed the check against its sources
    return (
      <div className="msg msg--iskra">
        {model.kept.slice(0, 6).map((k, i) => (
          <p key={i} className="msg__line">{k.text} {k.cites.map((c) => { const p = run.hits[c - 1]?.passage; return p ? (p.l ? <a key={c} className="msg__src" href={href(p.l)} title={p.t}>{p.t}</a> : <span key={c} className="msg__src">{p.t}</span>) : null; })}</p>
        ))}
        <div className="msg__meta">
          <span>written by {model.by}, checked against the sources{model.dropped ? ` · ${model.dropped} sentence${model.dropped === 1 ? "" : "s"} removed by the check` : ""}</span>
          <a href={`#ask?q=${encodeURIComponent(run.question)}`}>Sources and steps</a>
        </div>
      </div>
    );
  }
  return (
    <div className="msg msg--iskra">
      {model && "error" in model && <p className="note">The connected model could not be used: {model.error} The built-in answer follows.</p>}
      {model && "kept" in model && <p className="note">{model.found ? `Nothing ${model.by} wrote passed the check against the sources.` : `${model.by} found no answer in the sources.`} The built-in answer follows.</p>}
      {run.notes.map((n) => <p key={n} className="note">{n}</p>)}
      {run.answer.abstained
        ? <p className="msg__line">{run.answer.why}</p>
        : run.answer.lines.slice(0, 4).map((l, i) => {
          const p = run.hits[l.cite - 1]?.passage;
          const plain = !p || p.id.startsWith("tool:") || p.k === "derived" || p.k === "model" || p.t.startsWith("Our reading") || /["“”]/.test(l.text);   // quotation marks only around NASA's own words
          const label = p?.id.startsWith("tool:") ? "computed from NASA's tables" : p?.t ?? "source";
          return <p key={i} className="msg__line">{plain ? l.text : `“${l.text}”`} {p?.l ? <a className="msg__src" href={href(p.l)} title={label}>{label}</a> : <span className="msg__src">{label}</span>}</p>;
        })}
      <div className="msg__meta">
        <span>{run.answer.abstained ? "no answer in the data" : `${run.answer.lines.length} sourced ${run.answer.lines.length === 1 ? "sentence" : "sentences"}`}{computed ? " · counted by code" : ""}</span>
        <a href={`#ask?q=${encodeURIComponent(run.question)}`}>Sources and steps</a>
      </div>
    </div>
  );
}

/** ISKRA on every page: a button that opens a conversation. It knows where the visitor is and answers from the same engine as the Ask page. */
export function IskraChat({ state, name, top, ready, onTour, touring = false }: { state: IskraState; name: string; top: string; ready: boolean; onTour: () => void; touring?: boolean }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHid] = useState(isHidden);                 // the floating button can be put away; the conversation still opens from the pages
  const pending = useRef<string | null>(null);
  const { kit } = useKit(ready && open);                       // the search index is fetched when the conversation first opens
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const page = ALL_ITEMS.find((i) => i.path === top);

  const answer = (text: string) => {
    if (!kit) { pending.current = text; return; }
    setBusy(true);
    emit({ type: "SEARCHING" });
    window.setTimeout(async () => {                             // long enough for the lantern to be seen looking
      const run = runAgent(text, kit);
      const s = loadSettings();
      let model: ModelNote | undefined;
      if (s.mode !== "offline" && !run.refused && run.hits.length > 0) {       // the same rule as the Ask page: a model may only reword what the search found
        try {
          const r = await askModel(s, text, run.hits);
          model = { by: r.by, kept: r.verified.kept, dropped: r.verified.dropped.length, found: !r.verified.abstained };
        } catch (e) { model = { error: String((e as Error).message ?? e) }; }
      }
      setLog((l) => [...l, { who: "iskra", kind: "answer", run, model }]);
      setBusy(false);
      emit({ type: "ANSWER_DONE", strength: run.refused ? "refused" : run.answer.abstained ? "gap" : "supported" });
    }, 420);
  };
  const say = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setQ("");
    setLog((l) => [...l, { who: "you", text }]);
    const place = placeIn(text);
    if (place) { go(place.path); setLog((l) => [...l, { who: "iskra", kind: "went", label: place.label }]); return; }
    const talk = smallTalk(text, { model: connected(loadSettings()), examples: SUGGEST[top] ?? SUGGEST["/"] });
    if (talk) { setLog((l) => [...l, { who: "iskra", kind: "talk", talk }]); return; }       // a greeting is answered as a greeting, in every mode
    answer(text);
  };

  useEffect(() => on((e) => { if (e.type === "ASK") { setOpen(true); if (e.q) { pending.current = null; window.setTimeout(() => say(e.q as string), 0); } } }));
  useEffect(() => { if (kit && pending.current) { const t = pending.current; pending.current = null; answer(t); } }, [kit]);    // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && log.length === 0) setLog([{ who: "iskra", kind: "hello", page: top }]); }, [open]);            // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { end.current?.scrollIntoView({ block: "end" }); } }, [log, busy, open]);
  useEffect(() => {
    document.documentElement.classList.toggle("chat-on", open);
    if (!open) return;
    input.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const mood = busy ? "searching" : state.mood;
  const via = connected(loadSettings());
  const status = busy ? (via ? `Looking through NASA's records, then asking ${via}…` : "Looking through NASA's records…") : state.line || (page ? `With you on ${page.label}. Ring: ${KLASS[state.klass].label.toLowerCase()}.` : "Ready");
  const chips = SUGGEST[top] ?? SUGGEST["/"];

  return (
    <>
      {!hidden && !touring && !open && <button type="button" className="fab" data-iskra data-busy={busy} data-say={!!state.line} onClick={() => setOpen(true)} aria-label={`Ask ${name}, the companion`} title={`${name}. The ring shows the kind of information on this page: ${KLASS[state.klass].label.toLowerCase()}.`}>
        <Lantern g={state.g} fansOffAt={state.fansOffAt} klass={state.klass} mood={state.mood} size={46} />
        <span className="fab__text">Ask {name}<span>{state.line ? state.line.slice(0, 34) : "answers with sources"}</span></span>
      </button>}
      {open && (
        <aside className="chat" role="dialog" aria-label={`Conversation with ${name}`}>
          <header className="chat__head">
            <Lantern g={state.g} fansOffAt={state.fansOffAt} klass={state.klass} mood={mood} size={64} />
            <div className="chat__who"><b>{name}</b><span role="status" aria-live="polite">{status}</span></div>
            <div className="row" style={{ ["--gap" as string]: "6px" }}>
              <button type="button" className="icon-btn" onClick={() => { setOpen(false); onTour(); }} aria-label="Take the guided tour" title="Guided tour"><IconTour size={16} /></button>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><IconClose size={16} /></button>
            </div>
          </header>
          <div className="chat__log">
            {log.map((m, i) => {
              if (m.who === "you") return <div key={i} className="msg msg--you">{m.text}</div>;
              if (m.kind === "answer") return <Answer key={i} run={m.run} model={m.model} />;
              if (m.kind === "talk") return <div key={i} className="msg msg--iskra">{m.talk.lines.map((t, k) => <p key={k} className={k ? "note" : "msg__line"}>{t}</p>)}</div>;
              if (m.kind === "went") return <div key={i} className="msg msg--iskra"><p className="msg__line">Opened: {m.label}.</p></div>;
              const p = ALL_ITEMS.find((it) => it.path === m.page);
              return (
                <div key={i} className="msg msg--iskra">
                  <p className="msg__line">I am {name}, a lantern with a flame inside. Ask me about fire in spacecraft and I answer from NASA's tables and documents, with the source beside each sentence.</p>
                  {p && <p className="note">You are on {p.label}: {p.about.charAt(0).toLowerCase() + p.about.slice(1)}.</p>}
                </div>
              );
            })}
            {busy && <div className="msg msg--iskra"><span className="dots" aria-label="Searching"><i /><i /><i /></span></div>}
            {!busy && (
              <div className="msg__chips">
                {chips.map((s) => <button key={s} type="button" className="chipbtn" onClick={() => say(s)}>{s}</button>)}
              </div>
            )}
            <div ref={end} />
          </div>
          <button type="button" className="chat__hide" onClick={() => { setHidden(!hidden); setHid(!hidden); }}>{hidden ? `Show the ${name} button on every page` : `Hide the ${name} button`}</button>
          <form className="chat__form" onSubmit={(e) => { e.preventDefault(); say(q); }}>
            <label className="sr" htmlFor="chatq">Your question</label>
            <input id="chatq" ref={input} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ready ? "Ask, or say “open the atmosphere map”" : "Waiting for the NASA data"} autoComplete="off" disabled={!ready} />
            <button type="submit" className="btn btn--primary" disabled={!ready || busy || !q.trim()}>Ask</button>
          </form>
        </aside>
      )}
    </>
  );
}
