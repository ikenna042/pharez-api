const pool = require('../config/database');

class Meter {
  
  static async findByMeterNumber(meterNumber) {
    const query = `
      SELECT * FROM meters
      WHERE meter_number = $1
    `;

    const result = await pool.query(query, [meterNumber]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatMeter(result.rows[0]);
  }

  static async findById(id) {
    const query = `
      SELECT * FROM meters
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatMeter(result.rows[0]);
  }

  static async findAll(options = {}) {
    const { page = 1, limit = 10, status, phaseType } = options;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM meters WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
        query += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }

    if (phaseType) {
      paramCount++;
        query += ` AND phase_type = $${paramCount}`;
      queryParams.push(phaseType);
    }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM meters WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;

    if (status) {
      countParamCount++;
        countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (phaseType) {
      countParamCount++;
        countQuery += ` AND phase_type = $${countParamCount}`;
      countParams.push(phaseType);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    return {
      meters: result.rows.map(row => this.formatMeter(row)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    };
  }

  static async create(data, uploadedBy = null) {
    const { meterNumber, simNumber, manufacturedDate, meterMake, model, phaseType, sgcNumber } = data;

    const query = `
      INSERT INTO meters (
        meter_number, sim_number, manufactured_date, meter_make, model, 
        phase_type, sgc_number, status, uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', $8)
      RETURNING *
    `;

    const result = await pool.query(query, [
      meterNumber, simNumber, manufacturedDate, meterMake, 
      model, phaseType, sgcNumber, uploadedBy
    ]);
    
    return this.formatMeter(result.rows[0]);
  }

  static async bulkCreate(metersData, uploadedBy = null) {
    const client = await pool.connect();
    const createdMeters = [];
    const errors = [];

    try {
      await client.query('BEGIN');

      for (let i = 0; i < metersData.length; i++) {
        try {
          const meterData = metersData[i];
          
          // Check if meter already exists
          const existingMeter = await client.query(
            'SELECT meter_number FROM meters WHERE meter_number = $1',
            [meterData.meterNumber]
          );

          if (existingMeter.rows.length > 0) {
            errors.push({
              row: i + 2, // +2 because of header and 0-index
              meterNumber: meterData.meterNumber,
              error: 'Meter already exists'
            });
            continue;
          }

          const query = `
            INSERT INTO meters (
              meter_number, sim_number, manufactured_date, meter_make, model, 
              phase_type, sgc_number, status, uploaded_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', $8)
            RETURNING *
          `;

          const result = await client.query(query, [
            meterData.meterNumber,
            meterData.simNumber,
            meterData.manufacturedDate,
            meterData.meterMake,
            meterData.model,
            meterData.phaseType,
            meterData.sgcNumber,
            uploadedBy
          ]);

          createdMeters.push(this.formatMeter(result.rows[0]));
        } catch (error) {
          errors.push({
            row: i + 2,
            meterNumber: metersData[i].meterNumber,
            error: error.message
          });
        }
      }

      await client.query('COMMIT');
      
      return { 
        success: true, 
        created: createdMeters.length,
        errors: errors.length,
        details: errors
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateStatus(meterNumber, status, installedAt = null) {
    let query = `
      UPDATE meters
      SET status = $1, updated_at = CURRENT_TIMESTAMP
    `;
    
    const params = [status];
    let paramCount = 1;

    if (installedAt && status === 'INSTALLED') {
      paramCount++;
        query += `, installed_at = $${paramCount}`;
      params.push(installedAt);
    }

    paramCount++;
      query += ` WHERE meter_number = $${paramCount} RETURNING *`;
    params.push(meterNumber);

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatMeter(result.rows[0]);
  }

  static async delete(meterNumber) {
    const query = `
      DELETE FROM meters
      WHERE meter_number = $1
      RETURNING id
    `;

    const result = await pool.query(query, [meterNumber]);
    return result.rows.length > 0;
  }

  static async getAvailableMeters(phaseType) {
    const query = `
      SELECT * FROM meters
      WHERE status = 'AVAILABLE' AND phase_type = $1
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query, [phaseType]);
    return result.rows.map(row => this.formatMeter(row));
  }

  static async getStatistics() {
    const query = `
      SELECT 
        COUNT(*) as total_meters,
        COUNT(*) FILTER (WHERE status = 'AVAILABLE') as available,
        COUNT(*) FILTER (WHERE status = 'INSTALLED') as installed,
        COUNT(*) FILTER (WHERE status = 'FAULTY') as faulty,
        COUNT(*) FILTER (WHERE status = 'RETIRED') as retired,
        COUNT(*) FILTER (WHERE phase_type = 'SINGLE PHASE') as single_phase,
        COUNT(*) FILTER (WHERE phase_type = 'THREE PHASE') as three_phase
      FROM meters
    `;

    const result = await pool.query(query);
    const stats = result.rows[0];

    return {
      totalMeters: parseInt(stats.total_meters),
      available: parseInt(stats.available),
      installed: parseInt(stats.installed),
      faulty: parseInt(stats.faulty),
      retired: parseInt(stats.retired),
      singlePhase: parseInt(stats.single_phase),
      threePhase: parseInt(stats.three_phase)
    };
  }

  static async checkUnique(meterNumber) {
    const query = 'SELECT id FROM meters WHERE meter_number = $1';
    const result = await pool.query(query, [meterNumber]);
    return result.rows.length === 0;
  }

  static formatMeter(dbRow) {
    if (!dbRow) return null;

    return {
      id: dbRow.id,
      meterNumber: dbRow.meter_number,
      simNumber: dbRow.sim_number,
      manufacturedDate: dbRow.manufactured_date,
      meterMake: dbRow.meter_make,
      model: dbRow.model,
      phaseType: dbRow.phase_type,
      sgcNumber: dbRow.sgc_number,
      status: dbRow.status,
      uploadedBy: dbRow.uploaded_by,
      uploadedAt: dbRow.uploaded_at,
      installedAt: dbRow.installed_at,
      createdAt: dbRow.created_at,
      updatedAt: dbRow.updated_at
    };
  }

  static camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

module.exports = Meter;