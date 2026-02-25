const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const path = require("path"); 
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { Resend } = require('resend');
require("dotenv").config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Use centralized DB from database.js
const dbModule = require("./database.js");
const { 
  db, 
  getUserByEmail, 
  createUser, 
  getUserById, 
  setWidgetKey, 
  incrementMessagesUsed,
  incrementLeadsUsed,
  saveChat,
  saveLead,
  verifyUser,
  addKnowledge,
  getKnowledgeByUser,
  updateWidgetSettings,
  getLeadByEmail,
  saveBroadcast,
  getBroadcastsByUser,
  getBroadcastStats,
  getBusinessIdentity,
  saveBusinessIdentity,
  getSmartSettings
} = dbModule;

// Import auth
const { auth, isAdminMiddleware, signup, login } = require("./auth");
const { authenticateToken } = require("./auth-middleware");

const app = express();

// ================= MIDDLEWARE =================
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

// ================= SOCKET.IO =================
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });
app.set("socketio", io);

io.on("connection", (socket) => {
  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`👤 User joined socket room: ${userId}`);
  });
});

// ================= CONFIGURATION =================
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const CLOUDFLARE_AI_API_TOKEN = process.env.CLOUDFLARE_AI_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ADMIN_EMAIL = "ericchung992@gmail.com".toLowerCase().trim();

// ================= RESEND CONFIGURATION =================
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("✅ Resend configured for reliable email delivery");
} else {
  console.warn("⚠️ RESEND_API_KEY not found. Using nodemailer fallback.");
}

// Fallback to Nodemailer
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false }
});

// ================= EMAIL SENDING FUNCTION WITH FALLBACK =================
async function sendEmailWithFallback(to, fromName, subject, html, text = '') {
  // Try Resend first (best option)
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
        to: [to],
        subject: subject,
        html: html,
        text: text || html.replace(/<[^>]*>/g, '')
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log(`✅ Resend email sent to: ${to}`);
      return { success: true, method: 'resend' };
    } catch (err) {
      console.error(`❌ Resend failed for ${to}:`, err.message);
      // Fall through to nodemailer
    }
  }

  // Fallback to nodemailer
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    });
    console.log(`✅ Nodemailer email sent to: ${to}`);
    return { success: true, method: 'nodemailer' };
  } catch (err) {
    console.error(`❌ Both email methods failed for ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ================= FILE PROCESSING =================
async function extractTextFromFile(fileData, fileName, mimeType) {
  try {
    const base64Data = fileData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    if (mimeType.includes('pdf')) {
      const pdfData = await pdf(buffer);
      return pdfData.text.substring(0, 5000);
    } 
    else if (mimeType.includes('word') || mimeType.includes('docx') || mimeType.includes('doc')) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.substring(0, 5000);
    }
    else if (mimeType.includes('text') || fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
      return buffer.toString('utf-8').substring(0, 5000);
    }
    else {
      return `[File: ${fileName}] Cannot extract text from this file type.`;
    }
  } catch (err) {
    console.error("File extraction error:", err);
    return `[Error processing file: ${fileName}]`;
  }
}

// ================= STATIC FILES =================
app.use("/widget.js", express.static(path.join(__dirname, "widget.js")));

// ================= SERVE STATIC HTML FILES =================
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// ================= ROUTES =================
app.use('/api/smart-hub', require('./smart-hub'));

// Health check endpoint for Render
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Customer Insights
let customerRouter;
try {
  customerRouter = require('./customer-insights');
  console.log("✅ SUCCESS: customer-insights.js LOADED correctly");
} catch (err) {
  console.error("❌ FAILED to load customer-insights.js:", err.message);
  customerRouter = express.Router();
}
app.use('/api/customer-insights', customerRouter);

app.get('/api/customer-insights/debug', (req, res) => {
  res.json({ status: "alive", message: "Customer Insights prefix is reachable", time: new Date().toISOString() });
});

// AI Automations
app.use('/api/ai-automations', require('./ai-automations'));

// ================= PLAN LIMITS =================
const PLAN_LIMITS = {
  free: { messages: 50, leads: 10 },
  basic: { messages: 500, leads: 500 },
  pro: { messages: 3000, leads: 3000 },
  enterprise: { messages: Infinity, leads: Infinity },
  agency: { messages: Infinity, leads: Infinity }
};

// ================= DATABASE MIGRATIONS =================
db.serialize(() => {
  db.run(`ALTER TABLE users ADD COLUMN plan_expires DATETIME`, () => {});
  
  db.run(`
    CREATE TABLE IF NOT EXISTS smart_hub_settings (
      user_id INTEGER PRIMARY KEY,
      ai_instructions TEXT,
      ai_temp TEXT DEFAULT '0.7',
      ai_lang TEXT DEFAULT 'auto',
      booking_url TEXT,
      sentiment_enabled INTEGER DEFAULT 0,
      alert_email TEXT,
      handover_trigger TEXT DEFAULT 'human',
      webhook_url TEXT,
      booking_active INTEGER DEFAULT 0,
      webhook_active INTEGER DEFAULT 0,
      brain_active INTEGER DEFAULT 0,
      sentiment_active INTEGER DEFAULT 0,
      handover_active INTEGER DEFAULT 0,
      apollo_active INTEGER DEFAULT 0,
      followup_active INTEGER DEFAULT 0,
      vision_active INTEGER DEFAULT 0,
      analytics_active INTEGER DEFAULT 0
    )
  `);

  // Add columns
  const smartHubColumns = [
    "booking_active INTEGER DEFAULT 0",
    "webhook_active INTEGER DEFAULT 0",
    "brain_active INTEGER DEFAULT 0",
    "sentiment_active INTEGER DEFAULT 0",
    "handover_active INTEGER DEFAULT 0",
    "apollo_active INTEGER DEFAULT 0",
    "followup_active INTEGER DEFAULT 0",
    "vision_active INTEGER DEFAULT 0",
    "analytics_active INTEGER DEFAULT 0",
    "apollo_key TEXT",
    "auto_sync INTEGER DEFAULT 0",
    "vision_sensitivity TEXT DEFAULT 'high'",
    "vision_area TEXT DEFAULT 'all'"
  ];

  smartHubColumns.forEach(col => {
    db.run(`ALTER TABLE smart_hub_settings ADD COLUMN ${col}`, () => {});
  });

  // Create broadcasts table
  db.run(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      subject TEXT,
      recipients INTEGER,
      sent_count INTEGER,
      failed_count INTEGER,
      status TEXT DEFAULT 'sent',
      created_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (!err) console.log("✅ Broadcasts table ready");
  });

  // ================= NEW: INCIDENTS TABLE FOR STATUS PAGE =================
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
    if (!err) console.log("✅ Incidents table ready");
  });

  // ================= NEW: STATUS SUBSCRIBERS TABLE =================
  db.run(`
    CREATE TABLE IF NOT EXISTS status_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (!err) console.log("✅ Status subscribers table ready");
  });

  // Insert sample incident if none exist
  db.get(`SELECT COUNT(*) as count FROM incidents`, (err, row) => {
    if (!err && row && row.count === 0) {
      db.run(`
        INSERT INTO incidents (date, title, description, status) VALUES 
        (datetime('now', '-3 days'), 'Scheduled Maintenance', 'Database optimization completed successfully. No downtime.', 'resolved'),
        (datetime('now', '-8 days'), 'AI Response Delay', 'Cloudflare API experienced brief latency. Resolved within 5 minutes.', 'resolved'),
        (datetime('now', '-15 days'), 'Email Delivery Delay', 'Resend API had intermittent issues. All emails delivered.', 'resolved')
      `);
    }
  });
});

