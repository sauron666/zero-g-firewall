"""
Builds the MODEL_OUTPUT artifacts of the site. These depend on physics and on a few
published numbers (each named with its source); they do not depend on PSI table rows,
so they can be built before the NASA sync and are rebuilt with it.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os

from . import physics as ph
from . import transport

FUELS = ["CH4", "C2H4", "C3H8"]


def _atm(id_, name, p_psia, x_o2, source, note="", kind="habitat"):
    p = p_psia * ph.PSI_TO_KPA if p_psia != 14.696 else ph.ATM_KPA
    return {
        "id": id_, "name": name, "kind": kind, "p_psia": p_psia, "p_kpa": round(p, 2), "x_o2": x_o2,
        "ppo2_kpa": round(p * x_o2, 2), "ppo2_vs_sea_level": round(p * x_o2 / (0.2095 * ph.ATM_KPA), 3),
        "o2_fraction_vs_air": round(x_o2 / 0.2095, 3),
        "normoxic_x_o2_at_this_pressure": round(ph.normoxic_fraction(p), 4),
        "source": source, "note": note,
        "Tad_K": {f: round(ph.adiabatic_T(f, x_o2, p), 1) for f in FUELS},
    }


def atmospheres() -> dict:
    import cantera as ct
    presets = [
        _atm("iss", "Sea level and ISS cabin", 14.696, 0.2095, "OCHMO-TB-003 (NASA habitable-atmosphere brief)"),
        _atm("challenge_limit", "Lunar habitat, limit named in the challenge", 10.2, 0.30,
             "Challenge text: 30% oxygen or more at 10.2 psi or less", "On the normoxic curve."),
        _atm("exploration", "Exploration atmosphere", 8.2, 0.34,
             "Ferkul et al. 2026, NTRS 20260001966", "Nominal for landers and rovers; band up to 37% oxygen."),
        _atm("suit", "Spacesuit", 4.3, 1.0, "Challenge text; OCHMO-TB-003"),
    ]
    historical = [
        _atm("apollo_pad", "Apollo 1 pad test: pure oxygen at 16.7 psi", 16.7, 1.0,
             "Apollo 204 Review Board summary (nasa.gov)", "Pressure from the Review Board page, not from the SMA case study.", "historical"),
        _atm("apollo_test_6040", "Apollo flammability tests: 60% O2, 40% N2 at 16.2 psi", 16.2, 0.60,
             "NASA history: Apollo flammability tests", "", "historical"),
        _atm("apollo_test_62", "Apollo flammability tests: pure oxygen at 6.2 psi", 6.2, 1.0,
             "NASA history: Apollo flammability tests", "", "historical"),
    ]
    xs = [round(0.12 + 0.02 * i, 2) for i in range(45)]
    sweep = []
    for p_kpa, label in [(101.325, "101.3 kPa (14.7 psia)"), (56.54, "56.5 kPa (8.2 psia)"), (29.65, "29.6 kPa (4.3 psia)")]:
        sweep.append({"fuel": "CH4", "p_kpa": p_kpa, "label": label,
                      "T_K": [round(ph.adiabatic_T("CH4", x, p_kpa), 1) for x in xs]})
    limit = [{"fuel": f, **{d: round(100 * ph.limit_o2_fraction(f, d), 1) for d in ("N2", "CO2", "AR")}} for f in FUELS]
    normoxic = [{"p_kpa": round(p, 1), "x_o2": round(ph.normoxic_fraction(p), 4)} for p in
                [25, 30, 35, 40, 45, 50, 56.5, 60, 65, 70.3, 75, 80, 85, 90, 95, 101.3, 110, 120]]
    return {
        "klass": "model",
        "title": "Equilibrium flame temperature across cabin atmospheres",
        "method": "Constant-pressure adiabatic equilibrium of a stoichiometric fuel and oxidizer mixture, reactants at 298.15 K.",
        "mechanism": "GRI-Mech 3.0 (gri30.yaml) with Cantera %s" % ct.__version__,
        "assumptions": [
            "Gaseous fuel, perfectly mixed at stoichiometric proportion, no heat loss.",
            "A thermodynamic upper bound. It says nothing about ignition, spread rate or solid materials.",
            "Atmosphere values are published numbers; each row names its source.",
        ],
        "presets": presets, "historical": historical,
        "sweep": {"x_o2": xs, "series": sweep},
        "normoxic_curve": {"ppo2_kpa": ph.SEA_LEVEL_PPO2_KPA, "points": normoxic},
        "limit_temperature": {"T_limit_K": 1600, "rows": limit,
                              "note": "Oxygen percentage at which the stoichiometric flame temperature falls to 1600 K at 1 atm. "
                                      "An ordering tool for diluents, not a flammability-limit predictor."},
    }


def scaling() -> dict:
    bodies = []
    for id_, name, g in [("earth", "Earth", 1.0), ("mars", "Mars", 0.38), ("moon", "Moon", 0.165), ("iss", "ISS, free fall", 0.0)]:
        lo, hi = ph.buoyant_speed_range(g)
        bodies.append({"id": id_, "name": name, "g": g, "buoyant_cm_s": [round(lo * 100, 1), round(hi * 100, 1)],
                       "ratio_to_earth": round(g ** (1 / 3), 3) if g > 0 else 0.0,
                       "plume_cm_s_2cm_flame": round(ph.plume_speed(g) * 100, 0)})
    return {
        "klass": "model",
        "title": "A fan you cannot switch off: buoyant flow against the most flammable forced flow",
        "formula": "U_b = (g * alpha * dT/T)^(1/3), with dT/T = 5 and alpha from 2.2e-5 to 1.5e-4 m2/s",
        "assumptions": [
            "An order-of-magnitude scale for the flow buoyancy drives near the base of a small flame.",
            "The coefficient is uncertain; the dependence on the cube root of gravity is the robust part.",
            "A larger scale, sqrt(g L dT/T), applies higher in the plume.",
            "Not a prediction of flammability. FM2 is designed to measure the real behaviour on the Moon.",
        ],
        "bodies": bodies,
        "reference": {
            "klass": "literature",
            "value_cm_s": 10,
            "statement": "The gas velocity at the minimum of the flammability curve is on the order of 10 cm/s, and it also corresponds to a maximum in the flame spread rate.",
            "doc_id": "researchers_guide", "locator": "p. 31",
        },
    }


def platform() -> dict:
    rpm, r = 11.0, 1.22
    a = ph.centripetal(rpm, r)
    return {
        "klass": "model",
        "title": "How faithful is spun-up gravity? Coriolis and gradient on a rotating platform",
        "assumptions": ["Rigid rotation at constant rate.", "Gas speed is the speed relative to the rotating sample."],
        "luci": {"rpm": rpm, "radius_m": r, "omega_rad_s": round(ph.omega(rpm), 4), "a_m_s2": round(a, 3),
                 "g_fraction": round(a / ph.G0, 4), "source": "LUCI, NTRS 20250010653"},
        "coriolis": [{"gas_speed_m_s": v, "coriolis_m_s2": round(2 * ph.omega(rpm) * v, 3),
                      "fraction_of_simulated_gravity": round(ph.coriolis_fraction(rpm, r, v), 3)} for v in (0.05, 0.10, 0.20, 0.30, 0.50)],
        "gradient": {"dr_m": 0.10, "fraction": round(0.10 / r, 4)},
    }


def cabin() -> dict:
    cases = []
    for label, q, t, v in [("3.2 kW for 60 s in 18 m3", 3.2, 60, 18.0), ("1.5 kW for 60 s in 17 m3", 1.5, 60, 17.0),
                           ("3.2 kW for 300 s in 18 m3", 3.2, 300, 18.0)]:
        b = ph.cabin_bound(q, t, v)
        cases.append({"label": label, "q_kw": q, "t_s": t, "v_m3": v, **{k: round(val, 3) for k, val in b.items()}})
    return {
        "klass": "model",
        "title": "Well-mixed cabin: what a fire of Saffire scale does to the air",
        "assumptions": [
            "Heat release converted to oxygen consumption at 13.1 kJ per gram of oxygen (BASS-II summary report).",
            "Carbon dioxide from PMMA stoichiometry. Carbon monoxide is not computed.",
            "Temperature and pressure rises are adiabatic, constant-volume upper bounds; walls absorb most of the heat in reality.",
        ],
        "cases": cases,
        "source": "Fire sizes and volumes from Urban et al., ICES-2024-365 (NTRS 20240002981)",
    }


def build(out_dir: str, golden_path: str | None = None) -> dict:
    os.makedirs(os.path.join(out_dir, "model"), exist_ok=True)
    arts = {"model/atmospheres.json": atmospheres(), "model/scaling.json": scaling(),
            "model/platform.json": platform(), "model/cabin.json": cabin()}
    index = {}
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for rel, obj in arts.items():
        obj["built_at_utc"] = stamp
        b = json.dumps(obj, indent=1, ensure_ascii=False).encode("utf-8")
        with open(os.path.join(out_dir, rel), "wb") as fh:
            fh.write(b)
        index[rel] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "model"}
    if golden_path:
        os.makedirs(os.path.dirname(golden_path), exist_ok=True)
        with open(golden_path, "w", encoding="utf-8") as fh:
            json.dump(transport.golden(), fh)
    return index
