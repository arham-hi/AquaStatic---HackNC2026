// Each file gets a unique PostgreSQL schema; public application data is never reset.
import fs from "node:fs";
import { afterAll } from "vitest";
import { createTestDatabase } from "../scripts/test-database.mjs";
import { resetDbForTests } from "@/lib/db/client";

export async function freshDb(name: string) {
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.TEST_DATABASE_URL || process.env.TIGER_DATABASE_URL;
  await resetDbForTests();
  const database = await createTestDatabase(name, url);
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SCHEMA = database.schema;
  process.env.DEMO_MODE = "true";
  process.env.GEMINI_API_KEY = "";
  process.env.ELEVENLABS_API_KEY = "";
  process.env.SPECTRUM_PROJECT_ID = "";
  process.env.SPECTRUM_PROJECT_SECRET = "";
  process.env.AUTH_SECRET = "test-secret-test-secret-test";
  process.env.SOURCE_AUTO_REFRESH = "false";
  afterAll(async () => { await resetDbForTests(); await database.cleanup(); });
}
