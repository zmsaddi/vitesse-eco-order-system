// One-shot script: copies production DB (READ-ONLY) → new Neon DB.
// Run from d:/Vitesse_eco_order_system (CWD must be project root so
// dynamic imports of lib/db/* resolve correctly).
//
// STRATEGY:
//   Step 1: Run initDatabase() on NEW (uses project's own schema code)
//   Step 2: Apply migrations from scripts/migrations/ + scripts/migrations/v1-2/
//   Step 3: Copy table data from PROD -> NEW via pg COPY protocol
//   Step 4: Reset sequences to MAX(id) on NEW
//
// Safety:
//   - PROD_URL is used ONLY for SELECT/COPY TO STDOUT queries (read-only).
//   - If PROD_URL resolves to the same host as NEW_URL, abort.

import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { from as copyFrom, to as copyTo } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';

const PROD_URL = process.env.PROD_URL;
const NEW_URL  = process.env.NEW_URL;

if (!PROD_URL || !NEW_URL) {
  console.error('Missing PROD_URL or NEW_URL env vars.');
  process.exit(1);
}

const prodHost = new URL(PROD_URL).hostname;
const newHost  = new URL(NEW_URL).hostname;
if (prodHost === newHost) {
  console.error(`ABORT: PROD_URL host == NEW_URL host (${prodHost}). Refusing.`);
  process.exit(1);
}

console.log(`PROD host: ${prodHost}`);
console.log(`NEW  host: ${newHost}`);

// --- Step 1: run initDatabase on NEW ---
process.env.POSTGRES_URL = NEW_URL;
process.env.POSTGRES_URL_NON_POOLING = NEW_URL;

console.log('\n=== Step 1: initDatabase() on NEW ===');
const mig = await import(pathToFileURL(resolve(process.cwd(), 'lib/db/_migrations.js')).href);
await mig.initDatabase();
console.log('initDatabase done.');

// --- Step 2: run SQL migrations ---
console.log('\n=== Step 2: apply SQL migrations on NEW ===');
const newClient = new Client({ connectionString: NEW_URL });
await newClient.connect();

async function applyMigrationsDir(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(resolve(dir, f), 'utf8');
    console.log(`  Applying ${f}...`);
    try {
      await newClient.query(sql);
    } catch (err) {
      if (/already exists|duplicate/i.test(err.message)) {
        console.log(`    (skipped: ${err.message.split('\n')[0]})`);
      } else {
        throw err;
      }
    }
  }
}
await applyMigrationsDir(resolve(process.cwd(), 'scripts/migrations'));
await applyMigrationsDir(resolve(process.cwd(), 'scripts/migrations/v1-2'));
console.log('Migrations done.');

// --- Step 3: copy data table-by-table ---
console.log('\n=== Step 3: copy table data PROD -> NEW ===');
const prodClient = new Client({ connectionString: PROD_URL });
await prodClient.connect();

// List all public tables in PROD, in FK dependency order.
// Use topological sort via pg_depend / information_schema.referential_constraints.
const { rows: tables } = await prodClient.query(`
  SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
`);

// Build dependency map: table -> [tables it depends on]
const { rows: fks } = await prodClient.query(`
  SELECT
    tc.table_name AS child,
    ccu.table_name AS parent
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
`);
const deps = new Map();
for (const { table_name } of tables) deps.set(table_name, new Set());
for (const { child, parent } of fks) {
  if (child !== parent && deps.has(child) && deps.has(parent)) {
    deps.get(child).add(parent);
  }
}
// Topological sort
const ordered = [];
const seen = new Set();
function visit(t, stack = new Set()) {
  if (seen.has(t)) return;
  if (stack.has(t)) return; // cycle — tolerate
  stack.add(t);
  for (const p of deps.get(t) || []) visit(p, stack);
  stack.delete(t);
  seen.add(t);
  ordered.push(t);
}
for (const { table_name } of tables) visit(table_name);

console.log(`Tables in FK order: ${ordered.join(', ')}`);

// Skip schema_migrations — recreated by our migrate runs
const skipTables = new Set(['schema_migrations']);

// For each table, determine common columns (prod ∩ new) and COPY in text
// format with explicit column list. This tolerates column-order drift and
// skips columns that exist on one side only.
async function commonColumns(table) {
  const q = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`;
  const p = (await prodClient.query(q, [table])).rows.map(r => r.column_name);
  const n = new Set((await newClient.query(q, [table])).rows.map(r => r.column_name));
  return p.filter(c => n.has(c));
}

for (const table of ordered) {
  if (skipTables.has(table)) { console.log(`  [skip] ${table}`); continue; }

  await newClient.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);

  const { rows: [{ count }] } = await prodClient.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
  if (count === 0) { console.log(`  ${table}: empty, skipped`); continue; }

  const cols = await commonColumns(table);
  if (cols.length === 0) { console.log(`  ${table}: no common columns, skipped`); continue; }
  const colList = cols.map(c => `"${c}"`).join(',');

  const outStream = prodClient.query(copyTo(`COPY "${table}" (${colList}) TO STDOUT WITH (FORMAT text)`));
  const inStream  = newClient.query(copyFrom(`COPY "${table}" (${colList}) FROM STDIN WITH (FORMAT text)`));
  try {
    await pipeline(outStream, inStream);
    console.log(`  ${table}: copied ${count} rows (${cols.length} cols)`);
  } catch (err) {
    console.log(`  ${table}: FAILED — ${err.message.split('\n')[0]}`);
  }
}

// --- Step 4: reset sequences ---
console.log('\n=== Step 4: reset sequences on NEW ===');
const { rows: seqs } = await newClient.query(`
  SELECT s.relname AS seq_name,
         t.relname AS table_name,
         a.attname AS column_name
  FROM pg_class s
  JOIN pg_depend d     ON d.objid = s.oid AND d.deptype = 'a'
  JOIN pg_class t      ON t.oid = d.refobjid
  JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
  JOIN pg_namespace n  ON n.oid = s.relnamespace
  WHERE s.relkind = 'S' AND n.nspname = 'public'
`);
for (const { seq_name, table_name, column_name } of seqs) {
  const q = `SELECT setval('"${seq_name}"', COALESCE((SELECT MAX("${column_name}") FROM "${table_name}"), 1), true)`;
  try {
    await newClient.query(q);
    console.log(`  ${seq_name} <- MAX("${table_name}"."${column_name}")`);
  } catch (err) {
    console.log(`  ${seq_name}: skipped (${err.message.split('\n')[0]})`);
  }
}

await prodClient.end();
await newClient.end();

console.log('\n=== DONE ===');
