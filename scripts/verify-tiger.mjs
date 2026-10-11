import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import postgres from 'postgres';
import { readSnapshot, fingerprint, quote } from './sqlite-transfer.mjs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const files = fs.readdirSync('data/backups').filter(file => file.endsWith('-verified.json')).sort();
if (!files.length) throw new Error('No successful transfer report found');
const report = JSON.parse(fs.readFileSync(path.join('data/backups', files.at(-1)), 'utf8'));
const sqlite = new Database(report.source, { readonly: true });
let current;
try { current = readSnapshot(sqlite); } finally { sqlite.close(); }
const sql = postgres(process.env.TIGER_DATABASE_URL, { max: 1, connect_timeout: 15 });
try {
  for (const table of report.tables) {
    const rows = await sql.unsafe(`SELECT * FROM public.${quote(table.table)}`);
    if (rows.length !== table.rows || fingerprint(rows) !== table.sha256) throw new Error(`Tiger verification mismatch: ${table.table}`);
    const original = current.find(row => row.name === table.table);
    if (!original || fingerprint(original.rows) !== table.sha256) throw new Error(`SQLite changed after the transfer: ${table.table}`);
  }
  console.log(`All ${report.tables.reduce((sum, table) => sum + table.rows, 0)} records still match the source SQLite database and verified backup.`);
} catch(error) {
  console.error(error.message?.startsWith('Tiger verification') || error.message?.startsWith('SQLite changed') ? error.message : error.code || error.name);
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
