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
      plan_expires DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // SMART HUB SETTINGS (Detailed AI Logic)
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
      apollo_key TEXT,
      auto_sync INTEGER DEFAULT 0,
      vision_sensitivity TEXT DEFAULT 'high',
      vision_area TEXT DEFAULT 'all',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

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

  // LEADS - WITH COMPANY AND JOB_TITLE COLUMNS
  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      company TEXT,
      job_title TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // CHATS - WITH SENTIMENT COLUMN
  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_id TEXT,
      client_name TEXT NOT NULL,
      message TEXT NOT NULL,
      response TEXT NOT NULL,
      sentiment TEXT DEFAULT 'neutral',
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

  // AI AUTOMATIONS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS automations (
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
  `);

  // ==================== BROADCASTS TABLE ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'sent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error("Error creating broadcasts table:", err.message);
    } else {
      console.log("✅ Broadcasts table ready");
    }
  });

  // ==================== BUSINESS IDENTITY TABLE ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS business_identity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      business_type TEXT,
      business_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error("Error creating business_identity table:", err.message);
    } else {
      console.log("✅ Business Identity table ready");
    }
  });

  // Add trigger to update updated_at for business_identity
  db.run(`
    CREATE TRIGGER IF NOT EXISTS update_business_identity_timestamp 
    AFTER UPDATE ON business_identity
    BEGIN
      UPDATE business_identity SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error("Error creating trigger:", err.message);
    }
  });

  // ==================== TOOL STATES TABLE (for cross-device sync) ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS tool_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tool_type TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, tool_type),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error("Error creating tool_states table:", err.message);
    } else {
      console.log("✅ Tool states table ready");
    }
  });

  // Add trigger for updated_at on tool_states
  db.run(`
    CREATE TRIGGER IF NOT EXISTS update_tool_states_timestamp 
    AFTER UPDATE ON tool_states
    BEGIN
      UPDATE tool_states SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error("Error creating tool_states trigger:", err.message);
    }
  });

  // ==================== INCIDENTS TABLE FOR STATUS PAGE ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATETIME,
      title TEXT,
      description TEXT,
      status TEXT DEFAULT 'resolved',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("Error creating incidents table:", err.message);
    } else {
      console.log("✅ Incidents table ready");
      
      // Insert sample incidents if none exist
      db.get(`SELECT COUNT(*) as count FROM incidents`, (err, row) => {
        if (!err && row && row.count === 0) {
          db.run(`
            INSERT INTO incidents (date, title, description, status) VALUES 
            (datetime('now', '-3 days'), 'Scheduled Maintenance', 'Database optimization completed successfully. No downtime.', 'resolved'),
            (datetime('now', '-8 days'), 'AI Response Delay', 'Cloudflare API experienced brief latency. Resolved within 5 minutes.', 'resolved'),
            (datetime('now', '-15 days'), 'Email Delivery Delay', 'Resend API had intermittent issues. All emails delivered.', 'resolved')
          `, (err) => {
            if (!err) console.log("✅ Sample incidents added");
          });
        }
      });
    }
  });

  // ==================== STATUS SUBSCRIBERS TABLE ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS status_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("Error creating status_subscribers table:", err.message);
    } else {
      console.log("✅ Status subscribers table ready");
    }
  });

  // ==================== BACKWARD COMPATIBILITY MIGRATIONS ====================
  
  // Users table migrations
  const userColumns = [
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
    { name: "sentiment_alerts", type: "INTEGER DEFAULT 0" },
    { name: "plan_expires", type: "DATETIME" }
  ];

  userColumns.forEach((col) => {
    db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`, (err) => {
      // Ignore errors if column already exists
      if (err && !err.message.includes('duplicate column')) {
        console.log(`Note: ${col.name} may already exist`);
      }
    });
  });

  // Smart hub settings migrations
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
    { name: "analytics_active", type: "INTEGER DEFAULT 0" },
    { name: "apollo_key", type: "TEXT" },
    { name: "auto_sync", type: "INTEGER DEFAULT 0" },
    { name: "vision_sensitivity", type: "TEXT DEFAULT 'high'" },
    { name: "vision_area", type: "TEXT DEFAULT 'all'"}
  ];

  smartHubColumns.forEach((col) => {
    db.run(`ALTER TABLE smart_hub_settings ADD COLUMN ${col.name} ${col.type}`, (err) => {
      // Ignore errors if column already exists
      if (err && !err.message.includes('duplicate column')) {
        console.log(`Note: ${col.name} may already exist in smart_hub_settings`);
      }
    });
  });

  // Leads table migrations (company and job_title)
  const leadColumns = [
    { name: "company", type: "TEXT" },
    { name: "job_title", type: "TEXT" }
  ];

  leadColumns.forEach((col) => {
    db.run(`ALTER TABLE leads ADD COLUMN ${col.name} ${col.type}`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.log(`Note: ${col.name} may already exist in leads`);
      }
    });
  });

  // Chats table migrations (sentiment)
  db.run(`ALTER TABLE chats ADD COLUMN sentiment TEXT DEFAULT 'neutral'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Note: sentiment column may already exist in chats');
    }
  });

  console.log('✅ Database schema check complete');
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

// Updated Smart Hub Settings with all tool types
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
        query = `UPDATE smart_hub_settings SET apollo_active = ?, apollo_key = ?, auto_sync = ? WHERE user_id = ?`;
        params = [data.active ? 1 : 0, data.apiKey || null, data.autoSync ? 1 : 0, user_id];
        break;
      case 'vision':
        query = `UPDATE smart_hub_settings SET vision_active = ?, vision_sensitivity = ?, vision_area = ? WHERE user_id = ?`;
        params = [data.active ? 1 : 0, data.sensitivity || 'high', data.area || 'all', user_id];
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
// BUSINESS IDENTITY FUNCTIONS
// ===============================
function saveBusinessIdentity(user_id, business_type, business_description) {
  return new Promise((resolve, reject) => {
    // Check if identity exists
    db.get(`SELECT id FROM business_identity WHERE user_id = ?`, [user_id], (err, row) => {
      if (err) return reject(err);
      
      if (row) {
        // Update existing
        db.run(
          `UPDATE business_identity SET business_type = ?, business_description = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          [business_type, business_description, user_id],
          function (err) {
            if (err) return reject(err);
            resolve(true);
          }
        );
      } else {
        // Insert new
        db.run(
          `INSERT INTO business_identity (user_id, business_type, business_description) VALUES (?, ?, ?)`,
          [user_id, business_type, business_description],
          function (err) {
            if (err) return reject(err);
            resolve(true);
          }
        );
      }
    });
  });
}

