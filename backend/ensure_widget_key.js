const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Make sure this path matches the one your app uses!
const dbPath = path.join(__dirname, "database.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Failed to connect to database", err);
    process.exit(1);
  } else {
    console.log("✅ Database opened:", dbPath);
  }
});

db.serialize(() => {
  // 1️⃣ Check if 'users' table exists
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='users';`, (err, row) => {
    if (err) {
      console.error("❌ Error checking tables:", err);
      db.close();
      return;
    }

    if (!row) {
      console.log("ℹ️ 'users' table does not exist yet. No action taken.");
      db.close();
      return;
    }

    // 2️⃣ Check if 'widget_key' column exists
    db.all(`PRAGMA table_info(users);`, (err, columns) => {
      if (err) {
        console.error("❌ Error reading table info:", err);
        db.close();
        return;
      }

      const hasWidgetKey = columns.some(col => col.name === "widget_key");

      if (hasWidgetKey) {
        console.log("ℹ️ 'widget_key' column already exists, nothing to do.");
      } else {
        // 3️⃣ Add 'widget_key' safely
        db.run(`ALTER TABLE users ADD COLUMN widget_key TEXT`, (err) => {
          if (err) {
            console.error("❌ Failed to add 'widget_key':", err);
          } else {
            console.log("✅ 'widget_key' column added successfully!");
          }
          db.close();
        });
        return;
      }

      db.close();
    });
  });
});
