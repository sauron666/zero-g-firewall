import { href } from "../app/router";

/** The four modes of the laboratory, in the order a visitor meets them. */
export const LAB_MODES = [
  { path: "/lab", label: "Fire Lab", n: "3D" },
  { path: "/material", label: "Material Evidence", n: "PMMA" },
  { path: "/model", label: "Model Lab", n: "ML" },
  { path: "/alarm", label: "Alarm Trust", n: "SOC" },
] as const;

export function LabTabs({ at }: { at: string }) {
  return (
    <nav className="labtabs" aria-label="Laboratory modes">
      {LAB_MODES.map((m) => (
        <a key={m.path} href={href(m.path)} aria-current={m.path === at ? "page" : undefined}>
          <span>{m.label}</span><span className="labtabs__n">{m.n}</span>
        </a>
      ))}
    </nav>
  );
}

/** Keep the URL in step with the state without adding a history entry for every slider move. */
export function replaceQuery(path: string, q: URLSearchParams) {
  const h = "#" + path.split("/").filter(Boolean).join("--") + "?" + q.toString();
  if (window.location.hash !== h) history.replaceState(null, "", h);
}
/** A deliberate change (a preset, a demo): a new history entry, so Back returns to the previous case. */
export function pushQuery(path: string, q: URLSearchParams) {
  const h = "#" + path.split("/").filter(Boolean).join("--") + "?" + q.toString();
  if (window.location.hash !== h) history.pushState(null, "", h);
}

export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
