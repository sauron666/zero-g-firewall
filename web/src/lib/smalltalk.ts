/**
 * Words that are not a question about fire: a greeting, thanks, "who are you", "what can you do".
 * They are answered by the companion in its own voice, in every mode, and never sent to the search or to a model.
 * Anything longer than a few words is treated as a question.
 */
export type TalkKind = "hello" | "thanks" | "who" | "help" | "bye";
export interface Talk { kind: TalkKind; lines: string[] }

const PAT: [TalkKind, RegExp][] = [
  ["hello", /^(hi|hii+|hello|hey|heya|yo|hola|good (morning|afternoon|evening|day)|greetings|здравей(те)?|здрасти|привет|хей|добър ден|добро утро|добър вечер)( there| iskra| искра)?$/],
  ["thanks", /^(thanks|thank you|thanks a lot|thx|ty|cheers|благодаря( ти| ви)?|мерси)( iskra| искра)?$/],
  ["who", /^(who are you|what are you|what is iskra|who is iskra|are you (an? )?(ai|bot|robot|human)|кой си( ти)?|коя си( ти)?|какво си( ти)?)$/],
  ["help", /^(help|help me|what can you do|what can i ask( you)?|what do you know|how do (i|you) (use|work)( this| you)?|how does this work|помощ|какво можеш( да правиш)?|какво да (те )?питам)$/],
  ["bye", /^(bye|goodbye|see you|good night|чао|довиждане|лека нощ)$/],
];

export function smallTalk(text: string, ctx: { model?: string | null; examples?: string[] } = {}): Talk | null {
  const t = text.trim().toLowerCase().replace(/[!?.,;:…]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > 6) return null;
  const kind = PAT.find(([, re]) => re.test(t))?.[0];
  if (!kind) return null;
  const how = ctx.model
    ? `A model is connected (${ctx.model}): it may reword what the sources say, and every sentence it writes is checked against them before you see it.`
    : "I work with no network and no key.";
  const ask = ctx.examples?.length ? `Try: ${ctx.examples.slice(0, 2).map((e) => `“${e}”`).join(" or ")}.` : "Ask in plain words, for example whether a fire goes out when the fans stop.";
  const lines: Record<TalkKind, string[]> = {
    hello: ["Hello. I am ISKRA. Ask me about fire in spacecraft and I answer from NASA's tables and documents, with the source beside each sentence.", how, ask],
    who: ["I am ISKRA, the companion of Zero-G Firewall: a lantern with a flame inside. I search the NASA combustion records and documents this site carries and answer only from them.", how],
    help: ["I count test rows, rank the investigations for a mission, find what NASA's documents say and show where nothing was measured.", ask, "I can also open a page: say “open the atmosphere map”."],
    thanks: ["You are welcome. Every answer keeps its sources, so you can check me."],
    bye: ["Goodbye. The evidence stays here, with its receipts."],
  };
  return { kind, lines: lines[kind] };
}
