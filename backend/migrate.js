// backend/migrate.js - Run this before deployment
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { db } = require('./database.js');

console.log('🚀 Starting database migration...');
console.log('📊 Checking all required tables...');

const requiredTables = [
  'users',
  'smart_hub_settings',
  'knowledge_base',
  'leads',
  'chats',
  'support_tickets',
  'live_sessions',
  'automations',
  'broadcasts',
  'incidents',
  'status_subscribers'
];

async function checkTables() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (err, tables) => {
      if (err) {
        console.error('❌ Error checking tables:', err);
        reject(err);
        return;
      }

      const existingTables = tables.map(t => t.name);
      let allGood = true;

      requiredTables.forEach(table => {
        if (existingTables.includes(table)) {
          console.log(`✅ Table exists: ${table}`);
        } else {
          console.log(`❌ Table missing: ${table} - This will cause errors!`);
          allGood = false;
        }
      });

      if (allGood) {
        console.log('✅ All required tables present!');
      } else {
        console.log('⚠️ Some tables are missing. Run the application to create them automatically.');
      }

      resolve(allGood);
    });
  });
}

async function checkData() {
  return new Promise((resolve, reject) => {
    // Check for incidents
    db.get(`SELECT COUNT(*) as count FROM incidents`, (err, row) => {
      if (err) {
        console.log('ℹ️ Incidents table empty or not yet created');
      } else if (row.count === 0) {
        console.log('📝 Adding sample incidents...');
        db.run(`
          INSERT INTO incidents (date, title, description, status) VALUES 
          (datetime('now', '-3 days'), 'Scheduled Maintenance', 'Database optimization completed successfully. No downtime.', 'resolved'),
          (datetime('now', '-8 days'), 'AI Response Delay', 'Cloudflare API experienced brief latency. Resolved within 5 minutes.', 'resolved'),
          (datetime('now', '-15 days'), 'Email Delivery Delay', 'Resend API had intermittent issues. All emails delivered.', 'resolved')
        `, (err) => {
          if (!err) console.log('✅ Sample incidents added');
        });
      } else {
        console.log(`✅ ${row.count} incidents found`);
      }
    });

    // Check for admin user
    db.get(`SELECT COUNT(*) as count FROM users WHERE email = 'ericchung992@gmail.com'`, (err, row) => {
      if (err) {
        console.log('ℹ️ Users table empty');
      } else if (row.count === 0) {
        console.log('⚠️ No admin user found. First login will create it.');
      } else {
        console.log('✅ Admin user exists');
      }
    });

    resolve();
  });
}

async function main() {
  console.log('\n🔍 Verifying database setup...\n');
  
  try {
    await checkTables();
    await checkData();
    
    console.log('\n📁 Database location:', path.join(__dirname, 'database.sqlite'));
    console.log('\n✅ Migration check complete!\n');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  }
}

main();