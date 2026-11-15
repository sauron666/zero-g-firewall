/**
 * Material Evidence: the PMMA tests NASA recorded, set against a question condition by condition.
 *
 * Rules (docs/CONTRACTS.md, "EvidenceMatch"):
 *  - A joint match is admitted only when one test, as recorded, matches every asked condition at once.
 *  - Oxygen that changed during a test (initial to final) does not establish every value in between: at best "near".
 *  - A condition the record does not state is "not reported", never a match.
 *  - "Near" uses a tolerance shown on screen; it is our heuristic.
 *  - Ordering by similarity is separate from applicability (role).
 *  - Values come from the shipped artifacts (tables/*.json, reported.json); nothing is typed here.
 */
import type { ConditionCheck, EvidenceMatch, EvidenceRole, FuelForm, MatchStatus, ScenarioState } from "./scenario";
import { U } from "./scenario";
import type { Klass } from "./klass";

export interface Cond {
  material: string;            // as written
  isPmma: "yes" | "mixed";
  form: FuelForm;
  thickness_mm: number | null;
  sides: "1-sided" | "2-sided" | null;
  o2: { lo: number; hi: number; varying: boolean } | null;   // mole fraction
  p_kpa: number | null;
  u_m_s: number | null;
  g: number | null;
  gNote?: string;
  flowNote?: string;
  pNote?: string;
}
export interface Candidate {
  id: string;
  title: string;
  klass: Klass;
  record: string;              // e.g. "PSI-25 BASS-II"
  cond: Cond;
  observed: { label: string; value: string }[];
  source: { label: string; ref: Record<string, unknown> };
}

