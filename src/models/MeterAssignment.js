const pool = require('../config/database');

/**
 * Who a meter was dispatched to, read from meter_assignments. The list, the
 * exports, bulk search and the holder index all share these columns and joins,
 * so they can't disagree about a meter.
 */

const TZ = 'Africa/Lagos';

const STATUSES = ['ASSIGNED', 'USED', 'RETURNED', 'LOST'];

const fullName = (alias) => `NULLIF(TRIM(CONCAT_WS(' ', ${alias}.first_name, ${alias}.last_name)), '')`;

const SELECT_COLUMNS = `
  ma.id, ma.meter_id, ma.meter_number, ma.status AS assignment_status,
  ma.installer_id, ma.assigned_at, ma.released_at,
  m.sim_number, m.meter_make, m.model, m.phase_type, m.sgc_number, m.status AS meter_status,
  d.code AS disco_code,
  ${fullName('i')} AS installer_name, i.phone AS installer_phone,
  b.id AS batch_id, b.batch_ref, b.dispatch_ref,
  ${fullName('a')} AS assigned_by_name,
  ir.account_number
`;

const FROM_CLAUSE = `
  FROM meter_assignments ma
  JOIN assignment_batches b ON b.id = ma.assignment_batch_id
  JOIN meters m ON m.id = ma.meter_id
  JOIN discos d ON d.id = b.disco_id
  LEFT JOIN users i ON i.id = ma.installer_id
  LEFT JOIN users a ON a.id = b.assigned_by
  LEFT JOIN installation_request ir ON ir.id = ma.installation_request_id
`;

const ORDER_CLAUSE = 'ORDER BY ma.assigned_at DESC, ma.id DESC';

const escapeLike = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

