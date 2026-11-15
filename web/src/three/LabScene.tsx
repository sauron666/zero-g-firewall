/**
 * The Fire Lab viewport (Three.js, WebGL). Loaded lazily: opening a table never downloads this bundle.
 *
 * Scenes
 *  A droplet  : a FLEX droplet whose drawn size follows dropletAt(), the same function as the chart (computed).
 *  B habitat  : three conceptual modules; one vertical slice carries the site's 2-D transport solution ("2D transport visualized in 3D").
 *  C gravity  : two flames, one clock; the shape scaling with gravity is an illustration.
 * World units are metres; +y is "up" in the drawing and the gravity vector points along −y when g > 0.
 * The loop advances the shared clock and renders only when something changed; nothing here sets React state per frame.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Clock } from "../lab/clock";
import { dropletAt, DropletCase } from "../physics/dropletRun";
import type { Reality } from "../physics/paradox";
import { CABIN, SOURCE } from "../physics/paradox";
import { flowFromStream, plume, throughFlow } from "../physics/transport";
import { buoyantRatio, flickerHz } from "../physics/scaling";
import { mulberry32 } from "../lib/rank";

export type SceneId = "droplet" | "habitat" | "gravity";
export interface Pick { kind: "sensor" | "pin" | "module"; id: string }
export interface SensorSpec { id: string; name: string; x: number; y: number }
export interface LabSceneProps {
  scene: SceneId;
  clock: Clock;
  droplet: DropletCase;
  reality: Reality | null;
  fansOffAt: number | null;
  sensors: SensorSpec[];
  gA: number;
  gB: number;
  layers: Record<string, boolean>;
  quality: "high" | "low";
  cutaway: boolean;
  selected: string | null;
  onPick: (p: Pick) => void;
  onFail: (reason: string) => void;
  register: (api: { screenshot: () => string | null; resetView: () => void; startXR: (mode: "immersive-vr" | "immersive-ar") => Promise<string | null>; fps: () => number }) => void;
  onXR: (state: "on" | "off", mode?: string) => void;
}

const MAG = 40;                 // droplet scene: droplet and flame drawn 40 times enlarged (labelled on screen)

const flameVS = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const flameFS = `uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)),2.0); gl_FragColor = vec4(uColor*(0.25+1.5*f)*uI, (0.08+0.9*f)*uI); }`;
function flameMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({ vertexShader: flameVS, fragmentShader: flameFS, uniforms: { uColor: { value: color }, uI: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

function labelTexture(text: string, opts: { color?: string; bg?: string } = {}): { tex: THREE.CanvasTexture; aspect: number } {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const font = "600 44px B612, system-ui, sans-serif";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  c.width = w; c.height = 72;
  ctx.font = font;
  ctx.fillStyle = opts.bg ?? "rgba(4,7,13,0.78)"; ctx.strokeStyle = "rgba(135,146,170,0.7)"; ctx.lineWidth = 3;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(2, 2, w - 4, 68, 16); else ctx.rect(2, 2, w - 4, 68); ctx.fill(); ctx.stroke();
  ctx.fillStyle = opts.color ?? "#e8eefb"; ctx.textBaseline = "middle"; ctx.fillText(text, 18, 38);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, aspect: w / 72 };
}

function label(text: string, opts: { size?: number; color?: string; bg?: string } = {}): THREE.Sprite {
  const size = opts.size ?? 0.06;
  const { tex, aspect } = labelTexture(text, opts);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(size * aspect, size, 1);
  sp.renderOrder = 10;
  sp.userData.isLabel = true;
  return sp;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
      (mat as THREE.ShaderMaterial).uniforms && Object.values((mat as THREE.ShaderMaterial).uniforms).forEach((u) => u.value instanceof THREE.Texture && u.value.dispose());
      mat.dispose();
    }
  });
}

export function webglAvailable(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export default function LabScene(props: LabSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const P = useRef(props);
  P.current = props;
  const dirty = useRef(true);
  const rebuild = useRef<() => void>(() => {});
  const applyProps = useRef<() => void>(() => {});

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    } catch (e) { P.current.onFail("WebGL could not start: " + String((e as Error).message ?? e)); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, P.current.quality === "high" ? 2 : 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.localClippingEnabled = true;
    renderer.xr.enabled = true;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const bg = new THREE.Color("#04070d");
    scene.background = bg;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.addEventListener("change", () => (dirty.current = true));
    scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x05070c, 0.55));
    const key = new THREE.DirectionalLight(0xdfe8ff, 0.6); key.position.set(3, 5, 4); scene.add(key);
    const root = new THREE.Group(); scene.add(root);
    const pickables: THREE.Object3D[] = [];
    let update: (t: number, wall: number) => void = () => {};
    let homeCam = { pos: new THREE.Vector3(0, 0.25, 1.2), target: new THREE.Vector3(0, 0, 0) };

    const clear = () => { while (root.children.length) { const c = root.children[0]; root.remove(c); disposeTree(c); } pickables.length = 0; };

    // ---------- Scene A: droplet chamber ----------
    function buildDroplet() {
      const c = P.current.droplet;
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb3e6, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.62, 64, 1, true), glassMat); root.add(glass);
      const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.34, 0.34, 0.62, 48, 1, true), 30), new THREE.LineBasicMaterial({ color: 0x36425e })); root.add(rim);
      for (const y of [-0.31, 0.31]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.006, 8, 96), new THREE.MeshStandardMaterial({ color: 0x2b3650, metalness: 0.6, roughness: 0.4 })); ring.rotation.x = Math.PI / 2; ring.position.y = y; root.add(ring); }
      // graduated scale: 1 mm ticks of the real droplet, drawn at the same magnification
      const ticks = new THREE.Group();
      for (let i = 0; i <= 5; i++) {
        const h = (i * MAG) / 1000;
        const m = new THREE.Mesh(new THREE.BoxGeometry(i % 5 === 0 ? 0.03 : 0.018, 0.0016, 0.0016), new THREE.MeshBasicMaterial({ color: 0x8792aa }));
        m.position.set(0.24, h - 0.1, 0); ticks.add(m);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0016, (5 * MAG) / 1000, 0.0016), new THREE.MeshBasicMaterial({ color: 0x8792aa })); bar.position.set(0.24, (2.5 * MAG) / 1000 - 0.1, 0); ticks.add(bar);
      const tl = label("5 mm of droplet", { size: 0.054 }); tl.position.set(0.3, (5 * MAG) / 1000 - 0.06, 0); tl.userData.layer = "labels"; ticks.add(tl);
      root.add(ticks);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: c.fuel === "Heptane" ? 0xc9b98a : 0xaec8e8, roughness: 0.15, metalness: 0.05, emissive: 0x0a1a33 }));
      root.add(drop);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), flameMaterial(new THREE.Color("#4d9bff")));
      root.add(flame);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), flameMaterial(new THREE.Color("#1f4e9c")));
      root.add(halo);
      const light = new THREE.PointLight(0x5ea2ff, 0, 1.5, 2); root.add(light);
      const pin = new THREE.Mesh(new THREE.OctahedronGeometry(0.014), new THREE.MeshBasicMaterial({ color: 0xedf1f9 }));
      pin.position.set(-0.16, 0.16, 0); pin.userData = { pick: { kind: "pin", id: "flex-row" }, layer: "evidence" }; root.add(pin); pickables.push(pin);
      const pl = label(c.klass === "observed" ? `NASA FLEX test, row ${(c.row ?? 0) + 1}` : "Model estimate", { size: 0.047 }); pl.position.set(-0.16, 0.2, 0); pl.userData.layer = "evidence"; root.add(pl);
      const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, 0.16, 0), new THREE.Vector3(0, 0, 0)]), new THREE.LineBasicMaterial({ color: 0x8792aa })); stem.userData.layer = "evidence"; root.add(stem);
      const mag = label(`droplet and flame drawn ×${MAG}; flame shell is a schematic`, { size: 0.022 }); mag.position.set(0, -0.36, 0.2); mag.userData.layer = "labels"; root.add(mag);
      const state = label("", { size: 0.054 }); root.add(state);
      let lastPhase = "";
      homeCam = { pos: new THREE.Vector3(0.12, 0.16, 1.5), target: new THREE.Vector3(0, 0.02, 0) };
      update = (t) => {
        const s = dropletAt(P.current.droplet, t);
        const r = Math.max(0.0005, (s.d / 2 / 1000) * MAG);
        drop.scale.setScalar(r);
        const fr = r * 3.6;
        flame.visible = halo.visible = s.flame;
        flame.scale.setScalar(fr); halo.scale.setScalar(fr * 1.35);
        (flame.material as THREE.ShaderMaterial).uniforms.uI.value = 0.9; (halo.material as THREE.ShaderMaterial).uniforms.uI.value = 0.35;
        light.intensity = s.flame ? 1.6 : 0;
        if (s.phase !== lastPhase) {
          lastPhase = s.phase;
          const text = s.phase === "burning" ? "burning: D² falls linearly (d² law)" : s.phase === "extinct_recorded" ? `visible flame out at Dext = ${P.current.droplet.de} mm (recorded)` : "law reaches D = 0 (mathematical end)";
          const n = label(text, { size: 0.054, color: s.phase === "burning" ? "#cfe3ff" : "#ffe1a8" });
          state.material.map?.dispose(); state.material.dispose(); state.material = n.material; state.scale.copy(n.scale);
        }
        state.position.set(0, 0.36, 0);
      };
    }

    // ---------- Scene B: conceptual habitat ----------
    function buildHabitat() {
      const R = P.current.reality;
      const H = CABIN.Ly, L = CABIN.Lx, rad = H * 0.62;
      const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.0);
      const shellMat = () => new THREE.MeshStandardMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: P.current.cutaway ? [clip] : [] });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x3a4a6a });
      const module = (x0: number, len: number, id: string, name: string) => {
        const g = new THREE.CylinderGeometry(rad, rad, len, 40, 1, true); g.rotateZ(Math.PI / 2);
        const m = new THREE.Mesh(g, shellMat()); m.position.set(x0 + len / 2, H / 2, 0); m.userData = { pick: { kind: "module", id }, module: true }; root.add(m); pickables.push(m);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat); e.position.copy(m.position); root.add(e);
        const lb = label(`${name}, ${len} m long, ⌀ ${(2 * rad).toFixed(1)} m (concept)`, { size: 0.304 }); lb.position.set(x0 + len / 2, H + rad - 0.4, 0); lb.userData.layer = "labels"; root.add(lb);
      };
      module(-5.2, 4, "node", "Node");
      module(0, L, "cabin", "Cabin (solved slice)");
      module(L + 1.2, 4, "lab", "Lab");
      for (const [x0, x1] of [[-1.2, 0], [L, L + 1.2]]) { const g = new THREE.CylinderGeometry(0.55, 0.55, x1 - x0, 24, 1, true); g.rotateZ(Math.PI / 2); const t = new THREE.Mesh(g, shellMat()); t.position.set((x0 + x1) / 2, H / 2, 0); root.add(t); }
      // fans: supply at x = L, return at x = 0 (the solver's boundary conditions)
      const fans: THREE.Group[] = [];
      for (const [x, nm] of [[L - 0.05, "supply fan"], [0.05, "return duct, detector"]] as [number, string][]) {
        const f = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 40), new THREE.MeshStandardMaterial({ color: 0x5f6f8f, metalness: 0.7, roughness: 0.3 })); disc.rotation.y = Math.PI / 2; f.add(disc);
        const blades = new THREE.Group();
        for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.09), new THREE.MeshStandardMaterial({ color: 0x8a9abb, metalness: 0.5, roughness: 0.4 })); b.rotation.x = (i * Math.PI) / 4; blades.add(b); }
        f.add(blades); f.userData.blades = blades;
        f.position.set(x, H / 2, -0.9); root.add(f); fans.push(f);
        const lb = label(nm, { size: 0.228 }); lb.position.set(x, H / 2 + 0.55, -0.9); lb.userData.layer = "labels"; root.add(lb);
      }
      // the solved slice: a 2-D field drawn on one vertical plane
      const nx = R?.grid.nx ?? 60, ny = R?.grid.ny ?? 16;
      const data = new Uint8Array(nx * ny * 4);
      const tex = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
      const field = new THREE.Mesh(new THREE.PlaneGeometry(L, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      field.position.set(L / 2, H / 2, 0); field.userData.layer = "field"; root.add(field);
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(L, H)), new THREE.LineBasicMaterial({ color: 0x5ea2ff, transparent: true, opacity: 0.5 })); frame.position.copy(field.position); root.add(frame);
      const fl = label("2D transport visualized in 3D: one vertical slice, relative units (model)", { size: 0.266 }); fl.position.set(L / 2, -0.25, 0.1); fl.userData.layer = "labels"; root.add(fl);
      // flow arrows from the prescribed stream functions
      const arrows = new THREE.Group(); arrows.userData.layer = "flow"; root.add(arrows);
      const grid = { nx: 40, ny: 12, h: L / 40 };
      const fan = flowFromStream(grid, throughFlow(0.1));
      const plm = P.current.gB > 0 ? flowFromStream(grid, plume(L, H, SOURCE.x, 0.18, 1)) : null;
      const arrowSet = (on: boolean) => {
        while (arrows.children.length) { const a = arrows.children[0]; arrows.remove(a); disposeTree(a); }
        for (let j = 1; j < grid.ny; j += 3) for (let i = 2; i < grid.nx; i += 4) {
          let u = 0, v = 0;
          if (on) { u = fan.uf[i + j * (grid.nx + 1)]; v = fan.vf[i + j * grid.nx]; }
          if (plm) { u += 0.05 * plm.uf[i + j * (grid.nx + 1)]; v += 0.05 * plm.vf[i + j * grid.nx]; }
          const sp = Math.hypot(u, v); if (sp < 1e-4) continue;
          const dir = new THREE.Vector3(u, v, 0).normalize();
          const a = new THREE.ArrowHelper(dir, new THREE.Vector3(i * grid.h, j * (H / grid.ny), 0.05), Math.min(0.55, 0.15 + sp * 3), 0x7fb2ff, 0.1, 0.06);
          arrows.add(a);
        }
      };
      let arrowsOn = true; arrowSet(true);
      // particles: a seeded visual sample of the concentration, not tracked smoke
      const NP = P.current.quality === "high" ? 900 : 300;
      const pos = new Float32Array(NP * 3);
      const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd6e2f5, size: 0.035, transparent: true, opacity: 0.75, depthWrite: false })); pts.userData.layer = "particles"; root.add(pts);
      // source
      const src = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), flameMaterial(new THREE.Color("#ff9a4d"))); src.position.set(SOURCE.x, SOURCE.y, 0); src.scale.setScalar(0.12); root.add(src);
      const srcPin = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xedf1f9 })); srcPin.position.set(SOURCE.x, SOURCE.y + 0.5, 0.3); srcPin.userData = { pick: { kind: "pin", id: "bass2-fanoff" }, layer: "evidence" }; root.add(srcPin); pickables.push(srcPin);
      const sl = label("fire source (model)", { size: 0.228 }); sl.position.set(SOURCE.x, SOURCE.y + 0.75, 0.3); sl.userData.layer = "labels"; root.add(sl);
      // sensors
      const sens: THREE.Mesh[] = [];
      for (const s of P.current.sensors) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshStandardMaterial({ color: 0xedf1f9, emissive: 0x000000 }));
        m.position.set(s.x, s.y, 0.06); m.userData = { pick: { kind: "sensor", id: s.id }, layer: "sensors", sid: s.id }; root.add(m); pickables.push(m); sens.push(m);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 32), new THREE.MeshBasicMaterial({ color: 0x8792aa })); ring.position.copy(m.position); ring.userData.layer = "sensors"; root.add(ring);
        const lb = label(s.name, { size: 0.209 }); lb.position.set(s.x, s.y + 0.25, 0.1); lb.userData.layer = "labels"; root.add(lb);
      }
      homeCam = { pos: new THREE.Vector3(L / 2 - 0.8, 2.4, 8.2), target: new THREE.Vector3(L / 2, H / 2, 0) };
      let lastFrame = -1, lastSeed = -1;
      update = (t, wall) => {
        const Rn = P.current.reality;
        const fansOn = P.current.fansOffAt == null || t < P.current.fansOffAt;
        for (const f of fans) if (fansOn) (f.userData.blades as THREE.Group).rotation.x = wall * 9;
        if (arrowsOn !== fansOn) { arrowsOn = fansOn; arrowSet(fansOn); }
        const tSrc = (src.material as THREE.ShaderMaterial).uniforms.uI; tSrc.value = 0.9 + 0.1 * Math.sin(wall * 13);
        for (const m of sens) { const on = P.current.selected === m.userData.sid; (m.material as THREE.MeshStandardMaterial).emissive.setHex(on ? 0x2970d0 : 0x000000); m.scale.setScalar(on ? 1.35 : 1); }
        if (!Rn) return;
        const k = Math.max(0, Math.min(Rn.frames.length - 1, Math.round(t / Rn.frameDt)));
        if (k !== lastFrame || P.current.droplet.row !== lastSeed) {
          lastFrame = k; lastSeed = P.current.droplet.row ?? 0;
          const f = Rn.frames[k];
          const peak = Math.max(1e-9, Rn.peak);
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const c = Math.min(1, f[i + j * nx] / peak);
            const o = 4 * (i + j * nx);
            const v = Math.sqrt(c);
            data[o] = 200 + 55 * v; data[o + 1] = 215 + 40 * v; data[o + 2] = 235 + 20 * v; data[o + 3] = Math.round(235 * v);
          }
          tex.needsUpdate = true;
          // particles by inverse-CDF sampling of the field, seeded per frame
          let sum = 0; const cdf = new Float64Array(nx * ny);
          for (let i = 0; i < nx * ny; i++) { sum += f[i]; cdf[i] = sum; }
          const rnd = mulberry32(1000 + k);
          for (let p = 0; p < NP; p++) {
            if (sum <= 1e-12) { pos[3 * p] = pos[3 * p + 1] = -100; pos[3 * p + 2] = 0; continue; }
            const u = rnd() * sum; let lo = 0, hi = nx * ny - 1;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
            const ci = lo % nx, cj = Math.floor(lo / nx);
            pos[3 * p] = (ci + rnd()) * (L / nx); pos[3 * p + 1] = (cj + rnd()) * (H / ny); pos[3 * p + 2] = (rnd() - 0.5) * 1.4;
          }
          pg.attributes.position.needsUpdate = true;
        }
      };
    }

    // ---------- Scene C: gravity comparison ----------
    function buildGravity() {
      const mk = (x: number) => {
        const g = new THREE.Group(); g.position.x = x;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 40), new THREE.MeshStandardMaterial({ color: 0x2b3650, metalness: 0.6, roughness: 0.4 })); base.position.y = -0.2; g.add(base);
        const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0x9aa5bb })); wick.position.y = -0.1; g.add(wick);
        const fuel = new THREE.Mesh(new THREE.SphereGeometry(0.018, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 0.3 })); g.add(fuel);
        const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), flameMaterial(new THREE.Color("#4d9bff"))); g.add(outer);
        const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), flameMaterial(new THREE.Color("#ffb066"))); g.add(inner);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.52, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x8fb3e6, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })); glass.position.y = 0.04; g.add(glass);
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0.25, 0.18, 0), 0.16, 0x8792aa, 0.04, 0.025); arrow.userData.layer = "flow"; g.add(arrow);
        const lp = new THREE.PointLight(0x7fb2ff, 1.2, 1, 2); g.add(lp);
        root.add(g);
        return { g, outer, inner, arrow, lp, tag: null as THREE.Sprite | null };
      };
      const A = mk(-0.32), B = mk(0.32);
      const note = label("flame shape: illustrative scaling with gravity (cube root), not a measured shape", { size: 0.040 }); note.position.set(0, -0.3, 0.2); note.userData.layer = "labels"; root.add(note);
      homeCam = { pos: new THREE.Vector3(0, 0.1, 1.5), target: new THREE.Vector3(0, 0.04, 0) };
      let lastA = -1, lastB = -1;
      const shape = (s: ReturnType<typeof mk>, g: number, t: number) => {
        const b = buoyantRatio(g);
        const flick = g > 0 ? 1 + 0.06 * Math.sin(2 * Math.PI * flickerHz(g, 0.01) * t) : 1;
        s.outer.scale.set(0.06 * (1 - 0.3 * b), 0.06 * (1 + 1.9 * b) * flick, 0.06 * (1 - 0.3 * b)); s.outer.position.y = 0.06 * 1.2 * b;
        s.inner.visible = g > 0; s.inner.scale.set(0.022, 0.05 * (0.6 + 1.2 * b) * flick, 0.022); s.inner.position.y = 0.03 * b + 0.01;
        const col = new THREE.Color("#4d9bff").lerp(new THREE.Color("#ff8a3d"), Math.min(1, b * 0.85));
        (s.outer.material as THREE.ShaderMaterial).uniforms.uColor.value = col; s.lp.color = col;
        s.arrow.visible = g > 0 && (P.current.layers.flow ?? true);
      };
      const tag = (s: ReturnType<typeof mk>, g: number) => {
        if (s.tag) { s.g.remove(s.tag); disposeTree(s.tag); }
        s.tag = label(g === 0 ? "free fall, 0 g" : `${g.toFixed(3)} g${Math.abs(g - 0.165) < 0.01 ? " (Moon)" : Math.abs(g - 0.38) < 0.01 ? " (Mars)" : ""}`, { size: 0.061 });
        s.tag.position.set(0, 0.32, 0); s.g.add(s.tag);
      };
      update = (t) => {
        if (P.current.gA !== lastA) { lastA = P.current.gA; tag(A, lastA); }
        if (P.current.gB !== lastB) { lastB = P.current.gB; tag(B, lastB); }
        shape(A, P.current.gA, t); shape(B, P.current.gB, t);
      };
    }

    const placeCamera = () => { camera.position.copy(homeCam.pos); controls.target.copy(homeCam.target); controls.update(); dirty.current = true; };
    rebuild.current = () => {
      clear();
      const s = P.current.scene;
      if (s === "droplet") buildDroplet(); else if (s === "habitat") buildHabitat(); else buildGravity();
      placeCamera();
      applyProps.current();
    };
    applyProps.current = () => {
      const L = P.current.layers;
      root.traverse((o) => { const ly = o.userData.layer as string | undefined; if (ly) o.visible = L[ly] ?? true; });
      dirty.current = true;
    };

    // ---------- XR: session lifecycle ----------
    const xrPanel = new THREE.Group(); xrPanel.visible = false; scene.add(xrPanel);
    const buttons: { mesh: THREE.Mesh; act: () => void }[] = [];
    const mkBtn = (text: string, x: number, act: () => void) => {
      const { tex, aspect } = labelTexture(text, { bg: "rgba(41,112,208,0.92)", color: "#ffffff" });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.07 * aspect, 0.07), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
      mesh.position.set(x, 0, 0); xrPanel.add(mesh); buttons.push({ mesh, act });
    };
    mkBtn("Play / pause", -0.32, () => P.current.clock.toggle());
    mkBtn("Restart", 0.02, () => P.current.clock.reset());
    mkBtn("Labels", 0.3, () => { P.current.layers.labels = !(P.current.layers.labels ?? true); applyProps.current(); });
    const ray = new THREE.Raycaster();
    const controllers = [0, 1].map((i) => {
      const c = renderer.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x8fc0ff }));
      line.scale.z = 4; c.add(line);
      c.addEventListener("select", () => {
        const m = new THREE.Matrix4().extractRotation(c.matrixWorld);
        ray.ray.origin.setFromMatrixPosition(c.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
        const hb = ray.intersectObjects(buttons.map((b) => b.mesh), false)[0];
        if (hb) { buttons.find((b) => b.mesh === hb.object)?.act(); return; }
        const hp = ray.intersectObjects(pickables, false)[0];
        if (hp?.object.userData.pick) P.current.onPick(hp.object.userData.pick as Pick);
      });
      scene.add(c);
      return c;
    });
    let xrMode: string | null = null;
    const saved = { pos: new THREE.Vector3(), scale: 1 };
    const onSessionEnd = () => {
      scene.background = bg; renderer.setClearAlpha(1);
      root.position.copy(saved.pos); root.scale.setScalar(saved.scale); xrPanel.visible = false;
      controllers.forEach((c) => (c.visible = false));
      xrMode = null; P.current.onXR("off"); resize(); placeCamera();
    };
    const startXR = async (mode: "immersive-vr" | "immersive-ar"): Promise<string | null> => {
      const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
      if (!xr) return "WebXR is not available in this browser.";
      try {
        if (!(await xr.isSessionSupported(mode))) return `${mode} is not supported on this device.`;
        const session = await xr.requestSession(mode, { optionalFeatures: ["local-floor", "hit-test", "dom-overlay"], ...(mode === "immersive-ar" ? { domOverlay: { root: document.body } } : {}) } as XRSessionInit);
        renderer.xr.setReferenceSpaceType("local");
        await renderer.xr.setSession(session);
        xrMode = mode;
        saved.pos.copy(root.position); saved.scale = root.scale.x;
        const s = P.current.scene;
        const scale = s === "habitat" ? (mode === "immersive-ar" ? 0.04 : 0.22) : mode === "immersive-ar" ? 0.6 : 1.4;
        root.scale.setScalar(scale);
        root.position.set(s === "habitat" ? -CABIN.Lx * scale / 2 : 0, mode === "immersive-ar" ? -0.25 : 1.2 - (s === "habitat" ? 0.4 : 0), mode === "immersive-ar" ? -0.7 : -1.2);
        if (mode === "immersive-ar") { scene.background = null; renderer.setClearAlpha(0); }
        xrPanel.visible = true; xrPanel.position.set(0, mode === "immersive-ar" ? -0.45 : 0.75, mode === "immersive-ar" ? -0.6 : -1.0); xrPanel.scale.setScalar(mode === "immersive-ar" ? 0.5 : 1);
        controllers.forEach((c) => (c.visible = true));
        session.addEventListener("end", onSessionEnd, { once: true });
        P.current.onXR("on", mode);
        return null;
      } catch (e) { return `The XR session could not start: ${String((e as Error).message ?? e)}`; }
    };

    // ---------- loop, resize, visibility, context loss ----------
    let w = 0, h = 0;
    const resize = () => {
      if (renderer.xr.isPresenting) return;
      const r = el.getBoundingClientRect(); w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty.current = true;
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let prev = performance.now(), frames = 0, fpsT = prev, fps = 0;
    const offClock = P.current.clock.on(() => (dirty.current = true));
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
      if (!renderer.xr.isPresenting && document.hidden) return;
      P.current.clock.tick(dt);
      const moving = P.current.clock.playing() || P.current.scene !== "droplet" || renderer.xr.isPresenting;
      controls.update();
      if (!dirty.current && !moving) return;
      dirty.current = false;
      update(P.current.clock.get(), now / 1000);
      renderer.render(scene, camera);
      frames++; if (now - fpsT > 1000) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
    };
    renderer.setAnimationLoop(loop);
    const onVis = () => { prev = performance.now(); dirty.current = true; };
    document.addEventListener("visibilitychange", onVis);
    const canvas = renderer.domElement;
    const onLost = (e: Event) => { e.preventDefault(); renderer.setAnimationLoop(null); P.current.onFail("The graphics context was lost. The 2-D view below shows the same state."); };
    canvas.addEventListener("webglcontextlost", onLost);
    // pointer picking on the desktop
    const ndc = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables.filter((o) => o.visible), false)[0];
      if (hit?.object.userData.pick) P.current.onPick(hit.object.userData.pick as Pick);
    };
    canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp);

    rebuild.current();
    P.current.register({
      screenshot: () => { try { update(P.current.clock.get(), performance.now() / 1000); renderer.render(scene, camera); return canvas.toDataURL("image/png"); } catch { return null; } },
      resetView: placeCamera,
      startXR,
      fps: () => fps,
    });

    return () => {
      renderer.setAnimationLoop(null);
      const s = renderer.xr.getSession(); if (s) s.end().catch(() => {});
      offClock(); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
      controls.dispose();
      clear(); disposeTree(xrPanel); controllers.forEach((c) => disposeTree(c));
      renderer.dispose();
      canvas.remove();
      void xrMode;
    };
  }, []);

  // rebuild when the scene, the case or the solution changes; otherwise only re-apply layers
  useEffect(() => { rebuild.current(); }, [props.scene, props.droplet, props.reality, props.cutaway, props.quality, props.sensors, props.gB > 0]);
  useEffect(() => { applyProps.current(); dirty.current = true; }, [props.layers, props.selected, props.gA, props.gB, props.fansOffAt]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
