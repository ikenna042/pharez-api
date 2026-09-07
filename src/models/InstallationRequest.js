const pool = require('../config/database');

// Which statuses a transition may legally start from. Exported so the state
// machine can be asserted in tests without a database.
const ALLOWED_FROM = {
  ASSIGNED: ['PENDING', 'FAILED'],
  PENDING: ['ASSIGNED'],
  IN_PROGRESS: ['ASSIGNED'],
  INSTALLED: ['ASSIGNED', 'IN_PROGRESS'],
  FAILED: ['ASSIGNED', 'IN_PROGRESS'],
  CANCELLED: ['PENDING', 'ASSIGNED'],
  EXPORTED: ['INSTALLED']
};

const INSERT_COLUMNS = [
  'disco_id',
  'account_number',
  'customer_name',
  'customer_phone',
  'customer_email',
  'customer_address',
  'feeder_name',
  'transformer_name',
  'transformer_code',
  'region',
  'area',
  'meter_type',
  'installation_position',
  'meter_vendor',
  'source',
  'import_batch_id',
  'source_row_number',
  'source_row',
  'created_by'
];

const CHUNK_SIZE = 500;

class InstallationRequest {
  static get ALLOWED_FROM() {
    return ALLOWED_FROM;
  }

  static rowToParams(row) {
    return [
      row.discoId,
      row.accountNumber,
      row.customerName,
      row.customerPhone ?? null,
      row.customerEmail ?? null,
      row.customerAddress ?? null,
      row.feederName ?? null,
      row.transformerName ?? null,
      row.transformerCode ?? null,
      row.region ?? null,
      row.area ?? null,
      row.meterType ?? null,
      row.installationPosition ?? null,
      row.meterVendor ?? null,
      row.source || 'IMPORT',
      row.importBatchId ?? null,
      row.sourceRowNumber ?? null,
      row.sourceRow ? JSON.stringify(row.sourceRow) : null,
      row.createdBy ?? null
    ];
  }

