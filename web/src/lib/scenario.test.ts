import { describe, expect, it } from "vitest";
import { defaultScenario, fromJson, fromQuery, toJson, toQuery, validate } from "./scenario";

describe("scenario contract", () => {
  it("round-trips through the URL, keeping unknown as unknown", () => {
    const s = { ...defaultScenario(), p_kpa: null, evidence: ["Saffire VI-3", "PSI-25 row 4"], t_s: 3.5 };
    const back = fromQuery(new URLSearchParams(toQuery(s).toString()));
    expect(back.problems).toEqual([]);
    expect(back.state).toEqual(s);
    expect(back.state.p_kpa).toBeNull();
  });
  it("rejects NaN, negative pressure and fractions above one", () => {
    expect(fromQuery(new URLSearchParams("v=1&o2=abc")).problems.some((p) => p.field === "o2")).toBe(true);
    expect(fromQuery(new URLSearchParams("v=1&p=-5")).problems.some((p) => p.field === "p_kpa")).toBe(true);
    expect(fromQuery(new URLSearchParams("v=1&o2=1.4")).problems.some((p) => p.field === "o2")).toBe(true);
    expect(fromQuery(new URLSearchParams("v=2")).problems.some((p) => p.field === "v")).toBe(true);
  });
  it("validates JSON imports the same way", () => {
    const s = defaultScenario();
    expect(fromJson(toJson(s)).state).toEqual(s);
    expect(fromJson("{}").state).toBeNull();
    expect(fromJson(JSON.stringify({ schema: "zgf-scenario/1", ...s, g: -1 })).state).toBeNull();
    expect(validate({ ...s, u_m_s: Number.NaN }).length).toBe(1);
  });
  it("a URL without a version leaves the state alone", () => {
    const base = { ...defaultScenario(), o2: 0.25 };
    expect(fromQuery(new URLSearchParams("o2=0.9"), base).state).toBe(base);
  });
});
