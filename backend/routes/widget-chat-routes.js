// ============================================================
// backend/routes/widget-chat-routes.js - Widget Chat Routes
// ============================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

const { auth, checkVerified } = require("../auth");
const { processDashboardChat, processWidgetChat } = require("../services/chat-service");

// Dashboard AI Chat
router.post("/widget/chat", auth, checkVerified, bodyParser.json(), async (req, res) => {
  const { message, client_name, session_id } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message required" });
  }

  try {
    const result = await processDashboardChat(
      req.user.id,
      message,
      client_name,
      session_id
    );
    res.json(result);
  } catch (err) {
    console.error("💥 AI Error:", err.message);
    res.status(err.message.includes("limit") ? 403 : 500).json({
      error: err.message || "AI server error",
    });
  }
});

// Public Widget Chat (with image/file support)
router.post("/public/chat", bodyParser.json({ limit: "50mb" }), async (req, res) => {
  try {
    const result = await processWidgetChat(req.body);
    res.json(result);
  } catch (err) {
    console.error("💥 Public Chat Error:", err.message);
    const status = err.message.includes("limit") ? 403 :
                   err.message.includes("required") ? 400 : 500;
    res.status(status).json({
      error: err.message || "AI processing error",
    });
  }
});

module.exports = router;