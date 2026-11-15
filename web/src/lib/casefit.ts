import type { DocRef, EnvelopeDoc, ReportedDoc } from "./types";
import { DesignPoint, materialWords, names } from "./nearest";

/**
 * A design case against everything NASA has for it: which source agrees with the case in what.
 * Five things are compared: the material, oxygen, pressure, air flow and gravity. A source "agrees" in oxygen and pressure by the
 * atmosphere map's own near window, and in air flow within FLOW_NEAR either way. What a source does not state is shown as not stated
 * and is never counted as agreeing. No score is made of this: the table shows where each source departs from the case.
 */
export const FLOW_NEAR = 5;                       // cm/s either way
export type Fit = "same" | "differs" | "unstated" | "open";
export interface FitCell { fit: Fit; text: string }
export type Aspect = "material" | "oxygen" | "pressure" | "flow" | "gravity";
export const ASPECTS: Aspect[] = ["material", "oxygen", "pressure", "flow", "gravity"];
export interface CaseSource {
  id: string; title: string; kind: "psi" | "outside" | "planned"; count: string; cells: Record<Aspect, FitCell>;
  agree: number; asked: number; accession?: string; ref?: DocRef; refWhat?: string;
}

const pct = (v: number) => `${Number(v.toFixed(1))}%`;
/** A range written once with its unit: "7.9 to 8.0 psia". */
const span = (lo: number, hi: number, f: (v: number) => string) => {
  const a = f(lo), b = f(hi);
  if (a === b) return a;
  const unit = / \S+$/.exec(b)?.[0];
  return `${unit && a.endsWith(unit) ? a.slice(0, -unit.length) : a} to ${b}`;
};
const GRAVITY: Record<NonNullable<DesignPoint["gravity"]>, string> = { micro: "free fall", lunar: "lunar gravity", mars: "Martian gravity" };

/** Oxygen agrees when a stated value lies inside the near window of the case; otherwise the cell says how far the nearest one is. */
function oxygenCell(at: DesignPoint, vals: number[], dx: number): FitCell {
  if (vals.length === 0) return { fit: "unstated", text: "not stated" };
  const said = span(Math.min(...vals), Math.max(...vals), (v) => pct(100 * v));
  const nearest = vals.reduce((a, v) => (Math.abs(v - at.x) < Math.abs(a - at.x) ? v : a), vals[0]);
  if (Math.abs(nearest - at.x) <= dx + 1e-9) return { fit: "same", text: said };
  return { fit: "differs", text: `${said}, nearest ${Number((100 * Math.abs(nearest - at.x)).toFixed(1))} points ${nearest < at.x ? "below" : "above"}` };
}
function pressureCell(at: DesignPoint, vals: number[], dp: number, fmt: (kpa: number) => string, words?: string): FitCell {
  if (at.p == null) return { fit: "open", text: vals.length ? span(Math.min(...vals), Math.max(...vals), fmt) : words ?? "not stated" };
  if (vals.length === 0) return words ? { fit: "differs", text: `“${words}”` } : { fit: "unstated", text: "not stated" };
  const near = vals.some((v) => Math.abs(v - at.p!) <= dp * at.p!);
  return { fit: near ? "same" : "differs", text: span(Math.min(...vals), Math.max(...vals), fmt) };
}
function flowCell(at: DesignPoint, speeds: number[], worded: number): FitCell {
  const said = speeds.length ? span(Math.min(...speeds), Math.max(...speeds), (v) => `${Number(v.toFixed(1))} cm/s`) : worded ? "display readings, no speed stated" : "not stated";
  if (at.flow == null) return { fit: "open", text: said };
  if (speeds.length === 0) return { fit: "unstated", text: said };
  return { fit: speeds.some((v) => Math.abs(v - at.flow!) <= FLOW_NEAR) ? "same" : "differs", text: said };
}
const gravityCell = (at: DesignPoint, is: "micro" | "lunar" | null, text: string): FitCell =>
  is == null ? { fit: "unstated", text } : { fit: (at.gravity ?? "micro") === is ? "same" : "differs", text };
