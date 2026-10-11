import { json, route, ApiError, params } from "@/lib/api";
import { getPost, listPosts } from "@/lib/services/posts";
import { getDb, schema } from "@/lib/db/client";
import { inArray } from "drizzle-orm";
import { publicUser } from "@/lib/session";
import { HOUR } from "@/lib/time";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Other open ride posts heading to the same place within two hours of this one. */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const post = getPost(id);
  if (!post || post.status === "deleted") throw new ApiError(404, "Post not found");
  if (post.category !== "ride") return json({ companions: [], destination: null });
  const dest = norm(post.attributes.destination);
  if (!dest) return json({ companions: [], destination: null });
  const when = post.startsAt?.getTime() ?? post.createdAt.getTime();
  const others = listPosts({ category: "ride", status: ["open", "matched"], limit: 200 })
    .filter((p) => p.id !== post.id && norm(p.attributes.destination) === dest)
    .filter((p) => Math.abs((p.startsAt?.getTime() ?? p.createdAt.getTime()) - when) <= 2 * HOUR)
    .slice(0, 8);
  const ids = Array.from(new Set(others.map((p) => p.authorId).filter(Boolean) as string[]));
  const users = ids.length ? getDb().select().from(schema.users).where(inArray(schema.users.id, ids)).all() : [];
  const byId = new Map(users.map((u) => [u.id, publicUser(u)]));
  return json({
    destination: post.attributes.destination,
    companions: others.map((p) => ({ id: p.id, title: p.title, type: p.type, startsAt: p.startsAt, author: byId.get(p.authorId ?? "") ?? null })),
  });
});