// ================= VERIFICATION MIDDLEWARE =================
async function checkVerified(req, res, next) {
  try {
    const user = await getUserById(req.user.id);
    if (user && (user.is_verified === 1 || user.email.toLowerCase().trim() === ADMIN_EMAIL)) {
      next();
    } else {
      res.status(403).json({ error: "Please verify your email to access this feature." });
    }
  } catch (err) {
    res.status(500).json({ error: "Verification check failed" });
  }
}

// ================= RESEND VERIFICATION CODE =================
app.post("/api/auth/resend-verification", bodyParser.json(), async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  
  try {
    // Generate new verification code
    const vCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Update user with new verification token
    db.run(
      `UPDATE users SET verification_token = ? WHERE email = ?`,
      [vCode, normalizedEmail],
      async function(err) {
        if (err) {
          console.error("Update verification token error:", err);
          return res.status(500).json({ error: "Database error" });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: "Email not found" });
        }

        // Send verification email
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"></head>
          <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">✨ AI Smart Hub</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">New Verification Code</p>
              </div>
              <div style="padding: 40px;">
                <h2 style="color: #333; margin-bottom: 20px;">Your New Verification Code</h2>
                <p style="color: #666; margin-bottom: 20px;">You requested a new verification code for your account.</p>
                <div style="background: #f8f9fa; padding: 30px; text-align: center; border-radius: 8px; margin: 20px 0;">
                  <h1 style="font-size: 48px; letter-spacing: 8px; color: #d4af37; margin: 0;">${vCode}</h1>
                </div>
                <p style="color: #666;">Enter this code on the website to verify your account.</p>
                <p style="color: #999; font-size: 14px; margin-top: 20px;">This code will expire in 24 hours.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        const result = await sendEmailWithFallback(
          normalizedEmail,
          'AI Smart Hub Support',
          'Your New Verification Code',
          emailHtml
        );

        if (result.success) {
          res.json({ 
            success: true, 
            message: `New verification code sent to ${normalizedEmail} via ${result.method}` 
          });
        } else {
          res.status(500).json({ error: "Failed to send verification email" });
        }
      }
    );
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= AUTH ROUTES =================
app.post("/api/auth/signup", bodyParser.json(), async (req, res) => {
  const { email, password, business_name } = req.body; 
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const normalizedEmail = email.trim().toLowerCase();
  const vCode = Math.floor(100000 + Math.random() * 900000).toString();
  const hashed = await bcrypt.hash(password, 10);
  const business_id = "biz_" + Math.random().toString(36).substring(2, 12);

  getUserByEmail(normalizedEmail)
    .then(existing => {
      if (existing) return res.status(400).json({ error: "User already exists" });

      createUser(normalizedEmail, hashed, business_id, business_name, vCode)
        .then(userId => {
          const widgetKey = uuidv4();
          setWidgetKey(userId, widgetKey);

          // Send verification email
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0;">✨ Welcome to AI Smart Hub</h1>
                </div>
                <div style="padding: 40px;">
                  <h2 style="color: #333;">Verify Your Email</h2>
                  <p style="color: #666; margin-bottom: 20px;">Your verification code is:</p>
                  <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <h1 style="font-size: 48px; letter-spacing: 8px; color: #d4af37; margin: 0;">${vCode}</h1>
                  </div>
                  <p style="color: #666;">Enter this code on the website to verify your account.</p>
                  <p style="color: #999; font-size: 14px;">This code will expire in 24 hours.</p>
                </div>
              </div>
            </body>
            </html>
          `;

          sendEmailWithFallback(
            normalizedEmail,
            'AI Smart Hub Support',
            'Your Verification Code',
            emailHtml
          );

          res.json({ 
            success: true, 
            message: "Signup successful. Please check your email for your 6-digit verification code.",
            email: normalizedEmail
          });
        })
        .catch(err => {
          console.error("Signup insert error:", err);
          res.status(500).json({ error: "Failed to create user" });
        });
    })
    .catch(() => res.status(500).json({ error: "Database error" }));
});

app.get("/api/auth/verify/:token", async (req, res) => {
  const success = await verifyUser(req.params.token);
  if (success) {
    res.send("<h1>Email Verified!</h1><p>Your account is now active. You can now log in to your dashboard.</p>");
  } else {
    res.status(400).send("Invalid or expired verification code.");
  }
});

app.post("/api/auth/verify-code", bodyParser.json(), async (req, res) => {
  const { code, email } = req.body;
  
  try {
    // Find user with this verification token
    const user = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM users WHERE verification_token = ?`, [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    // Verify the user
    const success = await verifyUser(code);
    
    if (success) {
      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, plan: user.plan }, 
        JWT_SECRET, 
        { expiresIn: '7d' }
      );
      
      res.json({ 
        success: true, 
        message: "Account verified successfully!",
        token,
        plan: user.plan,
        email: user.email,
        business_name: user.business_name
      });
    } else {
      res.status(400).json({ error: "Invalid verification code." });
    }
  } catch (err) {
    console.error("Verify code error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", bodyParser.json(), (req, res, next) => {
  const { email } = req.body;
  if (email && email.toLowerCase().trim() === ADMIN_EMAIL) {
    db.run(
      `UPDATE users SET is_verified = 1, plan = 'agency', plan_expires = datetime('now', '+30 days') WHERE email = ?`, 
      [ADMIN_EMAIL], 
      (err) => {
        if (err) console.error("Admin update error:", err);
        login(req, res, next);
      }
    );
  } else {
    login(req, res, next);
  }
});

// ================= PROFILE MANAGEMENT =================
app.put("/api/admin/users/update-profile", auth, bodyParser.json(), async (req, res) => {
  const { business_name, password } = req.body;
  const userId = req.user.id;

  try {
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run(
        `UPDATE users SET business_name = ?, password = ? WHERE id = ?`,
        [business_name, hashedPassword, userId],
        function(err) {
          if (err) return res.status(500).json({ error: "Update failed" });
          res.json({ success: true, message: "Profile and password updated" });
        }
      );
    } else {
      db.run(
        `UPDATE users SET business_name = ? WHERE id = ?`,
        [business_name, userId],
        function(err) {
          if (err) return res.status(500).json({ error: "Update failed" });
          res.json({ success: true, message: "Profile name updated" });
        }
      );
    }
  } catch (e) {
    res.status(500).json({ error: "Server error during update" });
  }
});

app.delete("/api/admin/users/delete-account", auth, (req, res) => {
  const userId = req.user.id;
  db.serialize(() => {
    db.run(`DELETE FROM leads WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM chats WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM support_tickets WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM users WHERE id = ?`, [userId], function(err) {
      if (err) return res.status(500).json({ error: "Failed to delete account" });
      res.json({ success: true, message: "Account deleted permanently" });
    });
  });
});

// ================= KNOWLEDGE BASE =================
app.post("/api/knowledge/add", auth, checkVerified, bodyParser.json(), async (req, res) => {
  const { content } = req.body;
  try {
    await addKnowledge(req.user.id, content);
    res.json({ success: true, message: "Knowledge added" });
  } catch (err) { 
    res.status(500).json({ error: "Failed to save" }); 
  }
});

// ================= DASHBOARD =================
app.get("/api/dashboard/full", auth, (req, res) => {
  getUserById(req.user.id).then(user => {
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let dbPlan = (user.plan || 'free').toLowerCase().trim();
    if (dbPlan === 'agence') dbPlan = 'agency';
    let currentPlan = dbPlan;

    if (user.email.toLowerCase().trim() === ADMIN_EMAIL) {
        currentPlan = "agency";
    } 

    const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;
    const displayName = user.business_name || user.name || "My Business";

    console.log(`[DASHBOARD] Sending to frontend - plan: ${currentPlan} (raw DB: ${user.plan || 'free'})`);

    db.all(
      `SELECT session_id, client_name, message, response, MAX(created_at) as last_message, COUNT(*) as msg_count 
       FROM chats WHERE user_id = ? GROUP BY session_id ORDER BY last_message DESC`,
      [user.id],
      (_, chats) => {
        db.all(
          `SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC`,
          [user.id],
          (_, leads) => {
            res.json({
              name: displayName, 
              business_name: displayName,
              businessName: displayName,
              email: user.email,
              plan: currentPlan,
              plan_expires: user.plan_expires,
              is_verified: user.is_verified, 
              widget_color: user.widget_color, 
              messages_used: user.messages_used || 0,
              messages_limit: limits.messages,
              leads_used: user.leads_used || 0,
              leads_limit: limits.leads,
              chats: chats || [], 
              leads: leads || [],
              widget_key: user.widget_key || "generate-new-key"
            });
          }
        );
      }
    );
  }).catch(() => res.status(500).json({ error: "Server error" }));
});

// ================= CHAT SESSIONS =================
app.get("/api/chat/session/:session_id", auth, (req, res) => {
  db.all(
    `SELECT * FROM chats WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC`,
    [req.params.session_id, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows);
    }
  );
});

// ================= WIDGET CONFIG - CRITICAL FIX: Return all smart settings =================
app.get("/api/public/widget-config/:key", (req, res) => {
  const widgetKey = req.params.key;
  
  db.get(`SELECT id, business_name, widget_color, welcome_message, plan FROM users WHERE widget_key = ?`, [widgetKey], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Widget not found" });
    
    // Get smart hub settings for this user
    db.get(`SELECT * FROM smart_hub_settings WHERE user_id = ?`, [user.id], (err, smartSettings) => {
      const settings = smartSettings || {};
      
      // Get business identity
      getBusinessIdentity(user.id).then(identity => {
        res.json({
          business_name: user.business_name || "AI Assistant",
          widget_color: user.widget_color || "#d4af37",
          welcome_message: user.welcome_message || "Hi! How can I help you today?",
          plan: user.plan || 'free',
          // Business identity
          business_type: identity.business_type || '',
          business_description: identity.business_description || '',
          // CRITICAL FIX: Include all smart hub settings for the widget
          booking_url: settings.booking_url || '',
          booking_active: settings.booking_active || 0,
          apollo_active: settings.apollo_active || 0,
          apollo_key: settings.apollo_key || '',
          followup_active: settings.followup_active || 0,
          vision_active: settings.vision_active || 0,
          sentiment_active: settings.sentiment_active || 0,
          ai_instructions: settings.ai_instructions || '',
          ai_temp: settings.ai_temp || '0.7',
          smart_hub: settings // Include full settings object
        });
      }).catch(() => {
        res.json({
          business_name: user.business_name || "AI Assistant",
          widget_color: user.widget_color || "#d4af37",
          welcome_message: user.welcome_message || "Hi! How can I help you today?",
          plan: user.plan || 'free',
          booking_url: settings.booking_url || '',
          booking_active: settings.booking_active || 0,
          apollo_active: settings.apollo_active || 0,
          apollo_key: settings.apollo_key || '',
          followup_active: settings.followup_active || 0,
          vision_active: settings.vision_active || 0,
          sentiment_active: settings.sentiment_active || 0,
          ai_instructions: settings.ai_instructions || '',
          ai_temp: settings.ai_temp || '0.7',
          smart_hub: settings
        });
      });
    });
  });
});

// ================= AI CHAT (DASHBOARD) =================
app.post("/api/widget/chat", auth, checkVerified, bodyParser.json(), async (req, res) => {
  const { message, client_name, session_id } = req.body;
  const activeSession = session_id || "sess_" + Date.now();
  if (!message) return res.status(400).json({ error: "Message required" });

  getUserById(req.user.id).then(async user => {
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const limit = PLAN_LIMITS[user.plan].messages;
    if (user.messages_used >= limit)
      return res.status(403).json({ error: "Message limit reached" });

    try {
      const knowledge = await getKnowledgeByUser(user.id);
      const context = knowledge.map(k => k.content).join("\n");

      const smartSettings = await new Promise((resolve) => {
        db.get(`SELECT ai_instructions, ai_temp FROM smart_hub_settings WHERE user_id = ?`, [user.id], (err, row) => resolve(row || {}));
      });

      // Get business identity
      const identity = await getBusinessIdentity(user.id);

      // Build system prompt with business identity
      const businessContext = identity.business_type ? 
        `Business Type: ${identity.business_type}\nBusiness Description: ${identity.business_description || 'Not provided'}\n` : '';

      // CRITICAL FIX: Stronger system prompt that establishes AI persona
      const systemPrompt = smartSettings.ai_instructions || 
        `You are the AI assistant for ${user.business_name || 'this business'}. 
         ${businessContext}
         You are helpful, professional, and knowledgeable about the business. 
         Always represent yourself as the business assistant, never as a generic AI.
         Current date: ${new Date().toLocaleDateString()}`;

      // CRITICAL FIX: Remove space in Cloudflare URL
      const aiRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${CLOUDFLARE_AI_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: `${systemPrompt}\n\nBusiness Context:\n${context}` },
              { role: "user", content: message }
            ]
          })
        }
      );

      if (!aiRes.ok) {
        const errData = await aiRes.json();
        throw new Error(errData.errors?.[0]?.message || "Cloudflare AI failed");
      }

      const aiData = await aiRes.json();
      const reply = aiData.result?.response || "AI error";

      await saveChat(uuidv4(), user.id, activeSession, client_name || "Guest", message, reply);
      await incrementMessagesUsed(user.id);

      res.json({ success: true, reply, session_id: activeSession });
    } catch (err) {
      console.error("❌ AI Error:", err.message);
      res.status(500).json({ error: "AI server error" });
    }
  });
});

