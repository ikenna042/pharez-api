/**
 * Add SUPERVISOR to the users.role CHECK constraint.
 *
 * The constraint was created inline in migrate.js as
 * `CHECK (role IN ('SUPERADMIN', 'ADMIN', 'INSTALLER'))`, which Postgres
 * named `users_role_check` by default. This script looks the name up from
 * pg_constraint rather than assuming it, drops it, and recreates it with
 * SUPERVISOR included. No existing row is touched -- every current role
 * value is still valid under the new constraint.
 *
 * Usage:
 *   node src/database/migrations/003-add-supervisor-role.js --dry-run
 *   node src/database/migrations/003-add-supervisor-role.js
 */

require('dotenv').config();
const pool = require('../../config/database');

const log = (msg) => console.log(msg);

const run = async ({ dryRun }) => {
  const client = await pool.connect();

  try {
    log(dryRun
      ? '\n=== DRY RUN: every change will be rolled back ===\n'
      : '\n=== Adding SUPERVISOR to users.role ===\n');

    await client.query('BEGIN');

    const existing = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND contype = 'c' AND conname LIKE '%role%'
    `);

    if (existing.rows.length !== 1) {
      throw new Error(
        `Expected exactly one role CHECK constraint on users, found ${existing.rows.length}. Aborting.`
      );
    }

    const { conname, def } = existing.rows[0];
    log(`[1] found constraint ${conname}`);
    log(`    current: ${def}`);

    if (def.includes('SUPERVISOR')) {
      log('\n    SUPERVISOR is already present -- nothing to do.\n');
      await client.query('ROLLBACK');
      return;
    }

    await client.query(`ALTER TABLE users DROP CONSTRAINT ${conname}`);
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT ${conname}
      CHECK (role IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'INSTALLER'))
    `);

    const updated = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conname = $1 AND conrelid = 'users'::regclass
    `, [conname]);
    log(`\n[2] new constraint: ${updated.rows[0].def}`);

    const counts = await client.query(`SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY role`);
    log('\n[3] existing users by role (unaffected)');
    counts.rows.forEach((r) => log(`    ${r.role.padEnd(12)} ${r.n}`));

    if (dryRun) {
      await client.query('ROLLBACK');
      log('\nDRY RUN COMPLETE - nothing was persisted.\n');
    } else {
      await client.query('COMMIT');
      log('\nMIGRATION COMMITTED. SUPERVISOR is now a valid users.role value.\n');
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
  run({ dryRun: process.argv.includes('--dry-run') })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { run };
