const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const {
      firstName,
      lastName,
      role = 'INSTALLER',
      nin,
      phone,
      email,
      password,
      homeAddress,
      officeAddress
    } = userData;

    const passwordHash = await bcrypt.hash(password, 12);

    const query = `
      INSERT INTO users (
        first_name, last_name, role, nin, phone, email, password_hash,
        home_address, office_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, first_name, last_name, role, nin, phone, email,
                home_address, office_address, is_active, created_at, updated_at
    `;

    const values = [
      firstName,
      lastName,
      role,
      nin,
      phone,
      email,
      passwordHash,
      homeAddress,
      officeAddress
    ];

    const result = await pool.query(query, values);
    return this.formatUser(result.rows[0]);
  }

  static async findById(id) {
    const query = `
      SELECT id, first_name, last_name, role, nin, phone, email,
             home_address, office_address, is_active, is_phone_verified, 
             is_email_verified, created_at, updated_at
      FROM users
      WHERE id = $1 AND is_active = true
    `;

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatUser(result.rows[0]);
  }

  static async findByPhone(phone) {
    const query = `
      SELECT id, first_name, last_name, role, nin, phone, email,
             home_address, office_address, password_hash, is_active, 
             is_phone_verified, is_email_verified, created_at, updated_at
      FROM users
      WHERE phone = $1 AND is_active = true
    `;

    const result = await pool.query(query, [phone]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return {
      ...this.formatUser(result.rows[0]),
      passwordHash: result.rows[0].password_hash
    };
  }

  static async findByEmail(email) {
    const query = `
      SELECT id, first_name, last_name, role, nin, phone, email,
             home_address, office_address, is_active, is_phone_verified, 
             is_email_verified, created_at, updated_at
      FROM users
      WHERE email = $1 AND is_active = true
    `;

    const result = await pool.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatUser(result.rows[0]);
  }

  static async findByNin(nin) {
    const query = `
      SELECT id, first_name, last_name, role, nin, phone, email,
             home_address, office_address, is_active, is_phone_verified, 
             is_email_verified, created_at, updated_at
      FROM users
      WHERE nin = $1 AND is_active = true
    `;

    const result = await pool.query(query, [nin]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatUser(result.rows[0]);
  }

  static async findAll(options = {}) {
    const { page = 1, limit = 10, role, search } = options;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, first_name, last_name, role, nin, phone, email,
             home_address, office_address, is_active, is_phone_verified, 
             is_email_verified, created_at, updated_at
      FROM users
      WHERE is_active = true
    `;

    const queryParams = [];
    let paramCount = 0;

    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      queryParams.push(role);
    }

    if (search) {
      paramCount++;
      query += ` AND (
        first_name ILIKE $${paramCount} OR 
        last_name ILIKE $${paramCount} OR 
        email ILIKE $${paramCount} OR 
        phone ILIKE $${paramCount}
      )`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    let countQuery = 'SELECT COUNT(*) FROM users WHERE is_active = true';
    const countParams = [];
    let countParamCount = 0;

    if (role) {
      countParamCount++;
      countQuery += ` AND role = $${countParamCount}`;
      countParams.push(role);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (
        first_name ILIKE $${countParamCount} OR 
        last_name ILIKE $${countParamCount} OR 
        email ILIKE $${countParamCount} OR 
        phone ILIKE $${countParamCount}
      )`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    return {
      users: result.rows.map(user => this.formatUser(user)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    };
  }

  static async updateById(id, updateData) {
    const allowedFields = [
      'firstName', 'lastName', 'role', 'email', 'homeAddress', 'officeAddress'
    ];

    const updates = [];
    const values = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        paramCount++;
        const dbField = this.camelToSnake(key);
        updates.push(`${dbField} = ${paramCount}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    paramCount++;
    updates.push(`updated_at = ${paramCount}`);
    values.push(new Date());

    paramCount++;
    values.push(id);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = ${paramCount} AND is_active = true
      RETURNING id, first_name, last_name, role, nin, phone, email,
                home_address, office_address, is_active, created_at, updated_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.formatUser(result.rows[0]);
  }

  static async softDeleteById(id) {
    const query = `
      UPDATE users
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_active = true
      RETURNING id
    `;

    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  }

  static async undoSoftDeleteById(id) {
    const query = `
      UPDATE users
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_active = false
      RETURNING id
    `;

    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  }

  static async hardDeleteById(id) {
    const query = `
      DELETE FROM users
      WHERE id = $1 AND is_active = false
      RETURNING id
    `;

    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  }

  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const query = `
      UPDATE users
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND is_active = true
      RETURNING id
    `;

    const result = await pool.query(query, [passwordHash, id]);
    return result.rows.length > 0;
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static formatUser(dbUser) {
    if (!dbUser) return null;

    return {
      id: dbUser.id,
      firstName: dbUser.first_name,
      lastName: dbUser.last_name,
      role: dbUser.role,
      nin: dbUser.nin,
      phone: dbUser.phone,
      email: dbUser.email,
      homeAddress: dbUser.home_address,
      officeAddress: dbUser.office_address,
      isActive: dbUser.is_active,
      isPhoneVerified: dbUser.is_phone_verified || false,
      isEmailVerified: dbUser.is_email_verified || false,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at
    };
  }

  static camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  static async checkUnique(field, value, excludeId = null) {
    let query = `SELECT id FROM users WHERE ${this.camelToSnake(field)} = $1 AND is_active = true`;
    const params = [value];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await pool.query(query, params);
    return result.rows.length === 0;
  }
}

module.exports = User;