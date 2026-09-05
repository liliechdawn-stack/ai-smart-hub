// ============================================================
// backend/routes/profile-routes.js - User Profile Routes
// ============================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");

const { supabase, getUserById } = require("../database-supabase.js");
const { auth } = require("../auth");

// Update profile
router.put("/update-profile", auth, bodyParser.json(), async (req, res) => {
  const { business_name, password } = req.body;
  const userId = req.user.id;

  try {
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const { error } = await supabase
        .from("users")
        .update({ business_name, password: hashedPassword })
        .eq("id", userId);

      if (error) throw error;
      res.json({ success: true, message: "Profile and password updated" });
    } else {
      const { error } = await supabase
        .from("users")
        .update({ business_name })
        .eq("id", userId);

      if (error) throw error;
      res.json({ success: true, message: "Profile name updated" });
    }
  } catch (e) {
    res.status(500).json({ error: "Server error during update" });
  }
});

// Delete account
router.delete("/delete-account", auth, async (req, res) => {
  const userId = req.user.id;

  try {
    await supabase.from("activity_log").delete().eq("user_id", userId);
    await supabase.from("automations").delete().eq("user_id", userId);
    await supabase.from("chats").delete().eq("user_id", userId);
    await supabase.from("connected_accounts").delete().eq("user_id", userId);
    await supabase.from("governance_settings").delete().eq("user_id", userId);
    await supabase.from("knowledge_base").delete().eq("user_id", userId);
    await supabase.from("leads").delete().eq("user_id", userId);
    await supabase.from("support_tickets").delete().eq("user_id", userId);
    await supabase.from("users").delete().eq("id", userId);

    res.json({ success: true, message: "Account deleted permanently" });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// Get user profile
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      id: user.id,
      name: user.business_name || user.name || "User",
      email: user.email,
      business_name: user.business_name,
      plan: user.plan,
      is_verified: user.is_verified,
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;