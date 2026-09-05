// ============================================================
// backend/routes/chat-routes.js - Chat Routes
// ============================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

const { supabase } = require("../database-supabase.js");
const { auth } = require("../auth");

// Get chat session
router.get("/session/:session_id", auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("session_id", req.params.session_id)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Chat session error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Get chat list
router.get("/", auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("chats")
      .select("session_id, client_name, message, response, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const sessions = {};
    data.forEach((chat) => {
      if (!sessions[chat.session_id]) {
        sessions[chat.session_id] = {
          session_id: chat.session_id,
          client_name: chat.client_name,
          last_message: chat.created_at,
          messages: [],
        };
      }
      sessions[chat.session_id].messages.push(chat);
    });

    const result = Object.values(sessions).map((s) => ({
      session_id: s.session_id,
      client_name: s.client_name,
      created_at: s.last_message,
      message_count: s.messages.length,
    }));

    res.json(result);
  } catch (err) {
    console.error("Chat list error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;