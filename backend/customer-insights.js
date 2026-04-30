// ================================================
// customer-insights.js - Backend Middleman
// All Customer Insights logic lives here
// UPDATED: Added Service Completion Notifications endpoints
// ================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

// Correct import
const { authenticateToken } = require("./auth-middleware");
const { supabase } = require("./database-supabase");

// ==================== LEADS ====================
router.get("/leads", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  console.log(`[CUSTOMER-INSIGHTS] GET /leads for user ${userId}`);

  try {
    const { data: rows, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[CUSTOMER-INSIGHTS] Database error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[CUSTOMER-INSIGHTS] Returning ${rows?.length || 0} leads`);
    res.json(rows || []);
  } catch (err) {
    console.error('[CUSTOMER-INSIGHTS] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CHATS ====================
router.get("/chats", authenticateToken, async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "Email parameter is required" });

  const userId = req.user.id;

  console.log(`[CUSTOMER-INSIGHTS] GET /chats for user ${userId} - email: ${email}`);

  try {
    const { data: rows, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .eq('client_name', email)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('[CUSTOMER-INSIGHTS] Database error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[CUSTOMER-INSIGHTS] Returning ${rows?.length || 0} chats for ${email}`);
    res.json(rows || []);
  } catch (err) {
    console.error('[CUSTOMER-INSIGHTS] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== AI CHAT (Cloudflare) ====================
router.post("/ai-chat", authenticateToken, bodyParser.json(), async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  const userId = req.user.id;

  console.log(`[CUSTOMER-INSIGHTS] POST /ai-chat for user ${userId} - query: ${query.substring(0, 100)}...`);

  try {
    // Get user info from Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('business_name')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('[CUSTOMER-INSIGHTS] User fetch error:', userError);
      return res.status(401).json({ error: "User not found" });
    }

    const businessName = user.business_name || "Your Business";

    // Get recent chats from Supabase
    const { data: recentChats, error: chatsError } = await supabase
      .from('chats')
      .select('message, response')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (chatsError) {
      console.error('[CUSTOMER-INSIGHTS] Chats fetch error:', chatsError);
    }

    const context = (recentChats || []).map(c => `User: ${c.message}\nAI: ${c.response}`).join('\n\n');

    const prompt = `
You are an expert customer success analyst for ${businessName}.
Recent chat context:
${context || 'No recent chats available.'}

User query: ${query}

Provide a concise, professional, actionable response:
- Summarize detected customer problems
- Suggest specific fixes or next steps
- Assess churn risk if relevant
- Be helpful, empathetic, and business-oriented
    `;

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.CLOUDFLARE_AI_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }]
        })
      }
    );

    if (!cfRes.ok) {
      const errData = await cfRes.json();
      console.error("[CUSTOMER-INSIGHTS] Cloudflare AI error:", errData);
      return res.status(500).json({ error: "AI service error" });
    }

    const data = await cfRes.json();

    if (!data.result?.response) {
      return res.status(500).json({ error: "No response from AI" });
    }

    const reply = data.result.response.trim();
    console.log(`[CUSTOMER-INSIGHTS] AI reply sent (length: ${reply.length})`);
    res.json({ reply });
  } catch (err) {
    console.error("[CUSTOMER-INSIGHTS] AI chat error:", err.message);
    res.status(500).json({ error: "Failed to process AI request" });
  }
});

// ==================== CONTEXT FOR WIDGET & PAGE ====================
router.get("/context", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  console.log(`[CUSTOMER-INSIGHTS] GET /context for user ${userId}`);

  try {
    // Get user info from Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('business_name, plan')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('[CUSTOMER-INSIGHTS] User fetch error:', userError);
      return res.status(404).json({ error: "User not found" });
    }

    // Get recent negative sentiment chats from Supabase
    const { data: recentProblems, error: problemsError } = await supabase
      .from('chats')
      .select('client_name, message, created_at')
      .eq('user_id', userId)
      .eq('sentiment', 'negative')
      .order('created_at', { ascending: false })
      .limit(5);

    if (problemsError) {
      console.error('[CUSTOMER-INSIGHTS] Problems fetch error:', problemsError);
    }

    const problemList = (recentProblems || []).map(p => ({
      customer: p.client_name || "Visitor",
      issue: p.message?.substring(0, 80) + (p.message?.length > 80 ? "..." : ""),
      time: new Date(p.created_at).toLocaleString()
    }));

    res.json({
      business_name: user.business_name || "Your Business",
      plan: user.plan || "free",
      recent_problems: problemList,
      total_problems: problemList.length
    });

    console.log(`[CUSTOMER-INSIGHTS] Context sent - plan: ${user.plan || "free"}`);
  } catch (err) {
    console.error("[CUSTOMER-INSIGHTS] Context fetch error:", err.message);
    res.status(500).json({ error: "Failed to load context" });
  }
});

