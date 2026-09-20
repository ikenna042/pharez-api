/**
 * Migrate users.id from INTEGER (serial) to UUID.
 *
 * Background: migrate.js has declared users.id as UUID since commit 74a83f0, but
 * every statement there is CREATE TABLE IF NOT EXISTS, so the change never
 * reached an existing database. Live is still INTEGER. This migration makes the
 * database match the declaration.
 *
 * The whole thing runs in ONE transaction, so a failure at any point leaves the
 * database exactly as it was.
 *
 * The referencing columns are discovered from the live foreign-key catalog rather
 * than hardcoded, so nothing is missed if the schema has drifted.
 *
 * Usage:
 *   node src/database/migrations/001-users-id-to-uuid.js --dry-run   (verify, then roll back)
 *   node src/database/migrations/001-users-id-to-uuid.js             (commit)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');

// pg_constraint.confdeltype -> SQL clause
const ON_DELETE = { a: '', r: ' ON DELETE RESTRICT', c: ' ON DELETE CASCADE', n: ' ON DELETE SET NULL', d: ' ON DELETE SET DEFAULT' };

const log = (msg) => console.log(msg);

/** Every column with a foreign key onto users(id), with the metadata needed to rebuild it. */
const discoverReferences = async (client) => {
  const { rows } = await client.query(`
    SELECT con.conname          AS constraint_name,
           src.relname          AS table_name,
           att.attname          AS column_name,
           con.confdeltype      AS on_delete,
           att.attnotnull       AS not_null
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = k.attnum
    WHERE con.contype = 'f' AND tgt.relname = 'users' AND tgt.relnamespace = 'public'::regnamespace
    ORDER BY src.relname, att.attname
  `);

  return rows;
};

/** Index definitions covering those columns; dropping a column drops its indexes. */
const discoverIndexes = async (client, references) => {
  const tables = [...new Set(references.map((r) => r.table_name))];
  if (tables.length === 0) return [];

  const { rows } = await client.query(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [tables]
  );

  const wanted = new Set(references.map((r) => `${r.table_name}.${r.column_name}`));

  return rows.filter((idx) => {
    const inside = idx.indexdef.slice(idx.indexdef.indexOf('('));
    return references.some(
      (r) => r.table_name === idx.tablename &&
             wanted.has(`${r.table_name}.${r.column_name}`) &&
             new RegExp(`\\b${r.column_name}\\b`).test(inside)
    );
  });
};

