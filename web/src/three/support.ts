/** WebGL detection without loading Three.js: the 3-D bundle stays lazy. */
let cached: boolean | null = null;
export function webglAvailableCached(): boolean {
  if (cached != null) return cached;
  try {
    if (new URLSearchParams(location.hash.split("?")[1] ?? "").get("webgl") === "0") return (cached = false);   // force the 2-D fallback for testing
    const c = document.createElement("canvas");
    cached = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { cached = false; }
  return cached;
}
