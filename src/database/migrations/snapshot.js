/**
 * Point-in-time JSON backup of every table touched by a migration.
 *
 * Built on the pg client already in the project because pg_dump is not
 * necessarily installed, and because this needs to run anywhere the app runs.
 *
 * Each table is written to backups/<timestamp>/<table>.json and then read back
 * and counted, so a truncated or partially-flushed write cannot be mistaken for
 * a good backup. A manifest records the counts for a quick integrity check later.
 *
 * Usage:
 *   node src/database/migrations/snapshot.js
 *   node src/database/migrations/snapshot.js --out backups/before-uuid
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');

// Everything the users.id -> UUID migration reads or writes.
const TABLES = [
  'users',
  'otps',
  'meters',
  'meter_types',
  'api_keys',
  'discos',
  'import_batches',
  'export_batches',
  'assignment_batches',
  'meter_assignments',
  'installation_request',
  'jed_customer_request'
];

const snapshot = async ({ outDir, tables = TABLES } = {}) => {
  const dir = outDir || path.join('backups', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });

  const client = await pool.connect();
  const manifest = { createdAt: new Date().toISOString(), database: process.env.DB_NAME, tables: {} };

  try {
    console.log(`\nWriting snapshot to ${dir}\n`);

    for (const table of tables) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );

      if (exists.rows.length === 0) {
        console.log(`  ${table.padEnd(22)} skipped (does not exist)`);
        manifest.tables[table] = { skipped: true };
        continue;
      }

      const { rows } = await client.query(`SELECT * FROM ${table}`);
      const file = path.join(dir, `${table}.json`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2));

      // Read it back rather than trusting the write: a truncated file must not
      // pass as a usable backup.
      const readBack = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (readBack.length !== rows.length) {
        throw new Error(`${table}: wrote ${rows.length} rows but read back ${readBack.length}`);
      }

      const bytes = fs.statSync(file).size;
      manifest.tables[table] = { rows: rows.length, bytes };
      console.log(`  ${table.padEnd(22)} ${String(rows.length).padStart(6)} rows  ${(bytes / 1024).toFixed(0)} KB`);
    }

    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const total = Object.values(manifest.tables).reduce((n, t) => n + (t.rows || 0), 0);
    console.log(`\nSnapshot complete: ${total} rows across ${Object.keys(manifest.tables).length} tables`);
    console.log(`Location: ${path.resolve(dir)}\n`);

    return { dir, manifest };
  } finally {
    client.release();
  }
};

if (require.main === module) {
  const outIndex = process.argv.indexOf('--out');
  const outDir = outIndex !== -1 ? process.argv[outIndex + 1] : undefined;

  snapshot({ outDir })
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\nSNAPSHOT FAILED:', error.message);
      process.exit(1);
    });
}

module.exports = { snapshot, TABLES };
