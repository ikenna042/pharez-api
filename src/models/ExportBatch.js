const pool = require('../config/database');

/** A generated response sheet: what was sent to a disco, when, and covering which rows. */
class ExportBatch {
  static generateRef(discoCode) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `EXP-${String(discoCode).slice(0, 8)}-${stamp}-${suffix}`;
  }

  static async create(
    { discoId, discoCode, exportType = 'INSTALLATION_RESPONSE', filters = {}, rowCount = 0, fileName, markedExported = false, generatedBy = null },
    client = pool
  ) {
    const result = await client.query(
      `INSERT INTO export_batches
         (batch_ref, disco_id, export_type, filters, row_count, file_name, marked_exported, generated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
       RETURNING *`,
      [
        this.generateRef(discoCode),
        discoId,
        exportType,
        JSON.stringify(filters),
        rowCount,
        fileName || null,
        markedExported,
        generatedBy
      ]
    );

    return this.format(result.rows[0]);
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT b.*, d.code AS disco_code FROM export_batches b
       JOIN discos d ON d.id = b.disco_id WHERE b.id = $1`,
      [id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async findAll({ page = 1, limit = 20, discoId } = {}) {
    const params = [];
    let where = '';

    if (discoId) {
      params.push(discoId);
      where = `WHERE b.disco_id = $${params.length}`;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM export_batches b ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT b.*, d.code AS disco_code FROM export_batches b
       JOIN discos d ON d.id = b.disco_id ${where}
       ORDER BY b.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(totalCount / limit);

    return {
      batches: result.rows.map((row) => this.format(row)),
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
      exportType: row.export_type,
      filters: row.filters || {},
      rowCount: row.row_count,
      fileName: row.file_name,
      markedExported: row.marked_exported,
      generatedBy: row.generated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = ExportBatch;
