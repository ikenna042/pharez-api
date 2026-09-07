const pool = require('../config/database');

/**
 * A disco (distribution company) and the per-disco configuration that makes the
 * installation flow data-driven: how to read their pending-installation and meter
 * spreadsheets, and how to shape the response sheet we send back.
 *
 * Adding a new disco is a data operation (POST /discos plus a mapping), not a deploy.
 */
class Disco {
  static async create({
    code,
    name,
    integrationMode = 'OFFLINE',
    importMapping = {},
    exportTemplate = {},
    contactEmail = null,
    createdBy = null
  }) {
    const query = `
      INSERT INTO discos (code, name, integration_mode, import_mapping, export_template, contact_email, created_by)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(query, [
      code.toUpperCase(),
      name,
      integrationMode,
      JSON.stringify(importMapping),
      JSON.stringify(exportTemplate),
      contactEmail,
      createdBy
    ]);

    return this.format(result.rows[0]);
  }

  static async findByCode(code) {
    const result = await pool.query(
      'SELECT * FROM discos WHERE code = $1',
      [String(code || '').toUpperCase()]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM discos WHERE id = $1', [id]);
    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async findAll({ page = 1, limit = 20, isActive } = {}) {
    const filters = [];
    const params = [];

    if (isActive !== undefined) {
      params.push(isActive);
      filters.push(`is_active = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM discos ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT * FROM discos ${where} ORDER BY code ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(totalCount / limit);

    return {
      discos: result.rows.map((row) => this.format(row)),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  static async update(code, { name, integrationMode, contactEmail, isActive, updatedBy = null }) {
    const sets = [];
    const params = [];

    const set = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (name !== undefined) set('name', name);
    if (integrationMode !== undefined) set('integration_mode', integrationMode);
    if (contactEmail !== undefined) set('contact_email', contactEmail);
    if (isActive !== undefined) set('is_active', isActive);

    set('updated_by', updatedBy);
    sets.push('updated_at = CURRENT_TIMESTAMP');

    params.push(String(code || '').toUpperCase());

    const result = await pool.query(
      `UPDATE discos SET ${sets.join(', ')} WHERE code = $${params.length} RETURNING *`,
      params
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async updateImportMapping(code, importMapping, updatedBy = null) {
    const result = await pool.query(
      `UPDATE discos
       SET import_mapping = $1::jsonb, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE code = $3
       RETURNING *`,
      [JSON.stringify(importMapping), updatedBy, String(code || '').toUpperCase()]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async updateExportTemplate(code, exportTemplate, updatedBy = null) {
    const result = await pool.query(
      `UPDATE discos
       SET export_template = $1::jsonb, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE code = $3
       RETURNING *`,
      [JSON.stringify(exportTemplate), updatedBy, String(code || '').toUpperCase()]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  /**
   * The import config for one import type ('pendingInstallations' | 'meterInventory'),
   * with defaults applied so callers never have to guard on missing keys.
   */
  static getImportConfig(disco, importType) {
    const config = disco && disco.importMapping ? disco.importMapping[importType] : null;
    if (!config || !config.fields || Object.keys(config.fields).length === 0) return null;

    return {
      sheetIndex: config.sheetIndex ?? 0,
      headerRow: config.headerRow ?? 1,
      keyField: config.keyField,
      captureExtras: config.captureExtras === true,
      fields: config.fields
    };
  }

  static getExportTemplate(disco, exportType = 'installationResponse') {
    const template = disco && disco.exportTemplate ? disco.exportTemplate[exportType] : null;
    if (!template || !Array.isArray(template.columns) || template.columns.length === 0) return null;
    return template;
  }

  static format(row) {
    if (!row) return null;

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      integrationMode: row.integration_mode,
      importMapping: row.import_mapping || {},
      exportTemplate: row.export_template || {},
      contactEmail: row.contact_email,
      isActive: row.is_active,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = Disco;
