"""Check values from the project's science notes. Run: python -m unittest discover -s pipeline/tests"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from zgf import physics as ph, transport
import numpy as np


class Scaling(unittest.TestCase):
    def test_luci_spin_gives_lunar_gravity(self):
        self.assertAlmostEqual(ph.centripetal(11, 1.22), 1.619, places=3)
        self.assertAlmostEqual(ph.centripetal(11, 1.22) / ph.G0, 0.165, places=3)

    def test_buoyant_ratio(self):
        self.assertAlmostEqual(0.165 ** (1 / 3), 0.548, places=3)
        self.assertAlmostEqual(0.38 ** (1 / 3), 0.724, places=3)

    def test_buoyant_speed_ranges_cm_s(self):
        for g, lo, hi in [(1.0, 10.3, 19.4), (0.38, 7.4, 14.1), (0.165, 5.6, 10.7)]:
            a, b = ph.buoyant_speed_range(g)
            self.assertAlmostEqual(a * 100, lo, delta=0.06)
            self.assertAlmostEqual(b * 100, hi, delta=0.06)
        self.assertEqual(ph.buoyant_speed(0, 1e-4), 0.0)

    def test_coriolis_fractions(self):
        for v, frac in [(0.05, 0.07), (0.10, 0.14), (0.20, 0.28), (0.30, 0.43), (0.50, 0.71)]:
            self.assertAlmostEqual(ph.coriolis_fraction(11, 1.22, v), frac, delta=0.006)

    def test_normoxic_curve(self):
        self.assertAlmostEqual(ph.normoxic_fraction(10.2 * ph.PSI_TO_KPA), 0.301, delta=0.001)
        self.assertAlmostEqual(ph.normoxic_fraction(8.2 * ph.PSI_TO_KPA), 0.375, delta=0.001)

    def test_cabin_bounds(self):
        b = ph.cabin_bound(3.2, 60, 18.0)
        self.assertAlmostEqual(b["o2_g"], 14.7, delta=0.05)
        self.assertAlmostEqual(b["dT_K"], 12.4, delta=0.05)
        self.assertAlmostEqual(b["dP_frac"], 0.042, delta=0.001)
        self.assertAlmostEqual(b["moles"], 744, delta=1)


class Thermo(unittest.TestCase):
    def test_methane_air(self):
        self.assertAlmostEqual(ph.adiabatic_T("CH4", 0.21, ph.ATM_KPA), 2224, delta=4)

    def test_atmosphere_table(self):
        self.assertAlmostEqual(ph.adiabatic_T("CH4", 0.34, 8.2 * ph.PSI_TO_KPA), 2570, delta=4)
        self.assertAlmostEqual(ph.adiabatic_T("CH4", 1.0, 16.7 * ph.PSI_TO_KPA), 3068, delta=4)

    def test_more_oxygen_never_cools_the_flame(self):
        ts = [ph.adiabatic_T("CH4", x, ph.ATM_KPA) for x in (0.15, 0.21, 0.30, 0.34, 0.5, 1.0)]
        self.assertEqual(ts, sorted(ts))

    def test_zst_methane_air(self):
        self.assertAlmostEqual(ph.stoich_mixture_fraction("CH4", 1.0, 0.233), 0.055, delta=0.001)


class Transport(unittest.TestCase):
    def setUp(self):
        self.nx, self.ny, self.h = 24, 8, 0.25
        self.zu = np.zeros((self.ny, self.nx + 1)); self.zv = np.zeros((self.ny + 1, self.nx))

    def test_walls_do_not_leak(self):
        uf, vf = transport.flow_from_stream(self.nx, self.ny, self.h, transport.recirculation(6, 2, 0.12))
        self.assertTrue(np.allclose(uf[:, 0], 0) and np.allclose(uf[:, -1], 0) and np.allclose(vf[0, :], 0) and np.allclose(vf[-1, :], 0))
        div = (uf[:, 1:] - uf[:, :-1] + vf[1:, :] - vf[:-1, :]) / self.h
        self.assertLess(np.abs(div).max(), 1e-12)

    def test_mass_is_conserved_without_source(self):
        uf, vf = transport.flow_from_stream(self.nx, self.ny, self.h, transport.recirculation(6, 2, 0.12))
        c = np.zeros((self.ny, self.nx)); c[3, 5] = 4.0
        m0 = c.sum()
        for _ in range(300):
            c = transport.step(c, uf, vf, 3e-3, 0.2, self.h)
        self.assertAlmostEqual(c.sum(), m0, places=10)
        self.assertGreaterEqual(c.min(), -1e-15)

    def test_nothing_moves_without_flow_or_diffusion(self):
        c = np.random.default_rng(1).random((self.ny, self.nx))
        self.assertTrue(np.array_equal(transport.step(c, self.zu, self.zv, 0.0, 0.5, self.h), c))

    def test_pulse_moves_at_the_prescribed_speed(self):
        nx, ny, h, u = 80, 1, 0.1, 0.15
        uf = np.full((ny, nx + 1), u); uf[:, 0] = 0; uf[:, -1] = 0
        vf = np.zeros((ny + 1, nx))
        c = np.zeros((ny, nx)); c[0, 10] = 1.0
        x = (np.arange(nx) + 0.5) * h
        x0 = (c[0] * x).sum()
        for _ in range(100):
            c = transport.step(c, uf, vf, 0.0, 0.2, h)
        self.assertAlmostEqual(((c[0] * x).sum() - x0) / 20.0, u, delta=1e-9)   # 3 m in 20 s

    def test_open_ends_balance(self):
        g = transport.golden()["through"]
        self.assertAlmostEqual(g["total"] + g["left_through_return"], g["emitted"], delta=1e-9)

    def test_golden_balance(self):
        g = transport.golden()["mixed"]
        self.assertAlmostEqual(g["total"] + g["removed"], g["emitted"], delta=1e-9)


if __name__ == "__main__":
    unittest.main()
