// dashboard.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require('./database-supabase');
require("dotenv").config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";

// ================= PLAN CONFIG =================
const PLAN_LIMITS = {
  free: { messages: 50, leads: 10 },
  basic: { messages: 500, leads: Infinity },
  pro: { messages: 3000, leads: Infinity },
  agency: { messages: Infinity, leads: Infinity },
  enterprise: { messages: Infinity, leads: Infinity }
};

// ================= AUTH MIDDLEWARE =================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.userId = decoded.id;
    next();
  });
}

// ================= DASHBOARD ENDPOINT =================
router.get("/overview", authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    // Get user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error("❌ User fetch error:", userError);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userPlan = user.plan || 'free';
    const planLimits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;
    
    const messagesLeft = planLimits.messages - (user.messages_used || 0);
    const leadsLeft = planLimits.leads - (user.leads_used || 0);

    // Get chats
    const { data: chats, error: chatsError } = await supabase
      .from('chats')
      .select('id, client_name, message, response, created_at, session_id, sentiment')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (chatsError) {
      console.error("❌ Failed to fetch chats:", chatsError);
      return res.status(500).json({ error: "Failed to fetch chats" });
    }

    // Get leads
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, name, email, phone, company, job_title, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (leadsError) {
      console.error("❌ Failed to fetch leads:", leadsError);
      return res.status(500).json({ error: "Failed to fetch leads" });
    }

    // Get recent activity
    const { data: recentActivity, error: activityError } = await supabase
      .from('activity_log')
      .select('action, details, type, icon, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (activityError) {
      console.error("❌ Failed to fetch activity:", activityError);
    }

    // Get smart hub settings
    const { data: settings, error: settingsError } = await supabase
      .from('smart_hub_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error("❌ Failed to fetch settings:", settingsError);
    }

    // Calculate dashboard stats
    const totalChats = chats?.length || 0;
    const todayChats = chats?.filter(c => 
      new Date(c.created_at).toDateString() === new Date().toDateString()
    ).length || 0;
    
    const totalLeads = leads?.length || 0;
    const todayLeads = leads?.filter(l => 
      new Date(l.created_at).toDateString() === new Date().toDateString()
    ).length || 0;

    // Get subscription info
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError && subError.code !== 'PGRST116') {
      console.error("❌ Failed to fetch subscription:", subError);
    }

    // Get payment history
    const { data: payments, error: payError } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (payError) {
      console.error("❌ Failed to fetch payments:", payError);
    }

    // Return complete dashboard data
    res.json({
      id: user.id,
      name: user.business_name || user.name || "User",
      email: user.email,            // ✅ This is critical for Paystack
      business_name: user.business_name || "",
      business_type: user.business_type || "",
      
      // Plan & Usage
      plan: user.plan || "free",
      plan_expires: user.plan_expires,
      subscription: subscription?.status || "inactive",
      subscription_id: subscription?.id,
      
      // Usage counts
      messages_used: user.messages_used || 0,
      leads_used: user.leads_used || 0,
      messages_left: Math.max(0, messagesLeft),
      leads_left: Math.max(0, leadsLeft),
      
      // Widget settings
      widget_key: user.widget_key,
      widget_color: user.widget_color || "#d4af37",
      welcome_message: user.welcome_message || "Hi! How can I help you today?",
      
      // Data
      chats: chats || [],
      leads: leads || [],
      recent_activity: recentActivity || [],
      
      // Stats
      stats: {
        total_chats: totalChats,
        today_chats: todayChats,
        total_leads: totalLeads,
        today_leads: todayLeads,
        conversion_rate: totalChats > 0 ? Math.round((totalLeads / totalChats) * 100) : 0
      },
      
      // Smart hub settings
      settings: settings || {},
      
      // Recent payments
      recent_payments: payments || []
    });

  } catch (err) {
    console.error("❌ Dashboard overview error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// ================= GET USAGE STATS =================
router.get("/usage", authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('messages_used, leads_used, plan')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const planLimits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

    res.json({
      messages: {
        used: user.messages_used || 0,
        limit: planLimits.messages,
        remaining: Math.max(0, planLimits.messages - (user.messages_used || 0)),
        percentage: planLimits.messages === Infinity ? 0 : 
          Math.round(((user.messages_used || 0) / planLimits.messages) * 100)
      },
      leads: {
        used: user.leads_used || 0,
        limit: planLimits.leads,
        remaining: planLimits.leads === Infinity ? Infinity : 
          Math.max(0, planLimits.leads - (user.leads_used || 0)),
        percentage: planLimits.leads === Infinity ? 0 : 
          Math.round(((user.leads_used || 0) / planLimits.leads) * 100)
      }
    });
  } catch (err) {
    console.error("❌ Usage stats error:", err);
    res.status(500).json({ error: "Failed to load usage stats" });
  }
});

// ================= GET RECENT ACTIVITY =================
router.get("/activity", authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    const { data: activity, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(20);

    if (error) {
      console.error("❌ Activity fetch error:", error);
      return res.status(500).json({ error: "Failed to load activity" });
    }

    res.json(activity || []);
  } catch (err) {
    console.error("❌ Activity error:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// ================= UPDATE WIDGET SETTINGS =================
router.put("/widget", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { widget_color, welcome_message, widget_key } = req.body;

  try {
    const updates = {};
    if (widget_color) updates.widget_color = widget_color;
    if (welcome_message) updates.welcome_message = welcome_message;
    if (widget_key) updates.widget_key = widget_key;

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);

    if (error) {
      console.error("❌ Widget update error:", error);
      return res.status(500).json({ error: "Failed to update widget settings" });
    }

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: userId,
        action: 'widget_updated',
        details: 'Widget settings updated',
        type: 'settings',
        timestamp: new Date().toISOString()
      });

    res.json({ success: true, message: "Widget settings updated" });
  } catch (err) {
    console.error("❌ Widget error:", err);
    res.status(500).json({ error: "Failed to update widget settings" });
  }
});

// ================= REGENERATE WIDGET KEY =================
router.post("/widget/regenerate", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const newKey = uuidv4();

  try {
    const { error } = await supabase
      .from('users')
      .update({ widget_key: newKey })
      .eq('id', userId);

    if (error) {
      console.error("❌ Widget key regeneration error:", error);
      return res.status(500).json({ error: "Failed to regenerate widget key" });
    }

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: userId,
        action: 'widget_key_regenerated',
        details: 'Widget key regenerated',
        type: 'settings',
        timestamp: new Date().toISOString()
      });

    res.json({ success: true, widget_key: newKey });
  } catch (err) {
    console.error("❌ Widget key error:", err);
    res.status(500).json({ error: "Failed to regenerate widget key" });
  }
});

module.exports = router;