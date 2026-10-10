import { subscribe, revision } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** Server-Sent Events: emits {scope, rev} whenever data changes. Clients refetch on receipt; polling remains the fallback. */
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };
      send("hello", { rev: revision(), at: Date.now() });
      unsub = subscribe((ev) => send("change", ev));
      ping = setInterval(() => send("ping", { at: Date.now() }), 25_000);
      req.signal.addEventListener("abort", () => { unsub(); if (ping) clearInterval(ping); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel() { unsub(); if (ping) clearInterval(ping); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
