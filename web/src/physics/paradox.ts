/**
 * The Fan Paradox: two realities that start from the same state and differ only in ventilation.
 *
 * Reality A keeps the fans running. Reality B stops them at `switchTime`.
 * What the flame does when the fans stop is not one answer but a set of branches,
 * each tied to a NASA source; the ensemble runs all of them.
 *
 * MODEL_OUTPUT, illustrative. A 2-D slice with a prescribed flow, an effective diffusivity
 * and relative smoke units. It shows mechanisms and orders of magnitude. It is not a
 * prediction for the ISS or for any real cabin.
 */
import {
  Flow, Grid, cellIndex, combineFlow, flowFromStream, plume, stableDt, step, throughFlow, total, zeroFlow,
} from "./transport";
import { buoyantSpeedRange } from "./scaling";

export const CABIN = { Lx: 8.0, Ly: 32 / 15 }; // metres; a slice along a module
export const SOURCE = { x: 5.6, y: 0.8 };
/** Air is supplied at x = Lx and returns at x = 0; the duct detector reads the air entering the return. */
export const POINTS = {
  duct: { x: 0.04, y: 32 / 30, name: "Duct detector", note: "in the return air; smoke has to be carried to it" },
  overhead: { x: 5.4, y: 1.98, name: "Overhead detector", note: "1.2 m above the source" },
  crew: { x: 2.6, y: 1.0, name: "Crew position", note: "3 m from the source, towards the return" },
} as const;
export type PointId = keyof typeof POINTS;

/** What the flame does once the fans stop. Each branch names the evidence behind it. */
export type BranchId = "starved" | "diffusion" | "selffed" | "buoyant";
export interface Branch {
  id: BranchId;
  label: string;
  /** source strength long after the fans stop, relative to before */
  floor: number;
  evidence: string;
  /** NASA's own words that the sentence above rests on; a test finds each inside a checked quotation of this branch */
  cites: string[];
  /** shown only in a build without the stored documents; otherwise the page shows receipts */
  source: string;
  appliesTo: ("micro" | "partial")[];
}
export const BRANCHES: Record<BranchId, Branch> = {
  starved: {
    id: "starved", label: "The flame starves and goes out", floor: 0,
    evidence: "In a BASS-II test the flow was cut off under a spreading flame and the flame went out within 2 s.",
    cites: ["the flow was abruptly cut off", "extinguish within 2 s"],
    source: "BASS-II Summary Report (NTRS 20210011385); data set PSI-25", appliesTo: ["micro", "partial"],
  },
  diffusion: {
    id: "diffusion", label: "A weak flame lives on diffusion alone", floor: 0.15,
    evidence: "A candle flame burned for over 45 minutes in microgravity tests; flame balls of about one watt lasted over 40 minutes.",
    cites: ["for over 45 minutes", "approximately 1 Watt", "for over 40 minutes"],
    source: "A Researcher's Guide to: Combustion Science, p. 30", appliesTo: ["micro"],
  },
  selffed: {
    id: "selffed", label: "The fire has its own oxygen or a jet feeds it", floor: 1,
    evidence: "On Mir in 1997 an oxygen generator caught fire and the flame went out by itself; that the device fed its own flame is our reading. A suppressant jet entrains air and sustains a flame with the ambient flow off.",
    cites: ["the canister ignited", "The flame finally extinguished itself", "entrains air and sustains the flame even when the ambient airflow is turned off"],
    source: "NASA history page on the Mir fire; Researcher's Guide, p. 31", appliesTo: ["micro", "partial"],
  },
  buoyant: {
    id: "buoyant", label: "Gravity keeps feeding the flame", floor: 0.9,
    evidence: "Buoyant flow needs no fan. Fabric and an acrylic rod burned for over two and a half minutes in simulated lunar gravity; solids burn most readily in a flow of about 10 cm/s.",
    cites: ["the burn lasts for over two and a half minutes", "on the order of 10 cm/s"],
    source: "Lunar Combustion Investigation abstract (NTRS 20250010653); Researcher's Guide, p. 31", appliesTo: ["partial"],
  },
};

export interface ParadoxParams {
  gFrac: number;        // gravity as a fraction of 1 g
  fanSpeed: number;     // m/s, peak speed of the ventilation cell
  switchTime: number;   // s, when reality B stops the fans
  dOn: number;          // m²/s, effective mixing with fans on
  dOff: number;         // m²/s, residual mixing with fans off
  threshold: number;    // alarm threshold, relative units per m²
  tauExt: number;       // s, e-folding time of the source after the fans stop
  plumeSpeed: number;   // m/s, buoyant plume speed while the flame burns (0 in free fall)
  branch: BranchId;
  horizon: number;      // s
  coarse?: boolean;
}