// ================= PUBLIC WIDGET CHAT - CRITICAL FIXES =================
app.post("/api/public/chat", bodyParser.json({ limit: "50mb" }), async (req, res) => {
  // CRITICAL FIX: Extract is_visitor flag from request
  const { message, image_data, file_data, file_name, widget_key, client_name, session_id, is_visitor } = req.body;
  const activeSession = session_id || "pub_" + Date.now();

  if (!message && !image_data && !file_data) {
    return res.status(400).json({ error: "Missing message or file" });
  }

  if (!widget_key) {
    return res.status(400).json({ error: "Widget key required" });
  }

  db.get(`SELECT * FROM users WHERE widget_key = ?`, [widget_key], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Invalid Widget Key" });

    const limit = PLAN_LIMITS[user.plan].messages;
    if (user.messages_used >= limit) return res.status(403).json({ error: "Limit reached" });

    try {
      const knowledge = await getKnowledgeByUser(user.id);
      const context = knowledge.map(k => k.content).join("\n");

      // CRITICAL FIX: Get ALL smart settings including booking URL
      const smartSettings = await new Promise((resolve) => {
        db.get(`SELECT * FROM smart_hub_settings WHERE user_id = ?`, [user.id], (err, row) => resolve(row || {}));
      });

      // Get business identity
      const identity = await getBusinessIdentity(user.id).catch(() => ({ business_type: '', business_description: '' }));

      let reply = "";
      let fileContent = "";

      // CRITICAL FIX: Build professional system prompt
      const buildSystemPrompt = () => {
        const basePrompt = smartSettings.ai_instructions || 
          `You are the AI assistant for ${user.business_name || 'our business'}.`;
        
        const businessContext = identity.business_type ? 
          `Business Type: ${identity.business_type}. ${identity.business_description || ''}` : '';
        
        const visitorContext = is_visitor 
          ? `You are chatting with a website visitor named ${client_name || 'Guest'}. Be helpful, professional, and guide them to take action.`
          : `You are assisting the business owner.`;
        
        const bookingContext = smartSettings.booking_url && smartSettings.booking_active
          ? `When visitors want to book, schedule, or make appointments, provide this booking link: ${smartSettings.booking_url}`
          : '';
        
        return `${basePrompt}
${businessContext}
${visitorContext}
${bookingContext}
Business Context:
${context || 'No additional context provided.'}

IMPORTANT INSTRUCTIONS:
- Always identify yourself as ${user.business_name || 'our'} AI assistant, NEVER as "a language model" or "AI"
- Be concise but helpful (2-3 sentences max for simple questions)
- If you don't know something specific about the business, say "Let me connect you with the team" rather than making things up
- Use the booking link when visitors show interest in meetings/appointments
- Today's date: ${new Date().toLocaleDateString()}`;
      };

      if (image_data) {
        console.log("[WIDGET] Processing image with Cloudflare Vision");
        
        const base64Data = image_data.split(",")[1];
        const mimeType = image_data.match(/:(.*?);/)[1];

        const userPrompt = message || "Please describe what you see in this image in detail.";
        const systemContext = buildSystemPrompt();

        // CRITICAL FIX: Remove space in Cloudflare URL
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${CLOUDFLARE_AI_API_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messages: [
                { role: "system", content: systemContext },
                {
                  role: "user",
                  content: [
                    { type: "image_url", image_url: `data:${mimeType};base64,${base64Data}` },
                    { type: "text", text: userPrompt }
                  ]
                }
              ]
            })
          }
        );

        if (!cfRes.ok) {
          const errData = await cfRes.json();
          console.error("Vision API error:", errData);
          reply = `I had trouble analyzing this image. Please try again.`;
        } else {
          const cfData = await cfRes.json();
          reply = cfData.result?.response || "I couldn't analyze this image.";
        }
      } 
      else if (file_data) {
        console.log("[WIDGET] Processing file:", file_name);
        
        const mimeType = file_data.split(';')[0].split(':')[1];
        
        try {
          fileContent = await extractTextFromFile(file_data, file_name, mimeType);
          
          const systemContext = buildSystemPrompt();
          
          // CRITICAL FIX: Remove space in Cloudflare URL
          const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${CLOUDFLARE_AI_API_TOKEN}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                messages: [
                  { role: "system", content: systemContext },
                  { 
                    role: "user", 
                    content: `Here is the content of the file "${file_name}":\n\n${fileContent}\n\nUser question: ${message || "Please summarize this document and extract key information."}` 
                  }
                ]
              })
            }
          );

          if (!cfRes.ok) {
            const errData = await cfRes.json();
            console.error("File processing error:", errData);
            reply = `I had trouble processing this file.`;
          } else {
            const cfData = await cfRes.json();
            reply = cfData.result?.response || "I couldn't extract any information from this file.";
          }
        } catch (fileErr) {
          console.error("File extraction error:", fileErr);
          reply = `Sorry, I couldn't process this file.`;
        }
      } 
      else {
        console.log("[WIDGET] Processing text message");
        
        const systemContext = buildSystemPrompt();
        
        // CRITICAL FIX: Check for booking intent and inject link if needed
        const bookingKeywords = /book|appointment|schedule|meeting|reserve|consultation|demo/i;
        const hasBookingIntent = bookingKeywords.test(message);
        
        // CRITICAL FIX: Remove space in Cloudflare URL
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${CLOUDFLARE_AI_API_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messages: [
                { role: "system", content: systemContext },
                { role: "user", content: message }
              ]
            })
          }
        );

        if (!cfRes.ok) {
          const errData = await cfRes.json();
          console.error("Text API error:", errData);
          reply = `I'm having trouble connecting. Please try again.`;
        } else {
          const cfData = await cfRes.json();
          reply = cfData.result?.response || "I couldn't generate a response.";
          
          // CRITICAL FIX: If booking intent detected and we have URL but AI didn't include it, append it
          if (hasBookingIntent && smartSettings.booking_url && smartSettings.booking_active && !reply.includes(smartSettings.booking_url)) {
            reply += `\n\n📅 You can book here: ${smartSettings.booking_url}`;
          }
        }
      }

      await saveChat(uuidv4(), user.id, activeSession, client_name || "Web Visitor", message || "[File/Image Sent]", reply);
      await incrementMessagesUsed(user.id);

      res.json({ success: true, reply, session_id: activeSession });
    } catch (e) {
      console.error("❌ Public Chat Error:", e.message);
      res.status(500).json({ error: "AI processing error: " + (e.message || "Unknown issue") });
    }
  });
});

