// One-shot local setup: .env + AUTH_SECRET, database + migrations, locations, demo users, demo posts,
// first ingestion of public campus feeds, and the Chapel Hill Transit GTFS download.
// Usage: npm run setup            (full)
//        npm run setup -- --seed-only   (skip network fetches)
//        npm run setup -- --reset       (wipe demo data first)

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = process.cwd();
const envPath = path.join(root, ".env");
const args = new Set(process.argv.slice(2));

function ensureEnvFile() {
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(path.join(root, ".env.example"), envPath);
    console.log("• Created .env from .env.example");
  }
  let text = fs.readFileSync(envPath, "utf8");
  if (/^AUTH_SECRET=\s*$/m.test(text) || !/^AUTH_SECRET=/m.test(text)) {
    const secret = randomBytes(32).toString("base64url");
    text = /^AUTH_SECRET=/m.test(text) ? text.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${secret}`) : text + `\nAUTH_SECRET=${secret}\n`;
    fs.writeFileSync(envPath, text);
    console.log("• Generated AUTH_SECRET");
  }
  process.loadEnvFile(envPath);
}

async function main() {
  ensureEnvFile();
  const { migratePostgres } = await import("./postgres-migrations.mjs");
  await migratePostgres(process.env.DATABASE_URL);
  console.log("• PostgreSQL database ready");

  const { seedDemoData } = await import("@/lib/services/demo");
  const seeded = await seedDemoData({ reset: args.has("--reset") });
  console.log(`• Seeded ${seeded.length} demo posts (${seeded.reduce((n, s) => n + s.matches.length, 0)} matches suggested)`);

  if (!args.has("--seed-only")) {
    const { refreshAllSources } = await import("@/lib/services/sources");
    const results = await refreshAllSources({ force: true });
    for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.id}: ${r.ok ? `${r.count} items` : r.error}`);
    const { loadTransit } = await import("@/lib/services/transit");
    const t = await loadTransit({ force: true });
    console.log(`• Transit: ${t.mode === "gtfs" ? `GTFS loaded, ${t.routes.length} routes / ${t.stops.length} stops (${t.feedVersion})` : "demo overlay (GTFS unavailable)"}`);
  }
  console.log("\nDone. Start the app with: npm run dev  →  http://localhost:3000");
}

main().then(async () => { const { resetDbForTests } = await import("@/lib/db/client"); await resetDbForTests(); }).catch((e) => { console.error("Setup failed:", e.code || e.name); process.exit(1); });
