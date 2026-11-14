import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import "./styles/evidence.css";
import "./styles/trust.css";
import "./styles/ai.css";
import "./styles/home.css";
import "./styles/mascot.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
