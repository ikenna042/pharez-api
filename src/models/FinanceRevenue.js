const pool = require('../config/database');
const { resolveGroupBy, resolveSortBy, resolveSortOrder } = require('../utils/financeFilters');

/**
 * Revenue across every disco.
 *
 * Recognition differs per disco and both rules live in the CTE below:
 *
 *   JED        recognised when Remita confirms the cash (PAID onward). The
 *              price was frozen onto the row at payment-init.
 *   Aba Power  recognised when the installation is completed (INSTALLED
 *              onward). The price is frozen onto the row at completion.
 *
 * The rules are hardcoded per disco rather than derived from
 * discos.integration_mode: they are genuinely different business decisions, and
 * a third offline disco joining the Aba branch should be an explicit,
 * reviewable edit rather than an emergent consequence of a config flag.
 */

const RECOGNITION = {
  JED: 'ON_PAYMENT_CONFIRMED',
  ABA_POWER: 'ON_INSTALLATION_COMPLETED'
};

/**
 * `revenue_at` falls back rather than requiring one exact column.
 *
 * On the JED side date_paid is NULL whenever a row reached CONFIRMED without
 * passing through markPaidByRRR, and date_confirmed is unset on every live row.
 * Filtering strictly on date_paid would drop real money from every dated report
 * while still counting it in the all-time total, so the two would never
 * reconcile. `date_basis` tells the caller which column actually supplied the
 * date.
 */
const REVENUE_CTE = `
  WITH revenue AS (
    SELECT
      'JED'::text                                 AS disco_code,
      'jed_customer_request'::text                AS source,
      j.id                                        AS source_id,
      j.account_number                            AS reference,
      j.cust_names                                AS customer_name,
      upper(j.meter_recommended)                  AS meter_type,
      COALESCE(j.amount, 0)::numeric              AS amount,
      (j.amount IS NULL)                          AS amount_missing,
      false                                       AS is_estimated,
      j.status                                    AS source_status,
      COALESCE(j.date_paid, j.date_completed, j.date_requested) AS revenue_at,
      CASE
        WHEN j.date_paid IS NOT NULL      THEN 'date_paid'
        WHEN j.date_completed IS NOT NULL THEN 'date_completed'
        ELSE 'date_requested'
      END                                         AS date_basis
    FROM jed_customer_request j
    WHERE j.status IN ('PAID', 'CONFIRMED', 'COMPLETED')

    UNION ALL

    SELECT
      d.code,
      'installation_request'::text,
      ir.id,
      ir.account_number,
      ir.customer_name,
      ir.meter_type,
      COALESCE(ir.payment_amount, 0)::numeric,
      (ir.payment_amount IS NULL),
      (ir.payment_status = 'ESTIMATED'),
      ir.status,
      COALESCE(ir.reported_at, ir.updated_at),
      CASE WHEN ir.reported_at IS NOT NULL THEN 'reported_at' ELSE 'updated_at' END
    FROM installation_request ir
    JOIN discos d ON d.id = ir.disco_id
    WHERE ir.status IN ('INSTALLED', 'EXPORTED')
  )
`;

/**
 * Build the shared WHERE clause. Every value is parameterised; nothing from the
 * caller is ever interpolated.
 */
