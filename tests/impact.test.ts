import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "./setup";

await freshDb("impact");

const { getDb, schema } = await import("@/lib/db/client");
const { createPost, CreatePostSchema } = await import("@/lib/services/posts");
const { respondToMatch, completeMatch } = await import("@/lib/services/connections");
const { impactDashboard } = await import("@/lib/services/impact");
const { ensureDemoUsers, syncLocations } = await import("@/lib/services/demo");
const { ApiError } = await import("@/lib/api");
import type { User } from "@/lib/db/schema";

let alice: User, bob: User, carol: User, maya: User, jordan: User;

beforeAll(async () => {
  await syncLocations();
  await ensureDemoUsers();
  const db = getDb();
  const now = new Date();
  for (const [id, name] of [["u_real_alice", "Alice"], ["u_real_bob", "Bob"], ["u_real_carol", "Carol"]] as const) {
    await db.insert(schema.users).values({ id, displayName: name, avatar: "🐿️", interests: [], helpSubjects: [], preferredArea: null, notificationPrefs: {}, isDemo: false, createdAt: now });
  }
  const users = await db.select().from(schema.users);
  alice = users.find((u) => u.id === "u_real_alice")!;
  bob = users.find((u) => u.id === "u_real_bob")!;
  carol = users.find((u) => u.id === "u_real_carol")!;
  maya = users.find((u) => u.id === "u_demo_maya")!;
  jordan = users.find((u) => u.id === "u_demo_jordan")!;
}, 60_000);

let seq = 0;
const post = (author: User, type: "request" | "offer", over: Record<string, unknown> = {}) => {
  const item = `impact_item_${seq}`;
  return createPost(author, CreatePostSchema.parse({
    type, category: "borrowing", locationId: "davis-library", expiry: "3h",
    title: `${type === "request" ? "Need" : "Have"} ${item}`, description: `${type} ${item} at Davis Library`,
    keywords: ["impact_audit"], attributes: { item },
    ...over,
  }));
};

/** request + offer → suggested match → both accept → returns the accepted match view. */
async function acceptedPair(requester: User, offerer: User, over: Record<string, unknown> = {}) {
  seq++;
  const request = await post(requester, "request", over);
  const offer = await post(offerer, "offer", over);
  const match = offer.matches.find((m) => m.requestPostId === request.post.id);
  expect(match).toBeTruthy();
  await respondToMatch(requester, match!.id, "accept");
  const accepted = await respondToMatch(offerer, match!.id, "accept");
  expect(accepted.status).toBe("accepted");
  return { request: request.post, offer: offer.post, match: accepted };
}

