import { describe, expect, it } from "vitest";
import { KLASS } from "../lib/klass";
import { ALL_ITEMS } from "../app/nav";
import { IskraState, LINES, PAGE_KLASS, reduce } from "./Iskra";
import { RING } from "./Lantern";
import { DWELL, STOPS } from "./Tour";

const base: IskraState = { g: 0, fansOffAt: null, klass: "observed", mood: "idle", line: "" };

describe("the companion's states", () => {
  it("CQ5: when the evidence has no answer the companion says so and implies nothing", () => {
    const s = reduce(base, { type: "ANSWER_DONE", strength: "gap" }, 0);
    expect(s.mood).toBe("gap");
    expect(s.line).toBe(LINES.gap);
    expect(reduce(base, { type: "ANSWER_DONE", strength: "refused" }, 0).line).toBe(LINES.refused);
    expect(reduce(base, { type: "ANSWER_DONE", strength: "supported" }, 0)).toMatchObject({ mood: "pointing", line: LINES.pointing });
  });

  it("CQ6: every class of information has its own ring, and every page has a class", () => {
    expect(Object.keys(RING).sort()).toEqual(Object.keys(KLASS).sort());
    const drawn = Object.values(RING).map((r) => `${r.width}|${r.dash ?? ""}|${r.double ?? ""}|${r.cap ?? ""}`);
    expect(new Set(drawn).size).toBeGreaterThanOrEqual(7);            // live and observed share a solid ring; live also pulses
    for (const i of ALL_ITEMS) expect(PAGE_KLASS[i.path], i.path).toBeDefined();
  });

  it("CQ7: tampered readings make it sceptical; a fire alarm without tampering puts it on alarm", () => {
    expect(reduce(base, { type: "ALARM", state: "FIRE ALARM", anomaly: true }, 0)).toMatchObject({ mood: "sceptical", line: LINES.anomaly });
    expect(reduce(base, { type: "ALARM", state: "FIRE ALARM", anomaly: false }, 0)).toMatchObject({ mood: "alarm", line: LINES.alarm });
    expect(reduce(base, { type: "ALARM", state: "CLEAR", anomaly: false }, 0).mood).toBe("idle");
    expect(LINES.anomaly).toMatch(/alarm stands/);                    // an integrity anomaly never reads as "no fire"
  });

  it("the fans and the gravity of the page drive the flame", () => {
    const off = reduce(base, { type: "FANS", on: false }, 1234);
    expect(off.fansOffAt).toBe(1234);
    expect(reduce(off, { type: "FANS", on: true }, 2000).fansOffAt).toBeNull();
    const moon = reduce(base, { type: "CONTEXT", g: 0.1654 }, 0);
    expect(moon.g).toBe(0.1654);
    expect(moon.line).toBe(LINES.partial);                            // partial gravity is never shown without the caveat
    expect(reduce(moon, { type: "CONTEXT", fans: false }, 50).fansOffAt).toBe(50);
  });

  it("no line states a number, a probability or advice", () => {
    for (const l of Object.values(LINES)) expect(l).not.toMatch(/\d|probab|safe\b|should|must/i);
  });
});

describe("the guided tour", () => {
  it("runs in sixty to ninety seconds and names a challenge verb at every stop", () => {
    const seconds = (STOPS.length * DWELL) / 1000;
    expect(seconds).toBeGreaterThanOrEqual(60);
    expect(seconds).toBeLessThanOrEqual(90);
    for (const verb of ["Find", "Summarize", "Rank", "Interpret", "Model", "Control"]) expect(STOPS.map((s) => s.verb)).toContain(verb);
    expect(new Set(STOPS.map((s) => s.id)).size).toBe(STOPS.length);
  });
  it("every stop is a page of this site, so the tour needs no network", () => {
    const pages = new Set(ALL_ITEMS.map((i) => i.path));
    for (const s of STOPS) expect(pages.has("/" + s.to.split(/--|\?/)[0]), s.to).toBe(true);
    for (const s of STOPS) expect(s.text(null).length).toBeGreaterThan(40);
  });
});
