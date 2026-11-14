import { Manifest, fmtUtc } from "../lib/data";
import { KLASS, Klass, KlassBadge } from "../lib/klass";

export function About({ manifest }: { manifest: Manifest | null }) {
  const classes = Object.keys(KLASS) as Klass[];
  return (
    <div className="stack" style={{ ["--gap" as string]: "28px" }}>
      <div className="stack">
        <h1 className="page-title">Method and limits</h1>
        <p className="lede">
          This site reads NASA's public microgravity combustion evidence and shows what it supports, what it does not, and where it ends. It gives no safety rating and no probability.
        </p>
      </div>

      <section className="panel">
        <h2 className="h2">Eight kinds of content, never mixed</h2>
        <p className="panel__sub">Each number and sentence belongs to one class. The class is drawn as a glyph and a border style, so it does not depend on colour.</p>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead><tr><th>Mark</th><th>Code</th><th>What it means</th></tr></thead>
            <tbody>
              {classes.map((k) => (
                <tr key={k}><td><KlassBadge k={k} /></td><td className="mono">{KLASS[k].code}</td><td>{KLASS[k].meaning}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="panel">
          <h2 className="h2">What this site does not do</h2>
          <ul className="prose" style={{ fontSize: "1.02rem", marginTop: 12, paddingLeft: 18, listStyle: "disc" }}>
            <li>It does not predict whether a material burns on the Moon or Mars. PSI holds no partial-gravity data yet.</li>
            <li>It does not say a cabin, a procedure or an atmosphere is safe.</li>
            <li>It does not guess the cause of the Artemis II smoke alarm. The public source does not state it.</li>
            <li>It does not fill a missing value. Missing stays missing.</li>
            <li>It controls nothing. Every alarm and cyber scenario is simulated.</li>
          </ul>
        </div>
        <div className="panel">
          <h2 className="h2">How the data gets here</h2>
          <ol className="prose" style={{ fontSize: "1.02rem", marginTop: 12, paddingLeft: 20, listStyle: "decimal" }}>
            <li>A script fetches the PSI combustion search, each investigation, its experimental table and the official resources from NASA's servers.</li>
            <li>Every response is stored byte for byte with its address, SHA-256 and time, in a hash-chained ledger.</li>
            <li>Derived values are computed by code in the public repository. Models and scenarios are labelled as such.</li>
            <li>The site is static: it works offline, with no key and no server.</li>
          </ol>
        </div>
      </section>

      <section className="panel">
        <h2 className="h2">Use of AI</h2>
        <p className="prose" style={{ fontSize: "1.02rem", marginTop: 10 }}>
          AI tools (Claude, by Anthropic) assisted with software development during 14 and 15 November 2026. The team reviewed and tested what they produced. Scientific observations come from the cited NASA sources. Numbers come from deterministic code; a language model may explain, but a sentence about data is shown only with a citation that resolves. The flame drawings are schematics made in code and are marked as illustrations. Nothing here uses NASA insignia.
        </p>
        <p className="note" style={{ marginTop: 10 }}>
          Before the event the team prepared research notes, a written plan, a team emblem and one watermarked concept sketch that is not used here. All code, data processing and project assets were created inside the event window.
        </p>
      </section>

      <section className="panel">
        <h2 className="h2">This build</h2>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Built</dt><dd>{manifest ? fmtUtc(manifest.built_at_utc) : "unknown"}</dd>
          <dt>Data schema</dt><dd className="mono">{manifest?.schema ?? "unknown"}</dd>
          <dt>NASA sync</dt><dd>{manifest?.nasa ? fmtUtc(manifest.nasa.synced_at_utc) : "not yet derived in this build"}</dd>
          <dt>Artifacts</dt><dd>{manifest ? Object.keys(manifest.artifacts).length : 0} files, each listed with its SHA-256 in manifest.json</dd>
        </dl>
      </section>
    </div>
  );
}
