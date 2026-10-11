import { describe, expect, it } from "vitest";
import { CallTurns, isPlaybackEcho } from "@/components/radio/call-speech";

describe("call interruption guards", () => {
  it("ignores excerpts of Aqua's own reply heard through speakers", () => {
    expect(isPlaybackEcho("free pizza at the union", "There's free pizza at the Union, today!")).toBe(true);
    expect(isPlaybackEcho("", "Hello!")).toBe(false);
  });
  it("allows interruptions discussing the same campus topic", () => {
    expect(isPlaybackEcho("wait what time is the pizza", "There's free pizza at the Union today.")).toBe(false);
    expect(isPlaybackEcho("stop", "There's free pizza at the Union today.")).toBe(false);
  });
  it("rejects late greeting and reply completions after interruption or hangup", async () => {
    const turns = new CallTurns();
    const greeting = turns.next();
    const lateGreeting = Promise.resolve().then(() => turns.current(greeting));
    const reply = turns.next();
    expect(await lateGreeting).toBe(false);
    expect(turns.current(reply)).toBe(true);
    turns.next(); // interruption/hangup
    expect(turns.current(reply)).toBe(false);
  });
});
