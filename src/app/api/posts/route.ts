import { json, parseBody, route, ApiError } from "@/lib/api";
import { requireUser, currentUser } from "@/lib/session";
import { CreatePostSchema, createPost, listPosts } from "@/lib/services/posts";
import { rateLimit } from "@/lib/rate-limit";
import { POST_TYPES, type PostType } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const mine = u.searchParams.get("mine") === "1";
  const user = mine ? await currentUser() : null;
  if (mine && !user) return json({ posts: [] });
  const posts = listPosts({
    type: type && (POST_TYPES as readonly string[]).includes(type) ? (type as PostType) : undefined,
    authorId: user?.id, includeExpired: mine, status: mine ? ["open", "matched", "in_progress", "fulfilled", "resolved", "expired"] : ["open", "matched", "in_progress"],
    q: u.searchParams.get("q") || undefined, limit: 200,
  });
  return json({ posts });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const rl = rateLimit(`post:${user.id}`, 12, 10 * 60_000);
  if (!rl.ok) throw new ApiError(429, "You're posting quickly. Try again in a minute.");
  const input = await parseBody(req, CreatePostSchema);
  if (input.isDemo && !user.isDemo) input.isDemo = false; // only demo users create demo posts
  const result = await createPost(user, input);
  return json(result, { status: 201 });
});