export function defaultParams(gFrac: number): ParadoxParams {
  const [lo, hi] = buoyantSpeedRange(gFrac);
  return {
    gFrac, fanSpeed: 0.1, switchTime: 0, dOn: 8e-4, dOff: 1e-4, threshold: 1,
    tauExt: 8, plumeSpeed: (lo + hi) / 2, branch: gFrac > 0 ? "buoyant" : "starved", horizon: 600,
  };
}

export interface Reality {
  grid: Grid;
  frameDt: number;
  frames: Float32Array[];        // concentration fields
  t: Float32Array;               // sample times (1 s)
  series: Record<PointId, Float32Array>;
  sourceRate: Float32Array;      // q(t), relative
  fansOn: Uint8Array;            // 1 while fans run
  airborne: Float32Array;        // smoke still in the cabin air
  emitted: Float32Array;         // smoke released so far
  removed: Float32Array;         // smoke carried into the return duct (to the filters)
  alarm: Record<PointId, number | null>; // first time above threshold, s
  crewDose: number;              // time integral at the crew position
  peak: number;                  // largest concentration in any frame
}

function gridFor(coarse?: boolean): Grid {
  return coarse ? { nx: 60, ny: 16, h: 2 / 15 } : { nx: 120, ny: 32, h: 1 / 15 };
}

/** Source strength of reality B after the fans stop. */
export function sourceAfterStop(dt: number, tau: number, floor: number): number {
  return floor + (1 - floor) * Math.exp(-dt / tau);
}

export function simulate(p: ParadoxParams, fansStopAt: number): Reality {
  const g = gridFor(p.coarse);
  const n = g.nx * g.ny;
  const fan = flowFromStream(g, throughFlow(p.fanSpeed));
  const plm = p.plumeSpeed > 0 ? flowFromStream(g, plume(CABIN.Lx, CABIN.Ly, SOURCE.x, 0.18, 1)) : zeroFlow(g);
  const flow: Flow = zeroFlow(g);
  const src = new Float64Array(n);
  const ks = cellIndex(g, SOURCE.x, SOURCE.y);
  const idx: Record<PointId, number> = {
    duct: -1, // the duct detector reads the mean of the column of cells at the return end
    overhead: cellIndex(g, POINTS.overhead.x, POINTS.overhead.y),
    crew: cellIndex(g, POINTS.crew.x, POINTS.crew.y),
  };
  const read = (id: PointId, f: Float64Array) => {
    if (id !== "duct") return f[idx[id]];
    let s = 0;
    for (let j = 0; j < g.ny; j++) s += f[j * g.nx];
    return s / g.ny;
  };
  const branch = BRANCHES[p.branch];
  const nS = Math.floor(p.horizon) + 1;
  const frameDt = 2;
  const out: Reality = {
    grid: g, frameDt, frames: [], t: new Float32Array(nS),
    series: { duct: new Float32Array(nS), overhead: new Float32Array(nS), crew: new Float32Array(nS) },
    sourceRate: new Float32Array(nS), fansOn: new Uint8Array(nS), airborne: new Float32Array(nS), emitted: new Float32Array(nS), removed: new Float32Array(nS),
    alarm: { duct: null, overhead: null, crew: null }, crewDose: 0, peak: 0,
  };
  let c = new Float64Array(n);
  let c2 = new Float64Array(n);
  let t = 0, emitted = 0, nextSample = 0, lastFlowKey = "";
  let dt = 0.1;
  const prev: Record<PointId, number> = { duct: 0, overhead: 0, crew: 0 };

  const record = () => {
    const s = nextSample;
    out.t[s] = s;
    const on = s < fansStopAt;
    const q = on ? 1 : sourceAfterStop(s - fansStopAt, p.tauExt, branch.floor);
    out.sourceRate[s] = q;
    out.fansOn[s] = on ? 1 : 0;
    out.airborne[s] = total(g, c);
    out.emitted[s] = emitted;
    out.removed[s] = Math.max(0, emitted - out.airborne[s]);
    (Object.keys(idx) as PointId[]).forEach((id) => {
      const v = read(id, c);
      out.series[id][s] = v;
      if (out.alarm[id] === null && v >= p.threshold) {
        const v0 = prev[id];
        out.alarm[id] = s === 0 ? 0 : s - 1 + (v > v0 ? (p.threshold - v0) / (v - v0) : 1);
      }
      prev[id] = v;
    });
    if (s > 0) out.crewDose += read("crew", c);
    if (s % frameDt === 0) {
      const f = new Float32Array(n);
      let m = 0;
      for (let k = 0; k < n; k++) {
        f[k] = c[k];
        if (c[k] > m) m = c[k];
      }
      if (m > out.peak) out.peak = m;
      out.frames.push(f);
    }
    nextSample++;
  };

  record();
  while (nextSample < nS) {
    const on = t < fansStopAt;
    const q = on ? 1 : sourceAfterStop(t - fansStopAt, p.tauExt, branch.floor);
    // the plume follows the heat release: speed scales with the cube root of the source strength
    const pl = p.plumeSpeed > 0 ? p.plumeSpeed * Math.cbrt(Math.max(q, 0)) : 0;
    const key = (on ? "1" : "0") + pl.toFixed(4);
    const D = on ? p.dOn : p.dOff;
    if (key !== lastFlowKey) {
      combineFlow(flow, fan, on ? 1 : 0, plm, pl);
      dt = Math.min(0.25, stableDt(g, flow, D));
      lastFlowKey = key;
    }
    const target = nextSample; // next whole second
    const h = Math.min(dt, target - t);
    src[ks] = q / (g.h * g.h);
    step(g, c, c2, flow, D, h, src, null);
    const tmp = c; c = c2; c2 = tmp;
    emitted += q * h;
    t += h;
    if (target - t < 1e-9) {
      t = target;
      record();
    }
  }
  return out;
}

