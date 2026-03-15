const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // USERS: Businesses using your SaaS
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      business_id TEXT UNIQUE NOT NULL,
      business_name TEXT, 
      plan TEXT DEFAULT 'free',
      messages_used INTEGER DEFAULT 0,
      leads_used INTEGER DEFAULT 0,
      widget_key TEXT,
      is_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      widget_color TEXT DEFAULT '#d4af37',
      welcome_message TEXT DEFAULT 'How can I help you today?',
      ai_tone TEXT DEFAULT 'professional',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // KNOWLEDGE BASE: For RAG (AI Training Data)
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // CHATS: Threaded with session_id
  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id TEXT NOT NULL, 
      client_name TEXT DEFAULT 'Visitor',
      message TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // LEADS: Captured contact info
  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // PERFORMANCE INDEXES
  db.run(`CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_bus_id ON users(business_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_kb_user ON knowledge_base(user_id)`);
});

// Helper Functions
const query = (sql, params = []) => new Promise((res, rej) => {
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows));
});

const getOne = (sql, params = []) => new Promise((res, rej) => {
  db.get(sql, params, (err, row) => err ? rej(err) : res(row));
});

module.exports = { db, query, getOne };