function materialCell(words: string[], cells: string[], matches: boolean): FitCell {
  const kinds = Array.from(new Set(cells.map((c) => c.replace(/\s+/g, " ").trim())));
  const text = kinds.length <= 2 ? kinds.join("; ") : `“${kinds[0]}” and ${kinds.length - 1} other wordings`;
  return words.length === 0 ? { fit: "open", text } : { fit: matches ? "same" : "differs", text };
}
function tally(s: Omit<CaseSource, "agree" | "asked">): CaseSource {
  const asked = ASPECTS.filter((a) => s.cells[a].fit !== "open");
  return { ...s, agree: asked.filter((a) => s.cells[a].fit === "same").length, asked: asked.length };
}

/** Every source that names the material of the case (or, with no material asked, every solid-fuel source), with what it states. */
export function caseSources(env: EnvelopeDoc, rep: ReportedDoc | null, at: DesignPoint, fmtP: (kpa: number) => string = (v) => `${v.toFixed(1)} kPa`): CaseSource[] {
  const win = env.near ?? { dx: 0.03, dp: 0.15 };
  const words = materialWords(at.material);
  const kindOf = new Map(env.series.map((s) => [s.id, s.kind]));
  const out: CaseSource[] = [];

  // rows of PSI tables, one source for each record
  const rows = [
    ...env.points.filter((p) => (at.kind == null || kindOf.get(p.s) === at.kind) && (words.length ? names(p.f, words) : kindOf.get(p.s) === "solid")).map((p) => ({ ...p, placed: true })),
    ...(at.kind == null || at.kind === "solid" ? env.unplaced?.rows ?? [] : []).filter((u) => words.length > 0 && names(u.f, words)).map((u) => ({ ...u, x: null as number | null, p: null as number | null, placed: false })),
  ];
  const byRecord = new Map<string, typeof rows>();
  for (const r of rows) byRecord.set(r.a, [...(byRecord.get(r.a) ?? []), r]);
  for (const [acc, rs] of byRecord) {
    const xs = rs.flatMap((r) => (r.x == null ? [] : [r.x]));
    out.push(tally({
      id: `psi:${acc}`, kind: "psi", accession: acc, title: `${rs[0].s.replace(/ (solids|droplets|gas flames)$/, "")}, ${acc}`, count: `${rs.length} ${rs.length === 1 ? "row" : "rows"} of a PSI table`,
      cells: {
        material: materialCell(words, rs.map((r) => r.f), true),
        oxygen: oxygenCell(at, xs, win.dx),
        pressure: pressureCell(at, rs.flatMap((r) => (r.p == null ? [] : [r.p])), win.dp, fmtP),
        flow: flowCell(at, rs.flatMap((r) => (r.v == null ? [] : [r.v])), rs.filter((r) => r.w).length),
        gravity: gravityCell(at, "micro", "free fall"),
      },
    }));
  }
  if (!rep) return out;

  // what NASA reports outside PSI: none of it is a row of a PSI table, and no count of rows includes it
  const saf = rep.saffire.rows.filter((r) => words.length > 0 && names(r.material, words));
  if (saf.length) out.push(tally({
    id: "saffire", kind: "outside", title: `Saffire ${Array.from(new Set(saf.map((r) => r.id.split("-")[0]))).join(", ")}, in a NASA paper`, count: `${saf.length} ${saf.length === 1 ? "sample" : "samples"}`,
    ref: rep.saffire.refs.conditions, refWhat: "Table 1 of the paper",
    cells: {
      material: materialCell(words, saf.map((r) => r.material), true),
      oxygen: oxygenCell(at, saf.map((r) => r.o2_pct / 100), win.dx),
      pressure: pressureCell(at, saf.map((r) => r.p_kpa), win.dp, fmtP),
      flow: flowCell(at, saf.map((r) => r.flow_cm_s), 0),
      gravity: gravityCell(at, "micro", "free fall"),
    },
  }));
  const vent = rep.fm2.vent_tests?.rows.filter((r) => words.length > 0 && names(r.material, words)) ?? [];
  if (vent.length && rep.fm2.vent_tests) out.push(tally({
    id: "vent", kind: "outside", title: "Vent-gas tests for the Moon payload, in NASA slides", count: `${vent.reduce((a, r) => a + r.tests, 0)} tests`, ref: rep.fm2.vent_tests.ref, refWhat: "the slide that lists them",
    cells: {
      material: materialCell(words, vent.map((r) => r.material), true),
      oxygen: oxygenCell(at, vent.map((r) => r.o2_pct / 100), win.dx),
      pressure: pressureCell(at, vent.map((r) => r.p_kpa), win.dp, fmtP),
      flow: flowCell(at, [], 0),
      gravity: gravityCell(at, null, "not stated on the slide"),
    },
  }));
  const luci = rep.luci.rows.filter((r) => words.length > 0 && names(r.sample, words));
  if (luci.length) {
    const o = rep.luci.oxygen.find((x) => x.sample === luci[0].sample);
    out.push(tally({
      id: "luci", kind: "outside", title: "LUCI, on a spinning rocket, in NASA slides", count: `${new Set(luci.map((r) => r.sample)).size} sample`, ref: luci[0].ref, refWhat: "the slide with its spread rate",
      cells: {
        material: materialCell(words, luci.map((r) => r.sample), true),
        oxygen: oxygenCell(at, o ? [o.from_pct / 100, o.to_pct / 100] : [], win.dx),
        pressure: pressureCell(at, [], win.dp, fmtP, rep.luci.atmosphere?.as_stated),
        flow: flowCell(at, [], 0),
        gravity: gravityCell(at, "lunar", `${rep.luci.spin.g} g, simulated by spin`),
      },
    }));
  }
  const fuel = rep.fm2.fuel?.as_stated;
  out.push(tally({
    id: "fm2", kind: "planned", title: "FM2, planned on the Moon", count: `${rep.fm2.tests.length} tests, not yet flown`, ref: rep.fm2.ref, refWhat: "the slide with the four atmospheres",
    cells: {
      material: fuel ? materialCell(words, [fuel], names(fuel, words)) : { fit: words.length ? "unstated" : "open", text: "not stated" },
      oxygen: oxygenCell(at, rep.fm2.tests.map((t) => t.o2_pct / 100), win.dx),
      pressure: pressureCell(at, rep.fm2.tests.map((t) => t.p_kpa), win.dp, fmtP),
      flow: flowCell(at, [], 0),
      gravity: gravityCell(at, "lunar", "on the Moon"),
    },
  }));
  return out;
}

