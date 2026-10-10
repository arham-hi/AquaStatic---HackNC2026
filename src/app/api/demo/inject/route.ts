import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireDemoMode } from "@/lib/guard";
import { injectStep } from "@/lib/services/demo";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  requireDemoMode();
  const { step } = await parseBody(req, z.object({ step: z.enum(["mayaRequest", "jordanOffer"]) }));
  const result = await injectStep(step);
  return json(result, { status: 201 });
});
