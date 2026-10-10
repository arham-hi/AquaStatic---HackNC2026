// Aqua Static iMessage agent — Photon Spectrum worker.
// Runs as a separate long-lived process and reuses the web app's services and SQLite database.
// Start: npm run worker:photon   (requires SPECTRUM_PROJECT_ID / SPECTRUM_PROJECT_SECRET in .env)
//
// Verified against the spectrum-ts docs (photon.codes/docs/spectrum-ts):
//   const app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] });
//   for await (const [space, message] of app.messages) { if (message.content.type === "text") await space.send("...") }
//   Proactive: const im = imessage(app); const user = await im.user("+1555..."); const dm = await im.space.create(user); await dm.send("hi")

import fs from "node:fs";
import path from "node:path";

// Load .env without adding a dependency.
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

async function main() {
  const projectId = process.env.SPECTRUM_PROJECT_ID;
  const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
  if (!projectId || !projectSecret) {
    console.error("Photon not connected: set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET in .env (get them at https://app.photon.codes).");
    console.error("The web app works without this worker; use the simulator on /developer to exercise the same command handler.");
    process.exit(1);
  }

  const { handleChannelMessage } = await import("@/lib/services/channels");
  // Dynamic import so the web app never loads the SDK, and so a missing/incompatible package fails here with a clear message.
  let Spectrum: (opts: Record<string, unknown>) => Promise<SpectrumApp>;
  let imessage: IMessageProvider;
  try {
    const core = (await import("spectrum-ts")) as unknown as { Spectrum: typeof Spectrum };
    const prov = (await import("spectrum-ts/providers/imessage")) as unknown as { imessage: IMessageProvider };
    Spectrum = core.Spectrum;
    imessage = prov.imessage;
  } catch (e) {
    console.error("Could not load spectrum-ts:", (e as Error).message);
    console.error("Install it with `npm install spectrum-ts` and check https://photon.codes/docs/spectrum-ts for the current package layout.");
    process.exit(1);
  }

  const app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] });
  console.log("Aqua Static iMessage agent connected. Waiting for messages…");

  for await (const [space, message] of app.messages) {
    try {
      if (message.content?.type !== "text") { await space.send("I can only read text right now. Try: \"What's happening near Davis?\""); continue; }
      const sender = message.sender?.id ?? "unknown";
      // Channel handle: never logged in full, never exposed via public API.
      const handle = `imessage:${sender}`;
      const run = async () => {
        const reply = await handleChannelMessage(handle, message.content.text);
        await space.send(reply.text);
      };
      if (typeof space.responding === "function") await space.responding(run); else await run();
    } catch (e) {
      console.error("Message handling failed:", (e as Error).message);
      try { await space.send("Something went wrong on my end. Try again in a moment."); } catch { /* ignore */ }
    }
  }
}

// Minimal structural types for the parts of the SDK we use (keeps us honest if the package shape changes).
type SpectrumMessage = { platform?: string; content: { type: string; text: string }; sender?: { id?: string } };
type SpectrumSpace = { send: (text: string) => Promise<unknown>; responding?: (fn: () => Promise<void>) => Promise<void> };
type SpectrumApp = { messages: AsyncIterable<[SpectrumSpace, SpectrumMessage]> };
type IMessageProvider = { config: (opts?: Record<string, unknown>) => unknown };

main().catch((e) => { console.error(e); process.exit(1); });
