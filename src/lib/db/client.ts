import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

// One connection per process. Stored on globalThis so Next dev hot-reloads reuse it.
const g = globalThis as unknown as { __aquaPgDb?: DB; __aquaPgSql?: ReturnType<typeof postgres> };

export function databaseSchema(): string {
  const name = process.env.DATABASE_SCHEMA || "public";
  if (name !== "public" && !/^aqua_test_[a-z0-9_]+$/.test(name)) throw new Error("Invalid DATABASE_SCHEMA");
  return name;
}

export function getDb(): DB {
  if (g.__aquaPgDb) return g.__aquaPgDb;
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL must be a PostgreSQL URL. See docs/tiger-data-migration.md.");
  try { new URL(url); } catch { throw new Error("Invalid DATABASE_URL. Check its format in .env."); }
  const client = postgres(url, { max: 5, connect_timeout: 15, idle_timeout: 20, connection: { search_path: databaseSchema() } });
  g.__aquaPgSql = client;
  g.__aquaPgDb = drizzle(client, { schema });
  return g.__aquaPgDb;
}

/** Test helper: close and forget the cached connection. */
export async function resetDbForTests() {
  await g.__aquaPgSql?.end({ timeout: 5 });
  g.__aquaPgDb = undefined;
  g.__aquaPgSql = undefined;
}

export { schema };