/** WHERE clause and params for the list and export filters. Pure, for testing. */
const buildListWhere = ({ discoIds = null, statuses = ['ASSIGNED'], installerId, phaseType, from, to, q } = {}) => {
  const params = [];
  const p = (value) => { params.push(value); return `$${params.length}`; };
  const clauses = [`ma.status = ANY(${p(statuses)}::varchar[])`];

  // null = every disco; [] = none (a scoped user with no discos).
  if (discoIds) clauses.push(`b.disco_id = ANY(${p(discoIds)}::int[])`);
  if (installerId) clauses.push(`ma.installer_id = ${p(installerId)}`);
  if (phaseType) clauses.push(`m.phase_type = ${p(phaseType)}`);
  // Whole calendar days in Lagos, both ends included.
  if (from) clauses.push(`(ma.assigned_at AT TIME ZONE '${TZ}')::date >= ${p(from)}::date`);
  if (to) clauses.push(`(ma.assigned_at AT TIME ZONE '${TZ}')::date <= ${p(to)}::date`);
  if (q) {
    const like = p(`%${escapeLike(String(q).trim())}%`);
    clauses.push(`(ma.meter_number ILIKE ${like} OR m.sim_number ILIKE ${like})`);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
};

/** Trimmed, de-duplicated numbers in the order given, and how many repeats were dropped. */
const normalizeMeterNumbers = (meterNumbers = []) => {
  const seen = new Set();
  const numbers = [];
  meterNumbers.forEach((raw) => {
    const number = String(raw ?? '').trim();
    if (number && !seen.has(number)) {
      seen.add(number);
      numbers.push(number);
    }
  });
  return { numbers, duplicates: meterNumbers.filter((n) => String(n ?? '').trim()).length - numbers.length };
};

/**
 * One result per requested number, in the order requested. Nothing disappears:
 * a number with no record comes back NOT_FOUND. Pure, for testing.
 */
const mergeSearchResults = (numbers, meters, lastDispatches) => {
  const meterByNumber = new Map(meters.map((m) => [m.meterNumber, m]));
  const dispatchByNumber = new Map(lastDispatches.map((d) => [d.meterNumber, d]));

  const results = numbers.map((meterNumber) => {
    const meter = meterByNumber.get(meterNumber);
    if (!meter) return { result: 'NOT_FOUND', meterNumber };
    const dispatch = dispatchByNumber.get(meterNumber);
    return {
      ...meter,
      ...dispatch,
      result: dispatch && dispatch.assignmentStatus === 'ASSIGNED' ? 'ASSIGNED' : 'NOT_ASSIGNED'
    };
  });

  const summary = { requested: numbers.length, assigned: 0, notAssigned: 0, notFound: 0 };
  results.forEach((r) => {
    if (r.result === 'ASSIGNED') summary.assigned += 1;
    else if (r.result === 'NOT_ASSIGNED') summary.notAssigned += 1;
    else summary.notFound += 1;
  });

  return { results, summary };
};

class MeterAssignment {
  static format(row) {
    return {
      meterNumber: row.meter_number,
      simNumber: row.sim_number,
      meterMake: row.meter_make,
      model: row.model,
      phaseType: row.phase_type,
      sgcNumber: row.sgc_number,
      meterStatus: row.meter_status,
      assignmentStatus: row.assignment_status,
      discoCode: row.disco_code,
      installerId: row.installer_id,
      installerName: row.installer_name,
      installerPhone: row.installer_phone,
      batchId: row.batch_id,
      batchRef: row.batch_ref,
      dispatchRef: row.dispatch_ref,
      assignedByName: row.assigned_by_name,
      assignedAt: row.assigned_at,
      releasedAt: row.released_at,
      accountNumber: row.account_number
    };
  }

  /**
   * Every meter out with an installer right now, in one query: the portal
   * needs this on each meter screen, and used to open every open batch to
   * work it out. Same rule as a batch's items: ASSIGNED items of open batches.
   */
  static async findHolders({ discoIds = null, installerId } = {}) {
    const params = [];
    const clauses = [
      "ma.status = 'ASSIGNED'",
      "b.status IN ('ACTIVE', 'PARTIALLY_RETURNED')"
    ];
    if (discoIds) { params.push(discoIds); clauses.push(`b.disco_id = ANY($${params.length}::int[])`); }
    if (installerId) { params.push(installerId); clauses.push(`ma.installer_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT ma.meter_number, ma.status AS assignment_status, ma.assigned_at, ma.installer_id,
              m.phase_type, m.sim_number, d.code AS disco_code,
              ${fullName('i')} AS installer_name, b.id AS batch_id, b.batch_ref
       FROM meter_assignments ma
       JOIN assignment_batches b ON b.id = ma.assignment_batch_id
       JOIN meters m ON m.id = ma.meter_id
       JOIN discos d ON d.id = b.disco_id
       LEFT JOIN users i ON i.id = ma.installer_id
       WHERE ${clauses.join(' AND ')}`,
      params
    );

    return result.rows.map((row) => ({
      meterNumber: row.meter_number,
      assignmentStatus: row.assignment_status,
      phaseType: row.phase_type,
      simNumber: row.sim_number,
      assignedAt: row.assigned_at,
      installerId: row.installer_id,
      installerName: row.installer_name,
      batchId: row.batch_id,
      batchRef: row.batch_ref,
      discoCode: row.disco_code
    }));
  }

  static async findAll({ page = 1, limit = 20, ...filters } = {}) {
    const { where, params } = buildListWhere(filters);

    const count = await pool.query(`SELECT COUNT(*)::int AS n ${FROM_CLAUSE} ${where}`, params);
    const totalCount = count.rows[0].n;

    const result = await pool.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ${where} ${ORDER_CLAUSE}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    const totalPages = Math.ceil(totalCount / limit);
    return {
      assignments: result.rows.map((row) => this.format(row)),
      pagination: { currentPage: page, totalPages, totalCount, hasNext: page < totalPages, hasPrev: page > 1 }
    };
  }

  static async count(filters = {}) {
    const { where, params } = buildListWhere(filters);
    const result = await pool.query(`SELECT COUNT(*)::int AS n ${FROM_CLAUSE} ${where}`, params);
    return result.rows[0].n;
  }

  /** Query text and params for every matching row, for the exports. */
  static exportQuery(filters = {}) {
    const { where, params } = buildListWhere(filters);
    return { text: `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ${where} ${ORDER_CLAUSE}`, params };
  }

  /**
   * Bulk search. Each number gets its current state: who holds it now, or else
   * its most recent dispatch. A meter outside the caller's discos reads as
   * NOT_FOUND, so its existence isn't confirmed.
   */
  static async search({ meterNumbers, discoIds = null }) {
    const { numbers, duplicates } = normalizeMeterNumbers(meterNumbers);

    const scopeParams = [numbers];
    let scope = '';
    if (discoIds) { scopeParams.push(discoIds); scope = 'AND m.disco_id = ANY($2::int[])'; }

    const meters = await pool.query(
      `SELECT m.meter_number, m.sim_number, m.meter_make, m.model, m.phase_type, m.sgc_number,
              m.status AS meter_status, d.code AS disco_code
       FROM meters m
       LEFT JOIN discos d ON d.id = m.disco_id
       WHERE m.meter_number = ANY($1::varchar[]) ${scope}`,
      scopeParams
    );

    const dispatches = await pool.query(
      `SELECT DISTINCT ON (ma.meter_id) ${SELECT_COLUMNS} ${FROM_CLAUSE}
       WHERE ma.meter_number = ANY($1::varchar[]) ${scope}
       ORDER BY ma.meter_id, (ma.status = 'ASSIGNED') DESC, ma.assigned_at DESC, ma.id DESC`,
      scopeParams
    );

    const { results, summary } = mergeSearchResults(
      numbers,
      meters.rows.map((row) => this.format(row)),
      dispatches.rows.map((row) => this.format(row))
    );

    return { results, summary: { ...summary, duplicatesRemoved: duplicates } };
  }
}

module.exports = MeterAssignment;
module.exports.STATUSES = STATUSES;
module.exports.buildListWhere = buildListWhere;
module.exports.normalizeMeterNumbers = normalizeMeterNumbers;
module.exports.mergeSearchResults = mergeSearchResults;
