// Each test file gets a fresh SQLite database under data/test-*.db.
import fs from "node:fs";
import path from "node:path";
import { resetDbForTests } from "@/lib/db/client";

export function freshDb(name: string) {
  const file = path.resolve(process.cwd(), "data", `test-${name}.db`);
  for (const f of [file, `${file}-wal`, `${file}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  process.env.DATABASE_URL = `file:./data/test-${name}.db`;
  process.env.DEMO_MODE = "true";
  process.env.GEMINI_API_KEY = "";
  process.env.ELEVENLABS_API_KEY = "";
  process.env.SPECTRUM_PROJECT_ID = "";
  process.env.SPECTRUM_PROJECT_SECRET = "";
  process.env.AUTH_SECRET = "test-secret-test-secret-test";
  resetDbForTests();
}
