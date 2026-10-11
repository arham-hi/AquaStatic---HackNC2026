import { z } from "zod";
import { json, parseBody, route, ApiError } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { ask } from "@/lib/services/assistant";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const me = await currentUser();
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`ask:${me?.id ?? ip}`, 30, 60_000);
  if (!rl.ok) throw new ApiError(429, "Too many questions at once. Give it a few seconds.");
  const { question, draftContext, history } = await parseBody(req, z.object({
    question: z.string().trim().min(2).max(400),
    draftContext: z.string().trim().max(800).optional(), // set while we're mid-draft so short replies complete the post
    history: z.array(z.string().trim().min(2).max(400)).max(8).default([]),
  }));
  return json(await ask(me, question, { draftContext, autoPublish: true, history }));
});
