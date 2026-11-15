import { useEffect, useRef, useState } from "react";
import { Klass } from "../lib/klass";
import { emit, forgetContext, IskraEvent, on } from "./bus";
import { Mood } from "./Lantern";

/** What kind of information each page mostly shows. A page may say otherwise with a CONTEXT event. */
export const PAGE_KLASS: Record<string, Klass> = {
  "/": "illustrative", "/paradox": "model", "/myths": "literature", "/evidence": "observed", "/rank": "derived", "/envelope": "observed", "/gaps": "derived",
  "/lessons": "literature", "/physics": "model", "/alarm": "synthetic", "/playbooks": "derived", "/ask": "derived", "/falsify": "literature", "/ledger": "observed",
  "/data": "derived", "/about": "illustrative", "/lab": "model", "/material": "literature", "/model": "model",
};
const KEY = "zgf.iskra";
/** Short, dry, never about data: a line only says what the page is doing. */
export const LINES = {
  searching: "Searching NASA's records.",
  pointing: "Here is where that comes from.",
  gap: "No measurement of that yet.",
  refused: "NASA's data cannot answer that.",
  model: "A model, shown with its assumptions.",
  synthetic: "Synthetic. Made here to test the alarm, not read from a sensor.",
  alarm: "Alarm. Checking whether it is real.",
  anomaly: "These readings do not check out. The alarm stands.",
  partial: "Partial gravity: unmeasured so far.",
};

export interface IskraState { g: number; fansOffAt: number | null; klass: Klass; mood: Mood; line: string; /** the line is a tour caption, which outlives a change of page */ touring?: boolean }

/** One reduction for every event, so what the companion shows can be tested without a browser. */
export function reduce(s: IskraState, e: IskraEvent, now: number): IskraState {
  switch (e.type) {
    case "CONTEXT": {
      const g = e.g ?? s.g, klass = e.klass ?? s.klass;
      const fansOffAt = e.fans == null ? s.fansOffAt : e.fans ? null : s.fansOffAt ?? now;
      const line = e.g != null && g > 0.02 && g < 0.98 && g !== s.g ? LINES.partial : s.line;
      return { ...s, g, klass, fansOffAt, line };
    }
    case "FANS": return { ...s, fansOffAt: e.on ? null : now };
    case "SEARCHING": return { ...s, mood: "searching", line: LINES.searching };
    case "ANSWER_DONE": return e.strength === "supported" ? { ...s, mood: "pointing", line: LINES.pointing } : { ...s, mood: "gap", line: e.strength === "gap" ? LINES.gap : LINES.refused };
    case "ALARM": return e.state === "CLEAR" && !e.anomaly ? { ...s, mood: "idle", line: "" } : e.anomaly ? { ...s, mood: "sceptical", line: LINES.anomaly } : { ...s, mood: "alarm", line: LINES.alarm };
    case "TOUR_STEP": return { ...s, mood: "idle", line: e.text, touring: true };
    case "TOUR_END": return { ...s, mood: "idle", line: "", touring: false };
    case "SUCCESS": return { ...s, mood: "success", line: e.text ?? "" };
    case "ASK": return s;
    case "NOTE": return { ...s, mood: "pointing", line: e.text };
  }
}

export function useIskra(top: string) {
  const [s, setS] = useState<IskraState>({ g: 0, fansOffAt: null, klass: PAGE_KLASS[top] ?? "derived", mood: "idle", line: "" });
  const calm = useRef(0);
  useEffect(() => on((e) => {
    setS((prev) => reduce(prev, e, performance.now()));
    clearTimeout(calm.current);
    if (e.type !== "TOUR_STEP" && e.type !== "CONTEXT" && e.type !== "FANS" && e.type !== "ALARM") calm.current = window.setTimeout(() => setS((p) => ({ ...p, mood: "idle", line: "" })), 6500);
  }, true), []);
  const shown = useRef(top);
  if (shown.current !== top) {                                                 // a new page: its own kind of information, free fall, fans running.
    shown.current = top;                                                       // Done while rendering, so that it comes before anything the new page reports about itself.
    forgetContext();
    setS((p) => ({ ...p, g: 0, fansOffAt: null, klass: PAGE_KLASS[top] ?? "derived", mood: "idle", line: p.touring ? p.line : "" }));
  }
  return s;
}

export function isHidden(): boolean { try { return localStorage.getItem(KEY) === "hidden"; } catch { return false; } }
export function setHidden(h: boolean) { try { h ? localStorage.setItem(KEY, "hidden") : localStorage.removeItem(KEY); } catch { /* the choice lasts for this visit only */ } }

export { emit };
