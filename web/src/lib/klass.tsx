/**
 * Evidence class. Every number and sentence on screen belongs to exactly one.
 * The class is drawn (glyph + border style), never signalled by colour alone.
 */
export type Klass = "observed" | "literature" | "derived" | "model" | "synthetic" | "live" | "recorded" | "illustrative";

export const KLASS: Record<Klass, { code: string; label: string; meaning: string }> = {
  observed: { code: "NASA_OBSERVATION", label: "NASA data", meaning: "A value from a file fetched from NASA's PSI repository, with hash and row." },
  literature: { code: "NASA_LITERATURE", label: "NASA document", meaning: "A statement from a NASA document, with document and page or section." },
  derived: { code: "DERIVED_FROM_NASA", label: "Derived", meaning: "Computed from NASA data by code in this repository. Inputs are listed." },
  model: { code: "MODEL_OUTPUT", label: "Model", meaning: "Output of a physical model. Assumptions are listed. Not a measurement." },
  synthetic: { code: "SYNTHETIC_SCENARIO", label: "Synthetic", meaning: "Generated for a simulated scenario. Not NASA data and not a real event." },
  live: { code: "LIVE_TELEMETRY", label: "Live", meaning: "Read from a public telemetry feed while you watch." },
  recorded: { code: "RECORDED_TELEMETRY", label: "Recorded", meaning: "Telemetry recorded earlier, replayed here." },
  illustrative: { code: "ILLUSTRATIVE", label: "Illustration", meaning: "A schematic to explain an idea. Not data and not a prediction." },
};

function Glyph({ k }: { k: Klass }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  switch (k) {
    case "observed":
      return <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="currentColor" /></svg>;
    case "literature":
      return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2.5h3.2v7H2zM6.8 2.5H10v7H6.8z" {...s} /></svg>;
    case "derived":
      return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.8 10.6 10H1.4z" fill="currentColor" /></svg>;
    case "model":
      return <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" {...s} strokeDasharray="2.2 1.6" /></svg>;
    case "synthetic":
      return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 2.2l7.6 7.6M9.8 2.2 2.2 9.8" {...s} strokeWidth={1.9} /></svg>;
    case "live":
      return <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="2.4" fill="currentColor" /><circle cx="6" cy="6" r="4.8" {...s} strokeWidth={1.2} /></svg>;
    case "recorded":
      return <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" {...s} /><path d="M6 3.4V6l1.8 1.2" {...s} strokeWidth={1.3} /></svg>;
    default:
      return <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.2" {...s} strokeDasharray="1.4 1.8" /></svg>;
  }
}

export function KlassBadge({ k, note, onClick }: { k: Klass; note?: string; onClick?: () => void }) {
  const d = KLASS[k];
  const body = (
    <>
      <Glyph k={k} />
      <span>{note ? `${d.label}: ${note}` : d.label}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={`klass klass--${k}`} title={d.meaning} onClick={onClick}>{body}</button>
  ) : (
    <span className={`klass klass--${k}`} title={d.meaning}>{body}</span>
  );
}
