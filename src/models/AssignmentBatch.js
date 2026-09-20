const pool = require('../config/database');
const Meter = require('./Meter');

/**
 * A batch handover to one installer. Two kinds share this table because both
 * carry identical headers (who, from whom, which disco, how many, when, note,
 * status); only the item payload differs, and that already lives elsewhere
 * (meter_assignments rows vs. installation_request.assignment_batch_id).
 * `assignment_type` decides which item table you join.
 */
class AssignmentBatch {
  static generateRef(type, discoCode) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `${type === 'METER' ? 'MB' : 'IB'}-${String(discoCode).slice(0, 8)}-${stamp}-${suffix}`;
  }

  static async createBatch(client, { type, discoId, discoCode, installerId, assignedBy, note, dispatchRef }) {
    const result = await client.query(
      `INSERT INTO assignment_batches
         (batch_ref, assignment_type, disco_id, installer_id, assigned_by, note, dispatch_ref, item_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
       RETURNING *`,
      [this.generateRef(type, discoCode), type, discoId, installerId, assignedBy, note || null, dispatchRef || null]
    );

    return result.rows[0];
  }

  /**
   * Assign specific meter serials to an installer.
   *
   * Partial success by design: unknown, already-assigned or already-installed
   * serials are reported per serial rather than failing the whole dispatch.
   * Meters are locked FOR UPDATE so two concurrent assignments cannot both claim
   * the same serial; the partial unique index on meter_assignments is the final
   * backstop.
   */
  static async assignMeters({ disco, installerId, assignedBy, meterNumbers, note, dispatchRef }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const found = await Meter.findManyByNumbers(meterNumbers, { client, forUpdate: true });
      const byNumber = new Map(found.map((m) => [m.meterNumber, m]));

      const assignable = [];
      const rejected = [];

      for (const number of meterNumbers) {
        const meter = byNumber.get(number);

        if (!meter) {
          rejected.push({ meterNumber: number, reason: 'Meter not found' });
        } else if (meter.assignmentStatus === 'ASSIGNED') {
          rejected.push({
            meterNumber: number,
            reason: meter.assignedTo === installerId
              ? 'Already assigned to this installer'
              : 'Already assigned to another installer'
          });
        } else if (meter.assignmentStatus === 'USED' || meter.status === 'INSTALLED') {
          rejected.push({ meterNumber: number, reason: 'Meter already installed' });
        } else if (meter.status !== 'AVAILABLE') {
          rejected.push({ meterNumber: number, reason: `Meter is ${meter.status}` });
        } else {
          assignable.push(meter);
        }
      }

      const batch = await this.createBatch(client, {
        type: 'METER',
        discoId: disco.id,
        discoCode: disco.code,
        installerId,
        assignedBy,
        note,
        dispatchRef
      });

      let assigned = [];

      if (assignable.length > 0) {
        assigned = await Meter.assignToInstaller(client, {
          meterIds: assignable.map((m) => m.id),
          batchId: batch.id,
          installerId
        });

        const params = [];
        const tuples = assigned.map((m) => {
          const values = [batch.id, m.id, m.meterNumber, installerId];
          const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
          params.push(...values);
          return `(${placeholders.join(', ')})`;
        });

        await client.query(
          `INSERT INTO meter_assignments (assignment_batch_id, meter_id, meter_number, installer_id)
           VALUES ${tuples.join(', ')}`,
          params
        );

        await client.query(
          'UPDATE assignment_batches SET item_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [assigned.length, batch.id]
        );
        batch.item_count = assigned.length;
      }

      await client.query('COMMIT');

      return {
        batch: this.format(batch),
        assigned: assigned.map((m) => m.meterNumber),
        rejected
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Return meters to stock and close the batch once nothing is left out. */
  static async returnMeters({ meterNumbers, returnedBy }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const found = await Meter.findManyByNumbers(meterNumbers, { client, forUpdate: true });
      const byNumber = new Map(found.map((m) => [m.meterNumber, m]));

      const returnable = [];
      const rejected = [];

      for (const number of meterNumbers) {
        const meter = byNumber.get(number);
        if (!meter) rejected.push({ meterNumber: number, reason: 'Meter not found' });
        else if (meter.assignmentStatus !== 'ASSIGNED') {
          rejected.push({ meterNumber: number, reason: `Meter is ${meter.assignmentStatus}, not ASSIGNED` });
        } else returnable.push(meter);
      }

      let returned = [];
      const touchedBatches = new Set(returnable.map((m) => m.assignmentBatchId).filter(Boolean));

      if (returnable.length > 0) {
        returned = await Meter.releaseAssignment(client, returnable.map((m) => m.id));

        await client.query(
          `UPDATE meter_assignments
           SET status = 'RETURNED', released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE meter_id = ANY($1::int[]) AND status = 'ASSIGNED'`,
          [returnable.map((m) => m.id)]
        );

        for (const batchId of touchedBatches) {
          await client.query(
            `UPDATE assignment_batches b
             SET returned_count = sub.returned,
                 status = CASE
                   WHEN sub.returned >= b.item_count THEN 'CLOSED'
                   WHEN sub.returned > 0 THEN 'PARTIALLY_RETURNED'
                   ELSE b.status
                 END,
                 closed_at = CASE WHEN sub.returned >= b.item_count THEN CURRENT_TIMESTAMP ELSE b.closed_at END,
                 updated_at = CURRENT_TIMESTAMP
             FROM (
               SELECT COUNT(*) FILTER (WHERE status = 'RETURNED') AS returned
               FROM meter_assignments WHERE assignment_batch_id = $1
             ) sub
             WHERE b.id = $1`,
            [batchId]
          );
        }
      }

      await client.query('COMMIT');

      return { returned: returned.map((m) => m.meterNumber), rejected, batchesTouched: [...touchedBatches] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign pending jobs to an installer, addressed by id or by account number.
   * Only PENDING and FAILED requests move, so an in-flight or finished job is
   * never silently reassigned.
   */
  static async assignInstallations({ disco, installerId, assignedBy, ids, accountNumbers, note, dispatchRef }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const selector = ids && ids.length
        ? { sql: 'id = ANY($2::int[])', value: ids }
        : { sql: 'account_number = ANY($2::varchar[])', value: accountNumbers };

      const existing = await client.query(
        `SELECT id, account_number, status, assigned_to
         FROM installation_request
         WHERE disco_id = $1 AND ${selector.sql}
         FOR UPDATE`,
        [disco.id, selector.value]
      );

      const requested = ids && ids.length ? ids.map(Number) : accountNumbers;
      const byKey = new Map(
        existing.rows.map((r) => [ids && ids.length ? r.id : r.account_number, r])
      );

      const assignable = [];
      const rejected = [];

      for (const key of requested) {
        const row = byKey.get(key);
        if (!row) {
          rejected.push({ key, reason: 'Installation request not found for this disco' });
        } else if (!['PENDING', 'FAILED'].includes(row.status)) {
          rejected.push({ key, accountNumber: row.account_number, reason: `Cannot assign a ${row.status} request` });
        } else {
          assignable.push(row);
        }
      }

      const batch = await this.createBatch(client, {
        type: 'INSTALLATION',
        discoId: disco.id,
        discoCode: disco.code,
        installerId,
        assignedBy,
        note,
        dispatchRef
      });

      let assigned = [];

      if (assignable.length > 0) {
        const result = await client.query(
          `UPDATE installation_request
           SET status = 'ASSIGNED',
               assigned_to = $1,
               assigned_by = $2,
               assignment_batch_id = $3,
               assigned_at = CURRENT_TIMESTAMP,
               failure_reason = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ANY($4::int[]) AND status = ANY(ARRAY['PENDING','FAILED'])
           RETURNING id, account_number`,
          [installerId, assignedBy, batch.id, assignable.map((r) => r.id)]
        );

        assigned = result.rows.map((r) => ({ id: r.id, accountNumber: r.account_number }));

        await client.query(
          'UPDATE assignment_batches SET item_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [assigned.length, batch.id]
        );
        batch.item_count = assigned.length;
      }

      await client.query('COMMIT');

      return { batch: this.format(batch), assigned, rejected };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Send assigned jobs back to the pool. */
  static async unassignInstallations({ discoId, ids, accountNumbers }) {
    const selector = ids && ids.length
      ? { sql: 'id = ANY($2::int[])', value: ids }
      : { sql: 'account_number = ANY($2::varchar[])', value: accountNumbers };

    const result = await pool.query(
      `UPDATE installation_request
       SET status = 'PENDING',
           assigned_to = NULL,
           assigned_by = NULL,
           assignment_batch_id = NULL,
           assigned_at = NULL,
           started_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE disco_id = $1 AND ${selector.sql} AND status = 'ASSIGNED'
       RETURNING id, account_number`,
      [discoId, selector.value]
    );

    return result.rows.map((r) => ({ id: r.id, accountNumber: r.account_number }));
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT b.*, d.code AS disco_code, d.name AS disco_name,
              i.first_name || ' ' || i.last_name AS installer_name,
              a.first_name || ' ' || a.last_name AS assigned_by_name
       FROM assignment_batches b
       JOIN discos d ON d.id = b.disco_id
       LEFT JOIN users i ON i.id = b.installer_id
       LEFT JOIN users a ON a.id = b.assigned_by
       WHERE b.id = $1`,
      [id]
    );

    return result.rows.length === 0 ? null : this.format(result.rows[0]);
  }

  /** The items in a batch: meters for a METER batch, requests for an INSTALLATION one. */
  static async findItems(batch) {
    if (batch.assignmentType === 'METER') {
      const result = await pool.query(
        `SELECT ma.meter_number, ma.status, ma.assigned_at, ma.released_at,
                m.phase_type, m.sim_number, m.status AS meter_status
         FROM meter_assignments ma
         JOIN meters m ON m.id = ma.meter_id
         WHERE ma.assignment_batch_id = $1
         ORDER BY ma.meter_number`,
        [batch.id]
      );

      return result.rows.map((r) => ({
        meterNumber: r.meter_number,
        assignmentStatus: r.status,
        meterStatus: r.meter_status,
        phaseType: r.phase_type,
        simNumber: r.sim_number,
        assignedAt: r.assigned_at,
        releasedAt: r.released_at
      }));
    }

    const result = await pool.query(
      `SELECT id, account_number, customer_name, customer_address, meter_type, status, meter_number
       FROM installation_request
       WHERE assignment_batch_id = $1
       ORDER BY account_number`,
      [batch.id]
    );

    return result.rows.map((r) => ({
      id: r.id,
      accountNumber: r.account_number,
      customerName: r.customer_name,
      customerAddress: r.customer_address,
      meterType: r.meter_type,
      status: r.status,
      meterNumber: r.meter_number
    }));
  }

  static async findAll({ page = 1, limit = 20, assignmentType, installerId, discoId, status } = {}) {
    const filters = [];
    const params = [];

    const add = (sql, value) => {
      if (value === undefined || value === null || value === '') return;
      params.push(value);
      filters.push(sql.replace('?', `$${params.length}`));
    };

    add('b.assignment_type = ?', assignmentType);
    add('b.installer_id = ?', installerId);
    add('b.disco_id = ?', discoId);
    add('b.status = ?', status);

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM assignment_batches b ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT b.*, d.code AS disco_code, d.name AS disco_name,
              i.first_name || ' ' || i.last_name AS installer_name,
              a.first_name || ' ' || a.last_name AS assigned_by_name
       FROM assignment_batches b
       JOIN discos d ON d.id = b.disco_id
       LEFT JOIN users i ON i.id = b.installer_id
       LEFT JOIN users a ON a.id = b.assigned_by
       ${where}
       ORDER BY b.assigned_at DESC
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
      assignmentType: row.assignment_type,
      discoId: row.disco_id,
      discoCode: row.disco_code,
      discoName: row.disco_name,
      installerId: row.installer_id,
      installerName: row.installer_name,
      assignedBy: row.assigned_by,
      assignedByName: row.assigned_by_name,
      dispatchRef: row.dispatch_ref,
      itemCount: row.item_count,
      returnedCount: row.returned_count,
      note: row.note,
      status: row.status,
      assignedAt: row.assigned_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = AssignmentBatch;
