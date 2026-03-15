
const path = require("path");
const { supabase } = require('./database-supabase');

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// Removed SQLite serialization


// Helper Functions
const query = (sql, params = []) => new Promise((res, rej) => {
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows));
});

const getOne = (sql, params = []) => new Promise((res, rej) => {
  db.get(sql, params, (err, row) => err ? rej(err) : res(row));
});

module.exports = { db, query, getOne };