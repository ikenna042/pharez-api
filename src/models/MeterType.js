const pool = require('../config/database');

class MeterType {
  static async create({ discoId, name, amount, createdBy = null }) {
    const query = `
      INSERT INTO meter_types (disco_id, name, amount, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const result = await pool.query(query, [discoId, name, amount, createdBy]);
    return this.findById(result.rows[0].id);
  }

  static async findById(id) {
    const query = `
      SELECT mt.*, d.code AS disco_code
      FROM meter_types mt JOIN discos d ON d.id = mt.disco_id
      WHERE mt.id = $1 AND mt.is_active = true
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.format(result.rows[0]);
  }

  /**
   * Active prices, newest first. Prices differ per disco, so callers that use
   * the result to charge someone must pass discoId or discoCode -- an
   * unfiltered list mixes every disco's prices together.
   */
  static async findAll({ page = 1, limit = 20, discoId, discoCode } = {}) {
    const params = [];
    let where = 'WHERE mt.is_active = true';

    if (discoId) {
      params.push(discoId);
      where += ` AND mt.disco_id = $${params.length}`;
    }
    if (discoCode) {
      params.push(String(discoCode).toUpperCase());
      where += ` AND d.code = $${params.length}`;
    }

    const from = 'FROM meter_types mt JOIN discos d ON d.id = mt.disco_id';
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT mt.*, d.code AS disco_code ${from} ${where}
       ORDER BY mt.created_at DESC, mt.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const countRes = await pool.query(`SELECT COUNT(*) ${from} ${where}`, params);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    return {
      meterTypes: result.rows.map(r => this.format(r)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    };
  }

  static async update(id, { name, amount, updatedBy = null }) {
    // Build dynamic SET clause so partial updates don't overwrite fields with NULL
    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) {
      sets.push(`name = $${idx}`);
      params.push(name);
      idx++;
    }

    if (amount !== undefined) {
      sets.push(`amount = $${idx}`);
      params.push(amount);
      idx++;
    }

    // Always update updated_by and updated_at when performing an update
    sets.push(`updated_by = $${idx}`);
    params.push(updatedBy);
    idx++;

    sets.push('updated_at = CURRENT_TIMESTAMP');

    if (sets.length === 0) {
      // Nothing to update
      return await this.findById(id);
    }

    const setClause = sets.join(', ');
    const query = `
      UPDATE meter_types
      SET ${setClause}
      WHERE id = $${idx} AND is_active = true
      RETURNING id
    `;

    params.push(id);

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return null;
    return this.findById(result.rows[0].id);
  }

  // soft delete
  static async deactivate(id) {
    const query = `
      UPDATE meter_types mt
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      FROM discos d
      WHERE mt.id = $1 AND d.id = mt.disco_id
      RETURNING mt.*, d.code AS disco_code
    `;

    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.format(result.rows[0]);
  }

  static format(row) {
    if (!row) return null;
    return {
      id: row.id,
      discoId: row.disco_id,
      discoCode: row.disco_code ?? null,
      name: row.name,
      amount: parseFloat(row.amount),
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = MeterType;