describe("AquaImpact metrics count only confirmed completions", () => {
  it("an uncompleted match does not move any metric", async () => {
    seq++;
    const r = await post(alice, "request");
    const o = await post(bob, "offer");
    const match = o.matches.find((m) => m.requestPostId === r.post.id);
    expect(match).toBeTruthy();
    const d = await impactDashboard();
    expect(d.completed).toBe(0);
    expect(d.connections.total).toBe(0);
    expect(d.resourcesShared.total).toBe(0);
  });

  it("a completed borrow counts across every metric, with no demo share for real users", async () => {
    const { match } = await acceptedPair(alice, bob);
    await completeMatch(alice, match.id);
    const d = await impactDashboard();
    expect(d.completed).toBe(1);
    expect(d.resourcesShared).toMatchObject({ total: 1, demo: 0 });
    expect(d.reuseActions).toMatchObject({ total: 1, demo: 0 });
    expect(d.helpResolved).toMatchObject({ total: 1, demo: 0 });
    expect(d.peopleHelped).toMatchObject({ total: 1, demo: 0 });
    expect(d.connections).toMatchObject({ total: 1, demo: 0 });
    expect(d.breakdown.borrowed).toBe(1);
    // The completion lands in the current hourly bucket.
    expect(d.series).toHaveLength(24);
    expect(d.series.reduce((s, p) => s + p.count, 0)).toBe(1);
    // The recent feed exposes titles and locations only — no user ids or message content.
    const ev = d.recent[0];
    expect(ev).toMatchObject({ category: "borrowing", isDemo: false, requestLocation: "Davis Library" });
    expect(ev.requestTitle).toContain("impact_item");
    expect(JSON.stringify(ev)).not.toContain(alice.id);
  });

  it("completion is idempotent: a repeat call returns the match without double counting", async () => {
    const { match } = await acceptedPair(carol, alice);
    const done = await completeMatch(carol, match.id);
    expect(done.status).toBe("completed");
    const again = await completeMatch(alice, match.id); // the other participant repeats it
    expect(again.status).toBe("completed");
    const d = await impactDashboard();
    expect(d.completed).toBe(2);
    expect(d.helpResolved.total).toBe(2);
  });

  it("non-participants cannot complete, and suggested matches cannot be completed", async () => {
    const { match } = await acceptedPair(bob, carol);
    await expect(completeMatch(alice, match.id)).rejects.toThrow(ApiError);
    seq++;
    const r = await post(alice, "request");
    const o = await post(carol, "offer");
    const suggested = o.matches.find((m) => m.requestPostId === r.post.id)!;
    await expect(completeMatch(alice, suggested.id)).rejects.toThrow(ApiError);
  });

  it("expired or resolved posts cannot be completed", async () => {
    const { match, request } = await acceptedPair(alice, bob);
    const db = getDb();
    await db.update(schema.posts).set({ status: "expired", updatedAt: new Date() }).where(eq(schema.posts.id, request.id));
    await expect(completeMatch(alice, match.id)).rejects.toThrow(ApiError);
    const d = await impactDashboard();
    expect(d.completed).toBe(2); // unchanged
  });

  it("demo exchanges are counted separately, never as silent real impact", async () => {
    const { match } = await acceptedPair(maya, jordan);
    await completeMatch(jordan, match.id);
    const d = await impactDashboard();
    expect(d.completed).toBe(3);
    expect(d.resourcesShared.total).toBe(3);
    expect(d.resourcesShared.demo).toBe(1);
    expect(d.connections.demo).toBe(1);
    expect(d.recent.some((e) => e.isDemo)).toBe(true);
    // Real (non-demo) share is still recoverable and correct.
    expect(d.resourcesShared.total - d.resourcesShared.demo).toBe(2);
  });

  it("non-reuse categories count as connections and resolved requests, not as shared items", async () => {
    seq++;
    const r = await createPost(carol, CreatePostSchema.parse({
      type: "request", category: "tutoring", locationId: "undergraduate-library", expiry: "3h",
      title: "Need help with organic chemistry", description: "Need help with organic chemistry at the UL",
      keywords: ["chemistry"], attributes: { subject: "organic chemistry" },
    }));
    const o = await createPost(bob, CreatePostSchema.parse({
      type: "offer", category: "tutoring", locationId: "undergraduate-library", expiry: "3h",
      title: "Can tutor organic chemistry", description: "Can tutor organic chemistry at the UL",
      keywords: ["chemistry"], attributes: { subject: "organic chemistry" },
    }));
    const match = o.matches.find((m) => m.requestPostId === r.post.id);
    expect(match).toBeTruthy();
    await respondToMatch(carol, match!.id, "accept");
    const accepted = await respondToMatch(bob, match!.id, "accept");
    await completeMatch(carol, accepted.id);
    const d = await impactDashboard();
    expect(d.completed).toBe(4);
    expect(d.connections.total).toBe(4); // alice↔bob, carol↔alice, maya↔jordan, carol↔bob
    expect(d.resourcesShared.total).toBe(3); // tutoring is not a shared resource
    expect(d.reuseActions.total).toBe(3);
    expect(d.helpResolved.total).toBe(4);
    expect(d.peopleHelped.total).toBe(3); // alice, carol, maya were each helped once
  });
});
