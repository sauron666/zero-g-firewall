import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static-first: relative base so the build runs from any path (GitHub Pages, a file server, an offline laptop).
// ZGF_STABLE=1 writes fixed file names, for hosts that keep files by name between publishes.
const stable = process.env.ZGF_STABLE === "1";
const names = stable
  ? { entryFileNames: "assets/app.js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" }
  : {};

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: names },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as any);
