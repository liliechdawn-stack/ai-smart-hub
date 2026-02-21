import express from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../database.js";
import { authMiddleware } from "../middleware/jwt.js";
import fetch from "node-fetch"; // Node 18+ fetch fix

const router = express.Router();
const ADMIN_EMAIL = "ericchung992@gmail.com";

// ================= SEND CHAT MESSAGE =================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { message, image_data, client_name, session_id } = req.body;
    const userId = req.userId;

    if (!message && !image_data) {
      return res.status(400).json({ error: "Message or image required" });
    }

    // Get user info
    db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const PLAN_LIMITS = {
        free: 50,
        basic: 500,
        pro: 3000,
        agency: Infinity
      };

      const userPlan = user.plan || "free";
      const messagesUsed = user.messages_used || 0;
      const limit = PLAN_LIMITS[userPlan];

      // ================= FORCE UPGRADE =================
      if (user.email !== ADMIN_EMAIL && userPlan !== "agency" && messagesUsed >= limit) {
        return res.status(402).json({
          forceUpgrade: true,
          message: "Message limit reached. Please upgrade to continue.",
          plan: userPlan,
          messagesUsed,
          messagesLimit: limit
        });
      }

      // ================= CALL CLOUDFLARE WORKERS AI =================
      try {
        const aiRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.CLOUDFLARE_AI_API_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: "You are a professional AI assistant for a business. Be helpful, polite, concise, and sales-oriented."
                },
                {
                  role: "user",
                  content: message || "Please respond to this message."
                }
              ]
            })
          }
        );

        if (!aiRes.ok) {
          const errData = await aiRes.json();
          console.error("❌ Cloudflare AI Error:", errData);
          throw new Error(errData.errors?.[0]?.message || "Cloudflare AI failed");
        }

        const aiData = await aiRes.json();
        const reply = aiData.result?.response?.trim() || "AI failed to respond";

        // ================= SAVE CHAT =================
        const chatId = uuidv4();
        // If no session_id is provided by the widget, we use a new one so it groups correctly
        const finalSessionId = session_id || uuidv4(); 
        const createdAt = new Date().toISOString();

        db.run(
          `INSERT INTO chats (id, user_id, client_name, message, response, created_at, session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [chatId, userId, client_name || "Guest", message || "[Image Sent]", reply, createdAt, finalSessionId],
          (err) => {
            if (err) {
              console.error("❌ Failed to save chat:", err);
              // Fallback: If your table doesn't have session_id column yet, it might error. 
              // You should run: ALTER TABLE chats ADD COLUMN session_id TEXT;
              return res.status(500).json({ error: "Failed to save chat. Check if session_id column exists." });
            }

            // ================= INCREMENT USAGE =================
            db.run(
              `UPDATE users SET messages_used = messages_used + 1 WHERE id = ?`,
              [userId],
              (err2) => {
                if (err2) console.error("❌ Failed to update messages_used:", err2);
              }
            );

            console.log(`💬 Chat saved for user ${userId}`, {
              client_name,
              message,
              reply
            });

            res.json({
              success: true,
              chat: {
                id: chatId,
                client_name: client_name || "Guest",
                message: message || "[Image Sent]",
                response: reply, // named response to match your DB
                created_at: createdAt,
                session_id: finalSessionId
              }
            });
          }
        );
      } catch (err) {
        console.error("❌ AI server error:", err);
        res.status(500).json({ error: "AI server error: " + err.message });
      }
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= GET ALL CHATS =================
router.get("/", authMiddleware, (req, res) => {
  try {
    const userId = req.userId;

    db.all(
      `SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
      (err, rows) => {
        if (err) {
          console.error("❌ Failed to fetch chats:", err);
          return res.status(500).json({ error: "Failed to fetch chats" });
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