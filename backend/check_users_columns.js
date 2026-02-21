const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error("❌ Failed to connect", err);
  console.log("✅ Database opened");
});

db.all("PRAGMA table_info(users);", (err, rows) => {
  if (err) {
    console.error("❌ Error fetching columns:", err);
  } else {
    console.log("📋 Columns in 'users' table:");
    rows.forEach(col => console.log(`- ${col.name} (${col.type})`));
  }
  db.close(() => console.log("🔒 Database closed"));
});
