const pool = require('../config/database');

class MeterType {
  static async create({ name, amount, createdBy = null }) {
    const query = `
      INSERT INTO meter_types (name, amount, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await pool.query(query, [name, amount, createdBy]);
    return this.format(result.rows[0]);
  }

  static async findById(id) {
    const query = 'SELECT * FROM meter_types WHERE id = $1 AND is_active = true';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.format(result.rows[0]);
  }

  static async findAll({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const query = `SELECT * FROM meter_types WHERE is_active = true ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    const result = await pool.query(query, [limit, offset]);

    const countRes = await pool.query('SELECT COUNT(*) FROM meter_types WHERE is_active = true');
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
      RETURNING *
    `;

    params.push(id);

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return null;
    return this.format(result.rows[0]);
  }

  // soft delete
  static async deactivate(id) {
    const query = `
      UPDATE meter_types
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.format(result.rows[0]);
  }

  static format(row) {
    if (!row) return null;
    return {
      id: row.id,
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
