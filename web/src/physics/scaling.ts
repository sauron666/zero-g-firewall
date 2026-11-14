/**
 * Closed-form physics used across the product. Every function here is small enough
 * to check by hand; the unit tests reproduce the check values of the science brief.
 * Outputs are MODEL_OUTPUT: bounds and scalings, never predictions.
 */

export const G0 = 9.80665; // m/s², standard gravity
export const PSI_TO_KPA = 6.894757;
export const ATM_KPA = 101.325;
export const SEA_LEVEL_PPO2_KPA = 21.2; // 0.2095 x 101.325 kPa, rounded as in the brief

export interface Body {
  id: "iss" | "moon" | "mars" | "earth";
  name: string;
  g: number; // fraction of standard gravity
}
export const BODIES: Record<Body["id"], Body> = {
  iss: { id: "iss", name: "ISS, free fall", g: 0 },
  moon: { id: "moon", name: "Moon", g: 0.165 },
  mars: { id: "mars", name: "Mars", g: 0.38 },
  earth: { id: "earth", name: "Earth", g: 1 },
};

/** Thermal diffusivity range used for the buoyant velocity scale (cold air to flame-zone gas), m²/s. */
export const ALPHA_RANGE: [number, number] = [2.2e-5, 1.5e-4];

/**
 * Diffusive-buoyant velocity scale near the flame base: U_b = (g alpha dT/T)^(1/3).
 * The coefficient is uncertain; the g^(1/3) dependence is the robust part.
 */
export function buoyantSpeed(gFrac: number, alpha: number, dTT = 5): number {
  if (gFrac <= 0) return 0;
  return Math.cbrt(gFrac * G0 * alpha * dTT);
}
/** Range of the scale over ALPHA_RANGE, m/s. */
export function buoyantSpeedRange(gFrac: number): [number, number] {
  return [buoyantSpeed(gFrac, ALPHA_RANGE[0]), buoyantSpeed(gFrac, ALPHA_RANGE[1])];
}
/** Ratio of buoyant speed to its 1 g value. */
export const buoyantRatio = (gFrac: number) => Math.cbrt(Math.max(gFrac, 0));

/** Plume velocity scale over a flame of height L: sqrt(g L dT/T). About 1 m/s for a 2 cm flame on Earth. */
export function plumeSpeed(gFrac: number, L = 0.02, dTT = 5): number {
  return Math.sqrt(Math.max(gFrac, 0) * G0 * L * dTT);
}

/** Oxygen mole fraction that keeps sea-level oxygen partial pressure at total pressure P. */
export const normoxicFraction = (pKpa: number) => SEA_LEVEL_PPO2_KPA / pKpa;

/** Buoyant flicker frequency of a small flame scales as sqrt(g/d). Used only to animate schematics. */
export function flickerHz(gFrac: number, d = 0.01): number {
  return gFrac <= 0 ? 0 : 0.5 * Math.sqrt((gFrac * G0) / d) * 0.8;
}

/* ---------- spinning platforms ---------- */
export const omega = (rpm: number) => (rpm * 2 * Math.PI) / 60;
/** Centripetal acceleration at radius r, m/s². */
export const centripetal = (rpm: number, r: number) => omega(rpm) ** 2 * r;
/** Coriolis acceleration 2 omega v as a fraction of the simulated gravity. */
export const coriolisFraction = (rpm: number, r: number, v: number) => (2 * omega(rpm) * v) / centripetal(rpm, r);
/** Fractional change of simulated gravity across a sample of length dr. */
export const gravityGradient = (dr: number, r: number) => dr / r;

/* ---------- well-mixed cabin bounds ---------- */
export const O2_HEAT_KJ_PER_G = 13.1; // heat released per gram of oxygen consumed (BASS-II summary report)
const R = 8.314462618;
export interface CabinBound {
  energyKJ: number;
  o2Grams: number;
  co2Ppm: number;
  dT: number;
  dPfrac: number;
  moles: number;
}
/**
 * Upper bounds for a fire of power Q (kW) burning for t (s) in free volume V (m³).
 * Adiabatic, constant volume: real temperature and pressure rises are far lower because walls absorb heat.
 * CO2 uses PMMA stoichiometry (5 CO2 per 6 O2). CO is not computed.
 */
export function cabinBound(qKw: number, tS: number, vM3: number, pKpa = ATM_KPA, tK = 295): CabinBound {
  const energyKJ = qKw * tS;
  const o2Grams = energyKJ / O2_HEAT_KJ_PER_G;
  const moles = (pKpa * 1000 * vM3) / (R * tK);
  const co2Mol = (o2Grams / 31.998) * (5 / 6);
  const cv = 2.5 * R; // diatomic gas
  const dT = (energyKJ * 1000) / (moles * cv);
  return { energyKJ, o2Grams, co2Ppm: (co2Mol / moles) * 1e6, dT, dPfrac: dT / tK, moles };
}

/* ---------- transport time scales ---------- */
export const advectionTime = (L: number, u: number) => L / u;
/** Time for diffusion to carry a gas a distance L: L² / (2 D). */
export const diffusionTime = (L: number, D: number) => (L * L) / (2 * D);
export const peclet = (u: number, L: number, D: number) => (u * L) / D;

/** d-squared law: burn time of a droplet of initial diameter d0 (mm) and burning-rate constant K (mm²/s). */
export const d2BurnTime = (d0mm: number, K: number) => (d0mm * d0mm) / K;
