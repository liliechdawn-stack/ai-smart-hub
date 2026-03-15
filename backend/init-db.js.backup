const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to your existing database file
const dbPath = path.join(__dirname, 'database.sqlite'); 
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("🛠️ Initializing / Migrating Smart Hub settings table...");

    // 1. Create the full table if it doesn't exist
    db.run(`
        CREATE TABLE IF NOT EXISTS smart_hub_settings (
            user_id TEXT PRIMARY KEY,
            ai_instructions TEXT,
            ai_temp TEXT DEFAULT '0.7',
            ai_lang TEXT DEFAULT 'auto',
            booking_url TEXT,
            sentiment_enabled INTEGER DEFAULT 0,
            alert_email TEXT,
            handover_trigger TEXT DEFAULT 'human',
            webhook_url TEXT,
            apollo_key TEXT,
            auto_sync INTEGER DEFAULT 0,
            vision_sensitivity TEXT DEFAULT 'high',
            vision_area TEXT DEFAULT 'all',
            -- Active tracking for all tools
            brain_active INTEGER DEFAULT 0,
            booking_active INTEGER DEFAULT 0,
            sentiment_active INTEGER DEFAULT 0,
            handover_active INTEGER DEFAULT 0,
            webhook_active INTEGER DEFAULT 0,
            apollo_active INTEGER DEFAULT 0,
            followup_active INTEGER DEFAULT 0,
            vision_active INTEGER DEFAULT 0,
            analytics_active INTEGER DEFAULT 0
        )
    `, (err) => {
        if (err) {
            console.error("❌ Error creating smart_hub_settings table:", err.message);
        } else {
            console.log("✅ Table smart_hub_settings is ready (or already exists).");
        }
    });

    // 2. Add any missing columns (safe to run repeatedly)
    const missingColumns = [
        { name: 'apollo_key', type: 'TEXT' },
        { name: 'auto_sync', type: 'INTEGER DEFAULT 0' },
        { name: 'vision_sensitivity', type: 'TEXT DEFAULT "high"' },
        { name: 'vision_area', type: 'TEXT DEFAULT "all"' },
        { name: 'brain_active', type: 'INTEGER DEFAULT 0' },
        { name: 'booking_active', type: 'INTEGER DEFAULT 0' },
        { name: 'sentiment_active', type: 'INTEGER DEFAULT 0' },
        { name: 'handover_active', type: 'INTEGER DEFAULT 0' },
        { name: 'webhook_active', type: 'INTEGER DEFAULT 0' },
        { name: 'apollo_active', type: 'INTEGER DEFAULT 0' },
        { name: 'followup_active', type: 'INTEGER DEFAULT 0' },
        { name: 'vision_active', type: 'INTEGER DEFAULT 0' },
        { name: 'analytics_active', type: 'INTEGER DEFAULT 0' }
    ];

    missingColumns.forEach(col => {
        db.run(`ALTER TABLE smart_hub_settings ADD COLUMN ${col.name} ${col.type}`, (err) => {
            if (err && err.message.includes('duplicate column')) {
                console.log(`→ Column ${col.name} already exists (skipping)`);
            } else if (err) {
                console.error(`❌ Error adding column ${col.name}:`, err.message);
            } else {
                console.log(`✅ Added missing column: ${col.name}`);
            }
        });
    });

    console.log("🚀 Database migration complete. Close this script when done.");
});

db.close((err) => {
    if (err) console.error("Error closing DB:", err);
});