require('dotenv').config();
const pool = require('../config/database');

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
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
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
    status VARCHAR(20) CHECK (status IN ('INITIATED', 'PAID', 'COMPLETED')) DEFAULT 'INITIATED',
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
    uploaded_by INTEGER REFERENCES users(id),
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
    created_by INTEGER REFERENCES users(id),
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
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
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
`;


const runMigration = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Running database migrations...');
    
    // Start transaction
    await client.query('BEGIN');
    
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
    
    // Create indexes (including new tables)
    await client.query(createIndexes);
    console.log('✅ Indexes created');

    // Create update triggers for tables
    await client.query(createUpdateTrigger);
    console.log('✅ Update trigger(s) created');
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('🎉 Migration completed successfully!');
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
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };