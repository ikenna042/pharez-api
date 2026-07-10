const { Pool } = require('pg');

// Determine if SSL is required. 
// It is required if NODE_ENV is 'production' (for deployment) 
// OR if DB_SSL is explicitly set to 'true' (for local connection to cloud DB).
const isSslRequired = process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true';

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  
  // Conditionally apply SSL settings based on the environment variables
  ssl: isSslRequired ? { 
    // This setting is typically required for connecting to cloud providers like Render 
    // from an external client (your local machine).
    rejectUnauthorized: false 
  } : false,
  
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 6000,
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  // Exiting on an unexpected error to prevent connection leakage
  process.exit(-1); 
});

module.exports = pool;