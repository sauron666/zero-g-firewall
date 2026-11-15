import type { EnvelopeDoc, EnvelopePoint } from "./types";

export type Gravity = "micro" | "lunar" | "mars";
/** A cabin and what burns in it. Oxygen is always asked; the rest may be left open. */
export interface DesignPoint { x: number; p: number | null; kind: string | null; material?: string | null; flow?: number | null; gravity?: Gravity }
export interface Near { pt: EnvelopePoint; kind: string; d: number; dx: number; dp: number | null; byOxygen: boolean }

/** Names NASA's tables and slides use for one material. A reader's word is widened with these and nothing else. */
const SAME_MATERIAL: string[][] = [["pmma", "acrylic", "plexiglas", "polymethyl"], ["ptfe", "teflon"]];
export function materialWords(text: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const w of (text ?? "").toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []) {
    if (w.length < 2) continue;
    (SAME_MATERIAL.find((g) => g.includes(w)) ?? [w]).forEach((x) => out.add(x));
  }
  return Array.from(out);
}
/** Does a cell, as NASA wrote it, name the material? With no material asked, every cell does. */
export const names = (cell: string, words: string[]) => words.length === 0 || words.some((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(cell));

/**
 * The test rows nearest to a design point, in units of the atmosphere map's own "near" window:
 * a distance of 1 is the edge of that window in oxygen (and in pressure, when a pressure is asked for).
 * With a pressure, rows that state one come first and only they can be "near". Rows that state none follow,
 * ordered by oxygen alone and marked so: they are never counted as near.
 */
export function nearestRows(env: EnvelopeDoc, at: DesignPoint, k = 12): { rows: Near[]; pool: number; within: number; byOxygen: number } {
  const win = env.near ?? { dx: 0.03, dp: 0.15 };
  const kindOf = new Map(env.series.map((s) => [s.id, s.kind]));
  const words = materialWords(at.material);
  const fit = env.points.filter((pt) => (at.kind == null || kindOf.get(pt.s) === at.kind) && names(pt.f, words));
  const order = (a: Near, b: Near) => a.d - b.d || a.pt.a.localeCompare(b.pt.a) || a.pt.r - b.pt.r;
  const full = fit.filter((pt) => at.p == null || pt.p != null).map((pt): Near => {
    const dx = (pt.x - at.x) / win.dx;
    const dp = at.p == null || pt.p == null ? null : (pt.p - at.p) / (win.dp * at.p);
    return { pt, kind: kindOf.get(pt.s) ?? "", d: Math.hypot(dx, dp ?? 0), dx, dp, byOxygen: false };
  }).sort(order);
  const loose = fit.filter((pt) => at.p != null && pt.p == null).map((pt): Near => {
    const dx = (pt.x - at.x) / win.dx;
    return { pt, kind: kindOf.get(pt.s) ?? "", d: Math.abs(dx), dx, dp: null, byOxygen: true };
  }).sort(order);
  return { rows: [...full, ...loose].slice(0, k), pool: full.length, byOxygen: loose.length, within: full.filter((r) => Math.abs(r.dx) <= 1 && (r.dp == null || Math.abs(r.dp) <= 1)).length };
}

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The rows as a CSV a model can read, each with the file it came from and that file's hash. */
export function nearestCsv(rows: Near[], at: DesignPoint, files: Map<string, { file: string; sha256: string; ledger_seq: number }>): string {
  const head = ["psi_record", "series", "fuel_form", "source_file", "row_in_file", "oxygen_mole_fraction", "pressure_kpa", "fuel_as_written", "outcome_as_written", "air_flow_as_written", "air_flow_cm_s",
    "compared_by", "distance_in_near_windows", "source_sha256", "ledger_entry"];
  const lines = rows.map((r) => {
    const f = files.get(r.pt.t);
    return [r.pt.a, r.pt.s, r.kind, f?.file ?? r.pt.t, r.pt.r + 1, r.pt.x, r.pt.p, r.pt.f, r.pt.o ?? "", r.pt.w ?? "", r.pt.v ?? "", r.byOxygen ? "oxygen only" : at.p == null ? "oxygen" : "oxygen and pressure",
      r.d.toFixed(3), f?.sha256 ?? "", f?.ledger_seq ?? ""].map(cell).join(",");
  });
  const note = `# Zero-G Firewall: test rows of NASA PSI tables nearest to oxygen ${at.x} (mole fraction)${at.p == null ? "" : `, ${at.p} kPa`}${at.kind ? `, ${at.kind} only` : ""}${at.material ? `, material named ${at.material}` : ""}. Values as NASA wrote them; distance is ours.`;
  return [note, head.join(","), ...lines].join("\n") + "\n";
}
