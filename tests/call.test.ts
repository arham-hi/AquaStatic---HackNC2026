import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { freshDb } from "./setup";

// Spyable generateJson — real implementation by default (throws without a key → local path),
// mockResolvedValue in the Gemini test. No live API calls either way.
vi.mock("@/lib/ai/gemini", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/ai/gemini")>();
  return { ...orig, generateJson: vi.fn(orig.generateJson) };
});

await freshDb("call");

const { getDb, schema } = await import("@/lib/db/client");
const { createPost, CreatePostSchema } = await import("@/lib/services/posts");
const { ensureDemoUsers, syncLocations } = await import("@/lib/services/demo");
const { startCall, callTurn, endCall, dropSession } = await import("@/lib/services/call");
const { listPosts } = await import("@/lib/services/posts");
const { generateJson } = await import("@/lib/ai/gemini");
const { env } = await import("@/lib/env");
import type { User } from "@/lib/db/schema";

let maya: User;
const post = (text: string, extra: Record<string, unknown> = {}) =>
  createPost(maya, CreatePostSchema.parse({
    description: text, type: "request", category: "study", title: text.slice(0, 60),
    locationId: "davis-library", expiry: "3h", ...extra,
  }));

beforeAll(async () => {
  await syncLocations();
  await ensureDemoUsers();
  maya = (await getDb().select().from(schema.users)).find((u) => u.id === "u_demo_maya")!;
});

afterEach(() => {
  vi.mocked(generateJson).mockReset();
  vi.mocked(generateJson).mockRejectedValue(new Error("gemini unavailable in tests"));
  env.gemini.apiKey = "";
});

const sid = () => `test_${Math.random().toString(36).slice(2, 12)}`;

describe("live call service", () => {
  it("startCall greets like a radio host and creates a session", () => {
    const t = startCall(sid());
    expect(t.reply).toMatch(/Aqua FM/i);
    expect(t.cards).toEqual([]);
    expect(t.endCall).toBe(false);
  });

  it("captures the caller's name and uses it in the reply", async () => {
    const s = sid();
    startCall(s);
    const t = await callTurn(s, "Aadee");
    expect(t.callerName).toBe("Aadee");
    expect(t.reply).toContain("Aadee");
  });

  it("answers a campus question from real stored posts", async () => {
    await post("Looking for a CHEM 101 study group tonight");
    const s = sid();
    const t = await callTurn(s, "are there any study groups tonight?");
    expect(t.cards.length).toBeGreaterThan(0);
    expect(t.reply.toLowerCase()).toMatch(/chem|study/);
    expect(t.cards[0].href).toMatch(/^\//);
  });

  it("retains context across turns — follow-ups stay on topic", async () => {
    await post("Need a calculus study partner at Davis");
    const s = sid();
    await callTurn(s, "any study requests on the board?");
    const t = await callTurn(s, "what about calculus?"); // follow-up keywords narrow within session context
    expect(t.endCall).toBe(false);
    expect(t.reply.toLowerCase()).toMatch(/calcul|study|board/);
  });

  it("keeps follow-up context when the next turn reaches a different server instance", async () => {
    await post("Need a geometry study partner at Davis");
    const s = sid();
    const question = "any study requests on the board?";
    const first = await callTurn(s, question);
    dropSession(s);
    const second = await callTurn(s, "what about geometry?", Date.now(), {
      history: [{ role: "user", text: question }, { role: "aqua", text: first.reply }], callerName: "Sam",
    });
    expect(second.callerName).toBe("Sam");
    expect(second.cards.length).toBeGreaterThan(0);
    expect(second.reply.toLowerCase()).toContain("geometry");
  });

  it("is honest when nothing on the board matches", async () => {
    const s = sid();
    const t = await callTurn(s, "any news about the campus quidditch league?");
    expect(t.cards).toEqual([]);
    expect(t.reply.toLowerCase()).toMatch(/not seeing|quiet|nothing/i);
  });

  it("discloses demo data naturally", async () => {
    await post("Demo student wants a physics study buddy");
    const s = sid();
    const t = await callTurn(s, "any physics requests?");
    if (t.cards.some((c) => c.isDemo)) expect(t.reply.toLowerCase()).toContain("demo");
  });

  it("detects goodbyes and ends the call", async () => {
    const s = sid();
    const t = await callTurn(s, "alright bye, gotta go!");
    expect(t.endCall).toBe(true);
  });

  it("endCall signs off by name and drops the session", async () => {
    const s = sid();
    startCall(s);
    await callTurn(s, "Sam");
    const bye = endCall(s);
    expect(bye.reply).toContain("Sam");
    expect(bye.reply.toLowerCase()).toMatch(/aqua fm|out/);
    dropSession(s); // idempotent, no throw
  });

  it("uses Gemini's spoken reply and card selection when configured", async () => {
    const { post: p } = await post("Free pizza study session at the Union");
    env.gemini.apiKey = "test-key";
    vi.mocked(generateJson).mockResolvedValueOnce({
      reply: "Yo, there's a free pizza study sesh at the Union — check the board!",
      cardIds: [`post:${p.id}`], callerName: null, endCall: false,
    });
    const t = await callTurn(sid(), "anything with free food?");
    expect(t.provider).toBe("gemini");
    expect(t.reply).toContain("pizza study sesh");
    expect(t.cards.map((c) => c.id)).toEqual([`post:${p.id}`]);
  });

  it("posts a request to the board when the caller asks for one", async () => {
    const s = sid();
    const t = await callTurn(s, "can you add a request for a Chromebook charger at Davis Library please", Date.now(), undefined, maya);
    expect(t.acted).toBe(true);
    expect(t.posted?.href).toBe(`/connect?post=${t.posted!.id}`);
    expect(t.draftContext).toBeNull();
    const stored = (await listPosts()).find((p) => p.id === t.posted!.id);
    expect(stored?.type).toBe("request");
    expect(t.cards.map((c) => c.id)).toContain(t.posted!.id);
  });

  it("asks for a missing detail, then posts on the follow-up", async () => {
    const s = sid();
    const first = await callTurn(s, "add a request for a calculator please", Date.now(), undefined, maya);
    expect(first.posted).toBeNull();
    expect(first.draftContext).toBeTruthy();
    expect(first.reply.toLowerCase()).toMatch(/where|campus/);
    // Cold-server turn: the client echoes draftContext back like callerName.
    const second = await callTurn(sid(), "at davis library", Date.now(), {
      history: [{ role: "user", text: "add a request for a calculator please" }, { role: "aqua", text: first.reply }],
      callerName: null, draftContext: first.draftContext,
    }, maya);
    expect(second.posted).toBeTruthy();
    expect(second.draftContext).toBeNull();
    const stored = (await listPosts()).find((p) => p.id === second.posted!.id);
    expect(stored?.locationId).toBe("davis-library");
  });

  it("a clear new question drops a pending call draft", async () => {
    const s = sid();
    await callTurn(s, "add a request for a calculator please", Date.now(), undefined, maya);
    const t = await callTurn(s, "what events are happening on campus tonight?", Date.now(), undefined, maya);
    expect(t.posted).toBeNull();
    expect(t.draftContext).toBeNull();
  });

  it("falls back to the local persona when Gemini fails", async () => {
    await post("ISO a stats review group before the midterm");
    env.gemini.apiKey = "test-key"; // key set but the API call itself fails
    const t = await callTurn(sid(), "any stats study groups?");
    expect(t.provider).toBe("local");
    expect(t.reply.toLowerCase()).toMatch(/stats|study/);
  });
});