app.get("/api/chat", auth, (req, res) => {
  db.all(
    `SELECT session_id, client_name, MAX(created_at) as created_at, message, response 
     FROM chats WHERE user_id = ? 
     GROUP BY session_id 
     ORDER BY created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows || []);
    }
  );
});

// ================= LEADS =================
app.post("/api/public/leads", bodyParser.json(), (req, res) => {
  const { name, email, phone, widget_key } = req.body;
  
  if (!name || !email || !widget_key) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  db.get(`SELECT * FROM users WHERE widget_key = ?`, [widget_key], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Invalid Widget Key" });

    const limit = PLAN_LIMITS[user.plan]?.leads || 10;
    if (user.leads_used >= limit) {
      return res.status(403).json({ error: "Leads limit reached for this business" });
    }

    db.get(`SELECT id FROM leads WHERE user_id = ? AND email = ?`, [user.id, email.toLowerCase().trim()], (err, existingLead) => {
      if (err) {
        console.error("❌ Lead check error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (existingLead) {
        console.log(`[LEADS] Duplicate lead prevented for email: ${email}`);
        const io = req.app.get("socketio");
        io.to(user.id).emit("new_lead", { name, email, duplicate: true });
        return res.json({ success: true, message: "Welcome back!", duplicate: true });
      }

      saveLead(user.id, name, email, phone || "N/A")
        .then(() => {
          incrementLeadsUsed(user.id);
          const io = req.app.get("socketio");
          io.to(user.id).emit("new_lead", { name, email });
          res.json({ success: true, message: "Lead captured!" });
        })
        .catch(err => {
          console.error("❌ Lead Save Error:", err);
          res.status(500).json({ error: "Database save failed" });
        });
    });
  });
});

app.delete("/api/leads/:id", auth, (req, res) => {
  const leadId = req.params.id;
  db.get(`SELECT * FROM leads WHERE id = ? AND user_id = ?`, [leadId, req.user.id], (err, lead) => {
    if (err || !lead) return res.status(404).json({ error: "Lead not found" });

    db.run(`DELETE FROM leads WHERE id = ?`, [leadId], err => {
      if (err) return res.status(500).json({ error: "Failed to delete" });
      db.run(`UPDATE users SET leads_used = leads_used - 1 WHERE id = ? AND leads_used > 0`, [req.user.id]);
      res.json({ success: true, message: "Lead deleted" });
    });
  });
});

// ================= SUPPORT TICKETS =================
app.post("/api/support/ticket", auth, bodyParser.json(), (req, res) => {
  const { subject, message, priority } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const ticketId = uuidv4();
  db.run(
    `INSERT INTO support_tickets (id, user_id, subject, message, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, req.user.id, subject || "General Support", message, priority || "medium", "open", new Date().toISOString()],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to submit ticket" });
      res.json({ success: true, message: "Support ticket created successfully." });
    }
  );
});

