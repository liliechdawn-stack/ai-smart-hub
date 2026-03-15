import express from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../database.js";
import { authMiddleware } from "../middleware/jwt.js";
import nodemailer from "nodemailer"; // ADDED NODEMAILER

const router = express.Router();
const ADMIN_EMAIL = "ericchung992@gmail.com";

// ================= EMAIL TRANSPORTER SETUP =================
// Replace these with your actual SMTP details (Gmail, SendGrid, etc.)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "YOUR_EMAIL@gmail.com", 
    pass: "YOUR_APP_PASSWORD" 
  }
});

// Helper function to send email
const sendLeadEmail = (ownerEmail, leadData) => {
  const mailOptions = {
    from: '"AI Lead System" <YOUR_EMAIL@gmail.com>',
    to: ownerEmail,
    subject: `🚀 New Lead Captured: ${leadData.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; border: 1px solid #d4af37; padding: 20px; border-radius: 10px;">
        <h2 style="color: #d4af37;">New Lead Details</h2>
        <p><strong>Name:</strong> ${leadData.name}</p>
        <p><strong>Email:</strong> ${leadData.email}</p>
        <p><strong>Phone:</strong> ${leadData.phone || 'Not provided'}</p>
        <hr>
        <p style="font-size: 12px; color: #666;">This is an automated notification from your AI Chat Widget.</p>
      </div>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("❌ Email Error:", error);
    else console.log("📧 Notification sent to:", ownerEmail);
  });
};

// ================= PUBLIC ROUTE: CAPTURE FROM AI WIDGET =================
router.post("/public", async (req, res) => {
  try {
    const { name, email, phone, widget_key } = req.body;

    if (!widget_key) return res.status(400).json({ error: "Widget key is required" });
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    db.get(`SELECT * FROM users WHERE widget_key = ?`, [widget_key], (err, user) => {
      if (err || !user) return res.status(404).json({ error: "Invalid widget key" });

      const userId = user.id;

      // --- DUPLICATE CHECK BY EMAIL ---
      db.get(`SELECT id FROM leads WHERE user_id = ? AND email = ?`, [userId, email], (dupErr, existingLead) => {
        if (existingLead) {
          console.log(`ℹ️ Duplicate lead ignored for ${email}`);
          // Return success true so the widget treats it as a success and lets the user chat
          return res.json({ success: true, message: "Lead already recognized" });
        }

        const userPlan = user.plan || "free";
        const leadsUsed = user.leads_used || 0;
        
        const PLAN_LIMITS = {
          free: 10,
          basic: 500,
          pro: 3000,
          agency: Infinity
        };

        const limit = PLAN_LIMITS[userPlan];

        if (user.email !== ADMIN_EMAIL && userPlan !== "agency" && leadsUsed >= limit) {
          return res.status(402).json({ error: "Lead limit reached for this account." });
        }

        const leadId = uuidv4();
        const createdAt = new Date().toISOString();

        db.run(
          `INSERT INTO leads (id, user_id, name, email, phone, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [leadId, userId, name, email, phone || "", createdAt],
          function (dbErr) {
            if (dbErr) return res.status(500).json({ error: "Failed to save lead" });

            db.run(`UPDATE users SET leads_used = leads_used + 1 WHERE id = ?`, [userId]);

            // --- TRIGGER EMAIL NOTIFICATION ---
            sendLeadEmail(user.email, { name, email, phone });

            // --- TRIGGER REAL-TIME SOCKET NOTIFICATION ---
            const io = req.app.get("socketio");
            if (io) {
              io.to(userId).emit("newLead", { name, email, createdAt });
            }

            console.log(`📩 Public Lead captured for user ${userId}: ${email}`);
            res.json({ success: true, message: "Lead captured successfully" });
          }
        );
      });
    });
  } catch (err) {
    console.error("❌ Public lead error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= PRIVATE ROUTE: CREATE NEW LEAD (DASHBOARD) =================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const userId = req.userId;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // --- DUPLICATE CHECK FOR MANUAL ADDITION ---
    db.get(`SELECT id FROM leads WHERE user_id = ? AND email = ?`, [userId, email], (dupErr, existingLead) => {
      if (existingLead) {
        return res.status(400).json({ error: "A lead with this email already exists in your list." });
      }

      db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err || !user) return res.status(401).json({ error: "Unauthorized" });

        const PLAN_LIMITS = {
          free: 10,
          basic: 500,
          pro: 3000,
          agency: Infinity
        };

        const userPlan = user.plan || "free";
        const leadsUsed = user.leads_used || 0;
        const limit = PLAN_LIMITS[userPlan];

        if (user.email !== ADMIN_EMAIL && userPlan !== "agency" && leadsUsed >= limit) {
          return res.status(402).json({
            forceUpgrade: true,
            message: "Lead limit reached. Please upgrade to continue.",
            plan: userPlan,
            leadsUsed,
            leadsLimit: limit
          });
        }

        const leadId = uuidv4();
        const createdAt = new Date().toISOString();

        db.run(
          `INSERT INTO leads (id, user_id, name, email, phone, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [leadId, userId, name, email, phone || "", createdAt],
          function (err) {
            if (err) {
              console.error("❌ Failed to save lead:", err);
              return res.status(500).json({ error: "Failed to save lead" });
            }

            db.run(
              `UPDATE users SET leads_used = leads_used + 1 WHERE id = ?`,
              [userId],
              (err2) => {
                if (err2) console.error("❌ Failed to update leads_used:", err2);
              }
            );

            sendLeadEmail(user.email, { name, email, phone });

            const io = req.app.get("socketio");
            if (io) {
              io.to(userId).emit("newLead", { name, email, createdAt });
            }

            console.log(`📩 Lead saved for user ${userId}`, { name, email, phone });

            res.json({
              success: true,
              message: "Lead added successfully",
              lead: { id: leadId, name, email, phone, createdAt }
            });
          }
        );
      });
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= GET ALL LEADS (FOR DASHBOARD) =================
router.get("/", authMiddleware, (req, res) => {
  try {
    const userId = req.userId;

    db.all(
      `SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
      (err, rows) => {
        if (err) {
          console.error("❌ Failed to fetch leads:", err);
          return res.status(500).json({ error: "Failed to fetch leads" });
        }
        res.json(rows);
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;