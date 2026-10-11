// Starts a fresh dev server on port 3100 against an isolated database for Playwright.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createTestDatabase } from "./test-database.mjs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.TEST_DATABASE_URL || process.env.TIGER_DATABASE_URL;
const database = await createTestDatabase("e2e", url);

const env = { ...process.env, DATABASE_URL: url, DATABASE_SCHEMA: database.schema, SOURCE_AUTO_REFRESH: "false", AQUA_PREVIEW: "true", DEMO_MODE: "true", AUTH_SECRET: "e2e-secret-e2e-secret-e2e", PORT: "3100", GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "", SPECTRUM_PROJECT_ID: "", SPECTRUM_PROJECT_SECRET: "" };
// Prefer the production build when one exists (faster, no on-demand compiles); fall back to the dev server.
const hasBuild = fs.existsSync(path.resolve(".next-preview/BUILD_ID"));
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), hasBuild ? "start" : "dev", "-p", "3100"], { env, stdio: "inherit" });
child.on("exit", async (code) => { await database.cleanup(); process.exit(code ?? 0); });
process.on("SIGTERM", () => child.kill());
process.on("SIGINT", () => child.kill());
