import { GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";
import { env, hasGemini } from "@/lib/env";

// Thin Gemini wrapper: structured JSON in, Zod-validated object out. Server-only by construction (reads env).
// Two guards keep the UI snappy on the free tier (20 requests/day per model):
//   1. every call has a hard timeout, so the local fallback takes over within seconds, not minutes;
//   2. after a quota (429) or overload (503) answer, Gemini is skipped for a cooldown window instead of retried.

let client: GoogleGenAI | null = null;
function getClient() {
  if (!hasGemini()) return null;
  return (client ??= new GoogleGenAI({ apiKey: env.gemini.apiKey, httpOptions: { timeout: CALL_TIMEOUT_MS } }));
}

const CALL_TIMEOUT_MS = 12_000;
const g = globalThis as unknown as { __geminiPausedUntil?: number; __geminiPauseReason?: string };

export class GeminiUnavailable extends Error {}

export function geminiPaused(): { paused: boolean; until: number; reason: string } {
  const until = g.__geminiPausedUntil ?? 0;
  return { paused: Date.now() < until, until, reason: g.__geminiPauseReason ?? "" };
}

function pauseFor(ms: number, reason: string) {
  g.__geminiPausedUntil = Date.now() + ms;
  g.__geminiPauseReason = reason;
  console.warn(`[ai] Gemini paused for ${Math.round(ms / 60000)} min: ${reason}`);
}

function noteFailure(e: unknown) {
  const msg = (e as Error)?.message ?? String(e);
  if (/RESOURCE_EXHAUSTED|"code":429|429/.test(msg)) {
    // Daily quota: the error carries "Please retry in 20h7m" — honor it, capped at 6h so a reset is picked up.
    const m = /retry in (?:(\d+)h)?(?:(\d+)m)?/.exec(msg);
    const mins = m ? (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) : 10;
    pauseFor(Math.min(Math.max(mins, 1), 360) * 60_000, "quota exceeded (free tier)");
  } else if (/UNAVAILABLE|"code":503|503/.test(msg)) {
    pauseFor(2 * 60_000, "model overloaded");
  } else if (/timed? ?out|aborted/i.test(msg)) {
    pauseFor(60_000, "request timed out");
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(`Gemini timed out after ${ms} ms`)), ms); });
  try { return await Promise.race([p, timeout]); } finally { if (t) clearTimeout(t); }
}

export async function generateJson<T>(prompt: string, schema: ZodType<T>, opts: { system?: string; temperature?: number } = {}): Promise<T> {
  const ai = getClient();
  if (!ai) throw new GeminiUnavailable("GEMINI_API_KEY not configured");
  const p = geminiPaused();
  if (p.paused) throw new GeminiUnavailable(`Gemini paused: ${p.reason}`);
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  try {
    const res = await withTimeout(ai.models.generateContent({
      model: env.gemini.model,
      contents: prompt,
      config: { systemInstruction: opts.system, temperature: opts.temperature ?? 0.3, responseMimeType: "application/json", responseJsonSchema: jsonSchema },
    }), CALL_TIMEOUT_MS);
    const text = res.text ?? "";
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`); }
    return schema.parse(parsed);
  } catch (e) {
    noteFailure(e);
    throw e;
  }
}

export async function generateText(prompt: string, opts: { system?: string; temperature?: number } = {}): Promise<string> {
  const ai = getClient();
  if (!ai) throw new GeminiUnavailable("GEMINI_API_KEY not configured");
  const p = geminiPaused();
  if (p.paused) throw new GeminiUnavailable(`Gemini paused: ${p.reason}`);
  try {
    const res = await withTimeout(ai.models.generateContent({
      model: env.gemini.model, contents: prompt, config: { systemInstruction: opts.system, temperature: opts.temperature ?? 0.6 },
    }), CALL_TIMEOUT_MS);
    return (res.text ?? "").trim();
  } catch (e) {
    noteFailure(e);
    throw e;
  }
}

/** Connectivity probe for the integrations page. Costs one request; never called on page load. */
export async function probeGemini(): Promise<{ ok: boolean; detail: string }> {
  if (!hasGemini()) return { ok: false, detail: "GEMINI_API_KEY not set — using local fallback" };
  const p = geminiPaused();
  if (p.paused) return { ok: false, detail: `Paused until ${new Date(p.until).toLocaleTimeString("en-US", { timeZone: "America/New_York" })}: ${p.reason}. Local fallback in use.` };
  try {
    const out = await generateJson("Reply with {\"ok\": true}", z.object({ ok: z.boolean() }));
    return { ok: out.ok, detail: `Connected (${env.gemini.model})` };
  } catch (e) {
    const msg = (e as Error).message;
    if (/RESOURCE_EXHAUSTED|429/.test(msg)) return { ok: false, detail: "Daily free-tier quota used up (20 requests/day). Local fallback in use until it resets." };
    return { ok: false, detail: `Error: ${msg.slice(0, 160)}` };
  }
}
