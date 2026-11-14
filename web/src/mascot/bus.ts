import type { Klass } from "../lib/klass";

/**
 * The companion only listens. Pages say what is on screen; the companion never asks and never invents.
 * Nothing here carries data: a line of the companion is a remark about what the page already shows.
 */
export type IskraEvent =
  | { type: "CONTEXT"; g?: number; fans?: boolean; klass?: Klass; source?: string }
  | { type: "SEARCHING" }
  | { type: "ANSWER_DONE"; strength: "supported" | "gap" | "refused"; cites?: number[] }
  | { type: "ALARM"; state: "CLEAR" | "CHECK" | "FIRE ALARM"; anomaly: boolean }
  | { type: "FANS"; on: boolean }
  | { type: "TOUR_STEP"; id: string; text: string }
  | { type: "TOUR_END" }
  | { type: "SUCCESS"; text?: string };

type Fn = (e: IskraEvent) => void;
const subs = new Set<Fn>();
let context: IskraEvent | null = null;       // what the page last said about itself
export const emit = (e: IskraEvent) => {
  if (e.type === "CONTEXT") context = e;
  subs.forEach((f) => { try { f(e); } catch { /* a listener must not break a page */ } });
};
/** Subscribe. With `replay`, the page's last CONTEXT is delivered at once: a page reports itself before the companion has started listening. */
export const on = (f: Fn, replay = false) => { subs.add(f); if (replay && context) f(context); return () => { subs.delete(f); }; };
export const forgetContext = () => { context = null; };
