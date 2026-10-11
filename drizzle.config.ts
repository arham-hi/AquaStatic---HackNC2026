import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle-pg",
  dbCredentials: { url: process.env.DATABASE_URL || process.env.TIGER_DATABASE_URL || "" },
});
