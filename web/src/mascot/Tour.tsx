import { useEffect, useRef, useState } from "react";
import type { Manifest } from "../lib/data";
import { IconArrow, IconClose, IconPause, IconPlay } from "../components/icons";
import { emit } from "./bus";
import { IskraState } from "./Iskra";
import { Lantern } from "./Lantern";

export interface Stop { id: string; to: string; verb: string; text: (m: Manifest | null) => string; fans?: boolean }
const n = (v: number | undefined) => (v == null ? "the" : v.toLocaleString("en-US"));
/** The path through the north-star question. Each stop names the challenge verb it serves. Every stop works offline. */
export const STOPS: Stop[] = [
  { id: "question", to: "", verb: "Question", fans: false, text: () => "Kill the fans? One switch, two habitats. In free fall the flame starves. In lunar gravity it may not: gravity is a fan nobody can switch off." },
  { id: "interpret", to: "myths--fans", verb: "Interpret", text: () => "NASA tested it, and NASA's own guide calls the rule a misconception. Both sides, every quotation checked against the stored document." },
  { id: "model", to: "paradox", verb: "Model", text: () => "Two realities that differ only in ventilation. With the fans off, a detector in the duct may never see the smoke." },
  { id: "find", to: "envelope", verb: "Find", text: (m) => `Every real test by oxygen and pressure: ${n(m?.nasa?.envelope_points)} rows from NASA's tables. None was taken in lunar or Martian gravity.` },
  { id: "rank", to: "rank--lunar", verb: "Rank", text: () => "The investigations ranked for a lunar habitat by stated factors, with a check of how stable the order is." },
  { id: "summarize", to: "evidence--PSI-25", verb: "Summarize", text: () => "One record: what varied, what stayed constant, a receipt on every row, and the curator's notes on the data." },
  { id: "map", to: "playbooks?habitat=lunar", verb: "Map", text: () => "Fire behaviours by phase, like an attack matrix. Switch the habitat: in lunar gravity not one behaviour has been measured." },
  { id: "control", to: "alarm--replay", verb: "Control", text: () => "A real fire hidden behind replayed readings. The frames fail their checks, and the alarm stands. Synthetic, and labelled so." },
  { id: "ask", to: "ask?q=Has%20anything%20been%20burned%20in%20lunar%20gravity%3F", verb: "Ask", text: () => "An agent with typed tools: it counts with code, quotes with sources, and shows every step it took. No key, no network." },
  { id: "trace", to: "ledger", verb: "Trace", text: (m) => `${n(m?.nasa?.files_in_ledger)} files fetched from NASA, hash-chained. Your browser recomputes the chain while you watch.` },
];
export const DWELL = 8500;                                         // ms per stop: ten stops in under ninety seconds

export function Tour({ at, set, manifest, state }: { at: number; set: (i: number | null) => void; manifest: Manifest | null; state: IskraState }) {
  const [playing, setPlaying] = useState(true);
  const [left, setLeft] = useState(1);
  const stop = STOPS[at];
  const start = useRef(0);

  useEffect(() => {
    const want = "#" + stop.to;
    if (window.location.hash !== want) window.location.hash = stop.to;
    emit({ type: "TOUR_STEP", id: stop.id, text: stop.text(manifest) });
    const t = stop.fans === false ? window.setTimeout(() => emit({ type: "FANS", on: false }), 2600) : 0;   // on the opening page the tour flips the switch itself
    return () => { if (t) clearTimeout(t); };
  }, [at]);                                                        // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    start.current = performance.now();
    setLeft(1);
    const tick = window.setInterval(() => {
      const k = 1 - (performance.now() - start.current) / DWELL;
      setLeft(Math.max(0, k));
      if (k <= 0) { clearInterval(tick); if (at < STOPS.length - 1) set(at + 1); else setPlaying(false); }
    }, 120);
    return () => clearInterval(tick);
  }, [at, playing]);                                               // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "")) return;
      if (e.key === "ArrowRight" && at < STOPS.length - 1) set(at + 1);
      else if (e.key === "ArrowLeft" && at > 0) set(at - 1);
      else if (e.key === "Escape") set(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [at]);                                                        // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => emit({ type: "TOUR_END" }), []);

  return (
    <aside className="tour" aria-label="Guided tour">
      <div className="tour__bar" aria-hidden="true"><i style={{ width: `${((at + (playing ? 1 - left : 1)) / STOPS.length) * 100}%` }} /></div>
      <span className="tour__iskra" data-iskra><Lantern g={state.g} fansOffAt={state.fansOffAt} klass={state.klass} mood={state.mood} size={54} /></span>
      <div className="tour__text">
        <div className="tour__head"><span className="tour__verb">{stop.verb}</span><span className="tour__n">{at + 1} of {STOPS.length}</span></div>
        <p role="status" aria-live="polite">{stop.text(manifest)}</p>
      </div>
      <div className="tour__ctl">
        <button type="button" className="icon-btn" onClick={() => set(at - 1)} disabled={at === 0} aria-label="Previous stop"><span style={{ transform: "scaleX(-1)", display: "inline-flex" }}><IconArrow size={16} /></span></button>
        <button type="button" className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause the tour" : "Play the tour"}>{playing ? <IconPause size={16} /> : <IconPlay size={16} />}</button>
        <button type="button" className="icon-btn" onClick={() => set(at + 1)} disabled={at === STOPS.length - 1} aria-label="Next stop"><IconArrow size={16} /></button>
        <button type="button" className="icon-btn" onClick={() => set(null)} aria-label="End the tour"><IconClose size={16} /></button>
      </div>
    </aside>
  );
}
