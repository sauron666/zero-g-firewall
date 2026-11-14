import type { EnvelopeDoc, EnvelopePoint } from "./types";

export interface DesignPoint { x: number; p: number | null; kind: string | null }
export interface Near { pt: EnvelopePoint; kind: string; d: number; dx: number; dp: number | null }

/**
 * The test rows nearest to a design point, in units of the atmosphere map's own "near" window:
 * a distance of 1 is the edge of that window in oxygen (and in pressure, when a pressure is asked for).
 * With a pressure, only rows that state one can be compared; with oxygen alone, every placed row can.
 */
export function nearestRows(env: EnvelopeDoc, at: DesignPoint, k = 12): { rows: Near[]; pool: number; within: number } {
  const win = env.near ?? { dx: 0.03, dp: 0.15 };
  const kindOf = new Map(env.series.map((s) => [s.id, s.kind]));
  const pool = env.points.filter((pt) => (at.kind == null || kindOf.get(pt.s) === at.kind) && (at.p == null || pt.p != null));
  const all = pool.map((pt): Near => {
    const dx = (pt.x - at.x) / win.dx;
    const dp = at.p == null || pt.p == null ? null : (pt.p - at.p) / (win.dp * at.p);
    return { pt, kind: kindOf.get(pt.s) ?? "", d: Math.hypot(dx, dp ?? 0), dx, dp };
  }).sort((a, b) => a.d - b.d || a.pt.a.localeCompare(b.pt.a) || a.pt.r - b.pt.r);
  return { rows: all.slice(0, k), pool: pool.length, within: all.filter((r) => Math.abs(r.dx) <= 1 && (r.dp == null || Math.abs(r.dp) <= 1)).length };
}

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The rows as a CSV a model can read, each with the file it came from and that file's hash. */
export function nearestCsv(rows: Near[], at: DesignPoint, files: Map<string, { file: string; sha256: string; ledger_seq: number }>): string {
  const head = ["psi_record", "series", "fuel_form", "source_file", "row_in_file", "oxygen_mole_fraction", "pressure_kpa", "fuel_as_written", "outcome_as_written", "distance_in_near_windows", "source_sha256", "ledger_entry"];
  const lines = rows.map((r) => {
    const f = files.get(r.pt.t);
    return [r.pt.a, r.pt.s, r.kind, f?.file ?? r.pt.t, r.pt.r + 1, r.pt.x, r.pt.p, r.pt.f, r.pt.o ?? "", r.d.toFixed(3), f?.sha256 ?? "", f?.ledger_seq ?? ""].map(cell).join(",");
  });
  const note = `# Zero-G Firewall: test rows of NASA PSI tables nearest to oxygen ${at.x} (mole fraction)${at.p == null ? "" : `, ${at.p} kPa`}${at.kind ? `, ${at.kind} only` : ""}. Values as NASA wrote them; distance is ours.`;
  return [note, head.join(","), ...lines].join("\n") + "\n";
}