/** One sentence on the whole table: whether anything agrees in everything asked, and what the closest sources each lack. */
export function caseSay(sources: CaseSource[], at: DesignPoint): string {
  const done = sources.filter((s) => s.kind !== "planned");
  if (done.length === 0) return "No stored source names this material.";
  const full = done.filter((s) => s.agree === s.asked);
  const best = Math.max(...done.map((s) => s.agree));
  const lacks = (s: CaseSource) => ASPECTS.filter((a) => s.cells[a].fit === "differs" || s.cells[a].fit === "unstated").map((a) => (a === "flow" ? "the air flow" : a === "gravity" ? GRAVITY[at.gravity ?? "micro"] : `the ${a}`));
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const planned = sources.filter((s) => s.kind === "planned").map((s) => ` ${s.title}: not yet flown; its plan agrees in ${s.agree}${s.agree < s.asked ? ` (lacks ${list(lacks(s))})` : ""}.`).join("");
  if (full.length) return `${full.length === 1 ? "One source agrees" : `${full.length} sources agree`} with this case in all ${full[0].asked} things asked: ${list(full.map((s) => s.title))}.`;
  const close = done.filter((s) => s.agree === best);
  return `No test that has been run agrees with this case in all ${done[0].asked} things asked. The closest ${close.length === 1 ? "agrees" : "agree"} in ${best}: ${close.map((s) => `${s.title} (lacks ${list(lacks(s))})`).join("; ")}.${planned}`;
}
