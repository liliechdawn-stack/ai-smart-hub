const { supabase } = require('./database-supabase');
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../middleware/jwt.js";
import fetch from "node-fetch";

const router = express.Router();
const ADMIN_EMAIL = "ericchung992@gmail.com";

// Plan limits
const PLAN_LIMITS = {
  free: 50,
  basic: 500,
  pro: 3000,
  agency: Infinity,
  enterprise: Infinity
};

// ================= SEND CHAT MESSAGE =================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { message, image_data, client_name, session_id } = req.body;
    const userId = req.userId;

    if (!message && !image_data) {
      return res.status(400).json({ error: "Message or image required" });
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error("❌ User fetch error:", userError);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userPlan = user.plan || "free";
    const messagesUsed = user.messages_used || 0;
    const limit = PLAN_LIMITS[userPlan] || 50;

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

      // Insert chat into Supabase
      const { error: insertError } = await supabase
        .from('chats')
        .insert({
          id: chatId,
          user_id: userId,
          client_name: client_name || "Guest",
          message: message || "[Image Sent]",
          response: reply,
          created_at: createdAt,
          session_id: finalSessionId,
          sentiment: 'neutral'
        });

      if (insertError) {
        console.error("❌ Failed to save chat:", insertError);
        return res.status(500).json({ 
          error: "Failed to save chat. Please check database schema." 
        });
      }

      // ================= INCREMENT USAGE =================
      const { error: updateError } = await supabase
        .from('users')
        .update({ messages_used: messagesUsed + 1 })
        .eq('id', userId);

      if (updateError) {
        console.error("❌ Failed to update messages_used:", updateError);
      }

      // Emit real-time notification via Socket.io
      const io = req.app.get("socketio");
      if (io) {
        io.to(userId).emit("newChat", { 
          client_name: client_name || "Guest", 
          message: message || "[Image Sent]",
          created_at: createdAt 
        });
      }

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
          response: reply,
          created_at: createdAt,
          session_id: finalSessionId
        }
      });
    } catch (err) {
      console.error("❌ AI server error:", err);
      res.status(500).json({ error: "AI server error: " + err.message });
    }
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= GET ALL CHATS =================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: chats, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("❌ Failed to fetch chats:", error);
      return res.status(500).json({ error: "Failed to fetch chats" });
    }

    res.json(chats || []);
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= GET SINGLE CHAT SESSION =================
router.get("/session/:sessionId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;

    const { data: chats, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("❌ Failed to fetch chat session:", error);
      return res.status(500).json({ error: "Failed to fetch chat session" });
    }

    res.json(chats || []);
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= DELETE CHAT =================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.userId;

    // First check if chat exists and belongs to user
    const { data: chat, error: fetchError } = await supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Delete the chat
    const { error: deleteError } = await supabase
      .from('chats')
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error("❌ Failed to delete chat:", deleteError);
      return res.status(500).json({ error: "Failed to delete chat" });
    }

    // Emit notification
    const io = req.app.get("socketio");
    if (io) {
      io.to(userId).emit("chatDeleted", { id: chatId });
    }

    res.json({ success: true, message: "Chat deleted successfully" });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= GET CHAT STATS =================
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    // Get total chats
    const { data: chats, error: chatsError } = await supabase
      .from('chats')
      .select('id, created_at, sentiment')
      .eq('user_id', userId);

    if (chatsError) {
      console.error("❌ Failed to fetch chat stats:", chatsError);
      return res.status(500).json({ error: "Failed to fetch chat stats" });
    }

    // Calculate stats
    const total = chats?.length || 0;
    const today = chats?.filter(c => 
      new Date(c.created_at).toDateString() === new Date().toDateString()
    ).length || 0;
    const negative = chats?.filter(c => c.sentiment === 'negative').length || 0;
    const positive = chats?.filter(c => c.sentiment === 'positive').length || 0;
    const neutral = chats?.filter(c => !c.sentiment || c.sentiment === 'neutral').length || 0;

    res.json({
      total,
      today,
      sentiment: { negative, positive, neutral },
      conversion_rate: total > 0 ? Math.round((positive / total) * 100) : 0
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;