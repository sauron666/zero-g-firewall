import { describe, expect, it } from "vitest";
import { smallTalk } from "./smalltalk";

describe("small talk", () => {
  it("greets, in English and in Bulgarian, whatever the mode", () => {
    for (const t of ["hi", "Hi!", "hello", "Hello there.", "hey ISKRA", "здравей", "Здрасти!", "good morning"]) expect(smallTalk(t)?.kind, t).toBe("hello");
    expect(smallTalk("hi")!.lines.join(" ")).toContain("no network and no key");
    expect(smallTalk("hi", { model: "gemini-3.8-flash" })!.lines.join(" ")).toContain("gemini-3.8-flash");
  });
  it("answers who it is, what it can do and thanks", () => {
    expect(smallTalk("Who are you?")?.kind).toBe("who");
    expect(smallTalk("what can you do")?.kind).toBe("help");
    expect(smallTalk("какво можеш")?.kind).toBe("help");
    expect(smallTalk("thanks!")?.kind).toBe("thanks");
    expect(smallTalk("help", { examples: ["What did BASS-II study?"] })!.lines.join(" ")).toContain("“What did BASS-II study?”");
  });
  it("leaves every real question to the evidence", () => {
    for (const t of ["Will a fire go out if the fans are stopped?", "hi, will a fire go out if the fans are stopped?", "What did BASS-II study?", "hello world of flames in free fall and oxygen", "is it safe", ""])
      expect(smallTalk(t), t).toBeNull();
  });
  it("never states a number or a verdict of its own", () => {
    for (const t of ["hi", "who are you", "help", "thanks", "bye"]) {
      const text = smallTalk(t)!.lines.join(" ");
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/\bis safe\b|\bprobabilit/i);
    }
  });
});
