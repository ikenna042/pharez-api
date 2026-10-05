/**
 * Give PHEDC its own meter prices.
 *
 * Prices are per disco, so a disco with no prices records no revenue on
 * completed installations. PHEDC starts with the same amounts as Aba Power;
 * change them afterwards through the meter-price settings, no deploy needed.
 *
 * Run `npm run migrate` first -- it seeds the PHEDC disco. Does nothing if
 * PHEDC already has active prices, so it's safe to re-run.
 *
 * Usage:
 *   node src/database/migrations/006-phedc-meter-prices.js --dry-run
 *   node src/database/migrations/006-phedc-meter-prices.js
 */

require('dotenv').config();
const pool = require('../../config/database');

const log = (msg) => console.log(msg);

const run = async ({ dryRun }) => {
  const client = await pool.connect();

  try {
    log(dryRun
      ? '\n=== DRY RUN: every change will be rolled back ===\n'
      : '\n=== Seeding PHEDC meter prices ===\n');

    await client.query('BEGIN');

    const discos = await client.query("SELECT id, code FROM discos WHERE code IN ('ABA_POWER', 'PHEDC')");
    const id = Object.fromEntries(discos.rows.map((d) => [d.code, d.id]));
    if (!id.PHEDC) throw new Error('Disco PHEDC not found. Run `npm run migrate` first.');
    if (!id.ABA_POWER) throw new Error('Disco ABA_POWER not found. Aborting.');

    const existing = await client.query(
      'SELECT COUNT(*)::int AS n FROM meter_types WHERE disco_id = $1 AND is_active',
      [id.PHEDC]
    );
    if (existing.rows[0].n > 0) {
      log(`[1] PHEDC already has ${existing.rows[0].n} active price(s) -- nothing to do`);
    } else {
      const copied = await client.query(
        `INSERT INTO meter_types (disco_id, name, amount, created_by)
         SELECT $1, name, amount, created_by FROM meter_types
         WHERE disco_id = $2 AND is_active
         RETURNING name, amount`,
        [id.PHEDC, id.ABA_POWER]
      );
      log(`[1] copied ${copied.rowCount} price(s) from ABA_POWER to PHEDC`);
    }

    const prices = await client.query(`
      SELECT d.code, mt.name, mt.amount FROM meter_types mt JOIN discos d ON d.id = mt.disco_id
      WHERE mt.is_active ORDER BY d.code, mt.name
    `);
    log('\n[2] active prices per disco');
    prices.rows.forEach((p) => log(`    ${p.code.padEnd(10)} ${p.name.padEnd(14)} ${p.amount}`));

    if (dryRun) {
      await client.query('ROLLBACK');
      log('\nDRY RUN COMPLETE - nothing was persisted.\n');
    } else {
      await client.query('COMMIT');
      log('\nMIGRATION COMMITTED.\n');
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
