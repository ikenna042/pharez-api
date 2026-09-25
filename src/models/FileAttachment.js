const pool = require('../config/database');
const { resolveApiBaseUrl } = require('../config/swaggerServers');

/**
 * A file held in object storage, optionally attached to some other record.
 *
 * Polymorphic by design: entity_type/entity_id can point at any table, so there
 * is no foreign key and no cascade. Both are nullable because a file may be
 * uploaded before whatever references it exists.
 *
 * Only the object key is stored -- never a URL (the API base can change) and
 * never the bytes.
 */
class FileAttachment {
  static async create(
    {
      entityType = null,
      entityId = null,
      category = 'general',
      storageKey,
      contentType,
      sizeBytes,
      originalName = null,
      latitude = null,
      longitude = null,
      capturedAt = null,
      uploadedBy = null
    },
    client = pool
  ) {
    const result = await client.query(
      `INSERT INTO file_attachments
         (entity_type, entity_id, category, storage_key, content_type, size_bytes,
          original_name, latitude, longitude, captured_at, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        entityType || null,
        // entity_id is VARCHAR: binding a number makes Postgres compare varchar
        // to integer and error out.
        entityId === null || entityId === undefined || entityId === '' ? null : String(entityId),
        category,
        storageKey,
        contentType,
        sizeBytes,
        originalName,
        latitude ?? null,
        longitude ?? null,
        capturedAt || null,
        uploadedBy
      ]
    );

    return this.format(result.rows[0]);
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM file_attachments WHERE id = $1', [id]);
    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  /** For the public GET /files/:token route -- never expose the SERIAL id there. */
  static async findByToken(token) {
    const result = await pool.query('SELECT * FROM file_attachments WHERE public_token = $1', [token]);
    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static async findByEntity(entityType, entityId, { category } = {}) {
    const params = [entityType, String(entityId)];
    let where = 'WHERE entity_type = $1 AND entity_id = $2';

    if (category) {
      params.push(category);
      where += ` AND category = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT * FROM file_attachments ${where} ORDER BY created_at DESC, id DESC`,
      params
    );

    return result.rows.map((row) => this.format(row));
  }

  /** Returns the deleted row so the caller can remove the object it points at. */
  static async deleteById(id, client = pool) {
    const result = await client.query(
      'DELETE FROM file_attachments WHERE id = $1 RETURNING *',
      [id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  static format(row) {
    if (!row) return null;

    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      category: row.category,
      storageKey: row.storage_key,
      // Points at this API, never at the bucket: /files/:token signs a fresh
      // URL per request, so the link stays valid indefinitely and dies with
      // the row. Keyed by the UUID token, not the SERIAL id -- the route is
      // unauthenticated by design, so the token is the only thing standing in
      // for authorization and must not be sequentially guessable.
      url: `${resolveApiBaseUrl()}/files/${row.public_token}`,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      originalName: row.original_name,
      latitude: row.latitude === null || row.latitude === undefined ? null : parseFloat(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : parseFloat(row.longitude),
      capturedAt: row.captured_at,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at
    };
  }
}

module.exports = FileAttachment;
