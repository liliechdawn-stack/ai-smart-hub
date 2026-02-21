// dashboard.js
const express = require("express");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";

// ================= DATABASE =================
const db = new sqlite3.Database("./aiwidget.db", (err) => {
  if (err) console.error("❌ DB Error:", err);
  else console.log("✅ SQLite DB connected (dashboard.js)");
});

// ================= PLAN CONFIG =================
const PLAN_LIMITS = {
  free: { messages: 50, leads: 10 },
  basic: { messages: 500, leads: Infinity },
  pro: { messages: 3000, leads: Infinity },
  agency: { messages: Infinity, leads: Infinity },
};

// ================= AUTH MIDDLEWARE =================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.userId = decoded.id;
    next();
  });
}

// ================= DASHBOARD ENDPOINT =================
router.get("/overview", authMiddleware, (req, res) => {
  const userId = req.userId;

  db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Unauthorized" });

    const messagesLeft = PLAN_LIMITS[user.plan].messages - (user.messages_used || 0);
    const leadsLeft = PLAN_LIMITS[user.plan].leads - (user.leads_used || 0);

    // Get chats
    db.all(
      `SELECT id, client_name, message, response, created_at FROM chats WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
      (err, chats) => {
        if (err) return res.status(500).json({ error: "Failed to fetch chats" });

        // Get leads
        db.all(
          `SELECT id, name, email, phone, created_at FROM leads WHERE user_id = ? ORDER BY created_at DESC`,
          [userId],
          (err, leads) => {
            if (err) return res.status(500).json({ error: "Failed to fetch leads" });

            res.json({
              id: user.id,
              name: user.name,
              email: user.email,            // ✅ This is critical for Paystack
              plan: user.plan,
              subscription: user.subscription_status || "inactive",
              messages_used: user.messages_used || 0,
              leads_used: user.leads_used || 0,
              messages_left,
              leads_left,
              chats,
              leads,
            });
          }
        );
      }
    );
  });
});

module.exports = router;
