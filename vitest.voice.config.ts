import { defineConfig } from "vitest/config";
import path from "node:path";

// Browser simulation is separate from DB tests; needs Chrome, no API keys or mic.
export default defineConfig({
  test: { include: ["tests/call-speech.test.ts", "tests/call-playback.test.ts"], environment: "node", testTimeout: 20000 },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
