import fs from 'node:fs';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';

export async function migratePostgres(url, { adoptImport = false } = {}) {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  const migrations = readMigrationFiles({ migrationsFolder: 'drizzle-pg' });
  const sql = postgres(url, { max: 1, connect_timeout: 15 });
  try {
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(742913026)`;
      await tx`CREATE SCHEMA IF NOT EXISTS drizzle`;
      await tx`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
      const history = await tx`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC`;
      let lastApplied = Number(history[0]?.created_at || 0);
      if (adoptImport && !history.length) {
        const baseline = JSON.parse(fs.readFileSync('drizzle-pg/meta/0000_snapshot.json', 'utf8'));
        const tables = Object.values(baseline.tables);
        // Imported tables must match the baseline before marking it as applied.
        for (const table of tables) {
          const columns = await tx`SELECT column_name, data_type, is_nullable, datetime_precision FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table.name}`;
          const expected = Object.values(table.columns);
          if (columns.length !== expected.length || expected.some(column => {
            const actual = columns.find(value => value.column_name === column.name);
            const type = column.type.startsWith('timestamp') ? 'timestamp with time zone' : column.type;
            return !actual || actual.data_type !== type || (column.notNull && actual.is_nullable !== 'NO') || (type.startsWith('timestamp') && actual.datetime_precision !== 3);
          })) throw new Error(`Imported schema does not match the PostgreSQL baseline: ${table.name}`);
          // Align generated constraint names so future Drizzle migrations can reference them.
          const constraints = await tx`SELECT c.conname, c.contype, ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND t.relname = ${table.name}`;
          const wanted = [...Object.values(table.foreignKeys).map(key => ({ name: key.name, columns: key.columnsFrom, type: 'f' })), ...Object.values(table.compositePrimaryKeys).map(key => ({ ...key, type: 'p' }))];
          for (const key of wanted) {
            const actual = constraints.find(constraint => constraint.contype === key.type && JSON.stringify(constraint.columns) === JSON.stringify(key.columns));
            if (!actual) throw new Error(`Missing imported constraint: ${table.name}`);
            if (actual.conname !== key.name) await tx.unsafe(`ALTER TABLE "${table.name}" RENAME CONSTRAINT "${actual.conname}" TO "${key.name}"`);
          }
        }
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migrations[0].hash}, ${migrations[0].folderMillis})`;
        lastApplied = migrations[0].folderMillis;
      }
      for (const migration of migrations) if (migration.folderMillis > lastApplied) {
        for (const statement of migration.sql) if (statement.trim()) await tx.unsafe(statement);
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`;
      }
    });
  } finally { await sql.end({ timeout: 5 }); }
}
