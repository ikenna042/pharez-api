/**
 * Backfill revenue onto installations that completed before the price was
 * frozen at completion time.
 *
 * These rows have no recorded worth: the offline flow never wrote a money
 * value, and meter_types keeps no history, so the only figure available is
 * today's price. That is an estimate, not a fact, and it is marked
 * payment_status = 'ESTIMATED' so the finance endpoints can report it
 * separately instead of passing it off as recorded revenue.
 *
 * Rows completed from here on are priced by recordInstallation and marked
 * 'EARNED'. This script only touches rows that have no amount yet, so it is
 * safe to re-run and will never overwrite a frozen price.
 *
 * Usage:
 *   node src/database/migrations/002-backfill-installation-revenue.js --dry-run
 *   node src/database/migrations/002-backfill-installation-revenue.js
 */

require('dotenv').config();
const pool = require('../../config/database');

const log = (msg) => console.log(msg);

const run = async ({ dryRun }) => {
  const client = await pool.connect();

  try {
    log(dryRun
      ? '\n=== DRY RUN: every change will be rolled back ===\n'
      : '\n=== Backfilling revenue onto completed installations ===\n');

    await client.query('BEGIN');

    // One row per meter type name, newest active price wins. DISTINCT ON keeps
    // duplicate active names from multiplying the UPDATE.
    const priceBook = await client.query(`
      SELECT DISTINCT ON (upper(name)) id, upper(name) AS name, amount
      FROM meter_types
      WHERE is_active = true
      ORDER BY upper(name), created_at DESC, id DESC
    `);

    log('[1] active price book');
    if (priceBook.rows.length === 0) {
      throw new Error('No active meter_types rows; nothing could be priced. Aborting.');
    }
    priceBook.rows.forEach((p) => log(`    ${p.name.padEnd(14)} ${p.amount}  (meter_types #${p.id})`));

    const candidates = await client.query(`
      SELECT COUNT(*)::int AS n
      FROM installation_request
      WHERE status IN ('INSTALLED','EXPORTED') AND payment_amount IS NULL
    `);
    log(`\n[2] completed installations with no amount: ${candidates.rows[0].n}`);

    const updated = await client.query(`
      UPDATE installation_request ir
      SET payment_amount = mt.amount,
          payment_status = 'ESTIMATED',
          payment_source = 'PRICE_BOOK',
          meter_type_id  = mt.id,
          updated_at     = CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT ON (upper(name)) id, upper(name) AS name, amount
        FROM meter_types WHERE is_active = true
        ORDER BY upper(name), created_at DESC, id DESC
      ) mt
      WHERE ir.status IN ('INSTALLED','EXPORTED')
        AND ir.payment_amount IS NULL
        AND upper(ir.meter_type) = mt.name
      RETURNING ir.id, ir.meter_type, ir.payment_amount
    `);

    log(`\n[3] priced ${updated.rows.length} row(s) as ESTIMATED`);
    const byType = {};
    updated.rows.forEach((r) => {
      const k = `${r.meter_type} @ ${r.payment_amount}`;
      byType[k] = (byType[k] || 0) + 1;
    });
    Object.entries(byType).forEach(([k, n]) => log(`    ${k.padEnd(30)} x${n}`));

    // Anything still unpriced has a meter_type with no matching active price.
    const leftover = await client.query(`
      SELECT COALESCE(meter_type, '(null)') AS meter_type, COUNT(*)::int AS n
      FROM installation_request
      WHERE status IN ('INSTALLED','EXPORTED') AND payment_amount IS NULL
      GROUP BY 1 ORDER BY 2 DESC
    `);

    log('\n[4] still unpriced');
    if (leftover.rows.length === 0) {
      log('    none');
    } else {
      leftover.rows.forEach((r) => log(`    ${r.meter_type.padEnd(16)} ${r.n}  <- no active price for this type`));
      log('    These appear in finance reports under missingAmountCount until a price exists.');
    }

    const totals = await client.query(`
      SELECT payment_status, COUNT(*)::int AS n, COALESCE(SUM(payment_amount), 0)::numeric AS total
      FROM installation_request
      WHERE status IN ('INSTALLED','EXPORTED')
      GROUP BY payment_status ORDER BY 1
    `);
    log('\n[5] completed installations by revenue status');
    totals.rows.forEach((r) => log(`    ${String(r.payment_status || '(unpriced)').padEnd(12)} n=${String(r.n).padEnd(4)} total=${r.total}`));

    if (dryRun) {
      await client.query('ROLLBACK');
      log('\nDRY RUN COMPLETE - nothing was persisted.\n');
    } else {
      await client.query('COMMIT');
      log('\nBACKFILL COMMITTED.');
      log('Rows marked ESTIMATED were valued at today\'s price, not the price in force when they completed.\n');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nBACKFILL FAILED (rolled back):', error.message);
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
