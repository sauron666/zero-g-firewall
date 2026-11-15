/**
 * One time state for the whole laboratory. The 3-D loop reads it every frame without touching React;
 * charts subscribe and redraw at most ~12 times a second (useClock). Physical time never follows the frame rate:
 * the loop advances it by the wall-clock interval times the playback speed.
 */
import { useEffect, useState } from "react";

export interface Clock {
  get(): number; set(t: number): void; span(): number; setSpan(s: number): void;
  play(): void; pause(): void; toggle(): void; playing(): boolean; reset(): void;
  speed(): number; setSpeed(x: number): void;
  tick(dtWall: number): void;
  on(fn: (t: number, playing: boolean) => void): () => void;
}

export function createClock(span: number): Clock {
  let t = 0, run = false, sp = span, speed = 1;
  const fns = new Set<(t: number, p: boolean) => void>();
  const emit = () => fns.forEach((f) => f(t, run));
  return {
    get: () => t,
    set: (x) => { t = Math.max(0, Math.min(sp, x)); emit(); },
    span: () => sp,
    setSpan: (s) => { sp = Math.max(0.001, s); if (t > sp) t = sp; emit(); },
    play: () => { if (t >= sp) t = 0; run = true; emit(); },
    pause: () => { run = false; emit(); },
    toggle: () => { if (run) run = false; else { if (t >= sp) t = 0; run = true; } emit(); },
    playing: () => run,
    reset: () => { t = 0; run = false; emit(); },
    speed: () => speed,
    setSpeed: (x) => { speed = x; emit(); },
    tick: (dt) => { if (!run) return; t = Math.min(sp, t + dt * speed); if (t >= sp) run = false; emit(); },
    on: (fn) => { fns.add(fn); return () => fns.delete(fn); },
  };
}

/** Subscribe to a clock from React, throttled. */
export function useClock(c: Clock, hz = 12): { t: number; playing: boolean } {
  const [s, setS] = useState({ t: c.get(), playing: c.playing() });
  useEffect(() => {
    let last = 0, timer: number | null = null;
    const push = () => { last = performance.now(); timer = null; setS({ t: c.get(), playing: c.playing() }); };
    const off = c.on(() => {
      const wait = 1000 / hz - (performance.now() - last);
      if (wait <= 0) push(); else if (timer == null) timer = window.setTimeout(push, wait);
    });
    return () => { off(); if (timer != null) clearTimeout(timer); };
  }, [c, hz]);
  return s;
}