function getBusinessIdentity(user_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT business_type, business_description, created_at, updated_at FROM business_identity WHERE user_id = ?`,
      [user_id],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || { business_type: '', business_description: '' });
      }
    );
  });
}

// ===============================
// TOOL STATE FUNCTIONS (for cross-device sync)
// ===============================
function saveToolState(user_id, toolType, isActive) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO tool_states (user_id, tool_type, is_active) VALUES (?, ?, ?)
       ON CONFLICT(user_id, tool_type) DO UPDATE SET is_active = ?, updated_at = CURRENT_TIMESTAMP`,
      [user_id, toolType, isActive ? 1 : 0, isActive ? 1 : 0],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

function getToolStates(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT tool_type, is_active FROM tool_states WHERE user_id = ?`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        const states = {};
        rows.forEach(row => {
          states[row.tool_type] = row.is_active === 1;
        });
        resolve(states);
      }
    );
  });
}

function deleteToolState(user_id, toolType) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM tool_states WHERE user_id = ? AND tool_type = ?`,
      [user_id, toolType],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
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
      `UPDATE users SET plan = ?, messages_used = 0, leads_used = 0, plan_expires = datetime('now', '+30 days') WHERE id = ?`,
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
// LEADS - UPDATED with company and job_title
// ===============================
function saveLead(user_id, name, email, phone, company = '', job_title = '', message = "") {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO leads (user_id, name, email, phone, company, job_title, message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, name, email, phone, company, job_title, message],
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
// CHECK FOR EXISTING LEAD
// ===============================
function getLeadByEmail(user_id, email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM leads WHERE user_id = ? AND email = ?`,
      [user_id, email.toLowerCase().trim()],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

// ===============================
// CHATS - UPDATED with sentiment
// ===============================
function saveChat(id, user_id, session_id, client_name, message, response, sentiment = 'neutral') {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO chats (id, user_id, session_id, client_name, message, response, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, user_id, session_id, client_name, message, response, sentiment],
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

function getChatsBySession(session_id, user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM chats WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC`,
      [session_id, user_id],
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
        `INSERT INTO users (email, password, business_id, business_name, plan, is_verified, plan_expires)
         VALUES (?, ?, ?, ?, 'agency', 1, datetime('now', '+30 days'))`,
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
// AI AUTOMATIONS
// ===============================
function createAutomation(user_id, title, trigger, action, icon = '⚙️') {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO automations (user_id, title, icon, trigger, action, enabled, live, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'))`,
      [user_id, title, icon, trigger, action],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getAutomationsByUser(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM automations WHERE user_id = ? ORDER BY created_at DESC`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function toggleAutomation(id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE automations 
       SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END,
           live = CASE WHEN enabled = 1 THEN 0 ELSE 1 END
       WHERE id = ? AND user_id = ?`,
      [id, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function updateAutomation(id, user_id, updates) {
  return new Promise((resolve, reject) => {
    const { title, trigger, action, icon } = updates;
    let query = `UPDATE automations SET `;
    let params = [];
    let first = true;

    if (title) {
      query += `title = ?`;
      params.push(title);
      first = false;
    }
    if (trigger) {
      if (!first) query += `, `;
      query += `trigger = ?`;
      params.push(trigger);
      first = false;
    }
    if (action) {
      if (!first) query += `, `;
      query += `action = ?`;
      params.push(action);
      first = false;
    }
    if (icon) {
      if (!first) query += `, `;
      query += `icon = ?`;
      params.push(icon);
    }

    query += ` WHERE id = ? AND user_id = ?`;
    params.push(id, user_id);

    db.run(query, params, function (err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}

function deleteAutomation(id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM automations WHERE id = ? AND user_id = ?`,
      [id, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

// ===============================
// BROADCAST FUNCTIONS
// ===============================
function saveBroadcast(id, user_id, subject, recipients, sent_count, failed_count, status = 'sent') {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO broadcasts (id, user_id, subject, recipients, sent_count, failed_count, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, user_id, subject, recipients, sent_count, failed_count, status],
      function (err) {
        if (err) return reject(err);
        resolve(id);
      }
    );
  });
}

function getBroadcastsByUser(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM broadcasts WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function getBroadcastStats(user_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        COUNT(*) as total_broadcasts,
        SUM(recipients) as total_recipients,
        SUM(sent_count) as total_sent,
        SUM(failed_count) as total_failed
       FROM broadcasts WHERE user_id = ?`,
      [user_id],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || { total_broadcasts: 0, total_recipients: 0, total_sent: 0, total_failed: 0 });
      }
    );
  });
}

// ===============================
// INCIDENTS FUNCTIONS
// ===============================
function getIncidents(limit = 5) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM incidents ORDER BY date DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function addIncident(date, title, description, status = 'resolved') {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO incidents (date, title, description, status) VALUES (?, ?, ?, ?)`,
      [date, title, description, status],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

// ===============================
// STATUS SUBSCRIBERS FUNCTIONS
// ===============================
function addSubscriber(email) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO status_subscribers (email) VALUES (?)`,
      [email.toLowerCase().trim()],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function getSubscribers() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT email FROM status_subscribers ORDER BY created_at DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function removeSubscriber(email) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM status_subscribers WHERE email = ?`,
      [email.toLowerCase().trim()],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

// ===============================
// EXPORTS - ALL FUNCTIONS
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
  saveBusinessIdentity,
  getBusinessIdentity,
  saveToolState,
  getToolStates,
  deleteToolState,
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
  getLeadByEmail,
  saveChat,
  getChatsByUser,
  getChatsBySession,
  createAdminIfNotExists,
  createAutomation,
  getAutomationsByUser,
  toggleAutomation,
  updateAutomation,
  deleteAutomation,
  // Broadcast exports
  saveBroadcast,
  getBroadcastsByUser,
  getBroadcastStats,
  // Incident exports
  getIncidents,
  addIncident,
  // Status subscribers exports
  addSubscriber,
  getSubscribers,
  removeSubscriber
};