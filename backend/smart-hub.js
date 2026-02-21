const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('./database'); 
const { auth } = require('./auth'); 

/**
 * Smart Business Hub - Backend Controller
 * PRODUCTION READY - Fixed Tool Naming & Plan Enforcement
 */

const ADMIN_EMAIL = "ericchung992@gmail.com".toLowerCase().trim();

// ─── HELPER: RESOLVE USER ACCESS ──────────────────────────
async function resolveUserAccess(userId) {
    return new Promise((resolve) => {
        db.get("SELECT plan, plan_expires, email FROM users WHERE id = ?", [userId], (err, user) => {
            if (err || !user) return resolve({ plan: 'free', isExpired: true });

            const userEmail = (user.email || '').toLowerCase().trim();
            const isAdmin = userEmail === ADMIN_EMAIL;
            
            // Master Bypass for Admin
            if (isAdmin) {
                return resolve({ plan: 'agency', isExpired: false, isAdmin: true });
            }

            let currentPlan = (user.plan || 'free').toLowerCase().trim();
            const now = new Date();
            const expiryDate = user.plan_expires ? new Date(user.plan_expires) : null;
            const isExpired = expiryDate ? (now > expiryDate) : false;

            // If expired, treat as free
            if (isExpired && currentPlan !== 'free') {
                return resolve({ plan: 'free', isExpired: true });
            }

            resolve({ plan: currentPlan, isExpired: false });
        });
    });
}

// ─── GET CURRENT SETTINGS ──────────────────────────────
router.get("/settings", auth, (req, res) => {
    db.get(`SELECT * FROM smart_hub_settings WHERE user_id = ?`, [req.user.id], (err, row) => {
        if (err) {
            console.error("❌ GET Settings Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(row || {});
    });
});

// ─── SAVE TOOL SETTINGS ─────────────────────────────────
router.post("/save", auth, async (req, res) => {
    const { toolType, data } = req.body;
    const userId = req.user.id;

    // 1. Verify Plan Permissions
    const access = await resolveUserAccess(userId);
    
    // SYNCED TOOL LISTS (Matches frontend IDs)
    const proTools = ['sentiment', 'webhook', 'followup', 'card-followup', 'card-webhook'];
    const enterpriseTools = ['apollo', 'enrichment', 'vision', 'card-apollo', 'card-vision', 'card-enrichment'];

    // Permission Check
    const isAgencyOrEnterprise = ['agency', 'enterprise'].includes(access.plan);
    const isProOrHigher = ['pro', 'agency', 'enterprise'].includes(access.plan);

    if (enterpriseTools.includes(toolType) && !isAgencyOrEnterprise) {
        return res.status(403).json({ success: false, error: "Access Denied: Enterprise/Agency Plan Required." });
    }

    if (proTools.includes(toolType) && !isProOrHigher) {
        return res.status(403).json({ success: false, error: "Access Denied: Pro Plan Required." });
    }

    // 2. SQL Save with COALESCE (Keep existing data if null)
    const sql = `
        INSERT INTO smart_hub_settings (
            user_id, ai_instructions, ai_temp, ai_lang, booking_url, 
            sentiment_enabled, alert_email, handover_trigger, webhook_url,
            apollo_key, auto_sync, vision_sensitivity, vision_area
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            ai_instructions = COALESCE(excluded.ai_instructions, ai_instructions),
            ai_temp = COALESCE(excluded.ai_temp, ai_temp),
            ai_lang = COALESCE(excluded.ai_lang, ai_lang),
            booking_url = COALESCE(excluded.booking_url, booking_url),
            sentiment_enabled = COALESCE(excluded.sentiment_enabled, sentiment_enabled),
            alert_email = COALESCE(excluded.alert_email, alert_email),
            handover_trigger = COALESCE(excluded.handover_trigger, handover_trigger),
            webhook_url = COALESCE(excluded.webhook_url, webhook_url),
            apollo_key = COALESCE(excluded.apollo_key, apollo_key),
            auto_sync = COALESCE(excluded.auto_sync, auto_sync),
            vision_sensitivity = COALESCE(excluded.vision_sensitivity, vision_sensitivity),
            vision_area = COALESCE(excluded.vision_area, vision_area);
    `;

    const params = [
        userId, 
        data.instructions || null, 
        data.temp || null, 
        data.lang || null,
        data.url || null, 
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : null, 
        data.email || null,
        data.trigger || null, 
        data.webhook_url || null, 
        data.apolloKey || null, 
        data.autoSync !== undefined ? (data.autoSync ? 1 : 0) : null, 
        data.sensitivity || null, 
        data.area || null
    ];

    db.run(sql, params, function(err) {
        if (err) {
            console.error("❌ Save Error:", err.message);
            return res.status(500).json({ success: false, error: "Database Error" });
        }
        res.json({ success: true, message: "Settings updated." });
    });
});

// ─── RUN/TEST TOOL ──────────────────────────────────────
router.post("/test-tool", auth, async (req, res) => {
    const { toolType } = req.body;
    const userId = req.user.id;
    let aiResponse = "Logic activated. System live.";

    // Map frontend tool names to database 'active' columns
    const columnMap = {
        'brain': 'brain_active', 'booking': 'booking_active',
        'sentiment': 'sentiment_active', 'handover': 'handover_active',
        'webhook': 'webhook_active', 'enrichment': 'apollo_active',
        'apollo': 'apollo_active', 'followup': 'followup_active', 
        'vision': 'vision_active'
    };
    
    const activeColumn = columnMap[toolType];

    try {
        const access = await resolveUserAccess(userId);

        // Enforcement: Free plan can only use Brain and Booking
        if (access.plan === 'free' && !['booking', 'brain'].includes(toolType)) {
            return res.status(403).json({ success: false, error: "Access Denied: Please Upgrade." });
        }

        // Mark as active in DB
        if (activeColumn) {
            await new Promise((resolve) => {
                db.run(`UPDATE smart_hub_settings SET ${activeColumn} = 1 WHERE user_id = ?`, [userId], () => resolve());
            });
        }

        // Cloudflare Workers AI Integration for Brain (replaces Ollama)
        if (toolType === 'brain') {
            try {
                const cfRes = await fetch(
                    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
                    {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${process.env.CLOUDFLARE_AI_API_TOKEN}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            messages: [
                                { role: "user", content: "Tell the user in 5 words that their AI Brain is now online and learning." }
                            ]
                        })
                    }
                );

                if (!cfRes.ok) {
                    const errData = await cfRes.json();
                    throw new Error(errData.errors?.[0]?.message || "Cloudflare AI failed");
                }

                const cfData = await cfRes.json();
                aiResponse = cfData.result?.response || "AI Brain is active.";
            } catch (e) {
                console.error("Cloudflare Brain test error:", e.message);
                aiResponse = "AI Brain is active (Cloudflare offline).";
            }
        }

        res.json({ success: true, output: aiResponse });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;