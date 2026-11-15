import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FLOORS, FLOOR_GAP, FloorId, HALF_D, HALF_W, P_MAX, RAIL, SpaceLayout, floorY } from "../lib/space";

/**
 * The atmosphere map with gravity as its third axis: every row of NASA's tables on the free-fall floor,
 * and the floors of the Moon and Mars above it, empty but for the tests NASA plans. Drag to turn it.
 * The flat map and its table hold the same rows; this view adds nothing but the empty floors.
 */
interface Label { at: THREE.Vector3; text: string; cls: string }
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

export default function EvidenceSpace({ layout, names, summary }: { layout: SpaceLayout; names: Record<FloorId, string>; summary: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const labels = useMemo<Label[]>(() => [
    ...FLOORS.map((f) => ({ at: new THREE.Vector3(-HALF_W - 0.08, floorY(f) + 0.07, HALF_D), text: names[f], cls: `space__lab space__lab--floor space__lab--${f}` })),
    ...layout.poles.map((p, i) => ({ at: new THREE.Vector3(p.x, floorY("mars") + 0.16 + 0.17 * i, p.z), text: p.label, cls: "space__lab space__lab--pole" })),
    { at: new THREE.Vector3(HALF_W, floorY("micro") - 0.07, RAIL + 0.16), text: "oxygen, 10% to 100%", cls: "space__lab space__lab--axis space__lab--end" },
    { at: new THREE.Vector3(HALF_W + 0.1, floorY("micro") - 0.07, -HALF_D), text: `pressure, 0 to ${P_MAX} kPa`, cls: "space__lab space__lab--axis" },
    { at: new THREE.Vector3(-HALF_W, floorY("micro") - 0.07, RAIL + 0.16), text: "no pressure stated", cls: "space__lab space__lab--axis" },
    ...(layout.planned.length ? [{ at: new THREE.Vector3(layout.planned[0].x + 0.12, floorY("lunar") + 0.1, layout.planned[0].z), text: `${layout.planned.length} tests planned`, cls: "space__lab space__lab--planned" }] : []),
  ], [layout, names]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.prepend(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(3.8, 2.15, 4.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true;
    controls.minPolarAngle = 0.7; controls.maxPolarAngle = 1.45;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; controls.autoRotateSpeed = 0.7;
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    const disc = document.createElement("canvas"); disc.width = disc.height = 64;                 // a round mark for each row
    const cx = disc.getContext("2d")!; cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(32, 32, 28, 0, 2 * Math.PI); cx.fill();
    const dot = new THREE.CanvasTexture(disc);
    const group = new THREE.Group();
    scene.add(group);
    const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [];
    const keep = <T extends THREE.Material | THREE.BufferGeometry>(x: T): T => { (x instanceof THREE.Material ? mats : geos).push(x as never); return x; };
    const paint = () => {
      while (group.children.length) group.remove(group.children[0]);
      mats.splice(0).forEach((m) => m.dispose()); geos.splice(0).forEach((g) => g.dispose());
      const hue = { micro: new THREE.Color(css("--g-micro")), lunar: new THREE.Color(css("--g-partial")), mars: new THREE.Color(css("--g-partial")) };
      const ink = new THREE.Color(css("--ink-3"));
      for (const f of FLOORS) {
        const y = floorY(f);
        const plane = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALF_W, 2 * HALF_D)), keep(new THREE.MeshBasicMaterial({ color: hue[f], transparent: true, opacity: f === "micro" ? 0.1 : 0.05, side: THREE.DoubleSide, depthWrite: false })));
        plane.rotation.x = -Math.PI / 2; plane.position.y = y; group.add(plane);
        const edge = keep(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(a * HALF_W, y, b * HALF_D))));
        group.add(new THREE.Line(edge, keep(new THREE.LineBasicMaterial({ color: hue[f], transparent: true, opacity: 0.85 }))));
      }
      const cloud = (xyz: number[], size: number, opacity: number) => {            // rows that share an atmosphere fall on one spot: the spot grows denser, nothing is moved apart
        const g = keep(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
        group.add(new THREE.Points(g, keep(new THREE.PointsMaterial({ color: hue.micro, size, map: dot, alphaTest: 0.05, sizeAttenuation: true, transparent: true, opacity, depthWrite: false }))));
      };
      cloud(layout.placed, 0.13, 0.8);
      cloud(layout.rail, 0.1, 0.5);
      const rail = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-HALF_W, floorY("micro"), RAIL), new THREE.Vector3(HALF_W, floorY("micro"), RAIL)]));
      group.add(new THREE.Line(rail, keep(new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.6 }))));
      layout.poles.forEach((p, i) => {                                        // a cabin atmosphere passes through every floor
        const g = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, floorY("micro"), p.z), new THREE.Vector3(p.x, floorY("mars") + 0.14 + 0.17 * i, p.z)]));
        group.add(new THREE.Line(g, keep(new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.9 }))));
      });
      for (const t of layout.planned) {                                       // planned by NASA: a ring, not a filled mark
        const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.06, 0.09, 28)), keep(new THREE.MeshBasicMaterial({ color: hue.lunar, side: THREE.DoubleSide })));
        ring.rotation.x = -Math.PI / 2; ring.position.set(t.x, t.y + 0.004, t.z); group.add(ring);
      }
    };
    paint();
    const theme = new MutationObserver(paint);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const tags = Array.from(el.querySelectorAll<HTMLElement>(".space__lab"));
    const v = new THREE.Vector3();
    let w = 0, h = 0, raf = 0, seen = true;
    const size = () => { w = el.clientWidth; h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.fov = w < 520 ? 50 : 34; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(el); size();
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; }); io.observe(el);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!seen) return;
      controls.update();
      camera.lookAt(0, -0.12 * FLOOR_GAP, 0);
      renderer.render(scene, camera);
      labels.forEach((l, i) => { v.copy(l.at).project(camera); const t = tags[i]; if (t) t.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`; });
    };
    frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); theme.disconnect(); controls.dispose(); dot.dispose(); mats.forEach((m) => m.dispose()); geos.forEach((g) => g.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [layout, labels]);

  return (
    <div className="space" ref={host} role="img" aria-label={summary}>
      {labels.map((l, i) => <span key={i} className={l.cls} aria-hidden="true">{l.text}</span>)}
    </div>
  );
}
