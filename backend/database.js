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
  // USERS (Businesses) - FIXED: Added business_type column
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      business_id TEXT UNIQUE NOT NULL,
      business_name TEXT, 
      business_type TEXT DEFAULT 'retail',
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
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT,
      action_type TEXT NOT NULL,
      action_config TEXT,
      schedule TEXT,
      status TEXT DEFAULT 'active',
      trigger_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      avg_duration INTEGER DEFAULT 0,
      last_run DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // AUTOMATION RUNS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'running',
      result TEXT,
      duration INTEGER,
      error TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      estimated_hours INTEGER DEFAULT 0,
      FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // CONNECTED ACCOUNTS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS connected_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      api_key_encrypted TEXT,
      account_info TEXT,
      gateway_url TEXT,
      connection_type TEXT DEFAULT 'direct',
      status TEXT DEFAULT 'active',
      last_sync DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, platform, account_name)
    )
  `);

  // PLATFORM METRICS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS platform_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      metrics TEXT,
      collected_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // VISION RESULTS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS vision_results (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      image_url TEXT,
      analysis TEXT,
      objects_detected INTEGER DEFAULT 0,
      sentiment TEXT,
      confidence REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ACTIVITY LOG TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      icon TEXT,
      type TEXT DEFAULT 'info',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // PRICE HISTORY TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id TEXT,
      product_name TEXT,
      competitor TEXT,
      price REAL,
      currency TEXT DEFAULT 'USD',
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // INVENTORY ALERTS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id TEXT,
      product_name TEXT,
      current_quantity INTEGER,
      threshold INTEGER,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // LEAD SCORES TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS lead_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lead_id INTEGER NOT NULL,
      score INTEGER,
      criteria TEXT,
      scored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
  `);

  // GOVERNANCE SETTINGS TABLE (NEW FOR SAAS)
  db.run(`
    CREATE TABLE IF NOT EXISTS governance_settings (
      user_id INTEGER PRIMARY KEY,
      gpt4_policy TEXT DEFAULT 'Marketing Team Only',
      claude_policy TEXT DEFAULT 'All Teams',
      gemini_policy TEXT DEFAULT 'Executives Only',
      monthly_cap INTEGER DEFAULT 5000,
      used_amount INTEGER DEFAULT 0,
      per_user_limit INTEGER DEFAULT 200,
      cap_type TEXT DEFAULT 'soft',
      pii_redaction INTEGER DEFAULT 1,
      hipaa_mode INTEGER DEFAULT 0,
      gdpr INTEGER DEFAULT 1,
      salesforce_status TEXT DEFAULT 'connected',
      hubspot_status TEXT DEFAULT 'connected',
      shopify_status TEXT DEFAULT 'requires_auth',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ALERTS TABLE (NEW FOR SAAS)
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT,
      severity TEXT,
      title TEXT,
      description TEXT,
      resolved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // USAGE LOGS TABLE (NEW FOR SAAS)
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT,
      model TEXT,
      cost REAL,
      tokens INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // AGENT PERFORMANCE TABLE (NEW FOR SAAS)
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      success_rate REAL,
      avg_latency INTEGER,
      total_runs INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // MOBILE INSTANCES TABLE (NEW FOR SAAS)
  db.run(`
    CREATE TABLE IF NOT EXISTS mobile_instances (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // PROXY USAGE TABLE (NEW FOR SAAS)
  db.run(`
    CREATE TABLE IF NOT EXISTS proxy_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ip TEXT,
      success_rate REAL,
      requests INTEGER,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

  // ==================== NOTIFICATION SETTINGS TABLE (for Settings page) ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      user_id INTEGER PRIMARY KEY,
      email_notifications INTEGER DEFAULT 1,
      slack_webhook TEXT,
      discord_webhook TEXT,
      notify_on_success INTEGER DEFAULT 1,
      notify_on_failure INTEGER DEFAULT 1,
      notify_on_daily_summary INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error("Error creating notification_settings table:", err.message);
    } else {
      console.log("✅ Notification settings table ready");
    }
  });

  // ==================== API KEYS TABLE (for Settings page) ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      name TEXT,
      platform TEXT,
      api_key TEXT UNIQUE,
      last_used DATETIME,
      created_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error("Error creating api_keys table:", err.message);
    } else {
      console.log("✅ API keys table ready");
    }
  });

  // Create index for api_keys
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);`, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error("Error creating api_keys index:", err.message);
    }
  });

  // ==================== PAYMENTS TABLE ====================
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      plan TEXT,
      amount REAL,
      reference TEXT,
      status TEXT,
      created_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error("Error creating payments table:", err.message);
    } else {
      console.log("✅ Payments table ready");
    }
  });

  // Create indexes for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_automation_runs_user_id ON automation_runs(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_id ON connected_accounts(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lead_scores_user_id ON lead_scores(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lead_scores_lead_id ON lead_scores(lead_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp);`);

  // ==================== BACKWARD COMPATIBILITY MIGRATIONS ====================
  
  // Users table migrations - FIXED: Added business_type column
  const userColumns = [
    { name: "business_name", type: "TEXT" },
    { name: "business_type", type: "TEXT DEFAULT 'retail'" },  // FIXED: Added missing business_type
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
        // Initialize governance settings for new user
        db.run(`INSERT OR IGNORE INTO governance_settings (user_id) VALUES (?)`, [userId]);
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
// NOTIFICATION SETTINGS FUNCTIONS (for Settings page)
// ===============================
async function getNotificationSettings(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT * FROM notification_settings WHERE user_id = ?`,
            [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row || {
                    user_id: userId,
                    email_notifications: 1,
                    slack_webhook: null,
                    discord_webhook: null,
                    notify_on_success: 1,
                    notify_on_failure: 1,
                    notify_on_daily_summary: 1
                });
            }
        );
    });
}

async function saveNotificationSettings(userId, settings) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO notification_settings 
            (user_id, email_notifications, slack_webhook, discord_webhook, 
             notify_on_success, notify_on_failure, notify_on_daily_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                settings.email_notifications ? 1 : 0,
                settings.slack_webhook || null,
                settings.discord_webhook || null,
                settings.notify_on_success ? 1 : 0,
                settings.notify_on_failure ? 1 : 0,
                settings.notify_on_daily_summary ? 1 : 0
            ],
            function(err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            }
        );
    });
}

// ===============================
// API KEYS FUNCTIONS (for Settings page)
// ===============================
async function createApiKey(userId, name, platform) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const apiKey = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO api_keys (id, user_id, name, platform, api_key, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, userId, name, platform, apiKey, now],
            function(err) {
                if (err) reject(err);
                else resolve({ id, api_key: apiKey, name, platform, created_at: now });
            }
        );
    });
}

async function getApiKeys(userId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, name, platform, api_key, last_used, created_at 
             FROM api_keys 
             WHERE user_id = ? 
             ORDER BY created_at DESC`,
            [userId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

async function deleteApiKey(keyId, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM api_keys WHERE id = ? AND user_id = ?`,
            [keyId, userId],
            function(err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            }
        );
    });
}

async function updateApiKeyLastUsed(keyId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE api_keys SET last_used = ? WHERE id = ?`,
            [new Date().toISOString(), keyId],
            function(err) {
                if (err) reject(err);
                else resolve({ success: true });
            }
        );
    });
}

