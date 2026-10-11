import fs from 'node:fs';
import { migratePostgres } from './postgres-migrations.mjs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
try {
  const url = process.env.DATABASE_URL?.startsWith('postgres') ? process.env.DATABASE_URL : process.env.TIGER_DATABASE_URL;
  await migratePostgres(url, { adoptImport: process.argv.includes('--adopt-import') });
  console.log('PostgreSQL migrations verified and applied.');
} catch (error) {
  console.error('Database migration failed:', error.code || error.name);
  if (error.message?.startsWith('Imported schema') || error.message?.startsWith('Missing imported')) console.error(error.message);
  process.exitCode = 1;
}
