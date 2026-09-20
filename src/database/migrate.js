require('dotenv').config();
const pool = require('../config/database');
const { ABA_POWER_IMPORT_MAPPING, ABA_POWER_EXPORT_TEMPLATE } = require('../config/discoDefaults');

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('SUPERADMIN', 'ADMIN', 'INSTALLER')) DEFAULT 'INSTALLER',
    nin VARCHAR(11) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    home_address TEXT,
    office_address TEXT,
    is_active BOOLEAN DEFAULT true,
    is_phone_verified BOOLEAN DEFAULT false,
    is_email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createOtpTable = `
  CREATE TABLE IF NOT EXISTS otps (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    phone VARCHAR(20),
    email VARCHAR(255),
    otp_code VARCHAR(6) NOT NULL,
    otp_type VARCHAR(20) NOT NULL CHECK (otp_type IN ('phone_verification', 'email_verification', 'password_reset')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;



const createJedCustomerRequestTable = `
  CREATE TABLE IF NOT EXISTS jed_customer_request (
    id SERIAL PRIMARY KEY,
    account_number VARCHAR(50) UNIQUE NOT NULL,
    cust_names VARCHAR(255) NOT NULL,
    gsm VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    meter_recommended VARCHAR(50) NOT NULL,
    disco_code VARCHAR(50) NOT NULL,
    request_ref VARCHAR(100),
    region VARCHAR(100),
    rrr VARCHAR(50),
    amount DECIMAL(15, 2),
    order_id VARCHAR(100),
    app_id VARCHAR(100),
    date_requested TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('INITIATED', 'PAID', 'CONFIRMED', 'COMPLETED')) DEFAULT 'INITIATED',
    applicant_name VARCHAR(255),
    phone1 VARCHAR(20),
    phone2 VARCHAR(20),
    area VARCHAR(100),
    feeder VARCHAR(100),
    dt_name VARCHAR(100),
    dt_code VARCHAR(100),
    meter_type VARCHAR(50),
    pending_since TIMESTAMP WITH TIME ZONE,
    seal_no VARCHAR(100),
    meter_no VARCHAR(100),
    date_paid TIMESTAMP WITH TIME ZONE,
    date_completed TIMESTAMP WITH TIME ZONE,
    webhook_data JSONB,
    vendor_id VARCHAR(100),
    vendor_name VARCHAR(255),
    payment_source VARCHAR(20) DEFAULT 'MANUAL' CHECK (payment_source IN ('MANUAL', 'WEBHOOK')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;


const createMetersTable = `
  CREATE TABLE IF NOT EXISTS meters (
    id SERIAL PRIMARY KEY,
    meter_number VARCHAR(100) UNIQUE NOT NULL,
    sim_number VARCHAR(50),
    manufactured_date VARCHAR(20),
    meter_make VARCHAR(100),
    model VARCHAR(100),
    phase_type VARCHAR(50) CHECK (phase_type IN ('SINGLE PHASE', 'THREE PHASE')),
    sgc_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'INSTALLED', 'FAULTY', 'RETIRED')),
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    installed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createApiKeysTable = `
  CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createApiKeyLogsTable = `
  CREATE TABLE IF NOT EXISTS api_key_logs (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    status_code INTEGER,
    response_time INTEGER,
    request_body JSONB,
    response_body JSONB,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createMeterTypesTable = `
  CREATE TABLE IF NOT EXISTS meter_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

/* ---------------------------------------------------------------------------
 * Multi-disco installation flow (Aba Power and future discos).
 *
 * These tables are additive. The JED flow (jed_customer_request and everything
 * that reads it) is deliberately untouched: no new column, constraint, or
 * inbound foreign key targets that table. Migrating JED onto installation_request
 * is a separate, later phase.
 * ------------------------------------------------------------------------- */

/**
 * Resolve users.id's actual type rather than assuming it.
 *
 * The declaration above says UUID, and migrations/001-users-id-to-uuid.js brings
 * existing databases into line. This lookup keeps the tables below correct either
 * way -- on a fresh bootstrap, on a migrated database, and on one that has not
 * been migrated yet -- so the two can never drift apart again silently.
 */
const getUserIdType = async (client) => {
  const result = await client.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
  `);

  if (result.rows.length === 0) {
    throw new Error('Cannot determine users.id type: users table not found');
  }

  return result.rows[0].data_type === 'uuid' ? 'UUID' : 'INTEGER';
};

const createDiscosTable = (uid) => `
  CREATE TABLE IF NOT EXISTS discos (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    integration_mode VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
      CHECK (integration_mode IN ('OFFLINE', 'API')),
    import_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    export_template JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact_email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_by ${uid} REFERENCES users(id),
    updated_by ${uid} REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

// Reference data, so it lives here rather than in seed.js (which early-returns
// once any user exists and would therefore never run on a live database).
// ON CONFLICT DO NOTHING keeps re-runs safe and never clobbers mappings that
// were edited later through the API.
const seedDiscos = `
  INSERT INTO discos (code, name, integration_mode, import_mapping, export_template)
  VALUES
    ('ABA_POWER', 'Aba Power Limited Electric', 'OFFLINE', $1::jsonb, $2::jsonb),
    ('JED', 'Jos Electricity Distribution', 'API', '{}'::jsonb, '{}'::jsonb)
  ON CONFLICT (code) DO NOTHING;
`;

const createImportBatchesTable = (uid) => `
  CREATE TABLE IF NOT EXISTS import_batches (
    id SERIAL PRIMARY KEY,
    batch_ref VARCHAR(60) UNIQUE NOT NULL,
    disco_id INTEGER NOT NULL REFERENCES discos(id),
    import_type VARCHAR(30) NOT NULL
      CHECK (import_type IN ('PENDING_INSTALLATIONS', 'METER_INVENTORY')),
    file_name VARCHAR(255),
    file_size INTEGER,
    sheet_name VARCHAR(150),
    total_rows INTEGER DEFAULT 0,
    created_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'PROCESSING'
      CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    uploaded_by ${uid} REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createExportBatchesTable = (uid) => `
  CREATE TABLE IF NOT EXISTS export_batches (
    id SERIAL PRIMARY KEY,
    batch_ref VARCHAR(60) UNIQUE NOT NULL,
    disco_id INTEGER NOT NULL REFERENCES discos(id),
    export_type VARCHAR(30) NOT NULL DEFAULT 'INSTALLATION_RESPONSE'
      CHECK (export_type IN ('INSTALLATION_RESPONSE', 'METER_INVENTORY')),
    filters JSONB DEFAULT '{}'::jsonb,
    row_count INTEGER DEFAULT 0,
    file_name VARCHAR(255),
    marked_exported BOOLEAN DEFAULT false,
    generated_by ${uid} REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

// One table for both kinds of batch. Meter batches and installation batches have
// identical headers (who, from whom, which disco, how many, when, note, status);
// only the item payload differs, and that already lives in separate tables.
// assignment_type selects which item table you join.
const createAssignmentBatchesTable = (uid) => `
  CREATE TABLE IF NOT EXISTS assignment_batches (
    id SERIAL PRIMARY KEY,
    batch_ref VARCHAR(60) UNIQUE NOT NULL,
    assignment_type VARCHAR(20) NOT NULL
      CHECK (assignment_type IN ('METER', 'INSTALLATION')),
    disco_id INTEGER NOT NULL REFERENCES discos(id),
    installer_id ${uid} NOT NULL REFERENCES users(id),
    assigned_by ${uid} REFERENCES users(id),
    dispatch_ref VARCHAR(60),
    item_count INTEGER DEFAULT 0,
    returned_count INTEGER DEFAULT 0,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'PARTIALLY_RETURNED', 'CLOSED', 'CANCELLED')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const createInstallationRequestTable = (uid) => `
  CREATE TABLE IF NOT EXISTS installation_request (
    id SERIAL PRIMARY KEY,
    disco_id INTEGER NOT NULL REFERENCES discos(id),
    account_number VARCHAR(50) NOT NULL,

    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    customer_address TEXT,

    feeder_name VARCHAR(150),
    transformer_name VARCHAR(150),
    transformer_code VARCHAR(100),
    region VARCHAR(100),
    area VARCHAR(100),

    meter_type VARCHAR(50) CHECK (meter_type IN ('SINGLE PHASE', 'THREE PHASE')),
    installation_position VARCHAR(50),
    meter_vendor VARCHAR(150),

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSTALLED', 'EXPORTED', 'FAILED', 'CANCELLED')),
    source VARCHAR(20) NOT NULL DEFAULT 'IMPORT'
      CHECK (source IN ('IMPORT', 'API', 'MANUAL')),

    import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
    source_row_number INTEGER,
    source_row JSONB,

    assignment_batch_id INTEGER REFERENCES assignment_batches(id) ON DELETE SET NULL,
    assigned_to ${uid} REFERENCES users(id),
    assigned_by ${uid} REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,

    meter_id INTEGER REFERENCES meters(id),
    meter_number VARCHAR(100),
    seal_number VARCHAR(100),
    installation_date DATE,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    installation_photo_url TEXT,
    disco_supervisor VARCHAR(150),
    installed_by ${uid} REFERENCES users(id),
    reported_at TIMESTAMP WITH TIME ZONE,
    installation_notes TEXT,
    failure_reason TEXT,

    export_batch_id INTEGER REFERENCES export_batches(id) ON DELETE SET NULL,
    exported_at TIMESTAMP WITH TIME ZONE,
    export_count INTEGER DEFAULT 0,

    -- Reserved for the later JED migration; unused by the offline flow.
    -- status and payment_status are separate on purpose: the offline model has
    -- no payment step, the API model does, and the two must not be conflated.
    external_ref VARCHAR(100),
    payment_ref VARCHAR(50),
    payment_amount NUMERIC(15, 2),
    payment_status VARCHAR(20),
    payment_source VARCHAR(20),
    date_paid TIMESTAMP WITH TIME ZONE,
    date_confirmed TIMESTAMP WITH TIME ZONE,
    external_payload JSONB,

    created_by ${uid} REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

// Audit trail of every meter handover. The partial unique index below is the
// actual database-level guarantee that a meter is out with at most one installer
// at a time; the denormalized columns on `meters` are just the fast read path.
const createMeterAssignmentsTable = (uid) => `
  CREATE TABLE IF NOT EXISTS meter_assignments (
    id SERIAL PRIMARY KEY,
    assignment_batch_id INTEGER NOT NULL REFERENCES assignment_batches(id) ON DELETE CASCADE,
    meter_id INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    meter_number VARCHAR(100) NOT NULL,
    installer_id ${uid} NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED'
      CHECK (status IN ('ASSIGNED', 'USED', 'RETURNED', 'LOST')),
    installation_request_id INTEGER REFERENCES installation_request(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_meter_assignment_open
    ON meter_assignments (meter_id) WHERE status = 'ASSIGNED';
`;

// There is exactly ONE meter table in this system and it is `meters`. Assignment
// state is added as an orthogonal column rather than as new values in
// meters.status, because jedController requires status = 'AVAILABLE' before a JED
// installation. Putting 'ASSIGNED' in status would silently start rejecting JED
// installations for any meter an Aba supervisor had assigned.
const alterMetersAddAssignment = (uid) => `
  ALTER TABLE meters
    ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(20) DEFAULT 'UNASSIGNED',
    ADD COLUMN IF NOT EXISTS assigned_to ${uid} REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS assignment_batch_id INTEGER REFERENCES assignment_batches(id),
    ADD COLUMN IF NOT EXISTS installation_request_id INTEGER REFERENCES installation_request(id),
    ADD COLUMN IF NOT EXISTS phase_type_raw VARCHAR(100),
    ADD COLUMN IF NOT EXISTS import_batch_id INTEGER REFERENCES import_batches(id);

  UPDATE meters SET assignment_status = 'UNASSIGNED' WHERE assignment_status IS NULL;

  ALTER TABLE meters DROP CONSTRAINT IF EXISTS meters_assignment_status_check;
  ALTER TABLE meters
    ADD CONSTRAINT meters_assignment_status_check
    CHECK (assignment_status IN ('UNASSIGNED', 'ASSIGNED', 'USED', 'RETURNED', 'LOST'));
`;

const createIndexes = `
  CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_nin ON users(nin);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
  CREATE INDEX IF NOT EXISTS idx_otps_phone ON otps(phone);
  CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
  CREATE INDEX IF NOT EXISTS idx_otps_expires ON otps(expires_at);
  CREATE INDEX IF NOT EXISTS idx_jed_account_number ON jed_customer_request(account_number);
  CREATE INDEX IF NOT EXISTS idx_jed_status ON jed_customer_request(status);
  CREATE INDEX IF NOT EXISTS idx_jed_rrr ON jed_customer_request(rrr);
  CREATE INDEX IF NOT EXISTS idx_jed_date_requested ON jed_customer_request(date_requested);
  CREATE INDEX IF NOT EXISTS idx_meters_meter_number ON meters(meter_number);
  CREATE INDEX IF NOT EXISTS idx_meters_status ON meters(status);
  CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key);
  CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
  CREATE INDEX IF NOT EXISTS idx_api_key_logs_api_key_id ON api_key_logs(api_key_id);
  CREATE INDEX IF NOT EXISTS idx_api_key_logs_created_at ON api_key_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_meter_types_name ON meter_types(name);
  CREATE INDEX IF NOT EXISTS idx_meter_types_active ON meter_types(is_active);

  CREATE INDEX IF NOT EXISTS idx_discos_code ON discos(code);
  CREATE INDEX IF NOT EXISTS idx_discos_active ON discos(is_active);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_installation_request_disco_account
    ON installation_request(disco_id, account_number);
  CREATE INDEX IF NOT EXISTS idx_ir_status ON installation_request(status);
  CREATE INDEX IF NOT EXISTS idx_ir_disco_status ON installation_request(disco_id, status);
  CREATE INDEX IF NOT EXISTS idx_ir_assigned_to ON installation_request(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_ir_assignment_batch ON installation_request(assignment_batch_id);
  CREATE INDEX IF NOT EXISTS idx_ir_import_batch ON installation_request(import_batch_id);
  CREATE INDEX IF NOT EXISTS idx_ir_account_number ON installation_request(account_number);
  CREATE INDEX IF NOT EXISTS idx_ir_meter_number ON installation_request(meter_number);
  CREATE INDEX IF NOT EXISTS idx_ir_reported_at ON installation_request(reported_at);
  CREATE INDEX IF NOT EXISTS idx_ir_exported_at ON installation_request(exported_at);

  CREATE INDEX IF NOT EXISTS idx_assignment_batches_installer ON assignment_batches(installer_id);
  CREATE INDEX IF NOT EXISTS idx_assignment_batches_type ON assignment_batches(assignment_type);
  CREATE INDEX IF NOT EXISTS idx_assignment_batches_disco ON assignment_batches(disco_id);
  CREATE INDEX IF NOT EXISTS idx_assignment_batches_status ON assignment_batches(status);

  CREATE INDEX IF NOT EXISTS idx_meter_assignments_batch ON meter_assignments(assignment_batch_id);
  CREATE INDEX IF NOT EXISTS idx_meter_assignments_installer ON meter_assignments(installer_id);
  CREATE INDEX IF NOT EXISTS idx_meter_assignments_status ON meter_assignments(status);

  CREATE INDEX IF NOT EXISTS idx_import_batches_disco ON import_batches(disco_id);
  CREATE INDEX IF NOT EXISTS idx_import_batches_type ON import_batches(import_type);
  CREATE INDEX IF NOT EXISTS idx_export_batches_disco ON export_batches(disco_id);

  CREATE INDEX IF NOT EXISTS idx_meters_assigned_to ON meters(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_meters_assignment_status ON meters(assignment_status);
`;

const createUpdateTrigger = `
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  
  CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_jed_customer_request_updated_at ON jed_customer_request;
  
  CREATE TRIGGER update_jed_customer_request_updated_at
    BEFORE UPDATE ON jed_customer_request
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_meters_updated_at ON meters;
  
  CREATE TRIGGER update_meters_updated_at
    BEFORE UPDATE ON meters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
  
  CREATE TRIGGER update_api_keys_updated_at
      BEFORE UPDATE ON api_keys
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_meter_types_updated_at ON meter_types;

  CREATE TRIGGER update_meter_types_updated_at
    BEFORE UPDATE ON meter_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_discos_updated_at ON discos;

  CREATE TRIGGER update_discos_updated_at
    BEFORE UPDATE ON discos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_import_batches_updated_at ON import_batches;

  CREATE TRIGGER update_import_batches_updated_at
    BEFORE UPDATE ON import_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_export_batches_updated_at ON export_batches;

  CREATE TRIGGER update_export_batches_updated_at
    BEFORE UPDATE ON export_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_assignment_batches_updated_at ON assignment_batches;

  CREATE TRIGGER update_assignment_batches_updated_at
    BEFORE UPDATE ON assignment_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_installation_request_updated_at ON installation_request;

  CREATE TRIGGER update_installation_request_updated_at
    BEFORE UPDATE ON installation_request
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_meter_assignments_updated_at ON meter_assignments;

  CREATE TRIGGER update_meter_assignments_updated_at
    BEFORE UPDATE ON meter_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

const alterJedTableAddVendorColumns = `
  ALTER TABLE jed_customer_request
  ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255);
`;

const alterJedTableAddConfirmedStatus = `
  ALTER TABLE jed_customer_request
  ADD COLUMN IF NOT EXISTS date_confirmed TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_jed_error TEXT,
  ADD COLUMN IF NOT EXISTS jed_confirmation_attempts INTEGER DEFAULT 0;

  ALTER TABLE jed_customer_request DROP CONSTRAINT IF EXISTS jed_customer_request_status_check;
  ALTER TABLE jed_customer_request
  ADD CONSTRAINT jed_customer_request_status_check
  CHECK (status IN ('INITIATED', 'PAID', 'CONFIRMED', 'COMPLETED'));
`;


const runMigration = async (options = {}) => {
  const { dryRun = false } = options;
  const client = await pool.connect();

  try {
    console.log(dryRun
      ? '🔍 Running database migrations in DRY RUN mode (all changes will be rolled back)...'
      : '🔄 Running database migrations...');

    // Start transaction
    await client.query('BEGIN');

    // Ensure pgcrypto extension (for gen_random_uuid) is available
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    console.log('✅ pgcrypto extension ensured');
    
    // Create users table
    await client.query(createUsersTable);
    console.log('✅ Users table created');
    
    // Create OTP table
    await client.query(createOtpTable);
    console.log('✅ OTP table created');

    // Create JED customer request table
    await client.query(createJedCustomerRequestTable);
    console.log('✅ JED customer request table created');
    
    // Create meters table
    await client.query(createMetersTable);
    console.log('✅ Meters table created');

  // Create meter types table
  await client.query(createMeterTypesTable);
  console.log('✅ Meter types table created');

    // Create API keys table
    await client.query(createApiKeysTable);
    console.log('✅ API Keys table created');

    // Create API key logs table
    await client.query(createApiKeyLogsTable);
    console.log('✅ API Key Logs table created');

    /* --- Multi-disco installation flow (created in FK-dependency order) --- */

    const userIdType = await getUserIdType(client);
    console.log(`ℹ️  users.id resolved as ${userIdType}`);

    await client.query(createDiscosTable(userIdType));
    console.log('✅ Discos table created');

    await client.query(seedDiscos, [
      JSON.stringify(ABA_POWER_IMPORT_MAPPING),
      JSON.stringify(ABA_POWER_EXPORT_TEMPLATE)
    ]);
    console.log('✅ Discos seeded (ABA_POWER, JED)');

    await client.query(createImportBatchesTable(userIdType));
    console.log('✅ Import batches table created');

    await client.query(createExportBatchesTable(userIdType));
    console.log('✅ Export batches table created');

    await client.query(createAssignmentBatchesTable(userIdType));
    console.log('✅ Assignment batches table created');

    await client.query(createInstallationRequestTable(userIdType));
    console.log('✅ Installation request table created');

    await client.query(createMeterAssignmentsTable(userIdType));
    console.log('✅ Meter assignments table created');

    // Must run before createIndexes, which indexes the columns it adds
    await client.query(alterMetersAddAssignment(userIdType));
    console.log('✅ Ensured assignment columns exist on meters');

    // Create indexes (including new tables)
    await client.query(createIndexes);
    console.log('✅ Indexes created');

    // Create update triggers for tables
    await client.query(createUpdateTrigger);
    console.log('✅ Update trigger(s) created');

  // Ensure vendor columns exist on existing jed_customer_request table (for older DBs)
  await client.query(alterJedTableAddVendorColumns);
  console.log('✅ Ensured vendor columns exist on jed_customer_request');

  // Ensure date_confirmed and last_jed_error columns exist on existing jed_customer_request table (for older DBs)
  await client.query(alterJedTableAddConfirmedStatus);
  console.log('✅ Ensured date_confirmed and last_jed_error columns exist on jed_customer_request');
    
    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('🎉 Dry run completed successfully — every statement is valid, nothing was persisted.');
    } else {
      // Commit transaction
      await client.query('COMMIT');
      console.log('🎉 Migration completed successfully!');
    }
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration if called directly
if (require.main === module) {
  // `npm run migrate -- --dry-run` validates every statement then rolls back
  runMigration({ dryRun: process.argv.includes('--dry-run') })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };