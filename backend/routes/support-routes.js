// ============================================================
// backend/routes/support-routes.js - Support Routes
// ============================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const { supabase, logActivity } = require("../database-supabase.js");
const { auth } = require("../auth");

// Create support ticket
router.post("/ticket", auth, bodyParser.json(), async (req, res) => {
  const { subject, message, priority } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const ticketId = uuidv4();

  try {
    const { error } = await supabase
      .from("support_tickets")
      .insert({
        id: ticketId,
        user_id: req.user.id,
        subject: subject || "General Support",
        message,
        priority: priority || "medium",
        status: "open",
        created_at: new Date().toISOString(),
      });

    if (error) throw error;

    await logActivity(
      req.user.id,
      "ticket_created",
      `Support ticket: ${subject || "General"}`,
      "support"
    );

    res.json({ success: true, message: "Support ticket created successfully." });
  } catch (err) {
    console.error("Ticket error:", err);
    res.status(500).json({ error: "Failed to submit ticket" });
  }
});

// Get user tickets
router.get("/my-tickets", auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Tickets error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;