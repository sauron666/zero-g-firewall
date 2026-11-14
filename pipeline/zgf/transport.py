"""
Reference implementation of the tracer-transport scheme used in the browser
(web/src/physics/transport.ts). Same stencil, same operation order, so the two
agree to round-off; `golden()` writes the vectors the TypeScript tests load.
"""
from __future__ import annotations

import math
import numpy as np


def erf_as(x: float) -> float:
    """Abramowitz and Stegun 7.1.26, the same approximation as the TypeScript twin."""
    s = -1.0 if x < 0 else 1.0
    a = abs(x)
    t = 1.0 / (1.0 + 0.3275911 * a)
    y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * math.exp(-a * a)
    return s * y


def recirculation(Lx, Ly, speed, direction=-1):
    psi0 = direction * speed * Ly / math.pi
    return lambda x, y: psi0 * math.sin(math.pi * x / Lx) * math.sin(math.pi * y / Ly)


def through_flow(speed):
    """Uniform ventilation towards x = 0 at `speed` m/s (u = dpsi/dy = -speed)."""
    return lambda x, y: -speed * y


def plume(Lx, Ly, xs, w, speed):
    k = w * math.sqrt(math.pi / 2)
    E = lambda x: k * erf_as((x - xs) / (math.sqrt(2.0) * w))
    e0 = E(0.0)
    span = E(Lx) - e0
    return lambda x, y: -speed * math.sin(math.pi * y / Ly) * (E(x) - e0 - (x / Lx) * span)


def flow_from_stream(nx, ny, h, psi):
    p = np.array([[psi(i * h, j * h) for i in range(nx + 1)] for j in range(ny + 1)])  # [j, i]
    uf = (p[1:, :] - p[:-1, :]) / h           # (ny, nx+1)
    vf = -(p[:, 1:] - p[:, :-1]) / h          # (ny+1, nx)
    return uf, vf


def step(c, uf, vf, D, dt, h, src=None, sink=None):
    """One explicit conservative step. c has shape (ny, nx)."""
    ny, nx = c.shape
    invh = 1.0 / h
    fw = np.zeros_like(c); fe = np.zeros_like(c); fs = np.zeros_like(c); fn = np.zeros_like(c)
    # west faces of cells i>=1
    u = uf[:, 1:nx]; cw = c[:, :-1]; ck = c[:, 1:]
    fw[:, 1:] = np.where(u > 0, u * cw, u * ck) - D * (ck - cw) * invh
    # east faces of cells i<=nx-2
    u = uf[:, 1:nx]; ck = c[:, :-1]; ce = c[:, 1:]
    fe[:, :-1] = np.where(u > 0, u * ck, u * ce) - D * (ce - ck) * invh
    v = vf[1:ny, :]; cs = c[:-1, :]; ck = c[1:, :]
    fs[1:, :] = np.where(v > 0, v * cs, v * ck) - D * (ck - cs) * invh
    v = vf[1:ny, :]; ck = c[:-1, :]; cn = c[1:, :]
    fn[:-1, :] = np.where(v > 0, v * ck, v * cn) - D * (cn - ck) * invh
    # boundary faces: air that leaves carries smoke out; air that enters is clean
    u0 = uf[:, 0]; fw[:, 0] = np.where(u0 < 0, u0 * c[:, 0], 0.0)
    uN = uf[:, nx]; fe[:, -1] = np.where(uN > 0, uN * c[:, -1], 0.0)
    v0 = vf[0, :]; fs[0, :] = np.where(v0 < 0, v0 * c[0, :], 0.0)
    vN = vf[ny, :]; fn[-1, :] = np.where(vN > 0, vN * c[-1, :], 0.0)
    dc = (fw - fe + fs - fn) * invh
    if src is not None:
        dc = dc + src
    if sink is not None:
        dc = dc - sink * c
    return c + dt * dc


def golden() -> dict:
    """A small mixed case (fan cell + plume + source + filter) and two limiting cases."""
    nx, ny, h = 24, 8, 0.25
    Lx, Ly = nx * h, ny * h
    fan = recirculation(Lx, Ly, 0.12, -1)
    plm = plume(Lx, Ly, 4.0, 0.3, 0.05)
    uf, vf = flow_from_stream(nx, ny, h, lambda x, y: fan(x, y) + plm(x, y))
    D, dt, steps = 3e-3, 0.2, 200
    c = np.zeros((ny, nx))
    src = np.zeros((ny, nx)); src[2, 16] = 1.0 / (h * h)          # cell containing (4.1, 0.6)
    sink = np.zeros((ny, nx)); sink[0, 1:4] = 0.5
    removed = 0.0
    for _ in range(steps):
        removed += float((sink * c).sum()) * h * h * dt
        c = step(c, uf, vf, D, dt, h, src, sink)
    mixed = {"nx": nx, "ny": ny, "h": h, "fan_speed": 0.12, "plume": {"xs": 4.0, "w": 0.3, "speed": 0.05},
             "D": D, "dt": dt, "steps": steps, "source_cell": [16, 2], "sink_cells": [[1, 0], [2, 0], [3, 0]], "sink_rate": 0.5,
             "final": [float(x) for x in c.ravel()], "total": float(c.sum() * h * h), "removed": removed,
             "emitted": steps * dt}
    # pure diffusion of a unit pulse: mass conserved, peak falls, no negatives
    c = np.zeros((ny, nx)); c[4, 12] = 1.0 / (h * h)
    z_u = np.zeros((ny, nx + 1)); z_v = np.zeros((ny + 1, nx))
    for _ in range(100):
        c = step(c, z_u, z_v, 5e-3, 0.5, h)
    diffusion = {"D": 5e-3, "dt": 0.5, "steps": 100, "start_cell": [12, 4],
                 "final": [float(x) for x in c.ravel()], "total": float(c.sum() * h * h), "min": float(c.min()), "max": float(c.max())}
    # ventilation through open ends with a plume: what leaves through the return end is counted
    tf = through_flow(0.1)
    uf, vf = flow_from_stream(nx, ny, h, lambda x, y: tf(x, y) + plm(x, y))
    c = np.zeros((ny, nx)); out = 0.0
    for _ in range(300):
        out += float((-uf[:, 0] * c[:, 0]).clip(min=0).sum()) * h * 0.2
        c = step(c, uf, vf, 2e-3, 0.2, h, src)
    through = {"speed": 0.1, "D": 2e-3, "dt": 0.2, "steps": 300, "source_cell": [16, 2],
               "final": [float(x) for x in c.ravel()], "total": float(c.sum() * h * h), "left_through_return": out, "emitted": 300 * 0.2}
    return {"note": "Golden vectors written by pipeline/zgf/transport.py; compared in web/src/physics/transport.test.ts",
            "mixed": mixed, "diffusion": diffusion, "through": through}
