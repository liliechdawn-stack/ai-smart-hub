const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("🔧 Fixing automations table...");

db.serialize(() => {
  // First, check if the automations table exists and recreate it with correct schema
  db.run(`DROP TABLE IF EXISTS automations_temp`, (err) => {
    if (err) console.error("Error dropping temp table:", err);
  });

  // Create a new table with the correct schema
  db.run(`
    CREATE TABLE IF NOT EXISTS automations_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      icon TEXT DEFAULT '⚙️',
      trigger TEXT NOT NULL,
      action TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      live INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error("Error creating new table:", err);
    } else {
      console.log("✅ Created new automations table");
      
      // Copy data from old table if it exists
      db.run(`
        INSERT OR IGNORE INTO automations_new (id, user_id, title, icon, trigger, action, enabled, live, created_at)
        SELECT id, user_id, title, icon, trigger, action, enabled, live, created_at FROM automations
      `, (err) => {
        if (err) {
          console.log("No data to copy or table didn't exist");
        } else {
          console.log("✅ Copied existing data");
        }
        
        // Drop old table and rename new one
        db.run(`DROP TABLE IF EXISTS automations`, (err) => {
          if (err) console.error("Error dropping old table:", err);
          
          db.run(`ALTER TABLE automations_new RENAME TO automations`, (err) => {
            if (err) {
              console.error("Error renaming table:", err);
            } else {
              console.log("✅ Automations table fixed successfully!");
            }
            
            // Verify the table structure
            db.all(`PRAGMA table_info(automations)`, (err, columns) => {
              if (err) {
                console.error("Error verifying table:", err);
              } else {
                console.log("📊 Automations table columns:");
                columns.forEach(col => console.log(`   - ${col.name} (${col.type})`));
              }
              db.close();
            });
          });
        });
      });
    }
  });
});

console.log("🚀 Running database fix...");