import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { href } from "../app/router";
import { KLASS, Klass } from "../lib/klass";
import { IconClose, IconFan, IconTour } from "../components/icons";
import { emit, forgetContext, IskraEvent, on } from "./bus";
import { OUT_AFTER } from "./flame";
import { Lantern, Mood } from "./Lantern";

/** What kind of information each page mostly shows. A page may say otherwise with a CONTEXT event. */
export const PAGE_KLASS: Record<string, Klass> = {
  "/": "illustrative", "/paradox": "model", "/myths": "literature", "/evidence": "observed", "/rank": "derived", "/envelope": "observed", "/gaps": "derived",
  "/lessons": "literature", "/physics": "model", "/alarm": "synthetic", "/playbooks": "derived", "/ask": "derived", "/falsify": "literature", "/ledger": "observed",
  "/data": "derived", "/about": "illustrative",
};
const KEY = "zgf.iskra";
/** Short, dry, never about data: a line only says what the page is doing. */
export const LINES = {
  searching: "Checking the archive.",
  pointing: "Here is where that comes from.",
  gap: "Nobody has measured that yet.",
  refused: "That is not a question the evidence can answer.",
  model: "That is a model, not a measurement.",
  synthetic: "Synthetic. Made here to test the alarm, not read from a sensor.",
  alarm: "Alarm. Checking whether it is real.",
  anomaly: "These readings do not check out. The alarm stands.",
  partial: "Partial gravity. Not yet measured in NASA's tables.",
};

export interface IskraState { g: number; fansOffAt: number | null; klass: Klass; mood: Mood; line: string }

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
    case "TOUR_STEP": return { ...s, mood: "idle", line: e.text };
    case "TOUR_END": return { ...s, mood: "idle", line: "" };
    case "SUCCESS": return { ...s, mood: "success", line: e.text ?? "" };
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
    setS((p) => ({ ...p, g: 0, fansOffAt: null, klass: PAGE_KLASS[top] ?? "derived", mood: "idle", line: p.line && p.mood === "idle" ? p.line : "" }));
  }
  return s;
}

export function isHidden(): boolean { try { return localStorage.getItem(KEY) === "hidden"; } catch { return false; } }
export function setHidden(h: boolean) { try { h ? localStorage.setItem(KEY, "hidden") : localStorage.removeItem(KEY); } catch { /* the choice lasts for this visit only */ } }

/** The "Fans off" demonstration, in the companion's own panel. The caption is part of the demonstration and cannot be switched off. */
function FansOff() {
  const [where, setWhere] = useState<"station" | "moon">("station");
  const [offAt, setOffAt] = useState<number | null>(null);
  const [out, setOut] = useState(false);
  useEffect(() => {
    setOut(false);
    if (offAt == null || where !== "station") return;
    const t = window.setTimeout(() => setOut(true), OUT_AFTER * 1000);
    return () => clearTimeout(t);
  }, [offAt, where]);
  const g = where === "station" ? 0 : 0.1654;
  return (
    <div className="iskra__demo">
      <div className="seg" role="group" aria-label="Where">
        <button type="button" aria-pressed={where === "station"} onClick={() => { setWhere("station"); setOffAt(null); }}>Space station</button>
        <button type="button" aria-pressed={where === "moon"} onClick={() => { setWhere("moon"); setOffAt(null); }}>Lunar habitat</button>
      </div>
      <div className="iskra__stage"><Lantern g={g} fansOffAt={offAt} klass="illustrative" size={132} label={`Schematic flame, ${where === "station" ? "free fall" : "lunar gravity"}, fans ${offAt == null ? "on" : "off"}`} /></div>
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => setOffAt(offAt == null ? performance.now() : null)}><IconFan size={15} />{offAt == null ? "Stop the fans" : "Start the fans"}</button>
      <p className="iskra__cap" role="status">
        {offAt == null ? (where === "station" ? "Free fall, fans on: a small blue flame, steady." : "Lunar gravity, fans on: the flame leans upward. Not yet measured in NASA's tables.")
          : where === "station" ? <>{out ? "Out." : "Shrinking…"} Seen in one BASS-II test: the flame went out within 2 s of the flow being cut. Not a rule: NASA's guide lists it as a misconception. <a href={href("/myths/fans")}>Both sides</a>.</>
          : <>It may keep burning: gravity still draws air through the flame. Not yet measured in NASA's tables. <a href={href("/gaps")}>The gap</a>.</>}
      </p>
      <p className="note">Schematic. The flame follows published findings and the cube root of gravity. It is not a simulation of any material.</p>
    </div>
  );
}

export function IskraDock({ state, name, onTour, compact = false }: { state: IskraState; name: string; onTour: () => void; compact?: boolean }) {
  const [hidden, setHid] = useState(isHidden);
  const [open, setOpen] = useState(false);
  const hide = (h: boolean) => { setHidden(h); setHid(h); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (hidden) return compact ? null : <button type="button" className="iskra__show" onClick={() => hide(false)}>Show {name}, the companion</button>;
  const k = KLASS[state.klass];
  return (
    <div className={`iskra ${compact ? "iskra--compact" : ""}`}>
      <button type="button" className="iskra__body" data-iskra onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${name}, the companion. Open its panel.`}>
        <Lantern g={state.g} fansOffAt={state.fansOffAt} klass={state.klass} mood={state.mood} size={compact ? 30 : 58} />
      </button>
      {!compact && (
        <div className="iskra__talk">
          <b>{name}</b>
          <span className="iskra__ring">ring: {k.label.toLowerCase()}</span>
          <span className="iskra__line" role="status" aria-live="polite">{state.line}</span>
        </div>
      )}
      {open && createPortal(                    /* in the page body: the top bar's blur would otherwise trap a fixed panel inside it */
        <div className={`iskra__panel ${compact ? "iskra__panel--sheet" : ""}`} role="dialog" aria-label={`${name}, the companion`}>
          <div className="iskra__panelhead"><b>{name}</b><span className="note">Bulgarian for "spark"</span><button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><IconClose size={16} /></button></div>
          <p className="iskra__about">A pocket lantern with a small flame in its glass core. The flame follows the physics on the page. The ring shows what kind of information you are looking at: now <b>{k.label.toLowerCase()}</b>. {k.meaning}</p>
          <FansOff />
          <div className="row" style={{ ["--gap" as string]: "8px", marginTop: 4 }}>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { setOpen(false); onTour(); }}><IconTour size={15} />Take the tour</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => hide(true)}>Hide the companion</button>
          </div>
        </div>, document.body)}
    </div>
  );
}
export { emit };