app.get("/api/support/my-tickets", auth, (req, res) => {
  db.all(`SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows || []);
  });
});

// ================= GUIDANCE CONTENT =================
app.get("/api/content/guidance", (req, res) => {
  res.json({
    title: "How to Use Your AI Assistant",
    steps: [
      "Step 1: Go to Knowledge Base and add information about your business.",
      "Step 2: Copy your Widget Script from the Dashboard.",
      "Step 3: Paste the script tag into the <head> or <body> of your website.",
      "Step 4: Customize your widget color and welcome message in settings."
    ]
  });
});

app.get("/api/content/legal", (req, res) => {
  res.json({
    terms: "By using our AI SaaS, you agree to provide accurate information and not use the AI for illegal purposes...",
    privacy: "We value your privacy. We store chat logs to improve your AI's responses and do not sell your lead data..."
  });
});

// ================= ADMIN ROUTES =================
app.get("/api/admin/users", auth, isAdminMiddleware, (req, res) => {
  db.all(`SELECT id, email, business_name, plan, messages_used, leads_used, is_verified FROM users ORDER BY created_at DESC`, (_, rows) => {
    res.json(rows || []);
  });
});

app.put("/api/admin/users/:id", auth, isAdminMiddleware, bodyParser.json(), (req, res) => {
  const { plan, is_verified, messages_used, leads_used } = req.body;
  db.run(
    `UPDATE users SET plan = ?, is_verified = ?, messages_used = ?, leads_used = ? WHERE id = ?`,
    [plan, is_verified, messages_used, leads_used, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ success: true });
    }
  );
});

app.delete("/api/admin/users/:id", auth, isAdminMiddleware, (req, res) => {
  const userId = req.params.id;
  db.serialize(() => {
    db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    db.run(`DELETE FROM chats WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM leads WHERE user_id = ?`, [userId]);
    res.json({ success: true, message: "User and all data deleted" });
  });
});

app.get("/api/admin/activities", auth, isAdminMiddleware, (req, res) => {
  db.all(`SELECT * FROM chats ORDER BY created_at DESC LIMIT 100`, (_, rows) => {
    res.json(rows || []);
  });
});

// ================= SMART HUB SAVE ENDPOINT =================
app.post("/api/smart-hub/save", auth, bodyParser.json(), async (req, res) => {
  try {
    const { toolType, data } = req.body;
    const userId = req.user.id;
    
    console.log(`[SMART-HUB] Saving ${toolType} for user ${userId}:`, data);
    
    // Ensure smart_hub_settings exists
    await new Promise((resolve, reject) => {
      db.run(`INSERT OR IGNORE INTO smart_hub_settings (user_id) VALUES (?)`, [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Handle business_type separately
    if (toolType === 'business_type') {
      // FIXED: Map frontend field names to what saveBusinessIdentity expects
      const businessType = data.businessType || data.business_type || '';
      const businessDescription = data.businessDescription || data.business_description || '';
      
      await saveBusinessIdentity(userId, businessType, businessDescription);
      return res.json({ success: true });
    }
    
    // Handle other tool types
    let query = "";
    let params = [];

    switch(toolType) {
      case 'brain':
        query = `UPDATE smart_hub_settings SET ai_instructions = ?, ai_temp = ?, ai_lang = ?, brain_active = 1 WHERE user_id = ?`;
        params = [data.instructions, data.temp, data.lang, userId];
        break;
      case 'booking':
        query = `UPDATE smart_hub_settings SET booking_url = ?, booking_active = 1 WHERE user_id = ?`;
        params = [data.url, userId];
        break;
      case 'sentiment':
        query = `UPDATE smart_hub_settings SET sentiment_enabled = ?, alert_email = ?, sentiment_active = 1 WHERE user_id = ?`;
        params = [data.enabled ? 1 : 0, data.email, userId];
        break;
      case 'handover':
        query = `UPDATE smart_hub_settings SET handover_trigger = ?, handover_active = 1 WHERE user_id = ?`;
        params = [data.trigger, userId];
        break;
      case 'webhook':
        query = `UPDATE smart_hub_settings SET webhook_url = ?, webhook_active = 1 WHERE user_id = ?`;
        params = [data.url, userId];
        break;
      case 'apollo':
      case 'enrichment':
        query = `UPDATE smart_hub_settings SET apollo_active = ?, apollo_key = ?, auto_sync = ? WHERE user_id = ?`;
        params = [data.apolloKey ? 1 : 0, data.apolloKey || null, data.autoSync ? 1 : 0, userId];
        break;
      case 'vision':
        query = `UPDATE smart_hub_settings SET vision_active = ?, vision_sensitivity = ?, vision_area = ? WHERE user_id = ?`;
        params = [data.enabled ? 1 : 0, data.sensitivity || 'high', data.area || 'all', userId];
        break;
      case 'followup':
        query = `UPDATE smart_hub_settings SET followup_active = ? WHERE user_id = ?`;
        params = [data.enabled ? 1 : 0, userId];
        break;
      default:
        return res.status(400).json({ error: "Invalid tool type" });
    }

    db.run(query, params, function(err) {
      if (err) {
        console.error("Smart hub save error:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });

  } catch (err) {
    console.error("Smart hub save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= SMART HUB DEACTIVATE ENDPOINT =================
app.post("/api/smart-hub/deactivate", auth, async (req, res) => {
  try {
    const { toolType } = req.body;
    const userId = req.user.id;

    if (!toolType) {
      return res.status(400).json({ error: "Tool type required" });
    }

    // Map frontend tool names to database 'active' columns
    const activeColumnMap = {
      'brain': 'brain_active',
      'booking': 'booking_active',
      'sentiment': 'sentiment_active',
      'handover': 'handover_active',
      'webhook': 'webhook_active',
      'apollo': 'apollo_active',
      'enrichment': 'apollo_active',
      'followup': 'followup_active',
      'vision': 'vision_active',
      'business_type': null // Business type is stored in users table
    };

    const activeColumn = activeColumnMap[toolType];

    if (!activeColumn && toolType !== 'business_type') {
      return res.status(400).json({ error: "Invalid tool type" });
    }

    if (toolType === 'business_type') {
      // Business type can't be deactivated, just return success
      return res.json({ success: true, message: "Business type remains active" });
    }

    // Deactivate the tool by setting active flag to 0
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE smart_hub_settings SET ${activeColumn} = 0 WHERE user_id = ?`,
        [userId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    console.log(`[SMART-HUB] Tool deactivated: ${toolType} for user ${userId}`);
    res.json({ success: true, message: "Tool deactivated successfully" });

  } catch (err) {
    console.error("❌ Deactivation Error:", err.message);
    res.status(500).json({ success: false, error: "Database error during deactivation" });
  }
});

// ================= SMART HUB GET SETTINGS =================
app.get("/api/smart-hub/settings", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get smart hub settings
    const settings = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM smart_hub_settings WHERE user_id = ?`, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });

    // Get business identity
    const identity = await getBusinessIdentity(userId).catch(() => ({}));

    // Get user for booking_url
    const user = await getUserById(userId);

    res.json({
      ...settings,
      ...identity,
      booking_url: settings.booking_url || user?.booking_url || ''
    });

  } catch (err) {
    console.error("Smart hub get error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= SMART HUB TOOL STATE ENDPOINT =================
app.post("/api/smart-hub/tool-state", auth, async (req, res) => {
  try {
    const { toolType, isActive } = req.body;
    const userId = req.user.id;

    // This endpoint is optional - we're using localStorage for state
    // You could implement database sync here if needed
    res.json({ success: true });

  } catch (err) {
    console.error("Tool state error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= PAYSTACK =================
app.post("/api/subscription/create-checkout-session", auth, bodyParser.json(), async (req, res) => {
  const { plan } = req.body;
  const prices = { basic: 10000, pro: 25000, agency: 80000 };
  if (!prices[plan]) return res.status(400).json({ error: "Invalid plan" });

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
          email: req.user.email, 
          amount: prices[plan] * 100, 
          currency: "NGN",
          metadata: { userId: req.user.id, plan } 
      })
    });

    const data = await response.json();
    if (!data.status) return res.status(400).json({ error: data.message });

    res.json({ url: data.data.authorization_url });
  } catch (err) {
    res.status(500).json({ error: "Paystack server error" });
  }
});

app.post("/api/subscription/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY)
                        .update(req.body)
                        .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(req.body);
  
  if (event.event === "charge.success") {
    const { userId, plan } = event.data.metadata;
    
    db.run(
      `UPDATE users SET plan = ?, plan_expires = datetime('now', '+30 days'), messages_used = 0, leads_used = 0 WHERE id = ?`, 
      [plan, userId]
    );

    db.run(
      `INSERT INTO payments (id, user_id, plan, amount, reference, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), userId, plan, event.data.amount / 100, event.data.reference, "success", new Date().toISOString()]
    );
  }
  res.sendStatus(200);
});

