/**
 * K03: verify the signed release in the browser. The signature is checked over the exact bytes of release.json
 * with the published Ed25519 public key; then every listed file is fetched and hashed. A tamper option changes one
 * byte in memory (of the release, the signature or a file) to show that the matching check fails.
 */
export interface ReleaseDoc { schema: string; project: string; built_at_utc: string; ledger_head: string | null; canonicalization: string; artifacts: { path: string; sha256: string; bytes: number }[] }
export interface PubKeyDoc { alg: "Ed25519"; key_id: string; public_key_raw_b64: string; signs: string; trust_model: string }
export type Tamper = "none" | "release" | "signature" | "artifact";
export interface ReleaseResult { signatureOk: boolean; keyIdOk: boolean; checked: number; changed: string[]; missing: string[]; release: ReleaseDoc | null; key: PubKeyDoc | null; error?: string }

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (s: string) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));

export async function verifyRelease(get: (path: string) => Promise<Uint8Array | null>, tamper: Tamper = "none", onProgress?: (d: number, t: number) => void): Promise<ReleaseResult> {
  const bodyRaw = await get("release/release.json"), sigRaw = await get("release/release.sig"), keyRaw = await get("release/pubkey.json");
  if (!bodyRaw || !sigRaw || !keyRaw) return { signatureOk: false, keyIdOk: false, checked: 0, changed: [], missing: [], release: null, key: null, error: "no signed release in this build" };
  const body = new Uint8Array(bodyRaw);
  if (tamper === "release") { const i = new TextDecoder().decode(body).indexOf('"sha256":"') + 10; body[i] = body[i] === 48 ? 49 : 48; }
  const sig = b64(new TextDecoder().decode(sigRaw));
  if (tamper === "signature") sig[5] ^= 1;
  const key = JSON.parse(new TextDecoder().decode(keyRaw)) as PubKeyDoc;
  const raw = b64(key.public_key_raw_b64);
  let signatureOk = false;
  try {
    const k = await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
    signatureOk = await crypto.subtle.verify({ name: "Ed25519" }, k, sig, body);
  } catch (e) { return { signatureOk: false, keyIdOk: false, checked: 0, changed: [], missing: [], release: null, key, error: `this browser cannot verify Ed25519: ${String((e as Error).message ?? e)}` }; }
  const keyIdOk = hex(await crypto.subtle.digest("SHA-256", raw)).slice(0, 16) === key.key_id;
  let release: ReleaseDoc | null = null;
  try { release = JSON.parse(new TextDecoder().decode(body)); } catch { return { signatureOk, keyIdOk, checked: 0, changed: [], missing: [], release: null, key, error: "release.json is not JSON" }; }
  const changed: string[] = [], missing: string[] = [];
  let checked = 0;
  const list = release!.artifacts;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const b = await get(it.path);
    if (!b) { missing.push(it.path); continue; }
    const bytes = new Uint8Array(b);
    if (tamper === "artifact" && i === 0 && bytes.length) bytes[0] ^= 1;
    if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== it.sha256) changed.push(it.path);
    checked++;
    onProgress?.(i + 1, list.length);
  }
  return { signatureOk, keyIdOk, checked, changed, missing, release, key };
}
