import fs from 'node:fs';
process.loadEnvFile('.env');
const url = process.env.TIGER_DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url) || /[\r\n"]/.test(url)) throw new Error('Invalid TIGER_DATABASE_URL');
try { new URL(url); } catch { throw new Error('Invalid TIGER_DATABASE_URL'); }
const reports = fs.readdirSync('data/backups').filter(file => file.endsWith('-verified.json'));
if (!reports.length) throw new Error('Complete and verify the data transfer before switching');
let text = fs.readFileSync('.env', 'utf8');
if ((text.match(/^DATABASE_URL=/gm) || []).length !== 1) throw new Error('Expected exactly one DATABASE_URL in .env');
const old = process.env.DATABASE_URL;
if (old?.startsWith('file:') && !/^SQLITE_DATABASE_URL=/m.test(text)) text += `\nSQLITE_DATABASE_URL="${old}"\n`;
text = text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${url}"`);
fs.writeFileSync('.env', text);
console.log('DATABASE_URL now uses Tiger Data. Original SQLite file and credentials for other services are preserved. Restart the app.');
