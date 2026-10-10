// Starts a fresh dev server on port 3100 against an isolated database for Playwright.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const db = path.resolve("data/e2e.db");
for (const f of [db, db + "-wal", db + "-shm"]) if (fs.existsSync(f)) fs.unlinkSync(f);

const env = { ...process.env, DATABASE_URL: "file:./data/e2e.db", DEMO_MODE: "true", AUTH_SECRET: "e2e-secret-e2e-secret-e2e", PORT: "3100", GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "", SPECTRUM_PROJECT_ID: "", SPECTRUM_PROJECT_SECRET: "" };
const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
// Prefer the production build when one exists (faster, no on-demand compiles); fall back to the dev server.
const hasBuild = fs.existsSync(path.resolve(".next/BUILD_ID"));
const child = spawn(cmd, ["next", hasBuild ? "start" : "dev", "-p", "3100"], { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => child.kill());
process.on("SIGINT", () => child.kill());
