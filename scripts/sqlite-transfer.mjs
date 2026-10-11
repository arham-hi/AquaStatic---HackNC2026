import crypto from 'node:crypto';

const jsonColumns = new Set(['interests', 'help_subjects', 'notification_prefs', 'aliases', 'keywords', 'attributes', 'explanation', 'metadata', 'segments', 'sources']);
const booleanColumns = new Set(['is_demo', 'requester_accepted', 'offerer_accepted', 'enabled', 'healthy', 'includes_demo']);
export const quote = name => '"' + name.replaceAll('"', '""') + '"';

export function columnKind(column) {
  if (jsonColumns.has(column.name)) return 'jsonb';
  if (booleanColumns.has(column.name)) return 'boolean';
  if (column.name.endsWith('_at')) return 'timestamp(3) with time zone';
  if (column.type.toUpperCase() === 'INTEGER') return 'integer';
  if (column.type.toUpperCase() === 'REAL') return 'double precision';
  if (column.type.toUpperCase() === 'TEXT') return 'text';
  throw new Error(`Unsupported SQLite type: ${column.name} (${column.type})`);
}

export function convertedValue(column, value) {
  if (value === null) return null;
  const kind = columnKind(column);
  if (kind === 'jsonb') return JSON.parse(value);
  if (kind === 'boolean') {
    if (value !== 0 && value !== 1) throw new Error(`Invalid boolean: ${column.name}`);
    return value === 1;
  }
  if (kind.startsWith('timestamp')) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error(`Invalid timestamp: ${column.name}`);
    return date;
  }
  return value;
}

export function readSnapshot(sqlite) {
  if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('SQLite integrity check failed');
  if (sqlite.pragma('foreign_key_check').length) throw new Error('SQLite contains invalid foreign keys');
  const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name").all().map(row => row.name);
  const tables = names.map(name => {
    const columns = sqlite.pragma(`table_info(${quote(name)})`);
    const foreignKeys = sqlite.pragma(`foreign_key_list(${quote(name)})`);
    const indexes = sqlite.pragma(`index_list(${quote(name)})`).filter(index => index.origin !== 'pk').map(index => ({
      ...index,
      columns: sqlite.pragma(`index_info(${quote(index.name)})`).map(column => column.name),
    }));
    if (indexes.some(index => index.partial || index.columns.some(column => !column))) throw new Error(`Unsupported index on ${name}`);
    const rows = sqlite.prepare(`SELECT * FROM ${quote(name)}`).all().map(row => Object.fromEntries(columns.map(column => [column.name, convertedValue(column, row[column.name])])));
    return { name, columns, foreignKeys, indexes, rows };
  });
  // Parents must be created/imported before their children.
  const ordered = [];
  const pending = [...tables];
  while (pending.length) {
    const index = pending.findIndex(table => table.foreignKeys.every(fk => ordered.some(parent => parent.name === fk.table) || fk.table === table.name));
    if (index === -1) throw new Error('Cyclic or missing foreign-key dependencies');
    ordered.push(pending.splice(index, 1)[0]);
  }
  return ordered;
}

function defaultSql(column) {
  if (column.dflt_value === null) return '';
  const kind = columnKind(column);
  if (kind === 'boolean') return ` DEFAULT ${column.dflt_value === '1' ? 'true' : 'false'}`;
  if (kind.startsWith('timestamp')) throw new Error(`Unsupported timestamp default: ${column.name}`);
  return ` DEFAULT ${column.dflt_value}${kind === 'jsonb' ? '::jsonb' : ''}`;
}

export function tableSql(table) {
  const definitions = table.columns.map(column => `${quote(column.name)} ${columnKind(column)}${column.notnull || column.pk ? ' NOT NULL' : ''}${defaultSql(column)}`);
  const primary = table.columns.filter(column => column.pk).sort((a,b) => a.pk - b.pk);
  if (primary.length) definitions.push(`PRIMARY KEY (${primary.map(column => quote(column.name)).join(', ')})`);
  for (const fk of table.foreignKeys) {
    if (fk.seq !== 0) throw new Error(`Unsupported composite foreign key: ${table.name}`);
    definitions.push(`FOREIGN KEY (${quote(fk.from)}) REFERENCES ${quote(fk.table)} (${quote(fk.to)}) ON UPDATE ${fk.on_update} ON DELETE ${fk.on_delete}`);
  }
  const statements = [`CREATE TABLE ${quote(table.name)} (${definitions.join(', ')})`];
  for (const index of table.indexes) {
    const name = index.name.startsWith('sqlite_autoindex_') ? `${table.name}_unique_${index.seq}` : index.name;
    statements.push(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(name)} ON ${quote(table.name)} (${index.columns.map(quote).join(', ')})`);
  }
  return statements;
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function fingerprint(rows) {
  const strings = rows.map(row => JSON.stringify(canonical(row))).sort();
  return crypto.createHash('sha256').update(JSON.stringify(strings)).digest('hex');
}

export async function transfer(sql, tables) {
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(742913026)`;
    await tx`SET LOCAL search_path TO public`;
    const existing = await tx`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    const conflicts = existing.filter(row => tables.some(table => table.name === row.tablename));
    if (conflicts.length) throw new Error('Destination already contains application tables; refusing to overwrite any data');
    const verified = [];
    for (const table of tables) {
      for (const statement of tableSql(table)) await tx.unsafe(statement);
      // Explicit casts preserve JSON objects/arrays and millisecond timestamps.
      for (let offset = 0; offset < table.rows.length; offset += 100) {
        const batch = table.rows.slice(offset, offset + 100);
        const parameters = [];
        const values = batch.map(row => '(' + table.columns.map(column => {
          const value = row[column.name];
          const kind = columnKind(column);
          const serialized = value === null ? null : kind === 'jsonb' ? JSON.stringify(value) : value instanceof Date ? value.toISOString() : String(value);
          // Bind as text: inferred jsonb parameters would JSON-stringify this JSON again.
          parameters.push(tx.typed(serialized, 25));
          return `$${parameters.length}::${kind}`;
        }).join(', ') + ')').join(', ');
        await tx.unsafe(`INSERT INTO ${quote(table.name)} (${table.columns.map(column => quote(column.name)).join(', ')}) VALUES ${values}`, parameters);
      }
      const actual = await tx.unsafe(`SELECT * FROM ${quote(table.name)}`);
      if (actual.length !== table.rows.length || fingerprint(actual) !== fingerprint(table.rows)) {
        const sample = table.rows[0];
        const received = actual.find(row => row.id === sample?.id) || actual[0];
        const differing = table.columns.filter(column => JSON.stringify(canonical(sample?.[column.name])) !== JSON.stringify(canonical(received?.[column.name]))).map(column => `${column.name} (${typeof sample?.[column.name]} -> ${typeof received?.[column.name]})`);
        throw new Error(`Verification failed for ${table.name}; import rolled back. Differing fields: ${differing.join(', ')}`);
      }
      verified.push({ table: table.name, rows: actual.length, sha256: fingerprint(actual) });
    }
    return verified;
  });
}
