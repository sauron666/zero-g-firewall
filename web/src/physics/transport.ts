/**
 * Tracer transport on a 2-D slice of a cabin:
 *
 *     dc/dt + div(u c) = div(D grad c) + S - k c
 *
 * Conservative finite volume, first-order upwind advection, central diffusion,
 * explicit Euler. The velocity comes from a stream function sampled at cell corners,
 * so it is divergence-free to round-off. Where the stream function is constant along a
 * boundary that boundary is a wall; where it varies, air enters clean or leaves with its smoke.
 *
 * The same scheme is implemented in Python (pipeline/zgf/transport.py); the unit
 * tests compare the two on golden vectors.
 *
 * MODEL_OUTPUT, illustrative: prescribed flow, effective diffusivity, relative units.
 */

export interface Grid {
  nx: number;
  ny: number;
  h: number; // cell size, m
}

export interface Flow {
  uf: Float64Array; // x-velocity on vertical faces, size (nx+1)*ny
  vf: Float64Array; // y-velocity on horizontal faces, size nx*(ny+1)
}

export type Stream = (x: number, y: number) => number;

export function flowFromStream(g: Grid, psi: Stream): Flow {
  const { nx, ny, h } = g;
  const p = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) p[i + j * (nx + 1)] = psi(i * h, j * h);
  const uf = new Float64Array((nx + 1) * ny);
  const vf = new Float64Array(nx * (ny + 1));
  for (let j = 0; j < ny; j++)
    for (let i = 0; i <= nx; i++) uf[i + j * (nx + 1)] = (p[i + (j + 1) * (nx + 1)] - p[i + j * (nx + 1)]) / h;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i < nx; i++) vf[i + j * nx] = -(p[i + 1 + j * (nx + 1)] - p[i + j * (nx + 1)]) / h;
  return { uf, vf };
}

export function zeroFlow(g: Grid): Flow {
  return { uf: new Float64Array((g.nx + 1) * g.ny), vf: new Float64Array(g.nx * (g.ny + 1)) };
}

/** a*A + b*B, written into out. Stream functions add, so do the face velocities. */
export function combineFlow(out: Flow, A: Flow, a: number, B: Flow, b: number): Flow {
  for (let i = 0; i < out.uf.length; i++) out.uf[i] = a * A.uf[i] + b * B.uf[i];
  for (let i = 0; i < out.vf.length; i++) out.vf[i] = a * A.vf[i] + b * B.vf[i];
  return out;
}

export function maxSpeed(f: Flow): number {
  let m = 0;
  for (let i = 0; i < f.uf.length; i++) m = Math.max(m, Math.abs(f.uf[i]));
  for (let i = 0; i < f.vf.length; i++) m = Math.max(m, Math.abs(f.vf[i]));
  return m;
}

/** Largest stable explicit step for this flow and diffusivity (with a safety factor). */
export function stableDt(g: Grid, f: Flow, D: number, safety = 0.8): number {
  // positivity of the explicit upwind + central scheme in 2-D: dt (2|u|/h + 4D/h²) <= 1
  const rate = (2 * maxSpeed(f)) / g.h + (4 * D) / (g.h * g.h);
  return rate > 0 ? safety / rate : Infinity;
}

/**
 * One explicit step. c and out have nx*ny cells; src is a source field (units of c per second)
 * or null; sink is a first-order removal rate per cell (1/s) or null.
 */
export function step(
  g: Grid, c: Float64Array, out: Float64Array, f: Flow, D: number, dt: number,
  src: Float64Array | null, sink: Float64Array | null,
): void {
  const { nx, ny, h } = g;
  const { uf, vf } = f;
  const invh = 1 / h;
  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const k = row + i;
      const ck = c[k];
      // west face (i), east face (i+1): flux positive in +x
      let fw = 0, fe = 0, fs = 0, fn = 0;
      // Interior faces: upwind advection and central diffusion.
      // Boundary faces: air that leaves carries smoke out; air that enters is clean; no diffusion through a boundary.
      if (i > 0) {
        const u = uf[i + j * (nx + 1)];
        const cw = c[k - 1];
        fw = (u > 0 ? u * cw : u * ck) - D * (ck - cw) * invh;
      } else {
        const u = uf[j * (nx + 1)];
        fw = u < 0 ? u * ck : 0;
      }
      if (i < nx - 1) {
        const u = uf[i + 1 + j * (nx + 1)];
        const ce = c[k + 1];
        fe = (u > 0 ? u * ck : u * ce) - D * (ce - ck) * invh;
      } else {
        const u = uf[nx + j * (nx + 1)];
        fe = u > 0 ? u * ck : 0;
      }
      if (j > 0) {
        const v = vf[i + j * nx];
        const cs = c[k - nx];
        fs = (v > 0 ? v * cs : v * ck) - D * (ck - cs) * invh;
      } else {
        const v = vf[i];
        fs = v < 0 ? v * ck : 0;
      }
      if (j < ny - 1) {
        const v = vf[i + (j + 1) * nx];
        const cn = c[k + nx];
        fn = (v > 0 ? v * ck : v * cn) - D * (cn - ck) * invh;
      } else {
        const v = vf[i + ny * nx];
        fn = v > 0 ? v * ck : 0;
      }
      let dc = (fw - fe + fs - fn) * invh;
      if (src) dc += src[k];
      if (sink) dc -= sink[k] * ck;
      out[k] = ck + dt * dc;
    }
  }
}

export function total(g: Grid, c: Float64Array): number {
  let s = 0;
  for (let i = 0; i < c.length; i++) s += c[i];
  return s * g.h * g.h;
}

export const cellIndex = (g: Grid, x: number, y: number) =>
  Math.min(g.nx - 1, Math.max(0, Math.floor(x / g.h))) + Math.min(g.ny - 1, Math.max(0, Math.floor(y / g.h))) * g.nx;

/* ---------- stream functions used by the scenarios ---------- */

/** Uniform ventilation along the cabin, from the supply end (x = Lx) to the return end (x = 0), at `speed` m/s. */
export function throughFlow(speed: number): Stream {
  return (_x, y) => -speed * y; // u = dpsi/dy = -speed (towards x = 0)
}

/** One recirculation cell filling the cabin. Peak wall speed = speed (m/s). dir=-1 sweeps the floor towards x=0. */
export function recirculation(Lx: number, Ly: number, speed: number, dir: 1 | -1 = -1): Stream {
  const psi0 = (dir * speed * Ly) / Math.PI;
  return (x, y) => psi0 * Math.sin((Math.PI * x) / Lx) * Math.sin((Math.PI * y) / Ly);
}

// error function (Abramowitz and Stegun 7.1.26), accurate to 1.5e-7
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/**
 * A buoyant plume rising above (xs) with peak speed `speed` and half-width w, closed by a slow
 * return flow elsewhere. The stream function vanishes on all four walls.
 */
export function plume(Lx: number, Ly: number, xs: number, w: number, speed: number): Stream {
  const k = w * Math.sqrt(Math.PI / 2);
  const E = (x: number) => k * erf((x - xs) / (Math.SQRT2 * w));
  const e0 = E(0);
  const span = E(Lx) - e0;
  return (x, y) => -speed * Math.sin((Math.PI * y) / Ly) * (E(x) - e0 - (x / Lx) * span);
}
