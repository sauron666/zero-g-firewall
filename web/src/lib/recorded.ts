import type { RecordedDoc } from "./types";

/** Index of the last reading at or before t in a list of [time, value] sorted by time; -1 when there is none yet. */
export function lastAt(readings: [number, number][], t: number): number {
  let lo = 0, hi = readings.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (readings[mid][0] <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/** Index of the time nearest to t in a sorted list. */
export function nearest(ts: number[], t: number): number {
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid; else hi = mid;
  }
  return Math.abs(ts[hi] - t) < Math.abs(ts[lo] - t) ? hi : lo;
}

export const signed = (t: number) => `${t > 0 ? "+" : t < 0 ? "−" : ""}${Math.abs(Math.round(t))} s`;

/** Clock time of a moment of the recording, from the stated time of its zero. */
export function utcAt(doc: RecordedDoc, t: number): string {
  const ms = Date.parse(doc.zero.utc) + Math.round(t) * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 19) : "";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The calendar day of the recording in UTC, from the file's own time stamp: "5 June 2017". */
export function utcDay(doc: RecordedDoc): string {
  const d = new Date(Date.parse(doc.zero.utc));
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "";
}

export interface Moment { t: number; text: string; kind: "event" | "reading" }

/** The moments worth saying aloud while the recording plays, in order. Every number is one the file or its derived block states. */
export function moments(doc: RecordedDoc): Moment[] {
  const D = doc.derived, sc = D.scatter;
  const ev = (id: string) => doc.events.find((e) => e.id === id);
  const sample = (id: string) => doc.samples.find((s) => String(s["Sample Number"] ?? "").trim() === id);
  const dir = (id: string) => String(sample(id)?.Direction ?? "").trim().toLowerCase();
  const out: Moment[] = [];
  const w1 = ev("wire1"), s2 = ev("S2"), s1 = ev("S1"), w2 = ev("wire2");
  if (w1) {
    out.push({ t: w1.t, kind: "event", text: "A smoke wire is powered to show the airflow. Nothing is burning." });
    out.push({ t: sc.wire.peak_t, kind: "reading", text: `The vehicle's smoke detector reads ${sc.wire.peak}, ${Math.round(sc.wire.peak_after_s)} s after the wire. Its quiet level was ${sc.quiet.max}.` });
  }
  if (s2) out.push({ t: s2.t, kind: "event", text: `Igniter of sample S2${dir("S2") ? `: a flame spreading ${dir("S2") === "opposed" ? "against" : "with"} the airflow` : ""}.` });
  if (s1) out.push({ t: s1.t, kind: "event", text: `Igniter of sample S1${dir("S1") ? `: a flame spreading ${dir("S1") === "opposed" ? "against" : "with"} the airflow` : ""}. The detector reads ${sc.fire.before} or less.` });
  if (sc.fire.first_above_before_s != null) out.push({ t: sc.fire.first_above_before_s, kind: "reading", text: `${Math.round(sc.fire.first_above_before_s)} s after ignition the detector passes its level of the minute before.` });
  out.push({ t: D.flame.first_peak_t, kind: "reading", text: "The first pair of radiometers is at its peak." });
  out.push({ t: sc.fire.half_s, kind: "reading", text: `The detector is half-way to its peak, ${Math.round(sc.fire.half_s)} s after ignition.` });
  out.push({ t: sc.fire.peak_s, kind: "reading", text: `The detector peaks at ${sc.fire.peak}. The smoke wire gave ${sc.wire.peak}.` });
  out.push({ t: D.flame.until_t, kind: "reading", text: "The radiometers are back at baseline." });
  if (w2) out.push({ t: w2.t, kind: "event", text: "The smoke wire is powered again." });
  return out.filter((m) => m.t >= doc.window.from_t && m.t <= doc.window.to_t).sort((a, b) => a.t - b.t);
}

/** The newest moment at or before t. */
export function momentAt(ms: Moment[], t: number): Moment | null {
  let cur: Moment | null = null;
  for (const m of ms) if (m.t <= t) cur = m;
  return cur;
}

/** A step line through readings up to a time: each reading holds until the next one. */
export function stepPath(readings: [number, number][], sx: (t: number) => number, sy: (v: number) => number, until: number): string {
  let d = "";
  for (let i = 0; i < readings.length; i++) {
    const [t, v] = readings[i];
    if (t > until) break;
    d += i === 0 ? `M${sx(t).toFixed(1)} ${sy(v).toFixed(1)}` : `H${sx(t).toFixed(1)}V${sy(v).toFixed(1)}`;
  }
  const k = lastAt(readings, until);
  if (k >= 0 && readings[k][0] < until) d += `H${sx(until).toFixed(1)}`;
  return d;
}