async function validateApiKey(apiKey) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT * FROM api_keys WHERE api_key = ?`,
            [apiKey],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
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
          db.run(`INSERT INTO governance_settings (user_id) VALUES (?)`, [adminId]);
          resolve({ id: adminId, email: cleanEmail });
        }
      );
    });
  });
}

// ===============================
// AI AUTOMATIONS (UPDATED FOR SAAS)
// ===============================
function createAutomation(user_id, name, trigger_type, action_type, description = '', trigger_config = {}, action_config = {}) {
  return new Promise((resolve, reject) => {
    const { v4: uuidv4 } = require('uuid');
    const id = 'auto_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();
    
    db.run(
      `INSERT INTO automations (id, user_id, name, description, trigger_type, trigger_config, action_type, action_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, user_id, name, description, trigger_type, JSON.stringify(trigger_config), action_type, JSON.stringify(action_config), now, now],
      function (err) {
        if (err) return reject(err);
        resolve(id);
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
        resolve(rows || []);
      }
    );
  });
}

function getAutomationById(id, user_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM automations WHERE id = ? AND user_id = ?`,
      [id, user_id],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

function updateAutomation(id, user_id, updates) {
  return new Promise((resolve, reject) => {
    const { name, description, trigger_config, action_config, schedule, status } = updates;
    let query = `UPDATE automations SET updated_at = ?`;
    let params = [new Date().toISOString()];
    let sets = [];

    if (name) {
      sets.push(`name = ?`);
      params.push(name);
    }
    if (description !== undefined) {
      sets.push(`description = ?`);
      params.push(description);
    }
    if (trigger_config) {
      sets.push(`trigger_config = ?`);
      params.push(JSON.stringify(trigger_config));
    }
    if (action_config) {
      sets.push(`action_config = ?`);
      params.push(JSON.stringify(action_config));
    }
    if (schedule) {
      sets.push(`schedule = ?`);
      params.push(schedule);
    }
    if (status) {
      sets.push(`status = ?`);
      params.push(status);
    }

    if (sets.length === 0) {
      return resolve(true);
    }

    query = `UPDATE automations SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`;
    params.push(new Date().toISOString(), id, user_id);

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

function incrementAutomationTriggers(id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE automations SET trigger_count = trigger_count + 1, last_run = ? WHERE id = ? AND user_id = ?`,
      [new Date().toISOString(), id, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

// ===============================
// AUTOMATION RUNS FUNCTIONS
// ===============================
function createAutomationRun(id, automation_id, user_id) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO automation_runs (id, automation_id, user_id, started_at) VALUES (?, ?, ?, ?)`,
      [id, automation_id, user_id, now],
      function (err) {
        if (err) return reject(err);
        resolve(id);
      }
    );
  });
}

function completeAutomationRun(id, status, result, duration, error = null) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE automation_runs SET status = ?, result = ?, duration = ?, error = ?, completed_at = ? WHERE id = ?`,
      [status, JSON.stringify(result), duration, error, now, id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

function getAutomationRuns(automation_id, user_id, limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM automation_runs WHERE automation_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT ?`,
      [automation_id, user_id, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

// ===============================
// CONNECTED ACCOUNTS FUNCTIONS
// ===============================
function saveConnectedAccount(user_id, platform, account_name, api_key_encrypted, account_info = {}, gateway_url = null, connection_type = 'direct') {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    
    db.get(
      `SELECT id FROM connected_accounts WHERE user_id = ? AND platform = ? AND account_name = ?`,
      [user_id, platform, account_name],
      (err, existing) => {
        if (err) return reject(err);
        
        if (existing) {
          // Update existing
          db.run(
            `UPDATE connected_accounts SET api_key_encrypted = ?, account_info = ?, gateway_url = ?, connection_type = ?, status = 'active', last_sync = ?, updated_at = ? WHERE id = ?`,
            [api_key_encrypted, JSON.stringify(account_info), gateway_url, connection_type, now, now, existing.id],
            function(err) {
              if (err) return reject(err);
              resolve(existing.id);
            }
          );
        } else {
          // Insert new
          db.run(
            `INSERT INTO connected_accounts (user_id, platform, account_name, api_key_encrypted, account_info, gateway_url, connection_type, last_sync, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user_id, platform, account_name, api_key_encrypted, JSON.stringify(account_info), gateway_url, connection_type, now, now, now],
            function(err) {
              if (err) return reject(err);
              resolve(this.lastID);
            }
          );
        }
      }
    );
  });
}