  static async create(data) {
    const params = this.rowToParams(data);
    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query(
      `INSERT INTO installation_request (${INSERT_COLUMNS.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      params
    );

    return this.format(result.rows[0]);
  }

  /**
   * Insert many rows in chunked multi-row statements.
   *
   * Two details matter here:
   *
   *  - ON CONFLICT (disco_id, account_number) DO NOTHING lets an account that is
   *    already in the database count as *skipped* rather than as an error, and
   *    RETURNING tells us which rows actually landed.
   *  - Each chunk runs inside its own SAVEPOINT. Without that, one failing
   *    statement puts Postgres into "current transaction is aborted" (25P02) and
   *    every later statement fails too, including the batch summary update.
   *    On a chunk failure we fall back to per-row inserts, each savepointed, so a
   *    single bad row cannot take its 499 neighbours down with it.
   *
   * `client` must be an already-open transaction.
   */
  static async bulkCreate(rows, client) {
    const created = [];
    const skipped = [];
    const errors = [];

    const insertChunk = async (chunk, offset) => {
      const params = [];
      const tuples = chunk.map((row) => {
        const values = this.rowToParams(row);
        const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
        params.push(...values);
        return `(${placeholders.join(', ')})`;
      });

      const result = await client.query(
        `INSERT INTO installation_request (${INSERT_COLUMNS.join(', ')})
         VALUES ${tuples.join(', ')}
         ON CONFLICT (disco_id, account_number) DO NOTHING
         RETURNING account_number`,
        params
      );

      const landed = new Set(result.rows.map((r) => r.account_number));
      chunk.forEach((row, i) => {
        if (landed.has(row.accountNumber)) {
          created.push(row.accountNumber);
        } else {
          skipped.push({
            row: row.sourceRowNumber ?? offset + i + 1,
            accountNumber: row.accountNumber,
            reason: 'Already exists'
          });
        }
      });
    };

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE);
      const savepoint = `ir_chunk_${start}`;

      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        await insertChunk(chunk, start);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (chunkError) {
        // Roll the whole chunk back, then retry row by row to isolate the culprit.
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);

        // A chunk can fail for a row-specific reason (bad data in one row) or a
        // systematic one (malformed SQL, missing column). Retrying row by row is
        // right for the first and pathological for the second: 6,000 rows x a
        // round trip each is hours of work to reach the same conclusion. So if the
        // first few rows all fail identically, treat it as systematic and stop.
        const SYSTEMATIC_THRESHOLD = 5;
        let consecutiveIdentical = 0;
        let lastMessage = null;
        let systematic = false;

        for (let i = 0; i < chunk.length; i++) {
          if (systematic) {
            errors.push({
              row: chunk[i].sourceRowNumber ?? start + i + 1,
              accountNumber: chunk[i].accountNumber,
              error: lastMessage
            });
            continue;
          }

          const rowSavepoint = `ir_row_${start}_${i}`;
          await client.query(`SAVEPOINT ${rowSavepoint}`);
          try {
            await insertChunk([chunk[i]], start + i);
            await client.query(`RELEASE SAVEPOINT ${rowSavepoint}`);
          } catch (rowError) {
            await client.query(`ROLLBACK TO SAVEPOINT ${rowSavepoint}`);
            await client.query(`RELEASE SAVEPOINT ${rowSavepoint}`);
            errors.push({
              row: chunk[i].sourceRowNumber ?? start + i + 1,
              accountNumber: chunk[i].accountNumber,
              error: rowError.message
            });

            consecutiveIdentical = rowError.message === lastMessage ? consecutiveIdentical + 1 : 1;
            lastMessage = rowError.message;
            if (consecutiveIdentical >= SYSTEMATIC_THRESHOLD) systematic = true;
          }
        }
      }
    }

    return { created, skipped, errors };
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT r.*, d.code AS disco_code, d.name AS disco_name,
              u.first_name || ' ' || u.last_name AS installer_name,
              a.first_name || ' ' || a.last_name AS assignee_name
       FROM installation_request r
       JOIN discos d ON d.id = r.disco_id
       LEFT JOIN users u ON u.id = r.installed_by
       LEFT JOIN users a ON a.id = r.assigned_to
       WHERE r.id = $1`,
      [id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async findByAccountNumber(discoId, accountNumber) {
    const result = await pool.query(
      'SELECT * FROM installation_request WHERE disco_id = $1 AND account_number = $2',
      [discoId, accountNumber]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async getStatistics({ discoId } = {}) {
    const params = [];
    let where = '';

    if (discoId) {
      params.push(discoId);
      where = 'WHERE disco_id = $1';
    }

    const result = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'PENDING')::int     AS pending,
              COUNT(*) FILTER (WHERE status = 'ASSIGNED')::int    AS assigned,
              COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
              COUNT(*) FILTER (WHERE status = 'INSTALLED')::int   AS installed,
              COUNT(*) FILTER (WHERE status = 'EXPORTED')::int    AS exported,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int      AS failed,
              COUNT(*) FILTER (WHERE status = 'CANCELLED')::int   AS cancelled
       FROM installation_request ${where}`,
      params
    );

    const row = result.rows[0];
    return {
      total: row.total,
      pending: row.pending,
      assigned: row.assigned,
      inProgress: row.in_progress,
      installed: row.installed,
      exported: row.exported,
      failed: row.failed,
      cancelled: row.cancelled
    };
  }

  static async findAll({
    page = 1, limit = 20, discoId, status, assignedTo, assignmentBatchId, importBatchId, search, from, to
  } = {}) {
    const filters = [];
    const params = [];

    const add = (sql, value) => {
      if (value === undefined || value === null || value === '') return;
      params.push(value);
      filters.push(sql.replace('?', `$${params.length}`));
    };

    add('r.disco_id = ?', discoId);
    add('r.status = ?', status);
    add('r.assigned_to = ?', assignedTo);
    add('r.assignment_batch_id = ?', assignmentBatchId);
    add('r.import_batch_id = ?', importBatchId);
    add('r.created_at >= ?', from);
    add('r.created_at < ?', to);

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      filters.push(`(r.account_number ILIKE $${i} OR r.customer_name ILIKE $${i} OR r.meter_number ILIKE $${i})`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM installation_request r ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT r.*, d.code AS disco_code,
              u.first_name || ' ' || u.last_name AS installer_name,
              a.first_name || ' ' || a.last_name AS assignee_name
       FROM installation_request r
       JOIN discos d ON d.id = r.disco_id
       LEFT JOIN users u ON u.id = r.installed_by
       LEFT JOIN users a ON a.id = r.assigned_to
       ${where}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(totalCount / limit);

    return {
      requests: result.rows.map((row) => this.format(row)),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /** ASSIGNED -> IN_PROGRESS, guarded so only the assignee can start their own job. */
  static async markStarted(id, installerId) {
    const result = await pool.query(
      `UPDATE installation_request
       SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND assigned_to = $2 AND status = 'ASSIGNED'
       RETURNING *`,
      [id, installerId]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  /**
   * The core write of the whole flow. One transaction, both rows locked.
   *
   * Returns a discriminated result rather than throwing, so the controller maps
   * each refusal to its own HTTP status. The meter check is the enforcement of
   * "an installer may only fit a meter that is actually in their hands".
   */
  static async recordInstallation({
    requestId, installerId, meterNumber, sealNumber, installationDate,
    latitude, longitude, installationPhotoUrl, discoSupervisor, notes
  }) {
    const Meter = require('./Meter');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const requestResult = await client.query(
        'SELECT * FROM installation_request WHERE id = $1 FOR UPDATE',
        [requestId]
      );

      if (requestResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'REQUEST_NOT_FOUND' };
      }

      const request = requestResult.rows[0];

      if (String(request.assigned_to) !== String(installerId)) {
        await client.query('ROLLBACK');
        return { error: 'NOT_ASSIGNED_TO_YOU' };
      }

      if (!ALLOWED_FROM.INSTALLED.includes(request.status)) {
        await client.query('ROLLBACK');
        return { error: 'ILLEGAL_TRANSITION', status: request.status };
      }

      const meterResult = await client.query(
        'SELECT * FROM meters WHERE meter_number = $1 FOR UPDATE',
        [meterNumber]
      );

      if (meterResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'METER_NOT_FOUND' };
      }

      const meter = meterResult.rows[0];

      if (meter.assignment_status !== 'ASSIGNED' || String(meter.assigned_to) !== String(installerId)) {
        await client.query('ROLLBACK');
        return { error: 'METER_NOT_YOURS', assignmentStatus: meter.assignment_status };
      }

      if (request.meter_type && meter.phase_type && request.meter_type !== meter.phase_type) {
        await client.query('ROLLBACK');
        return { error: 'PHASE_MISMATCH', required: request.meter_type, provided: meter.phase_type };
      }

      await Meter.markUsedOnInstallation(client, meter.id, requestId);

      await client.query(
        `UPDATE meter_assignments
         SET status = 'USED', installation_request_id = $1,
             released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE meter_id = $2 AND status = 'ASSIGNED'`,
        [requestId, meter.id]
      );

      const updated = await client.query(
        `UPDATE installation_request
         SET status = 'INSTALLED',
             meter_id = $1, meter_number = $2, seal_number = $3,
             installation_date = $4, latitude = $5, longitude = $6,
             installation_photo_url = $7, disco_supervisor = $8,
             installation_notes = $9, installed_by = $10,
             reported_at = CURRENT_TIMESTAMP, failure_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $11
         RETURNING *`,
        [
          meter.id, meter.meter_number, sealNumber || null,
          installationDate || null, latitude ?? null, longitude ?? null,
          installationPhotoUrl || null, discoSupervisor || null,
          notes || null, installerId, requestId
        ]
      );

      await client.query('COMMIT');

      return { request: this.format(updated.rows[0]), meterNumber: meter.meter_number };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Record a failed attempt. The meter stays with the installer for the retry. */
  static async recordFailure(id, installerId, reason) {
    const result = await pool.query(
      `UPDATE installation_request
       SET status = 'FAILED', failure_reason = $1, installed_by = $2,
           reported_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND assigned_to = $2 AND status = ANY(ARRAY['ASSIGNED','IN_PROGRESS'])
       RETURNING *`,
      [reason, installerId, id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async cancel(id, reason) {
    const result = await pool.query(
      `UPDATE installation_request
       SET status = 'CANCELLED', failure_reason = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = ANY(ARRAY['PENDING','ASSIGNED'])
       RETURNING *`,
      [reason || null, id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  /** Rows for a disco's response sheet, with the installer's name resolved. */
  static async findForExport({ discoId, statuses = ['INSTALLED'], from, to }) {
    const params = [discoId, statuses];
    let dateFilter = '';

    if (from) { params.push(from); dateFilter += ` AND r.reported_at >= $${params.length}`; }
    if (to) { params.push(to); dateFilter += ` AND r.reported_at < $${params.length}`; }

    const result = await pool.query(
      `SELECT r.*, d.code AS disco_code,
              u.first_name || ' ' || u.last_name AS installer_name
       FROM installation_request r
       JOIN discos d ON d.id = r.disco_id
       LEFT JOIN users u ON u.id = r.installed_by
       WHERE r.disco_id = $1 AND r.status = ANY($2::varchar[])${dateFilter}
       ORDER BY r.reported_at ASC, r.id ASC`,
      params
    );

    return result.rows.map((row) => this.format(row));
  }

  /** INSTALLED -> EXPORTED, stamped with the batch that shipped them. */
  static async markExported(ids, exportBatchId, client = pool) {
    const result = await client.query(
      `UPDATE installation_request
       SET status = 'EXPORTED', export_batch_id = $1,
           exported_at = CURRENT_TIMESTAMP,
           export_count = COALESCE(export_count, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::int[]) AND status = 'INSTALLED'
       RETURNING id`,
      [exportBatchId, ids]
    );

    return result.rows.map((r) => r.id);
  }

  static format(row) {
    if (!row) return null;

    return {
      id: row.id,
      discoId: row.disco_id,
      discoCode: row.disco_code,
      discoName: row.disco_name,
      accountNumber: row.account_number,

      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      customerAddress: row.customer_address,

      feederName: row.feeder_name,
      transformerName: row.transformer_name,
      transformerCode: row.transformer_code,
      region: row.region,
      area: row.area,

      meterType: row.meter_type,
      installationPosition: row.installation_position,
      meterVendor: row.meter_vendor,

      status: row.status,
      source: row.source,

      importBatchId: row.import_batch_id,
      sourceRowNumber: row.source_row_number,

      assignmentBatchId: row.assignment_batch_id,
      assignedTo: row.assigned_to,
      assigneeName: row.assignee_name,
      assignedBy: row.assigned_by,
      assignedAt: row.assigned_at,
      startedAt: row.started_at,

      meterId: row.meter_id,
      meterNumber: row.meter_number,
      sealNumber: row.seal_number,
      installationDate: row.installation_date,
      latitude: row.latitude === null || row.latitude === undefined ? null : parseFloat(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : parseFloat(row.longitude),
      installationPhotoUrl: row.installation_photo_url,
      discoSupervisor: row.disco_supervisor,
      installedBy: row.installed_by,
      installerName: row.installer_name,
      reportedAt: row.reported_at,
      installationNotes: row.installation_notes,
      failureReason: row.failure_reason,

      exportBatchId: row.export_batch_id,
      exportedAt: row.exported_at,
      exportCount: row.export_count,

      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = InstallationRequest;
