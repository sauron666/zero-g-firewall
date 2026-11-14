/**
 * A language model that runs inside this browser tab: no key, no server, and no connection once its
 * weights are on the machine. Two ways, tried in this order unless the reader picks one:
 *
 *  1. The browser's own model, through the Prompt API (`LanguageModel`), which Chrome offers to web pages
 *     on desktop from version 148. The browser downloads and keeps the model.
 *  2. WebLLM: a small open model compiled for WebGPU, fetched once and kept in the browser's cache.
 *
 * Either way the model only rephrases passages it is handed, and the same checker judges every sentence.
 * State: written against the published interfaces and tested with stand-ins. It has not been run in the
 * build environment, which has neither a GPU nor the model downloads.
 */
export type Backend = "chrome" | "webllm";
export interface BrowserModelConfig { backend: "auto" | Backend; webllmModel: string }
export const BROWSER_DEFAULT: BrowserModelConfig = { backend: "auto", webllmModel: "Llama-3.2-1B-Instruct-q4f16_1-MLC" };
export const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

export interface Probe { chrome: "available" | "downloadable" | "downloading" | "unavailable" | "absent"; webgpu: boolean }
type Scope = Record<string, any>;

/** What this browser offers, without downloading anything. */
export async function probe(scope: Scope = globalThis as Scope): Promise<Probe> {
  let chrome: Probe["chrome"] = "absent";
  const LM = scope.LanguageModel;
  if (LM && typeof LM.availability === "function") {
    try {
      const a = String(await LM.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] }));
      chrome = (["available", "downloadable", "downloading", "unavailable"].includes(a) ? a : "unavailable") as Probe["chrome"];
    } catch { chrome = "unavailable"; }
  }
  return { chrome, webgpu: !!scope.navigator?.gpu };
}

export function choose(cfg: BrowserModelConfig, p: Probe): Backend | null {
  if (cfg.backend === "chrome") return p.chrome === "absent" || p.chrome === "unavailable" ? null : "chrome";
  if (cfg.backend === "webllm") return p.webgpu ? "webllm" : null;
  if (p.chrome === "available" || p.chrome === "downloadable" || p.chrome === "downloading") return "chrome";
  return p.webgpu ? "webllm" : null;
}

export type Progress = (fraction: number, text: string) => void;
let engine: { id: string; e: any } | null = null;          // a WebLLM engine is expensive to make: keep one per model

export interface Deps { scope?: Scope; load?: (url: string) => Promise<any> }
const loadModule = (url: string) => import(/* @vite-ignore */ url);

/** Ask the in-browser model. Throws with a sentence a person can act on. */
export async function callBrowserModel(cfg: BrowserModelConfig, system: string, user: string, onProgress: Progress = () => {}, deps: Deps = {}): Promise<{ text: string; by: string }> {
  const scope = deps.scope ?? (globalThis as Scope);
  const p = await probe(scope);
  const backend = choose(cfg, p);
  if (!backend) throw new Error(p.webgpu ? "This browser does not offer its own model." : "This browser offers neither its own model nor WebGPU. Chrome 148 or later on a desktop has both.");
  if (backend === "chrome") {
    const session = await scope.LanguageModel.create({
      initialPrompts: [{ role: "system", content: system }],
      expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }],
      monitor(m: any) { m.addEventListener("downloadprogress", (e: any) => onProgress(Number(e.loaded) || 0, "The browser is downloading its model")); },
    });
    try {
      const text = String(await session.prompt(user)).trim();
      if (!text) throw new Error("The model returned no text.");
      return { text, by: "the browser's built-in model" };
    } finally { try { session.destroy?.(); } catch { /* nothing to free */ } }
  }
  if (!engine || engine.id !== cfg.webllmModel) {
    let mod: any;
    try { mod = await (deps.load ?? loadModule)(WEBLLM_URL); } catch (e) { throw new Error(`The WebLLM library could not be loaded (${String((e as Error).message ?? e)}). It needs a connection the first time.`); }
    const e = await mod.CreateMLCEngine(cfg.webllmModel, { initProgressCallback: (r: any) => onProgress(Number(r?.progress) || 0, String(r?.text ?? "Loading the model")) });
    engine = { id: cfg.webllmModel, e };
  }
  const reply = await engine.e.chat.completions.create({ messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0, max_tokens: 500 });
  const text = String(reply?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The model returned no text.");
  return { text, by: `${cfg.webllmModel} in this browser` };
}
export const forgetEngine = () => { engine = null; };
