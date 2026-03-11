// ================================================
// customer-insights.js - Backend Middleman
// All Customer Insights logic lives here
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
      plan: user.plan || "free",                  // ← REAL PLAN SENT HERE
      recent_problems: problemList,
      total_problems: problemList.length
    });

    console.log(`[CUSTOMER-INSIGHTS] Context sent - plan: ${user.plan || "free"}`);
  } catch (err) {
    console.error("[CUSTOMER-INSIGHTS] Context fetch error:", err.message);
    res.status(500).json({ error: "Failed to load context" });
  }
});

module.exports = router;