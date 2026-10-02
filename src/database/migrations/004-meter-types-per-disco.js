/**
 * Make meter prices per disco.
 *
 * Before this, meter_types had no disco: one global price list was used both
 * to freeze Aba Power installation revenue and to charge JED customers through
 * Remita. Prices differ between discos, so every meter type now belongs to one.
 *
 * Run `npm run migrate` first -- it adds the nullable disco_id column and the
 * one-active-price-per-disco unique index. This script then:
 *
 *   1. Assigns every existing row (active and inactive history) to ABA_POWER.
 *      ABA_POWER installations have these exact rows frozen as meter_type_id,
 *      so they must stay ABA_POWER's for those references to remain accurate.
 *   2. Gives JED its own copies of ABA_POWER's active prices at the same
 *      amounts, so nobody is charged differently on day one. JED's prices can
 *      then be edited independently.
 *   3. Sets disco_id NOT NULL.
 *
 * Safe to re-run: each step only acts on rows that still need it.
 *
 * Usage:
 *   node src/database/migrations/004-meter-types-per-disco.js --dry-run
 *   node src/database/migrations/004-meter-types-per-disco.js
 */

require('dotenv').config();
const pool = require('../../config/database');

const log = (msg) => console.log(msg);

const run = async ({ dryRun }) => {
  const client = await pool.connect();

  try {
    log(dryRun
      ? '\n=== DRY RUN: every change will be rolled back ===\n'
      : '\n=== Making meter prices per disco ===\n');

    await client.query('BEGIN');

    const column = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'meter_types' AND column_name = 'disco_id'
    `);
    if (column.rows.length === 0) {
      throw new Error('meter_types.disco_id does not exist yet. Run `npm run migrate` first.');
    }

    const discos = await client.query(`SELECT id, code FROM discos WHERE code IN ('ABA_POWER', 'JED')`);
    const discoId = Object.fromEntries(discos.rows.map((d) => [d.code, d.id]));
    if (!discoId.ABA_POWER || !discoId.JED) {
      throw new Error(`Expected discos ABA_POWER and JED, found: ${discos.rows.map((d) => d.code).join(', ') || 'none'}`);
    }

    const assigned = await client.query(
      'UPDATE meter_types SET disco_id = $1 WHERE disco_id IS NULL RETURNING id',
      [discoId.ABA_POWER]
    );
    log(`[1] assigned ${assigned.rowCount} unowned meter type(s) to ABA_POWER`);

    const jedActive = await client.query(
      'SELECT COUNT(*)::int AS n FROM meter_types WHERE disco_id = $1 AND is_active',
      [discoId.JED]
    );
    if (jedActive.rows[0].n > 0) {
      log(`[2] JED already has ${jedActive.rows[0].n} active price(s) -- nothing to copy`);
    } else {
      const copied = await client.query(
        `INSERT INTO meter_types (disco_id, name, amount, created_by)
         SELECT $1, name, amount, created_by
         FROM meter_types
         WHERE disco_id = $2 AND is_active
         RETURNING id, name, amount`,
        [discoId.JED, discoId.ABA_POWER]
      );
      log(`[2] copied ${copied.rowCount} active price(s) to JED`);
    }

    await client.query('ALTER TABLE meter_types ALTER COLUMN disco_id SET NOT NULL');
    log('[3] meter_types.disco_id is now NOT NULL');

    const prices = await client.query(`
      SELECT d.code, mt.id, mt.name, mt.amount
      FROM meter_types mt JOIN discos d ON d.id = mt.disco_id
      WHERE mt.is_active
      ORDER BY d.code, mt.name
    `);
    log('\n[4] active prices per disco');
    prices.rows.forEach((p) => log(`    ${p.code.padEnd(10)} ${p.name.padEnd(14)} ${p.amount}  (meter_types #${p.id})`));

    const refs = await client.query(`
      SELECT d.code AS installation_disco, md.code AS price_disco, COUNT(*)::int AS n
      FROM installation_request ir
      JOIN discos d ON d.id = ir.disco_id
      JOIN meter_types mt ON mt.id = ir.meter_type_id
      JOIN discos md ON md.id = mt.disco_id
      GROUP BY 1, 2 ORDER BY 1, 2
    `);
    log('\n[5] frozen installation prices, by installation disco -> price disco');
    if (refs.rows.length === 0) log('    none');
    refs.rows.forEach((r) => log(`    ${r.installation_disco.padEnd(10)} -> ${r.price_disco.padEnd(10)} n=${r.n}`));

    if (dryRun) {
      await client.query('ROLLBACK');
      log('\nDRY RUN COMPLETE - nothing was persisted.\n');
    } else {
      await client.query('COMMIT');
      log('\nMIGRATION COMMITTED. Meter prices are now per disco.\n');
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