// ==================== SERVICES MANAGEMENT (NEW) ====================

// GET all services for a user
router.get("/services", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  console.log(`[SERVICES] GET /services for user ${userId}`);

  try {
    const { data: services, error } = await supabase
      .from('customer_services')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[SERVICES] Database error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[SERVICES] Returning ${services?.length || 0} services`);
    res.json(services || []);
  } catch (err) {
    console.error('[SERVICES] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// CREATE a new service
router.post("/services", authenticateToken, bodyParser.json(), async (req, res) => {
  const userId = req.user.id;
  const { id, customer_email, customer_name, service_type, description, status, created_at, completed_at } = req.body;

  console.log(`[SERVICES] POST /services for user ${userId} - service: ${service_type}`);

  if (!customer_email || !service_type) {
    return res.status(400).json({ error: "customer_email and service_type are required" });
  }

  try {
    const newService = {
      id: id || require('crypto').randomBytes(16).toString('hex'),
      user_id: userId,
      customer_email: customer_email,
      customer_name: customer_name || customer_email.split('@')[0],
      service_type: service_type,
      description: description || '',
      status: status || 'pending',
      created_at: created_at || new Date().toISOString(),
      completed_at: completed_at || null
    };

    const { data, error } = await supabase
      .from('customer_services')
      .insert(newService)
      .select()
      .single();

    if (error) {
      console.error('[SERVICES] Insert error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[SERVICES] Created service with ID: ${data.id}`);
    res.json(data);
  } catch (err) {
    console.error('[SERVICES] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// COMPLETE a service and send notifications
router.put("/services/:serviceId/complete", authenticateToken, bodyParser.json(), async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;

  console.log(`[SERVICES] PUT /services/${serviceId}/complete for user ${userId}`);

  try {
    // First, get the service to know customer details
    const { data: service, error: fetchError } = await supabase
      .from('customer_services')
      .select('*')
      .eq('id', serviceId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !service) {
      console.error('[SERVICES] Service not found:', fetchError);
      return res.status(404).json({ error: 'Service not found' });
    }

    if (service.status === 'completed') {
      return res.status(400).json({ error: 'Service already completed' });
    }

    // Update service status
    const { data: updatedService, error: updateError } = await supabase
      .from('customer_services')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', serviceId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('[SERVICES] Update error:', updateError);
      return res.status(500).json({ error: 'Database error' });
    }

    // Create notification for the customer (stored in notifications table for widget)
    const notification = {
      id: require('crypto').randomBytes(16).toString('hex'),
      user_id: userId,
      customer_email: service.customer_email,
      customer_name: service.customer_name,
      title: 'Service Completed',
      message: `Your service "${service.service_type}" has been completed! Thank you for your business.`,
      type: 'service_completed',
      service_id: serviceId,
      read: false,
      created_at: new Date().toISOString()
    };

    await supabase
      .from('customer_notifications')
      .insert(notification)
      .catch(err => console.error('[SERVICES] Notification insert error:', err));

    // Also create notification for the business owner (in-app notification)
    const ownerNotification = {
      id: require('crypto').randomBytes(16).toString('hex'),
      user_id: userId,
      customer_email: service.customer_email,
      customer_name: service.customer_name,
      title: 'Service Completed',
      message: `Service "${service.service_type}" for ${service.customer_name} has been marked as completed.`,
      type: 'service_completed_owner',
      service_id: serviceId,
      read: false,
      created_at: new Date().toISOString()
    };

    await supabase
      .from('user_notifications')
      .insert(ownerNotification)
      .catch(err => console.error('[SERVICES] Owner notification insert error:', err));

    console.log(`[SERVICES] Service ${serviceId} completed and notifications sent`);
    res.json(updatedService);

  } catch (err) {
    console.error('[SERVICES] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE a service
router.delete("/services/:serviceId", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;

  console.log(`[SERVICES] DELETE /services/${serviceId} for user ${userId}`);

  try {
    const { error } = await supabase
      .from('customer_services')
      .delete()
      .eq('id', serviceId)
      .eq('user_id', userId);

    if (error) {
      console.error('[SERVICES] Delete error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[SERVICES] Service ${serviceId} deleted`);
    res.json({ success: true });
  } catch (err) {
    console.error('[SERVICES] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== NOTIFICATIONS (for widget and owner) ====================

// GET notifications for the current user (owner)
router.get("/notifications", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  console.log(`[NOTIFICATIONS] GET /notifications for user ${userId}`);

  try {
    const { data: notifications, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[NOTIFICATIONS] Database error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(notifications || []);
  } catch (err) {
    console.error('[NOTIFICATIONS] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MARK notification as read
router.put("/notifications/:notificationId/read", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { notificationId } = req.params;

  console.log(`[NOTIFICATIONS] PUT /notifications/${notificationId}/read for user ${userId}`);

  try {
    const { error } = await supabase
      .from('user_notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      console.error('[NOTIFICATIONS] Update error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[NOTIFICATIONS] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MARK all notifications as read
router.put("/notifications/read-all", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  console.log(`[NOTIFICATIONS] PUT /notifications/read-all for user ${userId}`);

  try {
    const { error } = await supabase
      .from('user_notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.error('[NOTIFICATIONS] Update error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[NOTIFICATIONS] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== WIDGET NOTIFICATION ENDPOINT ====================
// This endpoint is called by the widget to check for notifications for a specific customer
router.get("/widget/notifications", async (req, res) => {
  const { customer_email, widget_key } = req.query;

  if (!customer_email && !widget_key) {
    return res.status(400).json({ error: "customer_email or widget_key required" });
  }

  try {
    let userId = null;

    if (widget_key) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('widget_key', widget_key)
        .single();

      if (!userError && user) {
        userId = user.id;
      }
    }

    if (!userId && customer_email) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('user_id')
        .eq('email', customer_email)
        .single();

      if (!leadError && lead) {
        userId = lead.user_id;
      }
    }

    if (!userId) {
      return res.json([]);
    }

    const { data: notifications, error } = await supabase
      .from('customer_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('customer_email', customer_email)
      .eq('read', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[WIDGET-NOTIFICATIONS] Error:', error);
      return res.json([]);
    }

    res.json(notifications || []);
  } catch (err) {
    console.error('[WIDGET-NOTIFICATIONS] Error:', err);
    res.json([]);
  }
});

// MARK widget notification as read
router.put("/widget/notifications/:notificationId/read", async (req, res) => {
  const { notificationId } = req.params;

  try {
    const { error } = await supabase
      .from('customer_notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('[WIDGET-NOTIFICATIONS] Update error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[WIDGET-NOTIFICATIONS] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SEND NOTIFICATION TO WIDGET (used by completeService) ====================
router.post("/send-widget-notification", authenticateToken, bodyParser.json(), async (req, res) => {
  const userId = req.user.id;
  const { customer_email, customer_name, message, type, service_id } = req.body;

  if (!customer_email || !message) {
    return res.status(400).json({ error: "customer_email and message required" });
  }

  console.log(`[WIDGET-NOTIFICATION] Sending to ${customer_email}: ${message.substring(0, 50)}...`);

  try {
    const notification = {
      id: require('crypto').randomBytes(16).toString('hex'),
      user_id: userId,
      customer_email: customer_email,
      customer_name: customer_name || customer_email.split('@')[0],
      title: type === 'service_completed' ? 'Service Completed' : 'Notification',
      message: message,
      type: type || 'general',
      service_id: service_id || null,
      read: false,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('customer_notifications')
      .insert(notification);

    if (error) {
      console.error('[WIDGET-NOTIFICATION] Insert error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[WIDGET-NOTIFICATION] Notification stored for ${customer_email}`);
    res.json({ success: true, notification_id: notification.id });
  } catch (err) {
    console.error('[WIDGET-NOTIFICATION] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== TEST WIDGET NOTIFICATION (for debugging) ====================
router.post("/test-widget-notification", authenticateToken, bodyParser.json(), async (req, res) => {
  const userId = req.user.id;
  const { customer_email, customer_name } = req.body;

  if (!customer_email) {
    return res.status(400).json({ error: "customer_email required" });
  }

  try {
    const notification = {
      id: require('crypto').randomBytes(16).toString('hex'),
      user_id: userId,
      customer_email: customer_email,
      customer_name: customer_name || customer_email.split('@')[0],
      title: 'Test Notification',
      message: 'This is a test notification from your admin panel. Service notifications will appear here when services are completed.',
      type: 'test',
      read: false,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('customer_notifications')
      .insert(notification);

    if (error) {
      console.error('[TEST-NOTIFICATION] Insert error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ success: true, message: `Test notification sent to ${customer_email}` });
  } catch (err) {
    console.error('[TEST-NOTIFICATION] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;