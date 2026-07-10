const pool = require('../config/database');
const crypto = require('crypto');

class ApiKey {
  
  // Generate API key
  static generateApiKey() {
    return 'PHZ_' + crypto.randomBytes(32).toString('hex');
  }

  // Create API key
  static async create(data, createdBy = null) {
    const { keyName, description, permissions, expiresAt } = data;
    const apiKey = this.generateApiKey();

    const query = `
      INSERT INTO api_keys (
        key_name, api_key, description, permissions, expires_at, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      keyName,
      apiKey,
      description,
      JSON.stringify(permissions || []),
      expiresAt,
      createdBy
    ]);

    return this.formatApiKey(result.rows[0]);
  }

  // Find API key by key
  static async findByKey(apiKey) {
    const query = `
      SELECT * FROM api_keys
      WHERE api_key = $1 AND is_active = true
    `;

    const result = await pool.query(query, [apiKey]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const key = result.rows[0];

    // Check if expired
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return null;
    }

    return this.formatApiKey(key);
  }

  //find API key by name
  static async findByName(keyName) {
    const query = `
      SELECT * FROM api_keys
      WHERE key_name = $1
    `;

    const result = await pool.query(query, [keyName]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatApiKey(result.rows[0]);
  }

  // Update last used
  static async updateLastUsed(apiKey) {
    const query = `
      UPDATE api_keys
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE api_key = $1
    `;

    await pool.query(query, [apiKey]);
  }

  // Log API key usage
  static async logUsage(apiKeyId, data) {
    const {
      endpoint,
      method,
      ipAddress,
      userAgent,
      statusCode,
      responseTime,
      requestBody,
      responseBody,
      error
    } = data;

    const query = `
      INSERT INTO api_key_logs (
        api_key_id, endpoint, method, ip_address, user_agent,
        status_code, response_time, request_body, response_body, error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await pool.query(query, [
      apiKeyId,
      endpoint,
      method,
      ipAddress,
      userAgent,
      statusCode,
      responseTime,
      requestBody ? JSON.stringify(requestBody) : null,
      responseBody ? JSON.stringify(responseBody) : null,
      error
    ]);
  }

  // Get all API keys
  static async findAll(options = {}) {
    const { page = 1, limit = 10, isActive } = options;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM api_keys WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;

    if (isActive !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      queryParams.push(isActive);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM api_keys WHERE 1=1';
    const countParams = [];

    if (isActive !== undefined) {
      countQuery += ' AND is_active = $1';
      countParams.push(isActive);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    return {
      apiKeys: result.rows.map(row => this.formatApiKey(row)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    };
  }

  // Get API key by ID
  static async findById(id) {
    const query = 'SELECT * FROM api_keys WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatApiKey(result.rows[0]);
  }

  // Deactivate API key
  static async deactivate(id) {
    const query = `
      UPDATE api_keys
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatApiKey(result.rows[0]);
  }

  // Delete API key
  static async delete(id) {
    const query = 'DELETE FROM api_keys WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  }

  // Get usage statistics
  static async getUsageStats(apiKeyId, days = 7) {
    const query = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status_code < 400) as successful_requests,
        COUNT(*) FILTER (WHERE status_code >= 400) as failed_requests,
        AVG(response_time) as avg_response_time,
        MAX(response_time) as max_response_time,
        DATE(created_at) as date
      FROM api_key_logs
      WHERE api_key_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const result = await pool.query(query, [apiKeyId]);

    return result.rows.map(row => ({
      date: row.date,
      totalRequests: parseInt(row.total_requests),
      successfulRequests: parseInt(row.successful_requests),
      failedRequests: parseInt(row.failed_requests),
      avgResponseTime: Math.round(parseFloat(row.avg_response_time)),
      maxResponseTime: parseInt(row.max_response_time)
    }));
  }

  // Format API key
  static formatApiKey(dbRow) {
    if (!dbRow) return null;

    return {
      id: dbRow.id,
      keyName: dbRow.key_name,
      apiKey: dbRow.api_key,
      description: dbRow.description,
      permissions: dbRow.permissions || [],
      isActive: dbRow.is_active,
      expiresAt: dbRow.expires_at,
      lastUsedAt: dbRow.last_used_at,
      createdBy: dbRow.created_by,
      createdAt: dbRow.created_at,
      updatedAt: dbRow.updated_at
    };
  }
}

module.exports = ApiKey;