export const TOL = {
  o2: { match: 0.005, near: 0.02, text: "match within 0.5 points of oxygen, near within 2 points" },
  p: { match: 0.02, near: 0.10, text: "match within 2% of the asked pressure, near within 10%" },
  u: { match: 0.01, near: 0.05, text: "match within 1 cm/s, near within 5 cm/s" },
  g: { match: 0.005, text: "gravity matches only in the same regime (free fall, simulated lunar, 1 g)" },
};
const WEIGHT: Record<ConditionCheck["dim"], number> = { material: 2, form: 1, o2: 2, p_kpa: 1.5, u_m_s: 1, g: 2 };
const SCORE: Record<MatchStatus, number> = { match: 1, near: 0.6, different: 0, not_reported: 0.2 };

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const m = String(s).replace(/[~\s]/g, " ").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** Form and thickness from a free-text material cell. Unknown stays unknown. */
export function parseGeometry(text: string): { form: FuelForm; thickness_mm: number | null; sides: Cond["sides"] } {
  const t = text.toLowerCase();
  let form: FuelForm = "unknown";
  if (/\brod\b/.test(t)) form = "rod";
  else if (/sphere/.test(t)) form = "sphere";
  else if (/film|slab|sheet|thick|micron|sided/.test(t)) form = "sheet";
  let thickness: number | null = null;
  const mic = t.match(/(\d+(?:\.\d+)?)\s*micron/);
  const mm = t.match(/(\d+(?:\.\d+)?)\s*mm(?:\s*thick)?/);
  const inch = t.match(/(\d+)\s*\/\s*(\d+)\s*"/);
  if (mic) thickness = Number(mic[1]) / 1000;
  else if (mm) thickness = Number(mm[1]);
  else if (inch) thickness = (Number(inch[1]) / Number(inch[2])) * 25.4;
  const sides = /1[\s-]*sided/.test(t) ? "1-sided" : /2[\s-]*sided/.test(t) ? "2-sided" : null;
  return { form, thickness_mm: thickness, sides };
}

/** Oxygen from initial and final cells in percent; "varying" when they differ by more than 0.3 points. */
export function o2Range(initialPct: number | null, finalPct: number | null): Cond["o2"] {
  if (initialPct == null) return null;
  if (finalPct == null || finalPct <= 0) return { lo: initialPct / 100, hi: initialPct / 100, varying: false };
  const lo = Math.min(initialPct, finalPct) / 100, hi = Math.max(initialPct, finalPct) / 100;
  return { lo, hi, varying: hi - lo > 0.003 };
}

interface TableDocLite { accession: string; file: string; sha256: string; ledger_seq: number; url?: string; columns: string[]; rows: string[][] }
interface ReportedLite {
  saffire: { rows: { id: string; material: string; direction: string; length_cm: number; flow_cm_s: number; p_kpa: number; o2_pct: number; co2_ppm: number; co_ppm: number; t_outlet_c: number }[]; refs: Record<string, Record<string, unknown>> };
  luci: { rows: { id: string; sample: string; measure: string; lunar: number; earth: number; unit: string; ref: Record<string, unknown> }[]; spin: { rpm: number; radius_m: number; g: number; ref: Record<string, unknown> }; oxygen: { sample: string; from_pct: number; to_pct: number; ref: Record<string, unknown> }[] };
}

const tableRef = (t: TableDocLite, row: number) => ({ kind: "table", accession: t.accession, file: t.file, sha256: t.sha256, ledger_seq: t.ledger_seq, url: t.url, row_in_file: row + 1 });

/** Every PMMA test this build can see, from NASA tables and NASA documents. */
export function collect(tables: { bass2?: TableDocLite; saffire2?: TableDocLite; bass?: TableDocLite }, rep: ReportedLite | null): Candidate[] {
  const out: Candidate[] = [];
  if (rep) {
    for (const r of rep.saffire.rows.filter((x) => /pmma/i.test(x.material))) {
      const geo = parseGeometry(r.material + " sheet");
      out.push({
        id: `Saffire ${r.id}`, title: `Saffire ${r.id}: ${r.material}, ${r.length_cm} cm, ${r.direction.toLowerCase()} flow`, klass: "literature", record: "Saffire VI (NTRS 20240002981)",
        cond: { material: r.material, isPmma: "yes", form: "sheet", thickness_mm: null, sides: geo.sides, o2: { lo: r.o2_pct / 100, hi: r.o2_pct / 100, varying: false }, p_kpa: r.p_kpa, u_m_s: r.flow_cm_s / 100, g: 0, gNote: "Cygnus vehicle in free flight" },
        observed: [{ label: "CO₂ rise at far sensors", value: `${r.co2_ppm} ppm` }, { label: "CO rise at far sensors", value: `${r.co_ppm} ppm` }, { label: "highest duct-outlet temperature", value: `${r.t_outlet_c} °C` }],
        source: { label: "Urban et al., ICES-2024-365, Table 1 (p. 3) and Table 2 (p. 6)", ref: { ...rep.saffire.refs.conditions, products: rep.saffire.refs.products } },
      });
    }
    const rod = rep.luci.rows.find((x) => /acrylic/i.test(x.sample));
    const ox = rep.luci.oxygen.find((x) => /acrylic/i.test(x.sample));
    if (rod) {
      const geo = parseGeometry(rod.sample);
      out.push({
        id: "LUCI acrylic rod", title: `LUCI: ${rod.sample}, spinning sounding rocket`, klass: "literature", record: "LUCI (NTRS 20250010653)",
        cond: { material: "Acrylic (PMMA) rod", isPmma: "yes", form: "rod", thickness_mm: geo.thickness_mm, sides: null, o2: ox ? o2Range(ox.from_pct, ox.to_pct) : null, p_kpa: null, u_m_s: null, g: rep.luci.spin.g,
          gNote: `simulated lunar gravity: ${rep.luci.spin.rpm} rpm at ${rep.luci.spin.radius_m} m on a sounding rocket, minutes long, with Coriolis effects`, pNote: "pressure not given on the cited slides", flowNote: "no forced flow stated" },
        observed: [{ label: `${rod.measure} spread, simulated lunar`, value: `${rod.lunar} ${rod.unit}` }, { label: `${rod.measure} spread, Earth`, value: `${rod.earth} ${rod.unit}` }],
        source: { label: "Ferkul et al., NTRS 20250010653, slides 12, 22, 33", ref: rod.ref },
      });
    }
  }
  const b2 = tables.bass2;
  if (b2) {
    const c = (name: string) => b2.columns.findIndex((h) => h.trim().toLowerCase().startsWith(name.toLowerCase()));
    const iMat = c("Fuel Sample Material"), iTest = c("Test #"), iO2i = c("Calibrated  initial O2"), iO2f = c("Calibrated final O2"), iFan = c("Fan display"), iAir = c("Air display"), iPI = c("PI");
    b2.rows.forEach((row, i) => {
      const mat = row[iMat] ?? "";
      if (!/pmma/i.test(mat)) return;
      const geo = parseGeometry(mat);
      const fan = (row[iFan] ?? "").trim(), air = (row[iAir] ?? "").trim();
      out.push({
        id: `BASS-II ${row[iTest]}`, title: `BASS-II ${row[iTest]}: ${mat.replace(/\s+/g, " ").trim()}`, klass: "observed", record: "PSI-25 BASS-II",
        cond: { material: mat, isPmma: "yes", form: geo.form, thickness_mm: geo.thickness_mm, sides: geo.sides, o2: o2Range(num(row[iO2i]), num(row[iO2f])), p_kpa: null, u_m_s: null, g: 0, gNote: "Microgravity Science Glovebox on the ISS",
          pNote: "the BASS-II table records no pressure", flowNote: `recorded as display settings (fan "${fan}", air "${air}"); not converted to cm/s without the fan calibration` },
        observed: [{ label: "fan display, as written", value: fan || "empty" }, { label: "air display, as written", value: air || "empty" }, { label: "investigator", value: row[iPI] ?? "" }],
        source: { label: `PSI-25, ${b2.file}, row ${i + 1}`, ref: tableRef(b2, i) },
      });
    });
  }
  const s2 = tables.saffire2;
  if (s2) {
    s2.rows.forEach((row, i) => {
      const mat = row[1] ?? "";
      if (!/pmma/i.test(mat)) return;
      const ox = row[6] ?? "";
      const nums = (ox.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      const flow = num(row[5]);
      out.push({
        id: `Saffire-II ${row[0]}`, title: `Saffire-II ${row[0]}: ${mat}, ${row[3]} × ${row[4]}`, klass: "observed", record: "PSI-99 Saffire-II",
        cond: { material: mat, isPmma: /&|and/i.test(mat) ? "mixed" : "yes", form: "sheet", thickness_mm: num(row[2]) != null && /mm/.test(row[2]) ? num(row[2]) : null, sides: null,
          o2: nums.length ? o2Range(nums[0], nums[1] ?? null) : null, p_kpa: null, u_m_s: flow != null ? flow / 100 : null, g: 0, gNote: "Cygnus vehicle in free flight", pNote: "the Saffire-II table records no pressure" },
        observed: [{ label: "burn time, as written", value: row[9] ?? "" }, { label: "flow direction", value: row[10] ?? "" }, { label: "oxygen, as written", value: ox }],
        source: { label: `PSI-99, ${s2.file}, row ${i + 1}`, ref: tableRef(s2, i) },
      });
    });
  }
  const b1 = tables.bass;
  if (b1) {
    b1.rows.forEach((row, i) => {
      const mat = row[5] ?? "";
      if (!/pmma/i.test(mat)) return;
      const geo = parseGeometry(mat);
      out.push({
        id: `BASS ${row[2]}`, title: `BASS run ${row[2]}: ${mat}`, klass: "observed", record: "PSI-26 BASS",
        cond: { material: mat, isPmma: "yes", form: geo.form, thickness_mm: null, sides: null, o2: null, p_kpa: null, u_m_s: null, g: 0, gNote: "Microgravity Science Glovebox on the ISS", pNote: "the BASS table lists the sample only", flowNote: "not in the BASS table" },
        observed: [{ label: "date", value: row[0] ?? "" }],
        source: { label: `PSI-26, ${b1.file}, row ${i + 1}`, ref: tableRef(b1, i) },
      });
    });
  }
  return out;
}

function gRegime(g: number): string { return g < 0.005 ? "free fall" : Math.abs(g - 0.165) < 0.03 ? "lunar" : Math.abs(g - 0.38) < 0.05 ? "martian" : Math.abs(g - 1) < 0.05 ? "1 g" : `${g} g`; }

/** One test against one question, condition by condition. */
export function match(c: Candidate, s: ScenarioState): EvidenceMatch {
  const checks: ConditionCheck[] = [];
  const k = c.cond;
  // material
  checks.push(s.material !== "PMMA" ? { dim: "material", asked: s.material, recorded: k.material, status: "different", why: "a different material" }
    : k.isPmma === "mixed" ? { dim: "material", asked: "PMMA", recorded: k.material, status: "near", why: "PMMA burned together with another material", tolerance: "mixed sample" }
    : { dim: "material", asked: "PMMA", recorded: k.material.replace(/\s+/g, " ").trim(), status: "match", why: "PMMA (acrylic)" });
  // form
  checks.push(s.form === "unknown" ? { dim: "form", asked: "unknown", recorded: k.form, status: "not_reported", why: "no form was asked" }
    : k.form === "unknown" ? { dim: "form", asked: s.form, recorded: "not reported", status: "not_reported", why: "the record does not say whether sheet, rod or sphere" }
    : { dim: "form", asked: s.form, recorded: `${k.form}${k.sides ? `, ${k.sides}` : ""}${k.thickness_mm != null ? `, ${+k.thickness_mm.toFixed(2)} mm` : ""}`, status: k.form === s.form ? "match" : "different",
        why: k.form === s.form ? (k.form === "rod" ? "a rod, as asked; a rod and a sheet are not the same geometry" : "same form; thickness may differ") : `a ${k.form} is not a ${s.form}` });
  // oxygen
  if (s.o2 == null) checks.push({ dim: "o2", asked: "unknown", recorded: k.o2 ? U.pct(k.o2.lo) : "not reported", status: "not_reported", why: "no oxygen was asked" });
  else if (!k.o2) checks.push({ dim: "o2", asked: U.pct(s.o2), recorded: "not reported", status: "not_reported", why: "the record states no oxygen" });
  else if (k.o2.varying) {
    const inside = s.o2 >= k.o2.lo - TOL.o2.match && s.o2 <= k.o2.hi + TOL.o2.match;
    checks.push({ dim: "o2", asked: U.pct(s.o2), recorded: `${U.pct(k.o2.hi)} falling to ${U.pct(k.o2.lo)}`, status: inside ? "near" : "different",
      why: inside ? "oxygen changed during the test; passing through a value does not establish that combination" : "outside the range the test passed through", tolerance: TOL.o2.text });
  } else {
    const d = Math.abs(s.o2 - k.o2.lo);
    checks.push({ dim: "o2", asked: U.pct(s.o2), recorded: U.pct(k.o2.lo), status: d <= TOL.o2.match ? "match" : d <= TOL.o2.near ? "near" : "different", why: `${(d * 100).toFixed(1)} points apart`, tolerance: TOL.o2.text });
  }
  // pressure
  if (s.p_kpa == null) checks.push({ dim: "p_kpa", asked: "unknown", recorded: U.kpa(k.p_kpa), status: "not_reported", why: "no pressure was asked" });
  else if (k.p_kpa == null) checks.push({ dim: "p_kpa", asked: U.kpa(s.p_kpa), recorded: "not reported", status: "not_reported", why: k.pNote ?? "the record states no pressure" });
  else { const r = Math.abs(k.p_kpa - s.p_kpa) / s.p_kpa; checks.push({ dim: "p_kpa", asked: U.kpa(s.p_kpa), recorded: U.kpa(k.p_kpa), status: r <= TOL.p.match ? "match" : r <= TOL.p.near ? "near" : "different", why: `${(r * 100).toFixed(1)}% apart`, tolerance: TOL.p.text }); }
  // airflow
  if (s.u_m_s == null) checks.push({ dim: "u_m_s", asked: "unknown", recorded: U.cms(k.u_m_s), status: "not_reported", why: "no airflow was asked" });
  else if (k.u_m_s == null) checks.push({ dim: "u_m_s", asked: U.cms(s.u_m_s), recorded: "not reported", status: "not_reported", why: k.flowNote ?? "the record states no airflow" });
  else { const d = Math.abs(k.u_m_s - s.u_m_s); checks.push({ dim: "u_m_s", asked: U.cms(s.u_m_s), recorded: U.cms(k.u_m_s), status: d <= TOL.u.match ? "match" : d <= TOL.u.near ? "near" : "different", why: `${(d * 100).toFixed(0)} cm/s apart`, tolerance: TOL.u.text }); }
  // gravity
  if (s.g == null) checks.push({ dim: "g", asked: "unknown", recorded: U.g(k.g), status: "not_reported", why: "no gravity was asked" });
  else if (k.g == null) checks.push({ dim: "g", asked: U.g(s.g), recorded: "not reported", status: "not_reported", why: "the record states no gravity level" });
  else { const same = gRegime(s.g) === gRegime(k.g); checks.push({ dim: "g", asked: U.g(s.g), recorded: `${U.g(k.g)}${k.gNote ? ` (${k.gNote})` : ""}`, status: same ? "match" : "different", why: same ? `same regime: ${gRegime(k.g)}` : `${gRegime(k.g)} is not ${gRegime(s.g)}` }); }

  const joint = checks.every((x) => x.status === "match");
  const wsum = checks.reduce((a, x) => a + WEIGHT[x.dim], 0);
  const similarity = checks.reduce((a, x) => a + WEIGHT[x.dim] * SCORE[x.status], 0) / wsum;
  const hard = checks.filter((x) => (x.dim === "material" || x.dim === "g" || x.dim === "form") && x.status === "different").length;
  const role: EvidenceRole = joint ? "direct" : hard > 0 ? (c.id.startsWith("LUCI") ? "mechanistic" : "context") : "analogous";
  return { id: c.id, title: c.title, checks, missing: checks.filter((x) => x.status === "not_reported").map((x) => x.dim), similarity, role, joint, klass: c.klass, source: c.source, observed: c.observed };
}

export function rankEvidence(cands: Candidate[], s: ScenarioState): EvidenceMatch[] {
  return cands.map((c) => match(c, s)).sort((a, b) => Number(b.joint) - Number(a.joint) || b.similarity - a.similarity || a.id.localeCompare(b.id));
}

export const DIM_LABEL: Record<ConditionCheck["dim"], string> = { material: "Material", form: "Geometry", o2: "Oxygen", p_kpa: "Pressure", u_m_s: "Airflow", g: "Gravity" };
export const STATUS_LABEL: Record<MatchStatus, string> = { match: "Match", near: "Near", different: "Different", not_reported: "Not reported" };
export const ROLE_LABEL: Record<EvidenceRole, string> = { direct: "direct: this test, these conditions", analogous: "analogous: same material and regime, some conditions differ", mechanistic: "mechanistic: other gravity, informs how a variable acts", context: "context: a different regime or form" };

/** The gap between a recorded test and the asked question, as a sentence list. */
export function gapOf(best: EvidenceMatch | undefined, s: ScenarioState): { differing: string[]; question: string } {
  if (!best) return { differing: ["no PMMA test in this build"], question: "Which PMMA test should be fetched first?" };
  const diff = best.checks.filter((c) => c.status !== "match");
  const parts = diff.map((c) => `${DIM_LABEL[c.dim].toLowerCase()} ${c.status === "not_reported" ? "is not reported" : `differs (${c.recorded} recorded, ${c.asked} asked)`}`);
  const q = `Does a ${s.form === "unknown" ? "" : s.form + " of "}PMMA burn${s.g != null && s.g > 0 ? ` at ${U.g(s.g)}` : " in free fall"} with ${U.pct(s.o2)} oxygen at ${U.kpa(s.p_kpa)} and ${U.cms(s.u_m_s)} airflow, and how does its spread compare with ${best.id}?`;
  return { differing: parts.length ? parts : ["none of the asked conditions differs from the record; what the record did not measure stays unknown"], question: q };
}

/** The brief, as Markdown. Same values as the screen. */
export function briefMarkdown(s: ScenarioState, ranked: EvidenceMatch[], meta: { ledger_head?: string; built?: string; url: string }): string {
  const top = ranked.slice(0, 3);
  const best = ranked[0];
  const gap = gapOf(best, s);
  const L: string[] = [];
  L.push("# Zero-G Firewall brief: PMMA against NASA's recorded tests", "");
  L.push(`**Question.** ${gap.question}`, "");
  L.push("## Conditions asked", "", `- Material: PMMA, ${s.form}`, `- Oxygen: ${U.pct(s.o2)}`, `- Pressure: ${U.kpa(s.p_kpa)}`, `- Airflow: ${U.cms(s.u_m_s)}`, `- Gravity: ${U.g(s.g)}`, "");
  L.push("## Nearest recorded tests", "", "| Test | Class | Role | Material | Geometry | Oxygen | Pressure | Airflow | Gravity |", "|---|---|---|---|---|---|---|---|---|");
  for (const m of top) L.push(`| ${m.id} | ${m.klass} | ${m.role} | ${m.checks.map((c) => `${STATUS_LABEL[c.status]}: ${c.recorded}`).join(" | ")} |`);
  L.push("", "## What was observed", "");
  for (const m of top) L.push(`- **${m.id}**: ${m.observed.map((o) => `${o.label} ${o.value}`).join("; ")}.`);
  L.push("", "## What this supports", "");
  L.push(best?.joint ? `- ${best.id} was recorded under every asked condition. Its observations apply to this question as recorded, and to nothing beyond it.` : `- No test in this build matches every asked condition at once. The nearest, ${best?.id ?? "none"}, is ${best ? ROLE_LABEL[best.role] : "unavailable"}. Its observations do not transfer to the asked conditions.`);
  L.push("", "## What is missing", "", ...gap.differing.map((d) => `- ${d}`), "", "## Next question", "", gap.question, "");
  L.push("## Sources", "", ...top.map((m) => `- ${m.id}: ${m.source.label}`), "");
  L.push("## Method", "", `Tolerances (our heuristic): ${TOL.o2.text}; ${TOL.p.text}; ${TOL.u.text}; ${TOL.g.text}. Similarity orders the list; applicability is the role.`, "");
  L.push(`Dataset: ledger head ${meta.ledger_head ?? "unknown"}, built ${meta.built ?? "unknown"}. Reopen: ${meta.url}`, "");
  L.push("Independent project, not endorsed by NASA. Absence of a test here is not absence in all NASA research.", "");
  return L.join("\n");
}

export function briefCsv(s: ScenarioState, ranked: EvidenceMatch[]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["test", "class", "role", "joint_match", "similarity", ...["material", "form", "o2", "p_kpa", "u_m_s", "g"].flatMap((d) => [`${d}_asked`, `${d}_recorded`, `${d}_status`]), "source"];
  const rows = ranked.map((m) => [m.id, m.klass, m.role, String(m.joint), m.similarity.toFixed(3), ...m.checks.flatMap((c) => [c.asked, c.recorded, c.status]), m.source.label].map(cell).join(","));
  return [`# asked: PMMA ${s.form}, O2 ${s.o2}, ${s.p_kpa} kPa, ${s.u_m_s} m/s, ${s.g} g`, head.join(","), ...rows].join("\n") + "\n";
}
