import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

export async function createTestDatabase(name, url) {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('Set TEST_DATABASE_URL or TIGER_DATABASE_URL to run database tests');
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Invalid test name');
  const schema = `aqua_test_${name}_${randomBytes(6).toString('hex')}`;
  const sql = postgres(url, { max: 1, connect_timeout: 15 });
  try {
    await sql.begin(async tx => {
      await tx.unsafe(`CREATE SCHEMA "${schema}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${schema}"`);
      const files = fs.readdirSync('drizzle-pg').filter(file => file.endsWith('.sql')).sort();
      for (const file of files) {
        const statements = fs.readFileSync(path.join('drizzle-pg', file), 'utf8').replaceAll('"public".', `"${schema}".`).split('--> statement-breakpoint');
        for (const statement of statements) if (statement.trim()) await tx.unsafe(statement);
      }
    });
  } finally { await sql.end({ timeout: 5 }); }
  return {
    schema,
    async cleanup() {
      if (!/^aqua_test_[a-z0-9_]+$/.test(schema)) throw new Error('Unsafe cleanup target');
      const cleanup = postgres(url, { max: 1, connect_timeout: 15 });
      try { await cleanup.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await cleanup.end({ timeout: 5 }); }
    },
  };
}
