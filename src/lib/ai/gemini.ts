import { GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";
import { env, hasGemini } from "@/lib/env";

// Thin Gemini wrapper: structured JSON in, Zod-validated object out. Server-only by construction (reads env).

let client: GoogleGenAI | null = null;
function getClient() {
  if (!hasGemini()) return null;
  return (client ??= new GoogleGenAI({ apiKey: env.gemini.apiKey }));
}

export class GeminiUnavailable extends Error {}

export async function generateJson<T>(prompt: string, schema: ZodType<T>, opts: { system?: string; temperature?: number } = {}): Promise<T> {
  const ai = getClient();
  if (!ai) throw new GeminiUnavailable("GEMINI_API_KEY not configured");
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const res = await ai.models.generateContent({
    model: env.gemini.model,
    contents: prompt,
    config: {
      systemInstruction: opts.system,
      temperature: opts.temperature ?? 0.3,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    },
  });
  const text = res.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }
  return schema.parse(parsed);
}

export async function generateText(prompt: string, opts: { system?: string; temperature?: number } = {}): Promise<string> {
  const ai = getClient();
  if (!ai) throw new GeminiUnavailable("GEMINI_API_KEY not configured");
  const res = await ai.models.generateContent({
    model: env.gemini.model,
    contents: prompt,
    config: { systemInstruction: opts.system, temperature: opts.temperature ?? 0.6 },
  });
  return (res.text ?? "").trim();
}

/** Cheap connectivity probe used by the integrations page. Never called on page load. */
export async function probeGemini(): Promise<{ ok: boolean; detail: string }> {
  if (!hasGemini()) return { ok: false, detail: "GEMINI_API_KEY not set — using local fallback" };
  try {
    const out = await generateJson("Reply with {\"ok\": true}", z.object({ ok: z.boolean() }));
    return { ok: out.ok, detail: `Connected (${env.gemini.model})` };
  } catch (e) {
    return { ok: false, detail: `Error: ${(e as Error).message.slice(0, 160)}` };
  }
}
