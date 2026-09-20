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

  /**
   * Bulk insert from a disco-mapped inventory sheet.
   *
   * Deliberately not reusing bulkCreate above: that method does a SELECT then an
   * INSERT per row, which is ~12,000 round trips for the 6,167-row Aba inventory,
   * and its single transaction has no savepoints, so one real SQL error would
   * abort every later statement (Postgres 25P02).
   *
   * Here each chunk is savepointed and ON CONFLICT lets an already-known serial
   * count as skipped rather than as an error. Must be given an open transaction.
   */
  static async bulkCreateFromImport(rows, { client, uploadedBy = null, importBatchId = null }) {
    const columns = [
      'meter_number', 'sim_number', 'manufactured_date', 'meter_make', 'model',
      'phase_type', 'phase_type_raw', 'sgc_number', 'status', 'uploaded_by', 'import_batch_id'
    ];

    const created = [];
    const skipped = [];
    const errors = [];
    const CHUNK_SIZE = 500;

    const toParams = (row) => [
      row.meterNumber,
      row.simNumber ?? null,
      row.manufacturedDate ?? null,
      row.meterMake ?? null,
      row.model ?? null,
      row.phaseType ?? null,
      row.phaseTypeRaw ?? null,
      row.sgcNumber ?? null,
      'AVAILABLE',
      uploadedBy,
      importBatchId
    ];

    const insertChunk = async (chunk, offset) => {
      const params = [];
      const tuples = chunk.map((row) => {
        const values = toParams(row);
        const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
        params.push(...values);
        return `(${placeholders.join(', ')})`;
      });

      const result = await client.query(
        `INSERT INTO meters (${columns.join(', ')})
         VALUES ${tuples.join(', ')}
         ON CONFLICT (meter_number) DO NOTHING
         RETURNING meter_number`,
        params
      );

      const landed = new Set(result.rows.map((r) => r.meter_number));
      chunk.forEach((row, i) => {
        if (landed.has(row.meterNumber)) {
          created.push(row.meterNumber);
        } else {
          skipped.push({
            row: row.sourceRowNumber ?? offset + i + 1,
            meterNumber: row.meterNumber,
            reason: 'Meter already exists'
          });
        }
      });
    };

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE);
      const savepoint = `meter_chunk_${start}`;

      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        await insertChunk(chunk, start);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (chunkError) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);

        // A chunk can fail for a row-specific reason (bad data in one row) or a
        // systematic one (malformed SQL, missing column). Retrying row by row is
        // right for the first and pathological for the second: 6,000 rows x a
        // round trip each is hours of work to reach the same conclusion. So if the
        // first few rows all fail identically, treat it as systematic and stop.
        const SYSTEMATIC_THRESHOLD = 5;
        let consecutiveIdentical = 0;
        let lastMessage = null;
        let systematic = false;

        for (let i = 0; i < chunk.length; i++) {
          if (systematic) {
            errors.push({
              row: chunk[i].sourceRowNumber ?? start + i + 1,
              meterNumber: chunk[i].meterNumber,
              error: lastMessage
            });
            continue;
          }

          const rowSavepoint = `meter_row_${start}_${i}`;
          await client.query(`SAVEPOINT ${rowSavepoint}`);
          try {
            await insertChunk([chunk[i]], start + i);
            await client.query(`RELEASE SAVEPOINT ${rowSavepoint}`);
          } catch (rowError) {
            await client.query(`ROLLBACK TO SAVEPOINT ${rowSavepoint}`);
            await client.query(`RELEASE SAVEPOINT ${rowSavepoint}`);
            errors.push({
              row: chunk[i].sourceRowNumber ?? start + i + 1,
              meterNumber: chunk[i].meterNumber,
              error: rowError.message
            });

            consecutiveIdentical = rowError.message === lastMessage ? consecutiveIdentical + 1 : 1;
            lastMessage = rowError.message;
            if (consecutiveIdentical >= SYSTEMATIC_THRESHOLD) systematic = true;
          }
        }
      }
    }

    return { created, skipped, errors };
  }

  /**
   * Hand meters to an installer.
   *
   * Deliberately does NOT touch meters.status: JED gates installations on
   * status === 'AVAILABLE', so changing it here would silently start rejecting
   * JED work for any meter an Aba supervisor had assigned. Holder state lives in
   * assignment_status, which JED never reads.
   *
   * The WHERE clause is the guard: only unassigned, available meters move, so a
   * meter already out with someone else is simply not returned.
   */
  static async assignToInstaller(client, { meterIds, batchId, installerId }) {
    const result = await client.query(
      `UPDATE meters
       SET assignment_status = 'ASSIGNED',
           assigned_to = $1,
           assigned_at = CURRENT_TIMESTAMP,
           assignment_batch_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($3::int[])
         AND assignment_status = 'UNASSIGNED'
         AND status = 'AVAILABLE'
       RETURNING id, meter_number`,
      [installerId, batchId, meterIds]
    );

    return result.rows.map((r) => ({ id: r.id, meterNumber: r.meter_number }));
  }

  /** Return meters to stock. Only currently-assigned meters move. */
  static async releaseAssignment(client, meterIds) {
    const result = await client.query(
      `UPDATE meters
       SET assignment_status = 'UNASSIGNED',
           assigned_to = NULL,
           assigned_at = NULL,
           assignment_batch_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])
         AND assignment_status = 'ASSIGNED'
       RETURNING id, meter_number`,
      [meterIds]
    );

    return result.rows.map((r) => ({ id: r.id, meterNumber: r.meter_number }));
  }

  /**
   * Consume a meter on a completed installation. This is the one place the new
   * flow writes meters.status, and it writes the same 'INSTALLED' value the JED
   * flow already writes via updateStatus.
   */
  static async markUsedOnInstallation(client, meterId, installationRequestId) {
    const result = await client.query(
      `UPDATE meters
       SET assignment_status = 'USED',
           status = 'INSTALLED',
           installed_at = CURRENT_TIMESTAMP,
           installation_request_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND assignment_status = 'ASSIGNED'
       RETURNING *`,
      [installationRequestId, meterId]
    );

    return result.rows.length === 0 ? null : this.formatMeter(result.rows[0]);
  }

  /** Look up many meters by serial. `forUpdate` locks them for the caller's transaction. */
  static async findManyByNumbers(meterNumbers, { client = pool, forUpdate = false } = {}) {
    const result = await client.query(
      `SELECT * FROM meters WHERE meter_number = ANY($1::varchar[])${forUpdate ? ' FOR UPDATE' : ''}`,
      [meterNumbers]
    );

    return result.rows.map((row) => this.formatMeter(row));
  }

  /** The meters currently in one installer's hands. */
  static async findAssignedToInstaller(installerId, { page = 1, limit = 50, phaseType } = {}) {
    const params = [installerId];
    let where = `WHERE assigned_to = $1 AND assignment_status = 'ASSIGNED'`;

    if (phaseType) {
      params.push(phaseType);
      where += ` AND phase_type = $${params.length}`;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM meters ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT * FROM meters ${where} ORDER BY meter_number ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(totalCount / limit);

    return {
      meters: result.rows.map((row) => this.formatMeter(row)),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
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
      // Assignment state is separate from status on purpose: JED gates on
      // status === 'AVAILABLE', so handing a meter to an installer must not
      // change status. These keys are additive; nothing existing reads them.
      assignmentStatus: dbRow.assignment_status,
      assignedTo: dbRow.assigned_to,
      assignedAt: dbRow.assigned_at,
      assignmentBatchId: dbRow.assignment_batch_id,
      installationRequestId: dbRow.installation_request_id,
      phaseTypeRaw: dbRow.phase_type_raw,
      importBatchId: dbRow.import_batch_id,
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