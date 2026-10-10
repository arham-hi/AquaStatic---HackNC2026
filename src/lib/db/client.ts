import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

// One connection per process. Stored on globalThis so Next dev hot-reloads reuse it.
const g = globalThis as unknown as { __aquaDb?: DB; __aquaSqlite?: Database.Database };

export function dbFilePath(): string {
  const url = (process.env.DATABASE_URL || "file:./data/aqua.db").replace(/^file:/, "");
  return path.resolve(process.cwd(), url);
}

export function getDb(): DB {
  if (g.__aquaDb) return g.__aquaDb;
  const file = dbFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  g.__aquaDb = db;
  g.__aquaSqlite = sqlite;
  return db;
}

/** Test helper: close and forget the cached connection. */
export function resetDbForTests() {
  g.__aquaSqlite?.close();
  g.__aquaDb = undefined;
  g.__aquaSqlite = undefined;
}

export { schema };
