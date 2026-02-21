const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ===============================
// DATABASE CONNECTION
// ===============================
const dbPath = path.join(__dirname, "database.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Failed to connect to database", err);
  } else {
    console.log("✅ SQLite database connected");
  }
});

// ===============================
// INITIALIZE / MIGRATE TABLES
// ===============================
db.serialize(() => {
  // USERS (Businesses)
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
      voice_enabled INTEGER DEFAULT 1,
      voice_pitch REAL DEFAULT 1.1,
      voice_rate REAL DEFAULT 0.9,
      about_business TEXT,
      booking_url TEXT,
      sentiment_alerts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // SMART HUB SETTINGS (Detailed AI Logic)
  // UPDATED: Added tracking columns for all new tools
  db.run(`
    CREATE TABLE IF NOT EXISTS smart_hub_settings (
      user_id INTEGER PRIMARY KEY,
      ai_instructions TEXT,
      ai_temp REAL DEFAULT 0.7,
      ai_lang TEXT DEFAULT 'auto',
      webhook_url TEXT,
      booking_url TEXT,
      handover_trigger TEXT DEFAULT 'human',
      sentiment_enabled INTEGER DEFAULT 0,
      alert_email TEXT,
      booking_active INTEGER DEFAULT 0,
      webhook_active INTEGER DEFAULT 0,
      brain_active INTEGER DEFAULT 1,
      sentiment_active INTEGER DEFAULT 0,
      handover_active INTEGER DEFAULT 0,
      apollo_active INTEGER DEFAULT 0,
      followup_active INTEGER DEFAULT 0,
      vision_active INTEGER DEFAULT 0,
      analytics_active INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // BACKWARD COMPATIBILITY (MIGRATIONS for users table)
  const columns = [
    { name: "business_name", type: "TEXT" },
    { name: "plan", type: "TEXT DEFAULT 'free'" },
    { name: "messages_used", type: "INTEGER DEFAULT 0" },
    { name: "leads_used", type: "INTEGER DEFAULT 0" },
    { name: "widget_key", type: "TEXT" },
    { name: "is_verified", type: "INTEGER DEFAULT 0" },
    { name: "verification_token", type: "TEXT" },
    { name: "widget_color", type: "TEXT DEFAULT '#d4af37'" },
    { name: "welcome_message", type: "TEXT DEFAULT 'How can I help you today?'" },
    { name: "ai_tone", type: "TEXT DEFAULT 'professional'" },
    { name: "voice_enabled", type: "INTEGER DEFAULT 1" },
    { name: "voice_pitch", type: "REAL DEFAULT 1.1" },
    { name: "voice_rate", type: "REAL DEFAULT 0.9" },
    { name: "about_business", type: "TEXT" },
    { name: "booking_url", type: "TEXT" },
    { name: "sentiment_alerts", type: "INTEGER DEFAULT 0" }
  ];

  columns.forEach((col) => {
    db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`, (err) => {
      // Ignore errors if column already exists
    });
  });

  // BACKWARD COMPATIBILITY (MIGRATIONS for smart_hub_settings table)
  // UPDATED: Added migrations for the new active tracking flags
  const smartHubColumns = [
    { name: "booking_url", type: "TEXT" },
    { name: "booking_active", type: "INTEGER DEFAULT 0" },
    { name: "webhook_active", type: "INTEGER DEFAULT 0" },
    { name: "brain_active", type: "INTEGER DEFAULT 1" },
    { name: "sentiment_active", type: "INTEGER DEFAULT 0" },
    { name: "handover_active", type: "INTEGER DEFAULT 0" },
    { name: "apollo_active", type: "INTEGER DEFAULT 0" },
    { name: "followup_active", type: "INTEGER DEFAULT 0" },
    { name: "vision_active", type: "INTEGER DEFAULT 0" },
    { name: "analytics_active", type: "INTEGER DEFAULT 0" }
  ];

  smartHubColumns.forEach((col) => {
    db.run(
      `ALTER TABLE smart_hub_settings ADD COLUMN ${col.name} ${col.type}`,
      () => {}
    );
  });

  // KNOWLEDGE BASE
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

  // LEADS
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

  // CHATS
  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_id TEXT,
      client_name TEXT NOT NULL,
      message TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // SUPPORT TICKETS
  db.run(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // LIVE CHAT SESSIONS
  db.run(`
    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
});

// ===============================
// USERS / BUSINESSES
// ===============================

function createUser(email, password, business_id, business_name, vToken) {
  return new Promise((resolve, reject) => {
    const cleanEmail = email.toLowerCase().trim();
    db.run(
      `INSERT INTO users (email, password, business_id, business_name, verification_token)
       VALUES (?, ?, ?, ?, ?)`,
      [cleanEmail, password, business_id, business_name, vToken],
      function (err) {
        if (err) return reject(err);
        const userId = this.lastID;
        // Also initialize an empty smart hub entry for them
        db.run(`INSERT INTO smart_hub_settings (user_id) VALUES (?)`, [userId]);
        resolve(userId);
      }
    );
  });
}

function verifyUser(token) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?`,
      [token],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const cleanEmail = email.toLowerCase().trim();
    db.get(`SELECT * FROM users WHERE email = ?`, [cleanEmail], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function getUserByBusinessId(business_id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE business_id = ?`, [business_id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// ===============================
// SAAS CUSTOMIZATION
// ===============================
function updateWidgetSettings(user_id, color, welcomeMsg, tone) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET widget_color = ?, welcome_message = ?, ai_tone = ? WHERE id = ?`,
      [color, welcomeMsg, tone, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

// UPDATED: Advanced Smart Hub Settings Logic
// This now handles the new tool types: Apollo, Vision, Follow-up, and Analytics
function updateSmartSettings(user_id, toolType, data) {
  return new Promise((resolve, reject) => {
    let query = "";
    let params = [];

    // Ensure entry exists
    db.run(`INSERT OR IGNORE INTO smart_hub_settings (user_id) VALUES (?)`, [user_id]);

    switch(toolType) {
      case 'brain':
        query = `UPDATE smart_hub_settings SET ai_instructions = ?, ai_temp = ?, ai_lang = ?, brain_active = 1 WHERE user_id = ?`;
        params = [data.instructions, data.temp, data.lang, user_id];
        break;
      case 'booking':
        query = `UPDATE smart_hub_settings SET booking_url = ?, booking_active = 1 WHERE user_id = ?`;
        params = [data.url, user_id];
        break;
      case 'sentiment':
        query = `UPDATE smart_hub_settings SET sentiment_enabled = ?, alert_email = ?, sentiment_active = 1 WHERE user_id = ?`;
        params = [data.enabled ? 1 : 0, data.email, user_id];
        break;
      case 'handover':
        query = `UPDATE smart_hub_settings SET handover_trigger = ?, handover_active = 1 WHERE user_id = ?`;
        params = [data.trigger, user_id];
        break;
      case 'webhook':
        query = `UPDATE smart_hub_settings SET webhook_url = ?, webhook_active = 1 WHERE user_id = ?`;
        params = [data.url, user_id];
        break;
      case 'apollo':
        query = `UPDATE smart_hub_settings SET apollo_active = ? WHERE user_id = ?`;
        params = [data.active ? 1 : 0, user_id];
        break;
      case 'vision':
        query = `UPDATE smart_hub_settings SET vision_active = ? WHERE user_id = ?`;
        params = [data.active ? 1 : 0, user_id];
        break;
      case 'followup':
        query = `UPDATE smart_hub_settings SET followup_active = ? WHERE user_id = ?`;
        params = [data.active ? 1 : 0, user_id];
        break;
      case 'analytics':
        query = `UPDATE smart_hub_settings SET analytics_active = ? WHERE user_id = ?`;
        params = [data.active ? 1 : 0, user_id];
        break;
    }

    if (!query) return reject(new Error("Invalid toolType provided to updateSmartSettings"));

    db.run(query, params, function (err) {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

function getSmartSettings(user_id) {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT u.booking_url, s.* FROM users u 
        LEFT JOIN smart_hub_settings s ON u.id = s.user_id 
        WHERE u.id = ?`, 
        [user_id], (err, row) => {
        if (err) return reject(err);
        resolve(row || {});
      });
    });
}

// ===============================
// SUPPORT & ABOUT FUNCTIONS
// ===============================
function saveSupportTicket(user_id, subject, message) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO support_tickets (user_id, subject, message) VALUES (?, ?, ?)`,
      [user_id, subject, message],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function updateBusinessAbout(user_id, aboutText) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET about_business = ? WHERE id = ?`,
      [aboutText, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

// ===============================
// KNOWLEDGE BASE (RAG)
// ===============================
function addKnowledge(user_id, content, type = 'text') {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO knowledge_base (user_id, content, source_type) VALUES (?, ?, ?)`,
      [user_id, content, type],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getKnowledgeByUser(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, content, source_type, created_at FROM knowledge_base WHERE user_id = ?`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function deleteKnowledge(knowledge_id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM knowledge_base WHERE id = ? AND user_id = ?`,
      [knowledge_id, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

// ===============================
// WIDGET KEY
// ===============================
function setWidgetKey(user_id, widget_key) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET widget_key = ? WHERE id = ?`,
      [widget_key, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

function getWidgetKey(user_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT widget_key FROM users WHERE id = ?`,
      [user_id],
      (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.widget_key : null);
      }
    );
  });
}

// ===============================
// PLAN & USAGE
// ===============================
function updatePlan(user_id, plan) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET plan = ?, messages_used = 0, leads_used = 0 WHERE id = ?`,
      [plan, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

function incrementMessagesUsed(user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET messages_used = messages_used + 1 WHERE id = ?`,
      [user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

function incrementLeadsUsed(user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET leads_used = leads_used + 1 WHERE id = ?`,
      [user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

// ===============================
// LEADS
// ===============================
function saveLead(user_id, name, email, phone, message = "") {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO leads (user_id, name, email, phone, message) VALUES (?, ?, ?, ?, ?)`,
      [user_id, name, email, phone, message],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getLeadsByUser(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

// ===============================
// CHATS
// ===============================
function saveChat(id, user_id, session_id, client_name, message, response) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO chats (id, user_id, session_id, client_name, message, response) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, user_id, session_id, client_name, message, response],
      function (err) {
        if (err) return reject(err);
        resolve(id);
      }
    );
  });
}

function getChatsByUser(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

// ===============================
// ADMIN INITIALIZATION
// ===============================
function createAdminIfNotExists(email, hashedPassword) {
  return new Promise((resolve, reject) => {
    const cleanEmail = email.toLowerCase().trim();
    db.get(`SELECT * FROM users WHERE email = ?`, [cleanEmail], (err, user) => {
      if (err) return reject(err);
      if (user) return resolve(user);

      const business_id = "admin_business";
      db.run(
        `INSERT INTO users (email, password, business_id, business_name, plan, is_verified)
         VALUES (?, ?, ?, ?, 'agency', 1)`,
        [cleanEmail, hashedPassword, business_id, "Admin Business"],
        function (err) {
          if (err) return reject(err);
          const adminId = this.lastID;
          db.run(`INSERT INTO smart_hub_settings (user_id) VALUES (?)`, [adminId]);
          resolve({ id: adminId, email: cleanEmail });
        }
      );
    });
  });
}

// ===============================
// EXPORTS
// ===============================
module.exports = {
  db,
  createUser,
  verifyUser,
  getUserByEmail,
  getUserByBusinessId,
  getUserById,
  updateWidgetSettings,
  updateSmartSettings,
  getSmartSettings,
  saveSupportTicket,
  updateBusinessAbout,
  addKnowledge,
  getKnowledgeByUser,
  deleteKnowledge, 
  setWidgetKey,
  getWidgetKey,
  updatePlan,
  incrementMessagesUsed,
  incrementLeadsUsed,
  saveLead,
  getLeadsByUser,
  saveChat,
  getChatsByUser,
  createAdminIfNotExists
};