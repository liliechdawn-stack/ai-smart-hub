// ============================================================
// backend/routes/admin-routes.js - Admin Routes
// ============================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const { supabase } = require("../database-supabase.js");
const { auth, isAdminMiddleware } = require("../auth");
const { authenticateToken } = require("../auth-middleware");
const config = require("../config");

// Get all users
router.get("/users", auth, isAdminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, business_name, plan, messages_used, leads_used, is_verified")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Update user
router.put("/users/:id", auth, isAdminMiddleware, bodyParser.json(), async (req, res) => {
  const { plan, is_verified, messages_used, leads_used } = req.body;

  try {
    const { error } = await supabase
      .from("users")
      .update({ plan, is_verified, messages_used, leads_used })
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Admin update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// Delete user
router.delete("/users/:id", auth, isAdminMiddleware, async (req, res) => {
  const userId = req.params.id;

  try {
    await supabase.from("activity_log").delete().eq("user_id", userId);
    await supabase.from("automations").delete().eq("user_id", userId);
    await supabase.from("chats").delete().eq("user_id", userId);
    await supabase.from("connected_accounts").delete().eq("user_id", userId);
    await supabase.from("governance_settings").delete().eq("user_id", userId);
    await supabase.from("leads").delete().eq("user_id", userId);
    await supabase.from("users").delete().eq("id", userId);

    res.json({ success: true, message: "User and all data deleted" });
  } catch (err) {
    console.error("Admin delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// Get activities
router.get("/activities", auth, isAdminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Admin activities error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Seed automation templates
router.post("/seed-templates", authenticateToken, async (req, res) => {
  if (req.user.email !== config.ADMIN_EMAIL) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const templates = [
    {
      slug: "lead-scoring",
      name: "AI Lead Scoring",
      description:
        "Automatically score and qualify leads based on behavior, engagement, and demographics.",
      category: "lead_generation",
      icon: "fa-chart-line",
      color: "#d4af37",
      is_featured: true,
      complexity: "simple",
      time_saved: "10 hrs/week",
      roi_impact: "45% more leads",
      industries: ["agency", "saas", "coach"],
      default_config: {
        trigger: { type: "new_lead", config: { score_threshold: 75 } },
        actions: ["score_lead", "notify_slack"],
      },
    },
    {
      slug: "cart-recovery",
      name: "Abandoned Cart Recovery",
      description:
        "Recover lost sales by automatically sending follow-up emails to customers who abandon their carts.",
      category: "ecommerce",
      icon: "fa-shopping-cart",
      color: "#059669",
      is_featured: true,
      complexity: "simple",
      time_saved: "5 hrs/week",
      roi_impact: "25% recovery rate",
      industries: ["ecommerce"],
      default_config: {
        trigger: { type: "abandoned_cart", config: { delay_hours: 1 } },
        actions: ["send_email", "send_sms"],
      },
    },
    {
      slug: "ai-social-media-scheduler",
      name: "AI Social Media Scheduler",
      description:
        "Auto-generate and schedule posts across all platforms with AI-optimized timing.",
      category: "social_media",
      icon: "fa-share-alt",
      color: "#3b82f6",
      is_featured: true,
      complexity: "medium",
      time_saved: "8 hrs/week",
      roi_impact: "3x engagement",
      industries: ["agency", "creator", "coach"],
      default_config: {
        trigger: { type: "schedule_time", config: { post_time: "09:00" } },
        actions: ["generate_post", "post_to_instagram"],
      },
    },
    {
      slug: "video-script-generator",
      name: "Video Script Generator",
      description:
        "Generate viral video scripts for TikTok, Reels, and YouTube Shorts in seconds.",
      category: "content_creation",
      icon: "fa-video",
      color: "#ef4444",
      is_featured: false,
      complexity: "simple",
      time_saved: "4 hrs/week",
      roi_impact: "10x content output",
      industries: ["creator", "agency"],
      default_config: {
        trigger: { type: "on_demand", config: {} },
        actions: ["generate_script"],
      },
    },
    {
      slug: "auto-responder",
      name: "AI Auto-Responder",
      description: "Handle 70% of common customer questions automatically, 24/7.",
      category: "customer_support",
      icon: "fa-headset",
      color: "#8b5cf6",
      is_featured: true,
      complexity: "medium",
      time_saved: "15 hrs/week",
      roi_impact: "80% faster response",
      industries: ["all"],
      default_config: {
        trigger: { type: "new_message", config: { response_tone: "professional" } },
        actions: ["ai_response"],
      },
    },
    {
      slug: "price-monitoring-alert",
      name: "Competitor Price Monitoring",
      description: "Track competitor prices and get alerts when they change.",
      category: "ecommerce",
      icon: "fa-chart-simple",
      color: "#f59e0b",
      is_featured: false,
      complexity: "advanced",
      time_saved: "6 hrs/week",
      roi_impact: "20% better pricing",
      industries: ["ecommerce"],
      default_config: {
        trigger: { type: "price_change", config: { alert_threshold: 5 } },
        actions: ["email_alert"],
      },
    },
    {
      slug: "lead-capture-crm-slack",
      name: "Lead Capture to CRM + Slack",
      description:
        "Capture leads from your website and instantly notify your team on Slack.",
      category: "lead_generation",
      icon: "fa-slack",
      color: "#d4af37",
      is_featured: true,
      complexity: "simple",
      time_saved: "3 hrs/week",
      roi_impact: "65% faster response",
      industries: ["agency", "saas"],
      default_config: {
        trigger: { type: "new_lead", config: {} },
        actions: ["create_lead", "send_slack"],
      },
    },
    {
      slug: "report-generator",
      name: "Auto-Generate Client Reports",
      description:
        "Pull data from analytics tools and email beautiful reports to clients weekly.",
      category: "reporting",
      icon: "fa-file-alt",
      color: "#d4af37",
      is_featured: false,
      complexity: "advanced",
      time_saved: "8 hrs/week",
      roi_impact: "15 hrs saved",
      industries: ["agency"],
      default_config: {
        trigger: { type: "schedule_time", config: { day: "Monday", time: "09:00" } },
        actions: ["generate_report", "send_email"],
      },
    },
    {
      slug: "review-requests",
      name: "Automated Review Requests",
      description:
        "Auto-request reviews after service completion and respond to feedback.",
      category: "customer_support",
      icon: "fa-star",
      color: "#f59e0b",
      is_featured: false,
      complexity: "simple",
      time_saved: "3 hrs/week",
      roi_impact: "3x more reviews",
      industries: ["local_business"],
      default_config: {
        trigger: { type: "service_completed", config: { delay_days: 1 } },
        actions: ["send_email", "track_response"],
      },
    },
  ];

  try {
    let inserted = 0;
    let updated = 0;

    for (const template of templates) {
      const { data: existing } = await supabase
        .from("automation_templates")
        .select("id")
        .eq("slug", template.slug)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("automation_templates")
          .update({
            ...template,
            updated_at: new Date().toISOString(),
          })
          .eq("slug", template.slug);

        if (error) throw error;
        updated++;
      } else {
        const { error } = await supabase
          .from("automation_templates")
          .insert({
            ...template,
            id: uuidv4(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            usage_count: 0,
          });

        if (error) throw error;
        inserted++;
      }
    }

    const { count, error: countError } = await supabase
      .from("automation_templates")
      .select("*", { count: "exact", head: true });

    res.json({
      success: true,
      message: `Templates seeded successfully`,
      inserted: inserted,
      updated: updated,
      total: count || 0,
    });
  } catch (error) {
    console.error("Error seeding templates:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      hint: "Make sure automation_templates table exists in Supabase",
    });
  }
});

module.exports = router;