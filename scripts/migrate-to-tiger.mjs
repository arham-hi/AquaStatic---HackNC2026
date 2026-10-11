import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import postgres from 'postgres';
import { readSnapshot, tableSql, fingerprint, transfer } from './sqlite-transfer.mjs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceOption = args.find(arg => arg.startsWith('--source='));
const sqliteUrl = process.env.SQLITE_DATABASE_URL || (process.env.DATABASE_URL?.startsWith('file:') ? process.env.DATABASE_URL : 'file:./data/aqua.db');
const sourcePath = path.resolve(sourceOption?.slice(9) || sqliteUrl.replace(/^file:/, ''));
if (!fs.existsSync(sourcePath)) throw new Error('SQLite source file does not exist');
fs.mkdirSync('data/backups', { recursive: true });
const backupPath = path.resolve('data/backups', `aqua-before-tiger-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
try { await source.backup(backupPath); } finally { source.close(); }
const snapshot = new Database(backupPath, { readonly: true });
let tables;
try { tables = readSnapshot(snapshot); } finally { snapshot.close(); }
console.log('Consistent SQLite backup:', backupPath);
console.table(tables.map(table => ({ table: table.name, records: table.rows.length })));
// A dry run checks every value and DDL statement without touching the remote service.
for (const table of tables) { tableSql(table); fingerprint(table.rows); }
if (dryRun) {
  console.log('Dry run passed. Original SQLite file and .env are unchanged.');
} else {
  const url = process.env.TIGER_DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('Set TIGER_DATABASE_URL in .env');
  const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5 });
  try {
    const verified = await transfer(sql, tables);
    const reportPath = backupPath.replace(/\.db$/, '-verified.json');
    fs.writeFileSync(reportPath, JSON.stringify({ source: sourcePath, backup: backupPath, importedAt: new Date().toISOString(), tables: verified }, null, 2));
    console.log(`Imported and verified ${verified.reduce((sum, table) => sum + table.rows, 0)} records across ${verified.length} tables.`);
    console.log('Verification report:', reportPath);
    console.log('The SQLite source and app database setting have been preserved. Run npm run db:migrate -- --adopt-import before configuring DATABASE_URL for PostgreSQL.');
  } catch (error) {
    // PostgreSQL errors may contain sensitive connection details or student content.
    console.error('Import failed. SQLite and .env are unchanged; the transaction is rolled back.');
    console.error(error.code || (error.message?.includes('Destination already') ? error.message : error.message?.includes('Verification failed') ? error.message : error.name));
    process.exitCode = 1;
  } finally { await sql.end({ timeout: 5 }); }
}
