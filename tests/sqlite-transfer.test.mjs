import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readSnapshot, tableSql, fingerprint, convertedValue, transfer } from '../scripts/sqlite-transfer.mjs';

test('preserves JSON, Unicode, booleans, timestamps, precise coordinates and relationships', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE users (id text PRIMARY KEY, interests text NOT NULL DEFAULT '[]', is_demo integer NOT NULL DEFAULT 0, created_at integer NOT NULL);
    CREATE TABLE posts (id text PRIMARY KEY, author_id text REFERENCES users(id), description text NOT NULL, attributes text NOT NULL DEFAULT '{}', expires_at integer, lat real);
    CREATE UNIQUE INDEX posts_unique ON posts(author_id, description);`);
  sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('u1', '["food","community"]', 1, 1791684823225);
  sqlite.prepare('INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?)').run('p1', 'u1', 'Free pizza 🍕', '{"item":"chair","nested":{"x":1}}', null, 35.9123456789012);
  const tables = readSnapshot(sqlite);
  assert.deepEqual(tables.map(table => table.name), ['users', 'posts']);
  assert.deepEqual(tables[0].rows[0].interests, ['food', 'community']);
  assert.equal(tables[0].rows[0].is_demo, true);
  assert.equal(tables[0].rows[0].created_at.getTime(), 1791684823225);
  assert.equal(tables[1].rows[0].description, 'Free pizza 🍕');
  assert.equal(tables[1].rows[0].expires_at, null);
  assert.equal(tables[1].rows[0].lat, 35.9123456789012);
  assert.match(tableSql(tables[1])[0], /REFERENCES "users" \("id"\)/);
  assert.match(tableSql(tables[1])[0], /"attributes" jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(tableSql(tables[0])[0], /timestamp\(3\) with time zone/);
  assert.match(tableSql(tables[1])[1], /CREATE UNIQUE INDEX/);
  sqlite.close();
});

test('fingerprints compare every field regardless of row or JSON key order', () => {
  const a = [{ id: 'b', attributes: { z: 2, a: 1 }, created_at: new Date(1234) }, { id: 'a' }];
  const b = [{ id: 'a' }, { created_at: new Date(1234), attributes: { a: 1, z: 2 }, id: 'b' }];
  assert.equal(fingerprint(a), fingerprint(b));
  b[1].attributes.z = 3;
  assert.notEqual(fingerprint(a), fingerprint(b));
});

test('rejects invalid SQLite booleans and JSON instead of silently corrupting data', () => {
  assert.throws(() => convertedValue({ name: 'is_demo', type: 'INTEGER' }, 2), /Invalid boolean/);
  assert.throws(() => convertedValue({ name: 'attributes', type: 'TEXT' }, '{bad'), SyntaxError);
});

test('refuses existing destination tables before any DDL or inserts', async () => {
  let mutations = 0;
  const tx = async (strings) => strings.join('').includes('pg_tables') ? [{ tablename: 'posts' }] : [];
  tx.unsafe = async () => { mutations++; return []; };
  const sql = { begin: callback => callback(tx) };
  await assert.rejects(transfer(sql, [{ name: 'posts' }]), /refusing to overwrite/);
  assert.equal(mutations, 0);
});

test('verification failure escapes the transaction so PostgreSQL rolls it back', async () => {
  const table = { name: 'users', columns: [{ name: 'id', type: 'TEXT', pk: 1, notnull: 1, dflt_value: null }], foreignKeys: [], indexes: [], rows: [{ id: 'u1' }] };
  let committed = false;
  const tx = async () => [];
  tx.unsafe = async query => query.startsWith('SELECT') ? [{ id: 'wrong-id' }] : [];
  tx.typed = value => value;
  const sql = { begin: async callback => { const result = await callback(tx); committed = true; return result; } };
  await assert.rejects(transfer(sql, [table]), /Verification failed/);
  assert.equal(committed, false);
});
