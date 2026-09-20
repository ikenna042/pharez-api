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
