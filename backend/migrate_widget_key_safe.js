const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error("❌ Failed to open database:", err);
  console.log("✅ Database opened");
});

db.serialize(() => {
  db.all(`PRAGMA table_info(users);`, (err, rows) => {
    if (err) {
      console.error("❌ Error checking table:", err);
      return db.close();
    }

    const hasWidgetKey = rows.some(row => row.name === "widget_key");
    if (hasWidgetKey) {
      console.log("ℹ️ 'widget_key' column already exists, nothing to do.");
    } else {
      db.run(`ALTER TABLE users ADD COLUMN widget_key TEXT`, (err) => {
        if (err) console.error("❌ Failed to add 'widget_key':", err);
        else console.log("✅ 'widget_key' column added successfully.");
      });
    }
  });
});

db.close(() => console.log("🔒 Database closed"));
