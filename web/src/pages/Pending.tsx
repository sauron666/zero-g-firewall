import { NavItem } from "../app/nav";

/** A page whose data has not been derived yet says so, and says what it will hold. */
const WILL: Record<string, string> = {
  "/myths": "The three misconceptions NASA lists about fire in spacecraft, each with the evidence against it, where it still holds, the PSI investigations behind it and what remains open.",
  "/evidence": "A card for every investigation the PSI combustion search returns: purpose, hardware, what varied and what stayed constant, sensors, files, and a source for every field.",
  "/rank": "Investigations ranked for a mission you choose, with the breakdown of each score and how stable the ranking is when the weights change.",
  "/envelope": "Every real test point in oxygen fraction against pressure, with habitat atmospheres, the normoxic curve, historical points and the regions nobody has tested.",
  "/gaps": "Where PSI has no data, and which planned experiment is designed to fill each gap.",
  "/lessons": "Apollo 1, Apollo 13, Mir and the Artemis II alarm, and four Earth applications, each linked to the evidence.",
  "/alarm": "A lab for one question: is this alarm real? Smoke, dust, a failing sensor and tampered data, tested against signed telemetry.",
  "/playbooks": "A matrix of fire behaviour by phase and phenomenon, and response steps for the station and for a lunar habitat, each step with its evidence.",
  "/ask": "Questions answered from the evidence, every sentence cited to a table row or a page. Works with no model, with a local model, or with cloud models that check each other.",
  "/falsify": "Take any conclusion and search for the conditions under which it fails.",
  "/ledger": "Every file fetched from NASA with its address, hash and time, chained so that a changed byte is detected.",
  "/data": "Tidy exports, inputs for combustion and fire models, and a report for the PSI curators.",
};

export function Pending({ item, nasaReady }: { item?: NavItem; nasaReady: boolean }) {
  if (!item) {
    return (
      <div className="empty">
        <p className="empty__title">This page does not exist</p>
        <p style={{ marginTop: 8 }}>Use the menu to pick a section.</p>
      </div>
    );
  }
  const needsNasa = item.needs === "nasa" && !nasaReady;
  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <h1 className="page-title">{item.label}</h1>
      <p className="lede">{WILL[item.path] ?? ""}</p>
      <div className="empty">
        <p className="empty__title">{needsNasa ? "Waiting for the NASA sync" : "Being built"}</p>
        <p style={{ marginTop: 8, maxWidth: "70ch" }}>
          {needsNasa
            ? "This page shows only data fetched from NASA during the event. Run pipeline/sync_nasa.py, then pipeline/derive.py; the page fills itself from the result. Nothing is shown in its place."
            : "This section is next in the build order. Its status is in docs/IMPLEMENTATION_STATUS.md."}
        </p>
      </div>
    </div>
  );
}
