
// Single place that reads process.env. Nothing else touches secrets.
const isProd = process.env.NODE_ENV === "production";

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (isProd) {
    throw new Error("AUTH_SECRET is required in production (run `npm run setup` or set it in the environment).");
  }
  // Dev-only. Sessions reset when the server restarts without a persisted secret.
  return "dev-insecure-secret-run-npm-setup";
}

export const env = {
  isProd,
  databaseUrl: process.env.DATABASE_URL || "",
  sourceAutoRefresh: process.env.SOURCE_AUTO_REFRESH !== "false",
  authSecret: authSecret(),
  // Demo mode defaults ON in development and OFF in production unless explicitly enabled.
  demoMode: isProd ? process.env.DEMO_MODE === "true" : process.env.DEMO_MODE !== "false",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  gemini: { apiKey: process.env.GEMINI_API_KEY || "", model: process.env.GEMINI_MODEL || "gemini-3.8-flash" },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    voiceId: process.env.ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9",
    voiceId2: process.env.ELEVENLABS_VOICE_ID_2 || "",
  },
  photon: { projectId: process.env.SPECTRUM_PROJECT_ID || "", projectSecret: process.env.SPECTRUM_PROJECT_SECRET || "" },
  cronSecret: process.env.CRON_SECRET || "",
  transitGtfsUrl: process.env.TRANSIT_GTFS_URL || "https://mychtransit.org/gtfs",
  // Radio station voice policy: "auto" uses ElevenLabs while budget allows, "browser" never calls it.
  radioVoice: process.env.RADIO_VOICE === "browser" ? "browser" : "auto",
  elevenlabsReserve: Math.max(0, Number(process.env.ELEVENLABS_RESERVE_CHARS) || 3000),
};

export const hasGemini = () => !!env.gemini.apiKey;
export const hasElevenLabs = () => !!env.elevenlabs.apiKey;
export const hasPhoton = () => !!(env.photon.projectId && env.photon.projectSecret);
