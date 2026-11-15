import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASPECTS, FLOW_NEAR, caseSay, caseSources } from "./casefit";
import type { DesignPoint } from "./nearest";
import type { EnvelopeDoc, ReportedDoc } from "./types";

const load = <T,>(n: string) => JSON.parse(readFileSync(`public/data/v1/${n}`, "utf8")) as T;
const env = load<EnvelopeDoc>("envelope.json"), rep = load<ReportedDoc>("reported.json");
const flow = load<{ reference: { value_cm_s: number } }>("model/scaling.json").reference.value_cm_s;
const cabin = env.near_presets.find((n) => n.id === "exploration")!;
/** The worked case of the page: a PMMA panel in the lunar-habitat atmosphere, in the forced flow NASA's guide calls the most flammable, on the Moon. */
const worked: DesignPoint = { x: cabin.x_o2, p: cabin.p_kpa, kind: "solid", material: "PMMA", flow, gravity: "lunar" };

describe("a design case against what NASA has", () => {
  const src = caseSources(env, rep, worked);
  const by = (id: string) => src.find((s) => s.id === id)!;

  it("counts the rows that name the material, record by record, as the tables hold them", () => {
    const table = (file: string) => load<{ columns: string[]; rows: string[][] }>(`tables/${file}`);
    const named = (file: string, col: string) => { const t = table(file); const j = t.columns.map((c) => c.replace(/\s+/g, " ").trim()).indexOf(col); return t.rows.filter((r) => /pmma/i.test(r[j] ?? "")).length; };
    expect(by("psi:PSI-25").count).toBe(`${named("PSI-25__PSI_25_Experimental_table_BASS_II.json", "Fuel Sample Material")} rows of a PSI table`);
    expect(by("psi:PSI-26").count).toBe(`${named("PSI-26__PSI_26_Experimental_table_BASS.json", "Fuel Sample Material")} rows of a PSI table`);
    expect(by("psi:PSI-99").count).toBe(`${named("PSI-99__PSI_99_Experimental_table_SAFFIRE_2.json", "Material")} rows of a PSI table`);
  });

  it("shows for each source where it departs from the case, and counts nothing unstated as agreeing", () => {
    expect(by("psi:PSI-25").cells).toMatchObject({ material: { fit: "same" }, oxygen: { fit: "differs" }, pressure: { fit: "unstated" }, flow: { fit: "unstated" }, gravity: { fit: "differs" } });
    expect(by("psi:PSI-25").cells.flow.text).toBe("display readings, no speed stated");
    expect(by("psi:PSI-26").cells).toMatchObject({ oxygen: { fit: "unstated" }, pressure: { fit: "unstated" }, flow: { fit: "unstated" } });
    expect(by("saffire").cells).toMatchObject({ material: { fit: "same" }, oxygen: { fit: "differs" }, pressure: { fit: "same" }, gravity: { fit: "differs" } });
    expect(by("vent").cells).toMatchObject({ material: { fit: "same" }, oxygen: { fit: "same" }, pressure: { fit: "same" }, flow: { fit: "unstated" }, gravity: { fit: "unstated" } });
    expect(by("luci").cells).toMatchObject({ material: { fit: "same" }, oxygen: { fit: "differs" }, pressure: { fit: "differs" }, gravity: { fit: "same" } });
    expect(by("fm2").cells).toMatchObject({ material: { fit: "differs" }, oxygen: { fit: "same" }, pressure: { fit: "same" }, gravity: { fit: "same" } });
    for (const s of src) {
      expect(s.asked).toBe(5);
      expect(s.agree).toBe(ASPECTS.filter((a) => s.cells[a].fit === "same").length);
    }
  });

  it("reads what the outside sources state from the checked numbers, not from this file", () => {
    const vent = rep.fm2.vent_tests!.rows.find((r) => /pmma/i.test(r.material))!;
    expect(by("vent").cells.oxygen.text).toBe(`${vent.o2_pct}%`);
    expect(by("vent").count).toBe(`${vent.tests} tests`);
    expect(by("fm2").cells.material.text).toBe(rep.fm2.fuel!.as_stated);
    expect(by("luci").cells.pressure.text).toBe(`“${rep.luci.atmosphere!.as_stated}”`);
    expect(by("luci").cells.gravity.text).toContain(String(rep.luci.spin.g));
    expect(rep.fm2.checks.every((c) => c.ok) && rep.luci.checks.every((c) => c.ok)).toBe(true);
  });

  it("says in one sentence that nothing run so far agrees in all five, and names what the closest lacks", () => {
    const run = src.filter((s) => s.kind !== "planned");
    expect(run.every((s) => s.agree < s.asked)).toBe(true);
    const say = caseSay(src, worked);
    expect(say.startsWith("No test that has been run agrees with this case in all 5 things asked.")).toBe(true);
    expect(say).toContain(`${by("vent").title} (lacks the air flow and lunar gravity)`);
    expect(say).toContain("not yet flown; its plan agrees in 3 (lacks the material and the air flow)");
  });

  it("judges air flow within the stated window and leaves what is not asked out of the count", () => {
    const at20 = caseSources(env, rep, { ...worked, flow: 20 });
    expect(at20.find((s) => s.id === "saffire")!.cells.flow.fit).toBe("same");
    expect(by("saffire").cells.flow.fit).toBe(Math.abs(20 - flow) <= FLOW_NEAR ? "same" : "differs");
    const open = caseSources(env, rep, { x: 0.21, p: null, kind: null, material: "SIBAL", flow: null, gravity: "micro" });
    expect(open.every((s) => s.asked === 3 && s.cells.pressure.fit === "open" && s.cells.flow.fit === "open")).toBe(true);
    expect(caseSources(env, rep, { ...worked, material: "unobtainium" }).filter((s) => s.kind !== "planned")).toEqual([]);
  });
});