const buildFilters = ({ discoCode, from, to, meterType, search } = {}) => {
  const conditions = [];
  const params = [];

  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (discoCode) add('disco_code = ?', String(discoCode).toUpperCase());
  if (from) add('revenue_at >= ?', from);
  if (to) add('revenue_at < ?', to);
  if (meterType) add('meter_type = ?', String(meterType).toUpperCase());

  if (search) {
    params.push(`%${search}%`);
    const i = params.length;
    conditions.push(`(reference ILIKE $${i} OR customer_name ILIKE $${i})`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
};

const AGGREGATES = `
  COALESCE(SUM(amount), 0)::numeric                                   AS amount,
  COUNT(*)::int                                                       AS count,
  COALESCE(SUM(amount) FILTER (WHERE is_estimated), 0)::numeric       AS estimated_amount,
  COUNT(*) FILTER (WHERE is_estimated)::int                           AS estimated_count,
  COUNT(*) FILTER (WHERE amount_missing)::int                         AS missing_amount_count
`;

const toNumbers = (row) => ({
  amount: parseFloat(row.amount),
  count: row.count,
  estimatedAmount: parseFloat(row.estimated_amount),
  estimatedCount: row.estimated_count,
  missingAmountCount: row.missing_amount_count
});

class FinanceRevenue {
  /** Totals plus a per-disco split. */
  static async summary(filters = {}) {
    const { where, params } = buildFilters(filters);

    const [totals, byDisco] = await Promise.all([
      pool.query(`${REVENUE_CTE} SELECT ${AGGREGATES} FROM revenue ${where}`, params),
      pool.query(
        `${REVENUE_CTE}
         SELECT disco_code, ${AGGREGATES}
         FROM revenue ${where}
         GROUP BY disco_code
         ORDER BY amount DESC`,
        params
      )
    ]);

    const total = toNumbers(totals.rows[0]);

    return {
      total: { amount: total.amount, count: total.count },
      byDisco: byDisco.rows.map((row) => ({
        discoCode: row.disco_code,
        recognition: RECOGNITION[row.disco_code] || null,
        ...toNumbers(row)
      })),
      dataQuality: {
        estimatedAmount: total.estimatedAmount,
        estimatedCount: total.estimatedCount,
        missingAmountCount: total.missingAmountCount
      }
    };
  }

  /**
   * Grouped totals. `groupBy` is a whitelist KEY, never a SQL fragment from the
   * caller — see financeFilters.js.
   */
  static async breakdown(filters = {}, groupByKey = 'disco') {
    const group = resolveGroupBy(groupByKey);
    if (!group) throw Object.assign(new Error(`Unsupported groupBy "${groupByKey}"`), { statusCode: 400 });

    const { where, params } = buildFilters(filters);
    const isPeriod = group.label === 'period';

    const result = await pool.query(
      `${REVENUE_CTE}
       SELECT ${group.column} AS group_key, ${AGGREGATES}
       FROM revenue ${where}
       GROUP BY ${group.column}
       ORDER BY ${isPeriod ? 'group_key ASC' : 'amount DESC'}`,
      params
    );

    return {
      groupBy: groupByKey,
      key: group.label,
      rows: result.rows.map((row) => ({
        [group.label]: row.group_key,
        ...(group.label === 'discoCode' ? { recognition: RECOGNITION[row.group_key] || null } : {}),
        ...toNumbers(row)
      }))
    };
  }

  /** The individual rows behind the totals. */
  static async transactions(filters = {}, { page = 1, limit = 20, sortBy, sortOrder } = {}) {
    const { where, params } = buildFilters(filters);

    const column = resolveSortBy(sortBy) || 'revenue_at';
    const direction = resolveSortOrder(sortOrder);
    const offset = (page - 1) * limit;

    const [rows, totals] = await Promise.all([
      pool.query(
        `${REVENUE_CTE}
         SELECT * FROM revenue ${where}
         ORDER BY ${column} ${direction} NULLS LAST, source_id ${direction}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      // Same filters as the page, so the total always reconciles with summary().
      pool.query(`${REVENUE_CTE} SELECT ${AGGREGATES} FROM revenue ${where}`, params)
    ]);

    const totalCount = totals.rows[0].count;
    const totalPages = Math.ceil(totalCount / limit) || 0;

    return {
      transactions: rows.rows.map((row) => ({
        discoCode: row.disco_code,
        source: row.source,
        sourceId: row.source_id,
        reference: row.reference,
        customerName: row.customer_name,
        meterType: row.meter_type,
        amount: parseFloat(row.amount),
        amountMissing: row.amount_missing,
        isEstimated: row.is_estimated,
        sourceStatus: row.source_status,
        revenueAt: row.revenue_at,
        dateBasis: row.date_basis
      })),
      totals: toNumbers(totals.rows[0]),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /** Total recognised revenue, for the dashboard. */
  static async totalRevenue(filters = {}) {
    const { where, params } = buildFilters(filters);
    const result = await pool.query(
      `${REVENUE_CTE} SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM revenue ${where}`,
      params
    );
    return parseFloat(result.rows[0].total);
  }
}

module.exports = FinanceRevenue;
module.exports.RECOGNITION = RECOGNITION;
