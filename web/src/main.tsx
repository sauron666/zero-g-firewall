import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import "./styles/evidence.css";
import "./styles/trust.css";
import "./styles/ai.css";
import "./styles/home.css";
import "./styles/mascot.css";
import "./styles/deck.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// After one visit with a connection the site opens with none. Not in development, and not where service workers are unavailable.
if (import.meta.env.PROD && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
      const loaded = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin));
      reg.active?.postMessage({ cache: Array.from(new Set(loaded)) });
    }).catch(() => { /* the site works without it */ });
  });
}