const run = async ({ dryRun, mapFile }) => {
  const client = await pool.connect();

  try {
    log(dryRun
      ? '\n=== DRY RUN: every change will be rolled back ===\n'
      : '\n=== MIGRATING users.id -> UUID ===\n');

    const currentType = await client.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
    `);

    if (currentType.rows.length === 0) throw new Error('users table not found');
    if (currentType.rows[0].data_type === 'uuid') {
      log('users.id is already UUID - nothing to do.');
      return;
    }

    const references = await discoverReferences(client);
    const indexes = await discoverIndexes(client, references);

    log(`Found ${references.length} foreign key column(s) onto users(id)`);
    references.forEach((r) => log(`  ${r.table_name}.${r.column_name}${r.not_null ? '  NOT NULL' : ''}${ON_DELETE[r.on_delete]}`));
    log(`Found ${indexes.length} index(es) to recreate`);
    indexes.forEach((i) => log(`  ${i.indexname}`));

    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    // 1. Give every user a UUID alongside their integer id.
    log('\n[1] users: adding id_uuid and backfilling');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS id_uuid UUID');
    await client.query('UPDATE users SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL');
    await client.query('ALTER TABLE users ALTER COLUMN id_uuid SET NOT NULL');
    const userCount = await client.query('SELECT COUNT(*)::int c FROM users');
    log(`    ${userCount.rows[0].c} user(s) given a UUID`);

    // 2. Persist the old -> new mapping before anything is dropped.
    //
    // This is the one artifact that cannot be reconstructed afterwards. Any
    // external holder of an integer user id -- a mobile app cache, a partner
    // integration, correlation against old logs -- needs this table to find its
    // way to the new id. Ten rows, and it makes the migration auditable.
    log('\n[2] recording the id mapping');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users_id_migration_map (
        old_id INTEGER PRIMARY KEY,
        new_id UUID NOT NULL,
        email VARCHAR(255),
        migrated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      INSERT INTO users_id_migration_map (old_id, new_id, email)
      SELECT id, id_uuid, email FROM users
      ON CONFLICT (old_id) DO NOTHING
    `);

    const mapping = await client.query('SELECT old_id, new_id, email FROM users_id_migration_map ORDER BY old_id');
    log(`    ${mapping.rows.length} mapping(s) recorded in users_id_migration_map`);
    mapping.rows.forEach((m) => log(`      ${String(m.old_id).padEnd(4)} -> ${m.new_id}  ${m.email}`));

    // Also drop it on disk next to the snapshot, so it survives even if the
    // database itself is later restored from an older point.
    if (mapFile) {
      fs.mkdirSync(path.dirname(mapFile), { recursive: true });
      fs.writeFileSync(mapFile, JSON.stringify(mapping.rows, null, 2));
      log(`    written to ${mapFile}`);
    }

    // 3. Translate every referencing column through that mapping.
    log('\n[3] translating referencing columns');
    for (const ref of references) {
      const tmp = `${ref.column_name}__uuid`;
      await client.query(`ALTER TABLE ${ref.table_name} ADD COLUMN IF NOT EXISTS ${tmp} UUID`);
      await client.query(
        `UPDATE ${ref.table_name} t SET ${tmp} = u.id_uuid FROM users u WHERE u.id = t.${ref.column_name}`
      );

      // Any non-null value that failed to map points at a user that does not
      // exist. Abort rather than silently discard the reference.
      const orphans = await client.query(
        `SELECT COUNT(*)::int c FROM ${ref.table_name}
         WHERE ${ref.column_name} IS NOT NULL AND ${tmp} IS NULL`
      );
      if (orphans.rows[0].c > 0) {
        throw new Error(
          `${ref.table_name}.${ref.column_name} has ${orphans.rows[0].c} value(s) with no matching user; aborting`
        );
      }

      const moved = await client.query(`SELECT COUNT(${tmp})::int c FROM ${ref.table_name}`);
      log(`    ${ref.table_name}.${ref.column_name}: ${moved.rows[0].c} reference(s) mapped`);
    }

    // 4. jed_customer_request.vendor_id stores a user id as text with no FK, so
    //    the catalog above does not see it. Rewrite it so attribution on
    //    completed JED installations survives. Data only: no JED schema or code change.
    log('\n[4] jed_customer_request.vendor_id (text, no FK)');
    const vendor = await client.query(`
      UPDATE jed_customer_request j
      SET vendor_id = u.id_uuid::text
      FROM users u
      WHERE j.vendor_id IS NOT NULL AND j.vendor_id ~ '^[0-9]+$' AND u.id = j.vendor_id::integer
      RETURNING j.id
    `);
    log(`    ${vendor.rowCount} row(s) repointed to the new UUID`);

    // 4. Drop the foreign keys so the old column can go.
    log('\n[5] dropping foreign keys');
    for (const ref of references) {
      await client.query(`ALTER TABLE ${ref.table_name} DROP CONSTRAINT ${ref.constraint_name}`);
    }
    log(`    ${references.length} constraint(s) dropped`);

    // 5. Swap each referencing column.
    log('\n[6] swapping referencing columns');
    for (const ref of references) {
      await client.query(`ALTER TABLE ${ref.table_name} DROP COLUMN ${ref.column_name}`);
      await client.query(
        `ALTER TABLE ${ref.table_name} RENAME COLUMN ${ref.column_name}__uuid TO ${ref.column_name}`
      );
    }

    // 6. Swap the primary key itself.
    log('\n[7] users: swapping the primary key');
    await client.query('ALTER TABLE users DROP CONSTRAINT users_pkey');
    await client.query('ALTER TABLE users DROP COLUMN id');
    await client.query('ALTER TABLE users RENAME COLUMN id_uuid TO id');
    await client.query('ALTER TABLE users ADD PRIMARY KEY (id)');
    await client.query('ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid()');
    await client.query('DROP SEQUENCE IF EXISTS users_id_seq');

    // 7. Put the foreign keys back, preserving their delete behaviour.
    log('\n[8] restoring foreign keys');
    for (const ref of references) {
      await client.query(
        `ALTER TABLE ${ref.table_name}
         ADD CONSTRAINT ${ref.constraint_name}
         FOREIGN KEY (${ref.column_name}) REFERENCES users(id)${ON_DELETE[ref.on_delete]}`
      );
    }

    // 8. Restore NOT NULL where it applied.
    log('\n[9] restoring NOT NULL');
    for (const ref of references.filter((r) => r.not_null)) {
      await client.query(`ALTER TABLE ${ref.table_name} ALTER COLUMN ${ref.column_name} SET NOT NULL`);
      log(`    ${ref.table_name}.${ref.column_name}`);
    }

    // 9. Recreate the indexes that went with the dropped columns.
    log('\n[10] recreating indexes');
    for (const idx of indexes) {
      await client.query(idx.indexdef);
      log(`    ${idx.indexname}`);
    }

    // 10. Prove the result before deciding to keep it.
    log('\n[11] verification');
    const finalType = await client.query(`
      SELECT data_type, column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users' AND column_name='id'
    `);
    log(`    users.id is now ${finalType.rows[0].data_type}, default ${finalType.rows[0].column_default}`);

    const finalRefs = await discoverReferences(client);
    log(`    ${finalRefs.length} foreign key(s) restored (was ${references.length})`);
    if (finalRefs.length !== references.length) throw new Error('foreign key count mismatch after migration');

    const stillInt = await client.query(`
      SELECT c.table_name, c.column_name FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.data_type <> 'uuid'
        AND (c.table_name, c.column_name) IN (${references.map((r, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})
    `, references.flatMap((r) => [r.table_name, r.column_name]));
    if (stillInt.rows.length > 0) {
      throw new Error(`columns still non-uuid: ${stillInt.rows.map((r) => `${r.table_name}.${r.column_name}`).join(', ')}`);
    }
    log('    every referencing column is uuid');

    if (dryRun) {
      await client.query('ROLLBACK');
      log('\nDRY RUN COMPLETE - every statement succeeded, nothing was persisted.\n');
    } else {
      await client.query('COMMIT');
      log('\nMIGRATION COMMITTED.');
      log('NOTE: existing JWTs carry the old integer userId and will no longer resolve.');
      log('      All users must log in again.\n');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nMIGRATION FAILED (rolled back):', error.message);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  const mapIndex = process.argv.indexOf('--map-file');

  run({
    dryRun: process.argv.includes('--dry-run'),
    mapFile: mapIndex !== -1 ? process.argv[mapIndex + 1] : undefined
  })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { run };
