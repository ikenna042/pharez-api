require('dotenv').config();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const seedUsers = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Seeding database...');
    
    // Check if users already exist
    const existingUsers = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(existingUsers.rows[0].count) > 0) {
      console.log('⚠️  Users already exist, skipping seed');
      return;
    }
    
    // Create default superadmin
    const superadminPassword = await bcrypt.hash(process.env.DEFAULT_PASSWORD, 12);

    const insertSuperAdmin = `
      INSERT INTO users (
        first_name, last_name, role, nin, phone, email, password_hash,
        home_address, office_address
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING id, first_name, last_name, role, phone, email;
    `;
    
    const superadminResult = await client.query(insertSuperAdmin, [
      'Super',
      'Admin',
      'SUPERADMIN',
      '12345678901',
      '08012345678',
      'superadmin@pharezapi.com',
      superadminPassword,
      '123 Admin Street, Lagos, Nigeria',
      'PharezAPI HQ, Victoria Island, Lagos'
    ]);
    
    console.log('✅ Superadmin created:', superadminResult.rows[0]);
    
    // Create sample admin
    const adminPassword = await bcrypt.hash(process.env.DEFAULT_PASSWORD, 12);

    const adminResult = await client.query(insertSuperAdmin, [
      'John',
      'Administrator',
      'ADMIN',
      '10987654321',
      '08023456789',
      'admin@pharezapi.com',
      adminPassword,
      '456 Admin Avenue, Abuja, Nigeria',
      'PharezAPI Branch, Central Business District, Abuja'
    ]);
    
    console.log('✅ Admin created:', adminResult.rows[0]);
    
    // Create sample installer
    const installerPassword = await bcrypt.hash(process.env.DEFAULT_PASSWORD, 12);

    const installerResult = await client.query(insertSuperAdmin, [
      'Mike',
      'Installer',
      'INSTALLER',
      '11122233344',
      '08034567890',
      'installer@pharezapi.com',
      installerPassword,
      '789 Field Street, Port Harcourt, Nigeria',
      'PharezAPI Service Center, Trans Amadi, Port Harcourt'
    ]);
    
    console.log('✅ Installer created:', installerResult.rows[0]);
    
    console.log('🎉 Seeding completed successfully!');
    console.log('\n📋 Default Login Credentials:');
    console.log('SUPERADMIN - Phone: 08012345678, Password: ' + process.env.DEFAULT_PASSWORD);
    console.log('ADMIN - Phone: 08023456789, Password: ' + process.env.DEFAULT_PASSWORD);
    console.log('INSTALLER - Phone: 08034567890, Password: ' + process.env.DEFAULT_PASSWORD);

    // Seed meter types if not present
    try {
      const meterTypesCount = await client.query('SELECT COUNT(*) FROM meter_types');
      if (parseInt(meterTypesCount.rows[0].count, 10) === 0) {
        const superadminId = superadminResult.rows[0].id;
        const insertMeterType = `
          INSERT INTO meter_types (name, amount, created_by)
          VALUES ($1, $2, $3)
          RETURNING id, name, amount;
        `;

        const singlePhase = await client.query(insertMeterType, ['Single Phase', 45000.00, superadminId]);
        console.log('✅ Seeded meter type:', singlePhase.rows[0]);

        const threePhase = await client.query(insertMeterType, ['Three Phase', 67000.00, superadminId]);
        console.log('✅ Seeded meter type:', threePhase.rows[0]);
      } else {
        console.log('⚠️  Meter types already exist, skipping seed');
      }
    } catch (err) {
      console.error('Failed to seed meter types:', err);
    }

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run seed if called directly
if (require.main === module) {
  seedUsers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedUsers };