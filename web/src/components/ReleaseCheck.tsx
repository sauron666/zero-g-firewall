import { useState } from "react";
import { verifyRelease, ReleaseResult, Tamper } from "../lib/release";
import { KlassBadge } from "../lib/klass";

const get = async (p: string) => { try { const r = await fetch("./data/v1/" + p, { cache: "no-cache" }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; } };

/** The signed release, verified here: signature over release.json, then every file's SHA-256. */
export function ReleaseCheck() {
  const [res, setRes] = useState<ReleaseResult | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [mode, setMode] = useState<Tamper>("none");
  const run = async (t: Tamper) => { setMode(t); setBusy(0); setRes(await verifyRelease(get, t, (d, n) => setBusy(d / n))); setBusy(null); };
  const ok = res && res.signatureOk && res.keyIdOk && !res.changed.length && !res.missing.length;
  return (
    <section className="panel" data-klass="derived" id="release" aria-label="Signed release">
      <div className="panel__head">
        <div><h2 className="panel__title">Signed release: verify it here</h2>
          <p className="panel__sub">An Ed25519 signature over the release manifest, which lists the SHA-256 of every data file of this site. Your browser checks the signature with the published key, then re-hashes every file.</p></div>
        <KlassBadge k="derived" />
      </div>
      <div className="row">
        <button className="btn btn--primary btn--sm" disabled={busy != null} onClick={() => run("none")}>{busy != null && mode === "none" ? `Checking… ${Math.round(busy * 100)}%` : "Verify the release"}</button>
        <span className="note">Tamper in memory, then verify:</span>
        <button className="btn btn--quiet btn--sm" disabled={busy != null} onClick={() => run("release")}>a hash in the manifest</button>
        <button className="btn btn--quiet btn--sm" disabled={busy != null} onClick={() => run("signature")}>the signature</button>
        <button className="btn btn--quiet btn--sm" disabled={busy != null} onClick={() => run("artifact")}>a data file</button>
      </div>
      {res && (
        <div className="verdict-line" role="status" style={{ marginTop: 12 }}>
          <span><b className={ok ? "ok-t" : "bad-t"}>{res.error ? res.error : ok ? "Release verified." : "Release does NOT verify."}</b>{" "}
            {!res.error && <>Signature: <b className={res.signatureOk ? "ok-t" : "bad-t"}>{res.signatureOk ? "valid" : "invalid"}</b>. Key ID {res.key?.key_id} {res.keyIdOk ? "matches" : "does not match"} the key. Files re-hashed: {res.checked}{res.changed.length ? `, changed: ${res.changed.join(", ")}` : ", all match"}{res.missing.length ? `, missing: ${res.missing.length}` : ""}.{mode !== "none" ? ` (One byte of the ${mode} was changed in memory before checking.)` : ""}</>}</span>
        </div>
      )}
      {res?.key && <p className="note" style={{ marginTop: 10 }}>{res.key.trust_model} Built {res.release?.built_at_utc}; canonical form: {res.release?.canonicalization}.</p>}
      <p className="note" style={{ marginTop: 6 }}>Files: <a href="./data/v1/release/release.json">release.json</a>, <a href="./data/v1/release/release.sig">release.sig</a>, <a href="./data/v1/release/pubkey.json">pubkey.json</a>.</p>
    </section>
  );
}
