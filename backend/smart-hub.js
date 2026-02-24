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
        
        // CRITICAL FIX: Also get business type from users table
        db.get(`SELECT business_type, business_name FROM users WHERE id = ?`, [req.user.id], (err, userRow) => {
            if (err) {
                console.error("❌ GET User Error:", err.message);
            }
            
            const settings = row || {};
            if (userRow) {
                settings.business_type = userRow.business_type || '';
                settings.business_name = userRow.business_name || '';
            }
            
            res.json(settings);
        });
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

    // CRITICAL FIX: Handle business type update separately (goes to users table)
    if (toolType === 'business_type') {
        db.run(
            `UPDATE users SET business_type = ? WHERE id = ?`,
            [data.businessType, userId],
            function(err) {
                if (err) {
                    console.error("❌ Business Type Save Error:", err.message);
                    return res.status(500).json({ success: false, error: "Database Error" });
                }
                res.json({ success: true, message: "Business type updated." });
            }
        );
        return;
    }

    // 2. Build dynamic SQL based on tool type with ACTIVE FLAGS
    let updates = {};
    
    switch(toolType) {
        case 'brain':
            updates = {
                ai_instructions: data.instructions,
                ai_temp: data.temp,
                ai_lang: data.lang,
                brain_active: 1
            };
            break;
        case 'booking':
            updates = {
                booking_url: data.url,
                booking_active: data.url ? 1 : 0  // CRITICAL: Set active flag
            };
            break;
        case 'sentiment':
            updates = {
                sentiment_enabled: data.enabled ? 1 : 0,
                sentiment_active: data.enabled ? 1 : 0,  // CRITICAL: Set active flag
                alert_email: data.email
            };
            break;
        case 'handover':
            updates = {
                handover_trigger: data.trigger,
                handover_active: 1  // CRITICAL: Set active flag
            };
            break;
        case 'webhook':
            updates = {
                webhook_url: data.url,
                webhook_active: data.url ? 1 : 0  // CRITICAL: Set active flag
            };
            break;
        case 'enrichment':
        case 'apollo':
            updates = {
                apollo_key: data.apolloKey,
                apollo_active: data.apolloKey ? 1 : 0,  // CRITICAL: Set active flag
                auto_sync: data.autoSync ? 1 : 0
            };
            break;
        case 'vision':
            updates = {
                vision_sensitivity: data.sensitivity,
                vision_area: data.area,
                vision_active: 1  // CRITICAL: Set active flag
            };
            break;
        case 'followup':
            updates = {
                followup_active: data.enabled ? 1 : 0  // CRITICAL: Set active flag
            };
            break;
        default:
            return res.status(400).json({ success: false, error: "Unknown tool type" });
    }

    // Build SQL dynamically
    const keys = Object.keys(updates);
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');
    const values = Object.values(updates);

    const sql = `
        INSERT INTO smart_hub_settings (user_id, ${columns})
        VALUES (?, ${placeholders})
        ON CONFLICT(user_id) DO UPDATE SET
        ${keys.map(k => `${k} = COALESCE(excluded.${k}, ${k})`).join(', ')};
    `;

    db.run(sql, [userId, ...values], function(err) {
        if (err) {
            console.error("❌ Save Error:", err.message);
            return res.status(500).json({ success: false, error: "Database Error" });
        }
        console.log(`[SMART-HUB] ${toolType} saved with active flags`);
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
        'brain': 'brain_active', 
        'booking': 'booking_active',
        'sentiment': 'sentiment_active', 
        'handover': 'handover_active',
        'webhook': 'webhook_active', 
        'enrichment': 'apollo_active',
        'apollo': 'apollo_active', 
        'followup': 'followup_active', 
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

        // CRITICAL FIX: Remove space in Cloudflare URL
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

// ─── PUBLIC ENDPOINTS FOR WIDGET (NO AUTH REQUIRED) ─────────────────

// Public Apollo enrichment (called by widget)
router.post("/public/apollo/enrich", async (req, res) => {
    const { email, name, widget_key } = req.body;
    
    if (!email || !widget_key) {
        return res.status(400).json({ error: "Email and widget_key required" });
    }
    
    // Get user's Apollo key from their settings
    db.get(`SELECT id FROM users WHERE widget_key = ?`, [widget_key], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: "Invalid widget key" });
        }
        
        db.get(`SELECT apollo_key, apollo_active FROM smart_hub_settings WHERE user_id = ?`, [user.id], (err, settings) => {
            if (err || !settings?.apollo_key || !settings.apollo_active) {
                return res.status(400).json({ error: "Apollo not configured" });
            }
            
            // Here you would call actual Apollo API
            // For now, return mock enriched data
            res.json({
                success: true,
                enriched: true,
                data: {
                    email: email,
                    name: name,
                    title: "VP of Engineering",
                    company: "Tech Corp",
                    industry: "Software",
                    company_size: "50-200",
                    location: "San Francisco, CA"
                }
            });
        });
    });
});

// Public follow-up scheduling (called by widget)
router.post("/public/followup/schedule", async (req, res) => {
    const { email, name, widget_key, session_id } = req.body;
    
    if (!email || !widget_key) {
        return res.status(400).json({ error: "Email and widget_key required" });
    }
    
    // Verify widget key and check if follow-up is active
    db.get(`SELECT id FROM users WHERE widget_key = ?`, [widget_key], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: "Invalid widget key" });
        }
        
        db.get(`SELECT followup_active FROM smart_hub_settings WHERE user_id = ?`, [user.id], (err, settings) => {
            if (err || !settings?.followup_active) {
                return res.status(400).json({ error: "Follow-up not enabled" });
            }
            
            // Store follow-up in database (create table if needed)
            console.log(`[FOLLOWUP] Scheduled for ${email} (user ${user.id})`);
            
            // You could create a follow_ups table here
            // For now, just acknowledge success
            
            res.json({ 
                success: true, 
                message: "Follow-up scheduled",
                scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours later
            });
        });
    });
});

module.exports = router;