function getConnectedAccounts(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, platform, account_name, account_info, status, last_sync, created_at FROM connected_accounts WHERE user_id = ? ORDER BY created_at DESC`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        const accounts = (rows || []).map(row => {
          try {
            return {
              ...row,
              account_info: row.account_info ? JSON.parse(row.account_info) : null
            };
          } catch (e) {
            return {
              ...row,
              account_info: null
            };
          }
        });
        resolve(accounts);
      }
    );
  });
}

function deleteConnectedAccount(id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM connected_accounts WHERE id = ? AND user_id = ?`,
      [id, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function updateAccountLastSync(id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE connected_accounts SET last_sync = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [new Date().toISOString(), new Date().toISOString(), id, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

// ===============================
// ACTIVITY LOG FUNCTIONS
// ===============================
function logActivity(user_id, action, details, type = 'info', icon = null) {
  return new Promise((resolve, reject) => {
    const icons = {
      'info': 'fa-info-circle',
      'success': 'fa-check-circle',
      'warning': 'fa-exclamation-triangle',
      'error': 'fa-times-circle',
      'automation': 'fa-robot',
      'account': 'fa-plug',
      'lead': 'fa-user',
      'vision': 'fa-eye',
      'security': 'fa-shield-alt',
      'mobile': 'fa-cloud',
      'pricing': 'fa-tags',
      'inventory': 'fa-boxes',
      'governance': 'fa-shield-alt'
    };
    
    const finalIcon = icon || icons[type] || 'fa-info-circle';
    
    db.run(
      `INSERT INTO activity_log (user_id, action, details, type, icon, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, action, details, type, finalIcon, new Date().toISOString()],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getRecentActivity(user_id, limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM activity_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [user_id, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

// ===============================
// GOVERNANCE SETTINGS FUNCTIONS
// ===============================
function getGovernanceSettings(user_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM governance_settings WHERE user_id = ?`,
      [user_id],
      (err, row) => {
        if (err) return reject(err);
        if (!row) {
          // Create default settings
          db.run(`INSERT INTO governance_settings (user_id) VALUES (?)`, [user_id], function(err) {
            if (err) return reject(err);
            db.get(`SELECT * FROM governance_settings WHERE user_id = ?`, [user_id], (err, newRow) => {
              if (err) return reject(err);
              resolve(newRow || {});
            });
          });
        } else {
          resolve(row);
        }
      }
    );
  });
}

function updateGovernanceSettings(user_id, settings) {
  return new Promise((resolve, reject) => {
    // First ensure record exists
    db.run(`INSERT OR IGNORE INTO governance_settings (user_id) VALUES (?)`, [user_id], function(err) {
      if (err) return reject(err);
      
      // Build dynamic update query
      const updates = [];
      const params = [];
      
      const allowedFields = [
        'gpt4_policy', 'claude_policy', 'gemini_policy', 
        'monthly_cap', 'used_amount', 'per_user_limit', 'cap_type',
        'pii_redaction', 'hipaa_mode', 'gdpr',
        'salesforce_status', 'hubspot_status', 'shopify_status'
      ];
      
      allowedFields.forEach(field => {
        if (settings[field] !== undefined) {
          updates.push(`${field} = ?`);
          params.push(settings[field]);
        }
      });
      
      if (updates.length === 0) {
        return resolve(true);
      }
      
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(user_id);
      
      db.run(
        `UPDATE governance_settings SET ${updates.join(', ')} WHERE user_id = ?`,
        params,
        function(err) {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  });
}

// ===============================
// ALERTS FUNCTIONS
// ===============================
function createAlert(user_id, type, severity, title, description) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO alerts (user_id, type, severity, title, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, type, severity, title, description, new Date().toISOString()],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getActiveAlerts(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM alerts WHERE user_id = ? AND resolved = 0 ORDER BY created_at DESC`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function resolveAlert(alert_id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE alerts SET resolved = 1, resolved_at = ? WHERE id = ? AND user_id = ?`,
      [new Date().toISOString(), alert_id, user_id],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

// ===============================
// USAGE LOGS FUNCTIONS
// ===============================
function logUsage(user_id, provider, model, cost, tokens) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO usage_logs (user_id, provider, model, cost, tokens, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, provider, model, cost, tokens, new Date().toISOString()],
      function (err) {
        if (err) return reject(err);
        
        // Update governance used_amount
        db.run(
          `UPDATE governance_settings SET used_amount = used_amount + ? WHERE user_id = ?`,
          [cost, user_id],
          function(err) {
            if (err) console.error("Error updating used_amount:", err);
          }
        );
        
        resolve(this.lastID);
      }
    );
  });
}

function getUsageStats(user_id, days = 30) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT provider, SUM(cost) as total_cost, SUM(tokens) as total_tokens, COUNT(*) as calls
       FROM usage_logs 
       WHERE user_id = ? AND timestamp > datetime('now', ? || ' days')
       GROUP BY provider`,
      [user_id, '-' + days],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

// ===============================
// MOBILE INSTANCES FUNCTIONS
// ===============================
function spawnMobileInstance(user_id) {
  return new Promise((resolve, reject) => {
    const { v4: uuidv4 } = require('uuid');
    const id = 'inst_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();
    
    db.run(
      `INSERT INTO mobile_instances (id, user_id, created_at, last_active) VALUES (?, ?, ?, ?)`,
      [id, user_id, now, now],
      function (err) {
        if (err) return reject(err);
        resolve(id);
      }
    );
  });
}

function getMobileInstances(user_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM mobile_instances WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC`,
      [user_id],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function terminateMobileInstance(id, user_id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE mobile_instances SET status = 'terminated' WHERE id = ? AND user_id = ?`,
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
  // Notification settings functions
  getNotificationSettings,
  saveNotificationSettings,
  // API keys functions
  createApiKey,
  getApiKeys,
  deleteApiKey,
  updateApiKeyLastUsed,
  validateApiKey,
  createAdminIfNotExists,
  // Automation functions (UPDATED)
  createAutomation,
  getAutomationsByUser,
  getAutomationById,
  updateAutomation,
  deleteAutomation,
  incrementAutomationTriggers,
  // Automation run functions (NEW)
  createAutomationRun,
  completeAutomationRun,
  getAutomationRuns,
  // Connected accounts functions (NEW)
  saveConnectedAccount,
  getConnectedAccounts,
  deleteConnectedAccount,
  updateAccountLastSync,
  // Activity log functions (NEW)
  logActivity,
  getRecentActivity,
  // Governance functions (NEW)
  getGovernanceSettings,
  updateGovernanceSettings,
  // Alert functions (NEW)
  createAlert,
  getActiveAlerts,
  resolveAlert,
  // Usage log functions (NEW)
  logUsage,
  getUsageStats,
  // Mobile instance functions (NEW)
  spawnMobileInstance,
  getMobileInstances,
  terminateMobileInstance,
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