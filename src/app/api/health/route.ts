import { json } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Import inside the handler so a missing production AUTH_SECRET returns safe JSON.
    const { env, hasElevenLabs, hasGemini, hasPhoton } = await import("@/lib/env");
    await getDb().execute(sql`select 1`);
    return json({ ok: true, database: "connected", demoMode: env.demoMode, gemini: hasGemini(), elevenlabs: hasElevenLabs(), photon: hasPhoton(), time: Date.now() });
  } catch (error) {
    // Never expose connection strings, credentials or provider error bodies.
    console.error("[health] Configuration/database check failed", (error as { code?: string }).code ?? "configuration");
    return json({ ok: false, error: "Server configuration or database connection is unavailable", time: Date.now() }, { status: 503 });
  }
}
