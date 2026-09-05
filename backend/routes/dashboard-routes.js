// ============================================================
// backend/routes/dashboard-routes.js - Dashboard Routes
// ============================================================

const express = require("express");
const router = express.Router();

const { supabase, getUserById } = require("../database-supabase.js");
const { auth } = require("../auth");
const config = require("../config");

// ============================================================
// IMPORT PLAN HELPERS - Single Source of Truth (from config)
// ============================================================
const { getPlanLimits, isValidPlan } = require("../config");

// ============================================================
// ROUTES
// ============================================================

// Get dashboard data
router.get("/full", auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Normalize plan
    let dbPlan = (user.plan || "free").toLowerCase().trim();
    if (dbPlan === "agence") dbPlan = "agency";
    
    // Validate plan exists, fallback to free
    let currentPlan = isValidPlan(dbPlan) ? dbPlan : "free";

    // Admin override
    if (user.email.toLowerCase().trim() === config.ADMIN_EMAIL) {
      currentPlan = "agency";
    }

    // Get limits from centralized source
    const limits = getPlanLimits(currentPlan);
    const displayName = user.business_name || user.name || "My Business";

    const { data: chats } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const businessProfile = user.business_profile || null;

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
      messages_limit: limits.messages || 50,
      leads_used: user.leads_used || 0,
      leads_limit: limits.leads || 10,
      chats: chats || [],
      leads: leads || [],
      widget_key: user.widget_key || "generate-new-key",
      business_profile: businessProfile,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;