export interface Pair { a: Reality; b: Reality; params: ParadoxParams }
export function runPair(p: ParadoxParams): Pair {
  return { a: simulate(p, Infinity), b: simulate(p, p.switchTime), params: p };
}

/* ---------- ensemble: what the model allows, not one answer ---------- */
export interface Member {
  branch: BranchId;
  dOff: number;
  thresholdFactor: number;
  plumeSpeed: number;
  alarm: Record<PointId, number | null>;
  crewDose: number;
}
export interface Ensemble {
  members: Member[];
  /** per detector: fastest, median, slowest alarm among members that alarm, and the share that never alarm */
  summary: Record<PointId, { min: number | null; median: number | null; max: number | null; never: number }>;
  byBranch: Record<string, { n: number; never: Record<PointId, number>; median: Record<PointId, number | null> }>;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Reality B across every branch the gravity regime permits, residual mixing, alarm threshold and plume speed. */
export function runEnsemble(base: ParadoxParams): Ensemble {
  const regime = base.gFrac > 0 ? "partial" : "micro";
  const branches = (Object.values(BRANCHES) as Branch[]).filter((b) => b.appliesTo.includes(regime));
  const dOffs = [2e-5, 1e-4, 5e-4, 1e-3];
  const thr = [0.5, 1, 2];
  const [lo, hi] = buoyantSpeedRange(base.gFrac);
  const plumes = base.gFrac > 0 ? [lo, hi] : [0];
  const members: Member[] = [];
  for (const b of branches)
    for (const dOff of dOffs)
      for (const pl of plumes) {
        // thresholds reuse one run: the series is the same, only the crossing changes
        const p: ParadoxParams = { ...base, branch: b.id, dOff, plumeSpeed: pl, coarse: true, threshold: base.threshold };
        const r = simulate(p, base.switchTime);
        for (const f of thr) {
          const alarm: Record<PointId, number | null> = { duct: null, overhead: null, crew: null };
          (Object.keys(alarm) as PointId[]).forEach((id) => {
            const s = r.series[id];
            const level = base.threshold * f;
            for (let i = 0; i < s.length; i++)
              if (s[i] >= level) {
                alarm[id] = i === 0 ? 0 : i - 1 + (s[i] > s[i - 1] ? (level - s[i - 1]) / (s[i] - s[i - 1]) : 1);
                break;
              }
          });
          members.push({ branch: b.id, dOff, thresholdFactor: f, plumeSpeed: pl, alarm, crewDose: r.crewDose });
        }
      }
  const ids: PointId[] = ["duct", "overhead", "crew"];
  const summary = {} as Ensemble["summary"];
  for (const id of ids) {
    const hit = members.map((m) => m.alarm[id]).filter((x): x is number => x !== null);
    summary[id] = {
      min: hit.length ? Math.min(...hit) : null, median: median(hit), max: hit.length ? Math.max(...hit) : null,
      never: (members.length - hit.length) / members.length,
    };
  }
  const byBranch: Ensemble["byBranch"] = {};
  for (const b of branches) {
    const ms = members.filter((m) => m.branch === b.id);
    const never = {} as Record<PointId, number>;
    const med = {} as Record<PointId, number | null>;
    for (const id of ids) {
      const hit = ms.map((m) => m.alarm[id]).filter((x): x is number => x !== null);
      never[id] = (ms.length - hit.length) / ms.length;
      med[id] = median(hit);
    }
    byBranch[b.id] = { n: ms.length, never, median: med };
  }
  return { members, summary, byBranch };
}
