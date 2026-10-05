/**
 * Per-disco access: profile existing users and give every meter a disco.
 *
 * Until now every staff account saw every disco's data, and meters had no
 * disco. With a second offline disco (PHEDC) arriving, ADMIN, SUPERVISOR and
 * INSTALLER accounts are limited to the discos they're profiled for
 * (user_discos), and each meter belongs to one disco's stock.
 *
 * Run `npm run migrate` first -- it creates user_discos and adds the nullable
 * meters.disco_id column. This script then:
 *
 *   1. Profiles every existing non-SUPERADMIN user for ABA_POWER only, since
 *      that's the only disco anyone works on today. Nobody sees another disco
 *      until a SUPERADMIN grants it. SUPERADMIN is never profiled: it always
 *      sees every disco.
 *   2. Gives each meter the disco of the import it came from. Meters with no
 *      import batch (the original manual upload) go to ABA_POWER.
 *   3. Sets meters.disco_id NOT NULL.
 *
 * Safe to re-run: each step only touches rows that still need it.
 *
 * --defer-not-null skips step 3. Use it when this runs against a database the
 * previous app version is still serving: that version inserts meters without
 * a disco_id, so NOT NULL would break its meter uploads. After the new version
 * is deployed, run again without the flag: it backfills any meters created in
 * between, then enforces NOT NULL.
 *
 * Usage:
 *   node src/database/migrations/005-disco-access.js --dry-run
 *   node src/database/migrations/005-disco-access.js [--defer-not-null]
 */

require('dotenv').config();
const pool = require('../../config/database');

const log = (msg) => console.log(msg);

const run = async ({ dryRun, deferNotNull = false }) => {
  const client = await pool.connect();

  try {
    log(dryRun
      ? '\n=== DRY RUN: every change will be rolled back ===\n'
      : '\n=== Per-disco access: profiling users and meters ===\n');

    await client.query('BEGIN');

    const ready = await client.query(`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_discos') AS has_table,
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'meters' AND column_name = 'disco_id') AS has_column
    `);
    if (!ready.rows[0].has_table || !ready.rows[0].has_column) {
      throw new Error('user_discos / meters.disco_id missing. Run `npm run migrate` first.');
    }

    const aba = await client.query("SELECT id FROM discos WHERE code = 'ABA_POWER'");
    if (aba.rows.length === 0) throw new Error('Disco ABA_POWER not found. Aborting.');
    const abaId = aba.rows[0].id;

    // First run only. Once anyone has been profiled, access is managed by
    // SUPERADMIN, and a re-run must not hand ABA_POWER back to someone whose
    // discos were deliberately changed or removed.
    const existing = await client.query('SELECT COUNT(*)::int AS n FROM user_discos');
    if (existing.rows[0].n > 0) {
      log(`[1] user_discos already has ${existing.rows[0].n} row(s) -- leaving user access as it is`);
    } else {
      const profiled = await client.query(
        `INSERT INTO user_discos (user_id, disco_id)
         SELECT id, $1 FROM users WHERE role <> 'SUPERADMIN'
         RETURNING user_id`,
        [abaId]
      );
      log(`[1] profiled ${profiled.rowCount} user(s) for ABA_POWER`);
    }

    const fromImport = await client.query(`
      UPDATE meters m SET disco_id = b.disco_id
      FROM import_batches b
      WHERE m.disco_id IS NULL AND b.id = m.import_batch_id
      RETURNING m.id
    `);
    const noImport = await client.query(
      'UPDATE meters SET disco_id = $1 WHERE disco_id IS NULL RETURNING id',
      [abaId]
    );
    log(`[2] meters given a disco: ${fromImport.rowCount} from their import, ${noImport.rowCount} with no import -> ABA_POWER`);

    if (deferNotNull) {
      log('[3] --defer-not-null: meters.disco_id left nullable (re-run without the flag after deploy)');
    } else {
      await client.query('ALTER TABLE meters ALTER COLUMN disco_id SET NOT NULL');
      log('[3] meters.disco_id is now NOT NULL');
    }

    const users = await client.query(`
      SELECT COALESCE(d.code, '(all discos)') AS disco, u.role, COUNT(*)::int AS n
      FROM users u
      LEFT JOIN user_discos ud ON ud.user_id = u.id
      LEFT JOIN discos d ON d.id = ud.disco_id
      WHERE u.is_active
      GROUP BY 1, 2 ORDER BY 1, 2
    `);
    log('\n[4] active users per disco');
    users.rows.forEach((r) => log(`    ${r.disco.padEnd(14)} ${r.role.padEnd(11)} ${r.n}`));

    const meters = await client.query(`
      SELECT d.code, COUNT(*)::int AS n FROM meters m JOIN discos d ON d.id = m.disco_id
      GROUP BY 1 ORDER BY 1
    `);
    log('\n[5] meters per disco');
    meters.rows.forEach((r) => log(`    ${r.code.padEnd(14)} ${r.n}`));

    if (dryRun) {
      await client.query('ROLLBACK');
      log('\nDRY RUN COMPLETE - nothing was persisted.\n');
    } else {
      await client.query('COMMIT');
      log('\nMIGRATION COMMITTED. Access is now per disco.\n');
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
  run({
    dryRun: process.argv.includes('--dry-run'),
    deferNotNull: process.argv.includes('--defer-not-null')
  })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { run };
