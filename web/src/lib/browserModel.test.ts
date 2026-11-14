import { describe, expect, it } from "vitest";
import { askModel, DEFAULTS } from "./ai";
import { callBrowserModel, choose, forgetEngine, probe } from "./browserModel";
import type { Hit } from "./search";

/** Stand-ins shaped like the published interfaces. They check what is sent and how a reply is read; they are not the real models. */
const chromeScope = (state: string, reply = "ok") => {
  const seen: any = {};
  return { seen, scope: { navigator: {}, LanguageModel: {
    availability: async () => state,
    create: async (o: any) => { seen.create = o; return { prompt: async (u: string) => { seen.user = u; return reply; }, destroy: () => { seen.destroyed = true; } }; },
  } } };
};
const webllm = (reply: string) => {
  const seen: any = {};
  return { seen, load: async (url: string) => { seen.url = url; return { CreateMLCEngine: async (id: string, cfg: any) => { seen.id = id; cfg.initProgressCallback({ progress: 0.5, text: "half" });
    return { chat: { completions: { create: async (r: any) => { seen.req = r; return { choices: [{ message: { content: reply } }] }; } } } }; } }; } };
};
const hits: Hit[] = [{ passage: { id: "a", k: "literature", t: "Guide", x: "The flame was observed to extinguish within 2 s." }, score: 1, matched: [] }];

describe("model in the browser", () => {
  it("reports what the browser offers", async () => {
    expect(await probe({ navigator: {} })).toEqual({ chrome: "absent", webgpu: false });
    expect(await probe({ navigator: { gpu: {} }, LanguageModel: { availability: async () => "downloadable" } })).toEqual({ chrome: "downloadable", webgpu: true });
    expect((await probe({ navigator: {}, LanguageModel: { availability: async () => { throw new Error("x"); } } })).chrome).toBe("unavailable");
  });

  it("prefers the browser's own model and falls back to WebGPU", () => {
    expect(choose({ backend: "auto", webllmModel: "m" }, { chrome: "available", webgpu: true })).toBe("chrome");
    expect(choose({ backend: "auto", webllmModel: "m" }, { chrome: "unavailable", webgpu: true })).toBe("webllm");
    expect(choose({ backend: "auto", webllmModel: "m" }, { chrome: "absent", webgpu: false })).toBeNull();
    expect(choose({ backend: "chrome", webllmModel: "m" }, { chrome: "absent", webgpu: true })).toBeNull();
  });

  it("sends the rules as the system prompt of the browser's model and frees the session", async () => {
    const { seen, scope } = chromeScope("available", "The flame went out within 2 s [1].");
    const out = await callBrowserModel({ backend: "auto", webllmModel: "m" }, "RULES", "QUESTION", undefined, { scope });
    expect(out.text).toBe("The flame went out within 2 s [1].");
    expect(seen.create.initialPrompts).toEqual([{ role: "system", content: "RULES" }]);
    expect(seen.user).toBe("QUESTION");
    expect(seen.destroyed).toBe(true);
  });

  it("loads WebLLM only when needed, reports progress and reads the reply", async () => {
    forgetEngine();
    const w = webllm("It went out within 2 s [1].");
    const progress: [number, string][] = [];
    const out = await callBrowserModel({ backend: "webllm", webllmModel: "tiny" }, "RULES", "Q", (f, t) => progress.push([f, t]), { scope: { navigator: { gpu: {} } }, load: w.load });
    expect(out).toEqual({ text: "It went out within 2 s [1].", by: "tiny in this browser" });
    expect(w.seen.id).toBe("tiny");
    expect(w.seen.req.messages[0]).toEqual({ role: "system", content: "RULES" });
    expect(w.seen.req.temperature).toBe(0);
    expect(progress).toEqual([[0.5, "half"]]);
  });

  it("says what is missing in words a person can act on", async () => {
    await expect(callBrowserModel({ backend: "auto", webllmModel: "m" }, "s", "u", undefined, { scope: { navigator: {} } })).rejects.toThrow(/neither its own model nor WebGPU/);
    forgetEngine();
    await expect(callBrowserModel({ backend: "webllm", webllmModel: "m" }, "s", "u", undefined, { scope: { navigator: { gpu: {} } }, load: async () => { throw new Error("offline"); } })).rejects.toThrow(/could not be loaded/);
  });

  it("goes through the same checker as every other model", async () => {
    const { scope } = chromeScope("available", "The flame went out within 2 s [1]. The cabin is safe [1]. It always takes 9 s [1].");
    const run = await askModel({ ...DEFAULTS, mode: "browser" }, "q", hits, undefined, undefined, { scope });
    expect(run.verified.kept.map((k) => k.text)).toEqual(["The flame went out within 2 s."]);
    expect(run.verified.dropped.map((d) => d.reason)).toEqual(["gives a verdict or a probability the evidence cannot give", "number not in the cited passage: 9"]);
  });
});