// ================= CONTACT FORM ENDPOINT =================
app.post("/api/contact/send", bodyParser.json(), async (req, res) => {
  const { name, email, subject, message, priority, copyMe } = req.body;
  
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Send email to support
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">📬 New Contact Form Submission</h1>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Priority:</strong> ${priority}</p>
          <p><strong>Message:</strong></p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 15px 0;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 0.9rem;">Sent from AI Smart Hub Contact Form</p>
        </div>
      </body>
      </html>
    `;

    // Send using Resend
    if (resend) {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
        to: ['aismarthub68@gmail.com'],
        subject: `[Contact Form] ${subject} - ${name}`,
        html: emailHtml,
      });

      // Send copy to user if requested
      if (copyMe) {
        await resend.emails.send({
          from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
          to: [email],
          subject: `Copy: ${subject}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px;">
                <h1 style="color: white; margin: 0;">✅ Thank You for Contacting AI Smart Hub</h1>
              </div>
              <div style="background: white; padding: 30px; margin-top: 20px; border-radius: 10px; border: 1px solid #e0e0e0;">
                <p>We've received your message and will respond within 24 hours.</p>
                <p><strong>Your message:</strong></p>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                  ${message.replace(/\n/g, '<br>')}
                </div>
                <p style="margin-top: 20px; color: #666;">Best regards,<br>AI Smart Hub Team</p>
              </div>
            </body>
            </html>
          `,
        });
      }

      console.log(`✅ Contact form message sent from: ${email}`);
    }

    res.json({ success: true, message: "Message sent successfully" });

  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ================= ENHANCED EMAIL BROADCAST SYSTEM =================
app.post("/api/broadcast/send", auth, bodyParser.json(), async (req, res) => {
  const { subject, content, target } = req.body;
  const userId = req.user.id;
  
  if (!subject || !content) {
    return res.status(400).json({ error: "Subject and content are required" });
  }

  try {
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const leads = await new Promise((resolve, reject) => {
      db.all(`SELECT name, email FROM leads WHERE user_id = ?`, [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (leads.length === 0) {
      return res.status(400).json({ error: "No leads found to send emails to" });
    }

    let recipients = leads;
    const batchSize = 10;
    const results = { sent: 0, failed: 0 };
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const promises = batch.map(lead => {
        const personalizedContent = content.replace(/{{name}}/g, lead.name || 'Valued Customer');
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"></head>
          <body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
            <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">✨ ${user.business_name || 'AI Smart Hub'}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Customer Update</p>
              </div>
              <div style="padding: 30px; background: white;">
                ${personalizedContent.replace(/\n/g, '<br>')}
              </div>
              <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                <p style="color: #666; font-size: 14px; margin: 0;">
                  You're receiving this because you're a valued customer of ${user.business_name || 'AI Smart Hub'}.
                </p>
                <p style="color: #999; font-size: 12px; margin: 10px 0 0;">
                  <a href="#" style="color: #d4af37; text-decoration: none;">Unsubscribe</a>
                </p>
              </div>
            </div>
          </body>
          </html>
        `;
        
        return sendEmailWithFallback(
          lead.email,
          user.business_name || 'AI Smart Hub',
          subject,
          emailHtml
        );
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(r => r.success ? results.sent++ : results.failed++);
      
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const broadcastId = uuidv4();
    await saveBroadcast(broadcastId, userId, subject, recipients.length, results.sent, results.failed);

    const method = resend ? 'Resend' : 'Nodemailer';
    res.json({ 
      success: true, 
      message: `✅ [${method}] Broadcast sent to ${results.sent} recipients${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      stats: results
    });

  } catch (err) {
    console.error("Broadcast error:", err);
    res.status(500).json({ error: "Failed to send broadcast: " + err.message });
  }
});

app.post("/api/broadcast/test", auth, bodyParser.json(), async (req, res) => {
  const { subject, content } = req.body;
  const userId = req.user.id;

  if (!subject || !content) {
    return res.status(400).json({ error: "Subject and content are required" });
  }

  try {
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    console.log(`📧 Sending test email to: ${user.email}`);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #f8f9fa; padding: 15px; text-align: center; border-bottom: 2px solid #d4af37;">
            <span style="background: #d4af37; color: white; padding: 5px 15px; border-radius: 20px; font-size: 14px; font-weight: bold;">🔔 TEST MODE</span>
          </div>
          <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">✨ ${user.business_name || 'AI Smart Hub'}</h1>
          </div>
          <div style="padding: 30px;">
            ${content.replace(/\n/g, '<br>')}
          </div>
          <div style="background: #fff3cd; padding: 20px; text-align: center; border-top: 2px solid #ffc107;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              ⚠️ This was a test email from your AI Smart Hub dashboard. 
              <strong>No customers received this message.</strong>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendEmailWithFallback(
      user.email,
      user.business_name || 'AI Smart Hub',
      `[TEST] ${subject}`,
      emailHtml
    );

    if (result.success) {
      res.json({ success: true, message: `✅ Test email sent via ${result.method}! Check your inbox.` });
    } else {
      throw new Error(result.error);
    }

  } catch (err) {
    console.error("Test email error:", err);
    res.status(500).json({ 
      error: "Failed to send test email: " + err.message,
      tip: "Sign up for Resend at https://resend.com for reliable delivery"
    });
  }
});

app.get("/api/broadcast/history", auth, (req, res) => {
  const userId = req.user.id;
  getBroadcastsByUser(userId)
    .then(history => res.json(history))
    .catch(err => res.status(500).json({ error: "Database error" }));
});

app.get("/api/broadcast/stats", auth, (req, res) => {
  const userId = req.user.id;
  getBroadcastStats(userId)
    .then(stats => res.json(stats))
    .catch(err => res.status(500).json({ error: "Database error" }));
});

// ================= WIDGET KEY =================
app.get("/api/widget/key", auth, (req, res) => {
  getUserById(req.user.id).then(user => {
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ key: user.widget_key || "generate-new-key" });
  }).catch(err => {
      console.error("Key Fetch Error:", err);
      res.status(500).json({ error: "Server error fetching key" });
  });
});

app.post("/api/widget/regenerate-key", auth, (req, res) => {
  const newKey = uuidv4();
  setWidgetKey(req.user.id, newKey)
    .then(() => res.json({ key: newKey, message: "New key generated successfully" }))
    .catch(err => res.status(500).json({ error: "Failed to regenerate key" }));
});

// ================= START SERVER =================
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));