// db/migrate.js
// Usage:
//   node db/migrate.js           → apply pending migrations
//   node db/migrate.js --seed    → apply pending migrations, then seed
//   node db/migrate.js --fresh   → DROP everything first (dev only!)

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEEDS_DIR      = path.join(__dirname, 'seeds');

async function ensureRegistry(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS seed_runs (
      id         SERIAL PRIMARY KEY,
      filename   TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedSet(client, table) {
  const { rows } = await client.query(`SELECT filename FROM ${table}`);
  return new Set(rows.map(r => r.filename));
}

async function applyFolder(client, dir, registryTable) {
  if (!fs.existsSync(dir)) {
    console.log(`  (folder ${dir} does not exist, skipping)`);
    return;
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log(`  (no .sql files in ${dir})`);
    return;
  }
  const applied = await appliedSet(client, registryTable);

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`  apply ${file} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO ${registryTable} (filename) VALUES ($1)`,
        [file]
      );
      await client.query('COMMIT');
      console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
}

async function fresh(client) {
  console.log('⚠  Dropping public schema (fresh mode)');
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
}

async function main() {
  const args = process.argv.slice(2);
  const doSeed  = args.includes('--seed');
  const doFresh = args.includes('--fresh');

  const client = await pool.connect();
  try {
    if (doFresh) await fresh(client);

    await ensureRegistry(client);

    console.log('\n▶ Migrations');
    await applyFolder(client, MIGRATIONS_DIR, 'schema_migrations');

    if (doSeed) {
      console.log('\n▶ Seeds');
      await applyFolder(client, SEEDS_DIR, 'seed_runs');
    }

    console.log('\n✓ Done\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n✗', err.message);
  process.exit(1);
});
