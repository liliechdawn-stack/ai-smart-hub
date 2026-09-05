// ============================================================
// backend/routes/widget-routes.js - Widget Routes
// ============================================================

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const { supabase, getUserById, setWidgetKey, getBusinessIdentity } = require("../database-supabase.js");
const { auth } = require("../auth");

// Get widget config (public)
router.get("/public/widget-config/:key", async (req, res) => {
  const widgetKey = req.params.key;

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, business_name, widget_color, welcome_message, plan")
      .eq("widget_key", widgetKey)
      .single();

    if (error || !user) return res.status(404).json({ error: "Widget not found" });

    const { data: smartSettings } = await supabase
      .from("smart_hub_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const settings = smartSettings || {};
    const identity = await getBusinessIdentity(user.id).catch(() => ({}));

    res.json({
      business_name: user.business_name || "AI Assistant",
      widget_color: user.widget_color || "#d4af37",
      welcome_message: user.welcome_message || "Hi! How can I help you today?",
      plan: user.plan || "free",
      business_type: identity.business_type || "",
      business_description: identity.business_description || "",
      booking_url: settings.booking_url || "",
      booking_active: settings.booking_active || 0,
      apollo_active: settings.apollo_active || 0,
      apollo_key: settings.apollo_key || "",
      followup_active: settings.followup_active || 0,
      vision_active: settings.vision_active || 0,
      sentiment_active: settings.sentiment_active || 0,
      ai_instructions: settings.ai_instructions || "",
      ai_temp: settings.ai_temp || "0.7",
      smart_hub: settings,
    });
  } catch (err) {
    console.error("Widget config error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get widget key
router.get("/widget/key", auth, (req, res) => {
  getUserById(req.user.id)
    .then((user) => {
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ key: user.widget_key || "generate-new-key" });
    })
    .catch((err) => {
      console.error("Key Fetch Error:", err);
      res.status(500).json({ error: "Server error fetching key" });
    });
});

// Regenerate widget key
router.post("/widget/regenerate-key", auth, (req, res) => {
  const newKey = uuidv4();
  setWidgetKey(req.user.id, newKey)
    .then(() => res.json({ key: newKey, message: "New key generated successfully" }))
    .catch((err) => res.status(500).json({ error: "Failed to regenerate key" }));
});

module.exports = router;