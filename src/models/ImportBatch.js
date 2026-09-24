const pool = require('../config/database');

/**
 * One spreadsheet upload. Records what was imported, how it went, and the
 * per-row errors, so a failed import is diagnosable after the fact.
 *
 * The file bytes themselves are never stored -- this codebase has no disk or
 * object storage, and the parsed rows already live in their destination tables.
 */
class ImportBatch {
  static generateRef(discoCode, importType) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    const kind = importType === 'METER_INVENTORY' ? 'MET' : 'PND';
    return `IMP-${String(discoCode).slice(0, 8)}-${kind}-${stamp}-${suffix}`;
  }

  /** Opens a PROCESSING batch. Accepts a client so it can join the caller's transaction. */
  static async create(
    { discoId, discoCode, importType, fileName, fileSize, sheetName, uploadedBy = null },
    client = pool
  ) {
    const result = await client.query(
      `INSERT INTO import_batches
         (batch_ref, disco_id, import_type, file_name, file_size, sheet_name, uploaded_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSING')
       RETURNING *`,
      [
        this.generateRef(discoCode, importType),
        discoId,
        importType,
        fileName || null,
        fileSize || null,
        sheetName || null,
        uploadedBy
      ]
    );

    return this.format(result.rows[0]);
  }

  static async complete(
    id,
    { totalRows = 0, createdCount = 0, skippedCount = 0, errors = [] },
    client = pool
  ) {
    const result = await client.query(
      `UPDATE import_batches
       SET status = 'COMPLETED', total_rows = $1, created_count = $2, skipped_count = $3,
           error_count = $4, errors = $5::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [totalRows, createdCount, skippedCount, errors.length, JSON.stringify(errors), id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async fail(id, message, client = pool) {
    const result = await client.query(
      `UPDATE import_batches
       SET status = 'FAILED', error_count = 1,
           errors = $1::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify([{ error: String(message) }]), id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT b.*, d.code AS disco_code, d.name AS disco_name
       FROM import_batches b
       JOIN discos d ON d.id = b.disco_id
       WHERE b.id = $1`,
      [id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async findAll({ page = 1, limit = 20, discoId, importType, status } = {}) {
    const filters = [];
    const params = [];

    const add = (sql, value) => {
      if (value === undefined || value === null || value === '') return;
      params.push(value);
      filters.push(sql.replace('?', `$${params.length}`));
    };

    add('b.disco_id = ?', discoId);
    add('b.import_type = ?', importType);
    add('b.status = ?', status);

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM import_batches b ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT b.*, d.code AS disco_code, d.name AS disco_name
       FROM import_batches b
       JOIN discos d ON d.id = b.disco_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(totalCount / limit);

    // The errors blob can be large, so list responses omit it; fetch one batch to see it.
    return {
      batches: result.rows.map((row) => {
        const formatted = this.format(row);
        delete formatted.errors;
        return formatted;
      }),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Undo an import: remove the rows it created, but only the ones nothing
   * real depends on yet. Mirrors the exact safety rules used in the manual
   * database cleanup this codebase has needed before:
   *
   *  - PENDING_INSTALLATIONS: only rows still in PENDING/ASSIGNED/FAILED/
   *    CANCELLED are removed. INSTALLED/EXPORTED/IN_PROGRESS rows represent
   *    real field work or a report already sent to the disco, so they are
   *    left alone and counted as skipped, not deleted.
   *  - METER_INVENTORY: only meters that are still UNASSIGNED and not
   *    referenced by any installation_request.meter_id are removed. A meter
   *    already dispatched or installed stays.
   *
   * One transaction; nothing is removed if anything after it fails.
   */
  static async undo(id) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const batchResult = await client.query('SELECT * FROM import_batches WHERE id = $1', [id]);
      if (batchResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const batch = batchResult.rows[0];

      let deletedCount = 0;
      let skippedCount = 0;
      const skippedByReason = {};

      if (batch.import_type === 'PENDING_INSTALLATIONS') {
        const REVERSIBLE = ['PENDING', 'ASSIGNED', 'FAILED', 'CANCELLED'];

        const skipped = await client.query(
          `SELECT status, COUNT(*)::int AS n FROM installation_request
           WHERE import_batch_id = $1 AND status != ALL($2::varchar[])
           GROUP BY status`,
          [id, REVERSIBLE]
        );
        skipped.rows.forEach((r) => { skippedByReason[r.status] = r.n; skippedCount += r.n; });

        // Defensive, mirrors the manual cleanup precedent: meters.installation_
        // request_id is a NO ACTION FK, so a meter's back-reference to a row
        // about to be deleted would otherwise block the delete outright. In
        // practice only INSTALLED rows ever get this reference (set alongside
        // reaching that status), and INSTALLED rows are never in REVERSIBLE --
        // this exists so that invariant changing later can't reintroduce the bug.
        await client.query(
          `UPDATE meters SET installation_request_id = NULL
           WHERE installation_request_id IN (
             SELECT id FROM installation_request
             WHERE import_batch_id = $1 AND status = ANY($2::varchar[])
           )`,
          [id, REVERSIBLE]
        );

        // Keep each touched batch's cached item_count honest.
        await client.query(
          `UPDATE assignment_batches ab
           SET item_count = GREATEST(0, ab.item_count - sub.n), updated_at = CURRENT_TIMESTAMP
           FROM (
             SELECT assignment_batch_id, COUNT(*)::int AS n
             FROM installation_request
             WHERE import_batch_id = $1 AND status = ANY($2::varchar[])
               AND assignment_batch_id IS NOT NULL
             GROUP BY assignment_batch_id
           ) sub
           WHERE ab.id = sub.assignment_batch_id`,
          [id, REVERSIBLE]
        );

        const deleted = await client.query(
          `DELETE FROM installation_request
           WHERE import_batch_id = $1 AND status = ANY($2::varchar[])
           RETURNING id`,
          [id, REVERSIBLE]
        );
        deletedCount = deleted.rowCount;
      } else if (batch.import_type === 'METER_INVENTORY') {
        const skipped = await client.query(
          `SELECT
             CASE WHEN assignment_status != 'UNASSIGNED' THEN assignment_status ELSE 'IN_USE' END AS reason,
             COUNT(*)::int AS n
           FROM meters
           WHERE import_batch_id = $1
             AND (assignment_status != 'UNASSIGNED'
                  OR id IN (SELECT meter_id FROM installation_request WHERE meter_id IS NOT NULL))
           GROUP BY 1`,
          [id]
        );
        skipped.rows.forEach((r) => { skippedByReason[r.reason] = r.n; skippedCount += r.n; });

        const deleted = await client.query(
          `DELETE FROM meters
           WHERE import_batch_id = $1
             AND assignment_status = 'UNASSIGNED'
             AND id NOT IN (SELECT meter_id FROM installation_request WHERE meter_id IS NOT NULL)
           RETURNING id`,
          [id]
        );
        deletedCount = deleted.rowCount;
      } else {
        await client.query('ROLLBACK');
        throw Object.assign(new Error(`Unknown import_type "${batch.import_type}"`), { statusCode: 400 });
      }

      await client.query('COMMIT');

      return {
        batchId: id,
        importType: batch.import_type,
        deletedCount,
        skippedCount,
        skippedByReason
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  static format(row) {
    if (!row) return null;

    return {
      id: row.id,
      batchRef: row.batch_ref,
      discoId: row.disco_id,
      discoCode: row.disco_code,
      discoName: row.disco_name,
      importType: row.import_type,
      fileName: row.file_name,
      fileSize: row.file_size,
      sheetName: row.sheet_name,
      totalRows: row.total_rows,
      created: row.created_count,
      skipped: row.skipped_count,
      failed: row.error_count,
      errors: row.errors || [],
      status: row.status,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = ImportBatch;
