import { json, parseBody, route, ApiError, params } from "@/lib/api";
import { requireUser, currentUser, publicUser } from "@/lib/session";
import { UpdatePostSchema, getPost, updatePost, deletePost } from "@/lib/services/posts";
import { getUser } from "@/lib/services/users";
import { postToFeed } from "@/lib/services/feed";
import { getDb, schema } from "@/lib/db/client";
import { eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const post = (await getPost(id));
  if (!post || post.status === "deleted") throw new ApiError(404, "Post not found");
  const author = post.authorId ? (await getUser(post.authorId)) : null;
  const me = await currentUser();
  const matches = (await getDb().select().from(schema.matches).where(or(eq(schema.matches.requestPostId, id), eq(schema.matches.offerPostId, id))));
  return json({ post, author: publicUser(author), item: postToFeed(post, author), isMine: !!me && me.id === post.authorId, matchCount: matches.filter((m) => m.status !== "declined" && m.status !== "cancelled").length });
});

export const PATCH = route<Ctx>(async (req, ctx) => {
  const { id } = await params(ctx);
  const user = await requireUser();
  const patch = await parseBody(req, UpdatePostSchema);
  return json({ post: (await updatePost(user, id, patch)) });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const user = await requireUser();
  (await deletePost(user, id));
  return json({ ok: true });
});
