import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { verifyRelease } from "./release";

const root = new URL("../../public/data/v1/", import.meta.url);
const get = async (p: string) => { const u = new URL(p, root); return existsSync(u) ? new Uint8Array(readFileSync(u)) : null; };

describe("signed release, verified as the browser does (AC19)", () => {
  it("verifies the shipped signature and every artifact hash", async () => {
    const r = await verifyRelease(get);
    expect(r.error).toBeUndefined();
    expect(r.signatureOk).toBe(true);
    expect(r.keyIdOk).toBe(true);
    expect(r.changed).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.checked).toBe(r.release!.artifacts.length);
  }, 60000);
  it("fails the right check for a changed release, signature or file", async () => {
    expect((await verifyRelease(get, "release")).signatureOk).toBe(false);
    expect((await verifyRelease(get, "signature")).signatureOk).toBe(false);
    const a = await verifyRelease(get, "artifact");
    expect(a.signatureOk).toBe(true);
    expect(a.changed.length).toBe(1);
  }, 60000);
  it("publishes no private key", () => {
    const k = readFileSync(new URL("release/pubkey.json", root), "utf8");
    expect(k).not.toMatch(/PRIVATE|BEGIN/);
  });
});
