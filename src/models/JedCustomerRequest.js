const pool = require('../config/database');

class JedCustomerRequest {
  
  static async create(data) {
    const {
      accountNumber,
      custNames,
      gsm,
      email,
      address,
      meterRecommended,
      discoCode,
      requestRef,
      region,
      rrr,
      amount,
      orderId,
      appId
    } = data;

    const query = `
      INSERT INTO jed_customer_request (
        account_number, cust_names, gsm, email, address, meter_recommended,
        disco_code, request_ref, region, rrr, amount, order_id, app_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'INITIATED')
      RETURNING *
    `;

    const values = [
      accountNumber, custNames, gsm, email, address, meterRecommended,
      discoCode, requestRef, region, rrr, amount, orderId, appId
    ];

    const result = await pool.query(query, values);
    return this.formatRequest(result.rows[0]);
  }

  static async findByAccountNumber(accountNumber) {
    const query = `
      SELECT * FROM jed_customer_request
      WHERE account_number = $1
    `;
    // console.log('Query:', query);

    const result = await pool.query(query, [accountNumber]);
    // console.log('Result:', result);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatRequest(result.rows[0]);
  }

  static async findByRRR(rrr) {
    const query = `
      SELECT * FROM jed_customer_request
      WHERE rrr = $1
    `;

    const result = await pool.query(query, [rrr]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatRequest(result.rows[0]);
  }

  static async markPaidByRRR(rrr, webhookPayload = null) {
    const query = `
      UPDATE jed_customer_request
      SET
        status = 'PAID',
        date_paid = NOW(),
        webhook_data = $2,
        updated_at = NOW()
      WHERE rrr = $1
      RETURNING *
    `;

    const webhookData = webhookPayload ? JSON.stringify(webhookPayload) : null;
    const result = await pool.query(query, [rrr, webhookData]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.formatRequest(result.rows[0]);
  }

  static async logWebhookPayment(accountNumber, webhookData) {
    const query = `
      UPDATE jed_customer_request
      SET 
        webhook_data = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE account_number = $2
    `;

    await pool.query(query, [JSON.stringify(webhookData), accountNumber]);
  }
  static async logWebhookPaymentByRRR(rrr, webhookData) {
    const query = `
      UPDATE jed_customer_request
      SET 
        webhook_data = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE rrr = $2
    `;

    await pool.query(query, [JSON.stringify(webhookData), rrr]);
  }

  static async updatePaymentDetails(accountNumber, paymentData, source = 'MANUAL') {
    const {
      applicantName,
      acctName,
      address,
      phone1,
      region,
      phone2,
      area,
      feeder,
      dtName,
      dtCode,
      meterType,
      pendingSince
    } = paymentData;

    const query = `
      UPDATE jed_customer_request
      SET 
        applicant_name = $1,
        cust_names = $2,
        address = $3,
        phone1 = $4,
        region = $5,
        phone2 = $6,
        area = $7,
        feeder = $8,
        dt_name = $9,
        dt_code = $10,
        meter_type = $11,
        pending_since = $12,
        date_paid = CURRENT_TIMESTAMP,
        status = 'PAID',
        payment_source = $13,
        updated_at = CURRENT_TIMESTAMP
      WHERE account_number = $14
      RETURNING *
    `;

    const values = [
      applicantName, acctName, address, phone1, region, phone2,
      area, feeder, dtName, dtCode, meterType, pendingSince, source, accountNumber
    ];

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.formatRequest(result.rows[0]);
  }

  static async updateInstallationDetails(accountNumber, user, installationData) {
    const { sealNo, meterNo } = installationData;
    // update vendor_id and vendor_name based on user info
    console.log('User info for installation update:', user);
    const vendorId = user.id;
    const vendorName = user.name || user.email || 'Unknown';
    const query = `
      UPDATE jed_customer_request
      SET 
        seal_no = $1,
        meter_no = $2,
        date_completed = CURRENT_TIMESTAMP,
        status = 'COMPLETED',
        vendor_id = $3,
        vendor_name = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE account_number = $5
      RETURNING *
    `;

    const result = await pool.query(query, [sealNo, meterNo, vendorId, vendorName, accountNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.formatRequest(result.rows[0]);
  }

  static async findAll(options = {}) {
    const { page = 1, limit = 10, status, vendorId, vendorName } = options;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM jed_customer_request WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }

    if (vendorId) {
      paramCount++;
      query += ` AND vendor_id = $${paramCount}`;
      queryParams.push(vendorId);
    }

    if (vendorName) {
      paramCount++;
      query += ` AND vendor_name = $${paramCount}`;
      queryParams.push(vendorName);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM jed_customer_request WHERE 1=1';
    const countParams = [];
    let cParamIndex = 0;

    if (status) {
      cParamIndex++;
      countQuery += ` AND status = $${cParamIndex}`;
      countParams.push(status);
    }

    if (vendorId) {
      cParamIndex++;
      countQuery += ` AND vendor_id = $${cParamIndex}`;
      countParams.push(vendorId);
    }

    if (vendorName) {
      cParamIndex++;
      countQuery += ` AND vendor_name = $${cParamIndex}`;
      countParams.push(vendorName);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    return {
      requests: result.rows.map(row => this.formatRequest(row)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    };
  }

  static formatRequest(dbRow) {
    if (!dbRow) return null;

    return {
      id: dbRow.id,
      accountNumber: dbRow.account_number,
      custNames: dbRow.cust_names,
      gsm: dbRow.gsm,
      email: dbRow.email,
      address: dbRow.address,
      meterRecommended: dbRow.meter_recommended,
      discoCode: dbRow.disco_code,
      requestRef: dbRow.request_ref,
      region: dbRow.region,
      rrr: dbRow.rrr,
      amount: dbRow.amount,
      orderId: dbRow.order_id,
      appId: dbRow.app_id,
      dateRequested: dbRow.date_requested,
      status: dbRow.status,
      applicantName: dbRow.applicant_name,
      phone1: dbRow.phone1,
      phone2: dbRow.phone2,
      area: dbRow.area,
      feeder: dbRow.feeder,
      dtName: dbRow.dt_name,
      dtCode: dbRow.dt_code,
      meterType: dbRow.meter_type,
      pendingSince: dbRow.pending_since,
      sealNo: dbRow.seal_no,
      meterNo: dbRow.meter_no,
      datePaid: dbRow.date_paid,
      dateCompleted: dbRow.date_completed,
      createdAt: dbRow.created_at,
      updatedAt: dbRow.updated_at
    };
  }

  static async count(filter = {}) {
    let query = 'SELECT COUNT(*) FROM jed_customer_request WHERE 1=1';
    const params = [];
    let paramIndex = 0;

    if (filter.status) {
      paramIndex++;
      query += ` AND status = $${paramIndex}`;
      params.push(filter.status);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  static async sum(column, filter = {}) {
    if (!column) throw new Error('Column name is required for sum()');

    let query = `SELECT COALESCE(SUM(${column}), 0) AS total FROM jed_customer_request WHERE 1=1`;
    const params = [];
    let paramIndex = 0;

    if (filter.status) {
      paramIndex++;
      query += ` AND status = $${paramIndex}`;
      params.push(filter.status);
    }

    const result = await pool.query(query, params);
    return parseFloat(result.rows[0].total);
  }

  static async findPayments(options = {}) {
    // options: { page, limit, status, startDate, endDate }
    const { page = 1, limit = 20, status, startDate, endDate } = options;
    const offset = (page - 1) * limit;

    const params = [];
    let idx = 1;

    let query = `SELECT cust_names, account_number, amount, meter_recommended, date_paid, date_completed, status, rrr, order_id, gsm, email, address, date_requested  FROM jed_customer_request WHERE 1=1`;

    if (status) {
      query += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    }

    // date filtering: if status is COMPLETED, filter by date_completed, otherwise by date_paid
    const dateField = status === 'COMPLETED' ? 'date_completed' : 'date_paid';

    if (startDate) {
      query += ` AND ${dateField} >= $${idx}`;
      params.push(startDate);
      idx++;
    }

    if (endDate) {
      query += ` AND ${dateField} <= $${idx}`;
      params.push(endDate);
      idx++;
    }

    query += ` ORDER BY ${dateField} DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // count
    let countQuery = 'SELECT COUNT(*) FROM jed_customer_request WHERE 1=1';
    const countParams = [];
    let cidx = 1;
    if (status) {
      countQuery += ` AND status = $${cidx}`;
      countParams.push(status);
      cidx++;
    }
    if (startDate) {
      countQuery += ` AND ${dateField} >= $${cidx}`;
      countParams.push(startDate);
      cidx++;
    }
    if (endDate) {
      countQuery += ` AND ${dateField} <= $${cidx}`;
      countParams.push(endDate);
      cidx++;
    }

    const countRes = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    return {
      payments: result.rows.map(r => ({
        custNames: r.cust_names,
        accountNumber: r.account_number,
        amount: parseFloat(r.amount),
        meterRecommended: r.meter_recommended,
        datePaid: r.date_paid,
        dateCompleted: r.date_completed,
        status: r.status,
        rrr: r.rrr,
        orderId: r.order_id,
        gsm: r.gsm,
        email: r.email,
        address: r.address,
        dateRequested: r.date_requested
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    };
  }

  static async findByLoggedInstaller(installerId, options = {}) {
    const { page = 1, limit = 10, status } = options;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM jed_customer_request WHERE vendor_id = $1';
    const queryParams = [installerId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM jed_customer_request WHERE vendor_id = $1';
    const countParams = [installerId];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    return {
      requests: result.rows.map(row => this.formatRequest(row)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    };
  }

  static async findInitiatedWithRrr() {
    const query = `
      SELECT * FROM jed_customer_request
      WHERE status = 'INITIATED' AND rrr IS NOT NULL
      ORDER BY date_requested ASC
    `;

    const result = await pool.query(query);
    return result.rows.map(row => this.formatRequest(row));
  }


}

module.exports = JedCustomerRequest;