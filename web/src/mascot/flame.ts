/**
 * How the companion's flame follows the physics it stands for. Every mapping is a schematic:
 * durations are theatrical and no number here is a measurement.
 *
 *  - Free fall: a dim blue ball, steady.
 *  - Gravity: the flame stretches along "up" in proportion to g^(1/3), the buoyant-speed scaling, and its tip warms.
 *  - Fans off in free fall: a flamelet, a few wobbles, out. Seen in a BASS-II test; NASA's guide warns it is not a rule.
 *  - Fans off in partial gravity: it keeps burning under a question mark, because nobody has measured it.
 */
export const elongation = (g: number) => Math.cbrt(Math.max(0, g));          // 1 at Earth gravity, 0.548 on the Moon, 0.724 on Mars
export const isPartial = (g: number) => g > 0.02 && g < 0.98;
export const OUT_AFTER = 2.6;                                                // seconds of the "fans off" beat in free fall

export interface Shape { strength: number; stretch: number; warm: number; wobble: number; halo: boolean; out: boolean }

/** The flame t seconds after the fans stopped (or with the fans running when t is null). */
export function shape(g: number, tOff: number | null): Shape {
  const stretch = elongation(g);
  const warm = Math.min(1, Math.sqrt(Math.max(0, g)) * 1.2);
  if (tOff == null) return { strength: 1, stretch, warm, wobble: 0, halo: isPartial(g), out: false };
  if (g <= 0.02) {
    const k = Math.min(1, Math.max(0, tOff / OUT_AFTER));
    const wobble = k < 1 ? Math.sin(tOff * Math.PI * 2 * 2.2) * 0.22 * k : 0;                   // oscillation grows as the flame shrinks
    return { strength: k >= 1 ? 0 : Math.max(0, (1 - k) * (1 + wobble)), stretch, warm, wobble, halo: false, out: k >= 1 };
  }
  const settle = 1 - 0.25 * Math.min(1, tOff / 1.5);                                             // weaker without the fan, never out
  return { strength: Math.max(0.6, settle), stretch, warm, wobble: 0, halo: g < 0.98, out: false };
}
