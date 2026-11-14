"""
Closed-form physics and equilibrium thermochemistry.

Everything here is MODEL_OUTPUT: bounds and scalings with their assumptions listed.
The TypeScript twin of the closed forms lives in web/src/physics/scaling.ts; the
check values in tests/test_physics.py are the ones in the project's science notes.
"""
from __future__ import annotations

import math

G0 = 9.80665
PSI_TO_KPA = 6.894757
ATM_KPA = 101.325
SEA_LEVEL_PPO2_KPA = 21.2
ALPHA_RANGE = (2.2e-5, 1.5e-4)
O2_HEAT_KJ_PER_G = 13.1
R = 8.314462618


def buoyant_speed(g_frac: float, alpha: float, dTT: float = 5.0) -> float:
    """Diffusive-buoyant velocity scale (g alpha dT/T)^(1/3), m/s."""
    return 0.0 if g_frac <= 0 else (g_frac * G0 * alpha * dTT) ** (1.0 / 3.0)


def buoyant_speed_range(g_frac: float) -> tuple[float, float]:
    return buoyant_speed(g_frac, ALPHA_RANGE[0]), buoyant_speed(g_frac, ALPHA_RANGE[1])


def plume_speed(g_frac: float, L: float = 0.02, dTT: float = 5.0) -> float:
    return math.sqrt(max(g_frac, 0.0) * G0 * L * dTT)


def normoxic_fraction(p_kpa: float) -> float:
    return SEA_LEVEL_PPO2_KPA / p_kpa


def omega(rpm: float) -> float:
    return rpm * 2 * math.pi / 60.0


def centripetal(rpm: float, r: float) -> float:
    return omega(rpm) ** 2 * r


def coriolis_fraction(rpm: float, r: float, v: float) -> float:
    return 2 * omega(rpm) * v / centripetal(rpm, r)


def cabin_bound(q_kw: float, t_s: float, v_m3: float, p_kpa: float = ATM_KPA, t_k: float = 295.0) -> dict:
    """Upper bounds for a fire of power q burning for t in a closed, adiabatic volume."""
    energy_kj = q_kw * t_s
    o2_g = energy_kj / O2_HEAT_KJ_PER_G
    moles = p_kpa * 1000.0 * v_m3 / (R * t_k)
    co2_mol = (o2_g / 31.998) * (5.0 / 6.0)          # PMMA: C5H8O2 + 6 O2 -> 5 CO2 + 4 H2O
    dT = energy_kj * 1000.0 / (moles * 2.5 * R)
    return {"energy_kj": energy_kj, "o2_g": o2_g, "co2_ppm": co2_mol / moles * 1e6,
            "dT_K": dT, "dP_frac": dT / t_k, "moles": moles}


# ---------------- equilibrium thermochemistry (Cantera, GRI-Mech 3.0) ----------------
O2_PER_FUEL = {"CH4": 2.0, "C2H4": 3.0, "C3H8": 5.0}
_gas = None


def _solution():
    global _gas
    if _gas is None:
        import cantera as ct
        _gas = ct.Solution("gri30.yaml")
    return _gas


def adiabatic_T(fuel: str, x_o2: float, p_kpa: float, diluent: str = "N2", T0: float = 298.15) -> float:
    """
    Constant-pressure adiabatic equilibrium temperature of a stoichiometric mixture of `fuel`
    with an oxidizer of oxygen mole fraction x_o2 (rest `diluent`), reactants at T0.
    A thermodynamic upper bound for gaseous fuels. Not a statement about solid materials.
    """
    gas = _solution()
    nu = O2_PER_FUEL[fuel]
    comp = {fuel: 1.0, "O2": nu}
    if x_o2 < 1.0:
        comp[diluent] = comp.get(diluent, 0.0) + nu * (1.0 - x_o2) / x_o2
    gas.TPX = T0, p_kpa * 1000.0, comp
    gas.equilibrate("HP")
    return float(gas.T)


def stoich_mixture_fraction(fuel: str, y_fuel_stream: float, y_o2_stream: float) -> float:
    """Zst = 1 / (1 + s Y_F,1 / Y_O2,2) with s the stoichiometric oxygen-to-fuel mass ratio."""
    W = {"CH4": 16.043, "C2H4": 28.054, "C3H8": 44.097}
    s = O2_PER_FUEL[fuel] * 31.998 / W[fuel]
    return 1.0 / (1.0 + s * y_fuel_stream / y_o2_stream)


def limit_o2_fraction(fuel: str, diluent: str, T_limit: float = 1600.0, p_kpa: float = ATM_KPA) -> float:
    """Oxygen fraction at which the stoichiometric flame temperature falls to T_limit (bisection)."""
    lo, hi = 0.03, 0.60
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if adiabatic_T(fuel, mid, p_kpa, diluent) < T_limit:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)
