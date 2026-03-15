const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.all(
  "SELECT name FROM sqlite_master WHERE type='table'",
  (err, rows) => {
    if (err) {
      console.error(err);
    } else {
      console.log("📦 Tables found:");
      rows.forEach(r => console.log(" -", r.name));
    }
    db.close();
  }
);
