import { describe, expect, it } from "vitest";
import golden from "./golden/transport.json";
import { Grid, combineFlow, flowFromStream, maxSpeed, plume, recirculation, stableDt, step, throughFlow, total, zeroFlow, erf } from "./transport";

const G = golden as any;

describe("transport solver", () => {
  it("matches the Python reference on the mixed golden case", () => {
    const m = G.mixed;
    const g: Grid = { nx: m.nx, ny: m.ny, h: m.h };
    const Lx = m.nx * m.h, Ly = m.ny * m.h;
    const fan = flowFromStream(g, recirculation(Lx, Ly, m.fan_speed, -1));
    const plm = flowFromStream(g, plume(Lx, Ly, m.plume.xs, m.plume.w, m.plume.speed));
    const flow = combineFlow(zeroFlow(g), fan, 1, plm, 1);
    let c = new Float64Array(g.nx * g.ny), c2 = new Float64Array(g.nx * g.ny);
    const src = new Float64Array(g.nx * g.ny);
    src[m.source_cell[0] + m.source_cell[1] * g.nx] = 1 / (g.h * g.h);
    const sink = new Float64Array(g.nx * g.ny);
    for (const [i, j] of m.sink_cells) sink[i + j * g.nx] = m.sink_rate;
    for (let s = 0; s < m.steps; s++) {
      step(g, c, c2, flow, m.D, m.dt, src, sink);
      [c, c2] = [c2, c];
    }
    let worst = 0;
    for (let k = 0; k < c.length; k++) worst = Math.max(worst, Math.abs(c[k] - m.final[k]));
    expect(worst).toBeLessThan(1e-9);
    expect(total(g, c)).toBeCloseTo(m.total, 9);
  });

  it("matches the Python reference for pure diffusion, conserves mass and stays non-negative", () => {
    const d = G.diffusion, m = G.mixed;
    const g: Grid = { nx: m.nx, ny: m.ny, h: m.h };
    let c = new Float64Array(g.nx * g.ny), c2 = new Float64Array(g.nx * g.ny);
    c[d.start_cell[0] + d.start_cell[1] * g.nx] = 1 / (g.h * g.h);
    const flow = zeroFlow(g);
    for (let s = 0; s < d.steps; s++) {
      step(g, c, c2, flow, d.D, d.dt, null, null);
      [c, c2] = [c2, c];
    }
    let worst = 0, min = Infinity;
    for (let k = 0; k < c.length; k++) { worst = Math.max(worst, Math.abs(c[k] - d.final[k])); min = Math.min(min, c[k]); }
    expect(worst).toBeLessThan(1e-12);
    expect(total(g, c)).toBeCloseTo(1, 12);
    expect(min).toBeGreaterThanOrEqual(0);
  });

  it("has no flow through the walls and no divergence", () => {
    const g: Grid = { nx: 30, ny: 10, h: 0.2 };
    const f = combineFlow(zeroFlow(g), flowFromStream(g, recirculation(6, 2, 0.1, -1)), 1, flowFromStream(g, plume(6, 2, 4, 0.2, 0.08)), 1);
    for (let j = 0; j < g.ny; j++) { expect(f.uf[j * (g.nx + 1)]).toBeCloseTo(0, 14); expect(f.uf[g.nx + j * (g.nx + 1)]).toBeCloseTo(0, 14); }
    for (let i = 0; i < g.nx; i++) { expect(f.vf[i]).toBeCloseTo(0, 14); expect(f.vf[i + g.ny * g.nx]).toBeCloseTo(0, 14); }
    let div = 0;
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++)
      div = Math.max(div, Math.abs(f.uf[i + 1 + j * (g.nx + 1)] - f.uf[i + j * (g.nx + 1)] + f.vf[i + (j + 1) * g.nx] - f.vf[i + j * g.nx]));
    expect(div).toBeLessThan(1e-12);
  });

  it("leaves the field unchanged with no flow, no diffusion and no source", () => {
    const g: Grid = { nx: 8, ny: 4, h: 0.5 };
    const c = Float64Array.from({ length: 32 }, (_, i) => Math.sin(i) ** 2), out = new Float64Array(32);
    step(g, c, out, zeroFlow(g), 0, 0.5, null, null);
    expect(Array.from(out)).toEqual(Array.from(c));
  });

  it("chooses a time step that keeps the scheme positive", () => {
    const g: Grid = { nx: 120, ny: 32, h: 1 / 15 };
    const f = flowFromStream(g, recirculation(8, 32 / 15, 0.2, -1));
    const dt = stableDt(g, f, 2e-3, 1);
    expect(dt * ((2 * maxSpeed(f)) / g.h + (4 * 2e-3) / (g.h * g.h))).toBeCloseTo(1, 9);
  });

  it("matches the Python reference with open ends: what leaves through the return is counted", () => {
    const th = G.through, m = G.mixed;
    const g: Grid = { nx: m.nx, ny: m.ny, h: m.h };
    const Lx = m.nx * m.h, Ly = m.ny * m.h;
    const flow = combineFlow(zeroFlow(g), flowFromStream(g, throughFlow(th.speed)), 1, flowFromStream(g, plume(Lx, Ly, m.plume.xs, m.plume.w, m.plume.speed)), 1);
    let c = new Float64Array(g.nx * g.ny), c2 = new Float64Array(g.nx * g.ny);
    const src = new Float64Array(g.nx * g.ny);
    src[th.source_cell[0] + th.source_cell[1] * g.nx] = 1 / (g.h * g.h);
    for (let s = 0; s < th.steps; s++) { step(g, c, c2, flow, th.D, th.dt, src, null); [c, c2] = [c2, c]; }
    let worst = 0;
    for (let k = 0; k < c.length; k++) worst = Math.max(worst, Math.abs(c[k] - th.final[k]));
    expect(worst).toBeLessThan(1e-9);
    expect(total(g, c) + th.left_through_return).toBeCloseTo(th.emitted, 8);
  });

  it("erf approximation is accurate", () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(-0.5)).toBeCloseTo(-0.5204999, 6);
  });
});
