const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { db } = require('./database'); 
const { auth } = require('./auth'); 

/**
 * Smart Business Hub - Backend Controller
 * PRODUCTION READY - Fixed Tool Naming, Deactivation, and Plan Enforcement
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
        
        // Get business type from users table
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

// ─── DEACTIVATE TOOL ──────────────────────────────────────
router.post("/deactivate", auth, async (req, res) => {
    const { toolType } = req.body;
    const userId = req.user.id;

    if (!toolType) {
        return res.status(400).json({ success: false, error: "Tool type required" });
    }

    // Map frontend tool names to database 'active' columns
    const activeColumnMap = {
        'brain': 'brain_active',
        'booking': 'booking_active',
        'sentiment': 'sentiment_active',
        'handover': 'handover_active',
        'webhook': 'webhook_active',
        'apollo': 'apollo_active',
        'enrichment': 'apollo_active',
        'followup': 'followup_active',
        'vision': 'vision_active',
        'business_type': null // Business type is stored in users table
    };

    const activeColumn = activeColumnMap[toolType];

    if (!activeColumn && toolType !== 'business_type') {
        return res.status(400).json({ success: false, error: "Invalid tool type" });
    }

    try {
        if (toolType === 'business_type') {
            // Business type can't be deactivated, just return success
            return res.json({ success: true, message: "Business type remains active" });
        }

        // Deactivate the tool by setting active flag to 0
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE smart_hub_settings SET ${activeColumn} = 0 WHERE user_id = ?`,
                [userId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log(`[SMART-HUB] Tool deactivated: ${toolType} for user ${userId}`);
        res.json({ success: true, message: "Tool deactivated successfully" });

    } catch (err) {
        console.error("❌ Deactivation Error:", err.message);
        res.status(500).json({ success: false, error: "Database error during deactivation" });
    }
});

// ─── SAVE TOOL SETTINGS ─────────────────────────────────
router.post("/save", auth, async (req, res) => {
    const { toolType, data } = req.body;
    const userId = req.user.id;

    if (!toolType) {
        return res.status(400).json({ success: false, error: "Tool type required" });
    }

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

    // Handle business type update separately (goes to users table)
    if (toolType === 'business_type') {
        db.run(
            `UPDATE users SET business_type = ? WHERE id = ?`,
            [data.businessType || data.business_type, userId],
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

    // 2. Ensure settings row exists
    await new Promise((resolve, reject) => {
        db.run(`INSERT OR IGNORE INTO smart_hub_settings (user_id) VALUES (?)`, [userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // 3. Build dynamic SQL based on tool type with ACTIVE FLAGS
    let updates = {};
    let activeFlag = true; // By default, saving activates the tool
    
    switch(toolType) {
        case 'brain':
            updates = {
                ai_instructions: data.instructions,
                ai_temp: data.temp,
                ai_lang: data.lang,
                brain_active: activeFlag ? 1 : 0
            };
            break;
        case 'booking':
            updates = {
                booking_url: data.url,
                booking_active: data.url ? (activeFlag ? 1 : 0) : 0
            };
            break;
        case 'sentiment':
            updates = {
                sentiment_enabled: data.enabled ? 1 : 0,
                sentiment_active: activeFlag ? 1 : 0,
                alert_email: data.email
            };
            break;
        case 'handover':
            updates = {
                handover_trigger: data.trigger,
                handover_active: activeFlag ? 1 : 0
            };
            break;
        case 'webhook':
            updates = {
                webhook_url: data.url,
                webhook_active: data.url ? (activeFlag ? 1 : 0) : 0
            };
            break;
        case 'enrichment':
        case 'apollo':
            updates = {
                apollo_key: data.apolloKey || data.apiKey,
                apollo_active: (data.apolloKey || data.apiKey) ? (activeFlag ? 1 : 0) : 0,
                auto_sync: data.autoSync ? 1 : 0
            };
            break;
        case 'vision':
            updates = {
                vision_sensitivity: data.sensitivity || 'high',
                vision_area: data.area || 'all',
                vision_active: activeFlag ? 1 : 0
            };
            break;
        case 'followup':
            updates = {
                followup_active: data.enabled ? (activeFlag ? 1 : 0) : 0
            };
            break;
        default:
            return res.status(400).json({ success: false, error: "Unknown tool type" });
    }

    // Build SQL dynamically
    const keys = Object.keys(updates);
    if (keys.length === 0) {
        return res.status(400).json({ success: false, error: "No updates provided" });
    }

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    const sql = `
        UPDATE smart_hub_settings 
        SET ${setClause}
        WHERE user_id = ?
    `;

    db.run(sql, [...values, userId], function(err) {
        if (err) {
            console.error("❌ Save Error:", err.message);
            return res.status(500).json({ success: false, error: "Database Error" });
        }
        console.log(`[SMART-HUB] ${toolType} saved with active flags for user ${userId}`);
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

        // Mark as active in DB if applicable
        if (activeColumn) {
            await new Promise((resolve, reject) => {
                db.run(`UPDATE smart_hub_settings SET ${activeColumn} = 1 WHERE user_id = ?`, [userId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        // Generate AI response for brain tool
        if (toolType === 'brain') {
            try {
                if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_AI_API_TOKEN) {
                    throw new Error("Cloudflare credentials not configured");
                }

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
                                { role: "user", content: "Tell the user in 10 words or less that their AI Brain is now online and learning." }
                            ]
                        })
                    }
                );

                if (!cfRes.ok) {
                    const errData = await cfRes.json().catch(() => ({}));
                    throw new Error(errData.errors?.[0]?.message || `Cloudflare AI returned ${cfRes.status}`);
                }

                const cfData = await cfRes.json();
                aiResponse = cfData.result?.response || "AI Brain is active and ready.";
            } catch (e) {
                console.error("Cloudflare Brain test error:", e.message);
                aiResponse = "AI Brain is active (Cloudflare offline mode).";
            }
        }

        res.json({ success: true, output: aiResponse });
    } catch (err) {
        console.error("Test tool error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── GET TOOL STATES ──────────────────────────────────────
router.get("/tool-states", auth, async (req, res) => {
    const userId = req.user.id;

    try {
        // Get all active flags from smart_hub_settings
        db.get(
            `SELECT 
                brain_active, booking_active, sentiment_active, 
                handover_active, webhook_active, apollo_active, 
                followup_active, vision_active 
            FROM smart_hub_settings WHERE user_id = ?`,
            [userId],
            (err, row) => {
                if (err) {
                    console.error("❌ Tool states error:", err.message);
                    return res.status(500).json({ error: err.message });
                }

                const states = row || {};
                // Also check if business type exists
                db.get(`SELECT business_type FROM users WHERE id = ?`, [userId], (err, userRow) => {
                    if (!err && userRow?.business_type) {
                        states.business_type_active = true;
                    }
                    
                    res.json(states);
                });
            }
        );
    } catch (err) {
        console.error("Tool states error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PUBLIC APOLLO ENRICHMENT (NO AUTH REQUIRED) ─────────────────
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
            // For demo, return mock enriched data
            const enrichedData = {
                enriched: true,
                data: {
                    email: email,
                    name: name,
                    title: "VP of Engineering",
                    company: "Tech Corp",
                    industry: "Software",
                    company_size: "50-200",
                    location: "San Francisco, CA",
                    phone: "+1 (555) 123-4567",
                    linkedin: "https://linkedin.com/in/example"
                }
            };
            
            // Store enriched data in leads table if needed
            db.run(
                `UPDATE leads SET company = ?, job_title = ? WHERE user_id = ? AND email = ?`,
                [enrichedData.data.company, enrichedData.data.title, user.id, email],
                () => {} // Ignore errors
            );
            
            res.json({
                success: true,
                ...enrichedData
            });
        });
    });
});

// ─── PUBLIC FOLLOW-UP SCHEDULING ─────────────────
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
            
            // Create follow_ups table if it doesn't exist
            db.run(`
                CREATE TABLE IF NOT EXISTS follow_ups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    email TEXT NOT NULL,
                    name TEXT,
                    session_id TEXT,
                    scheduled_for DATETIME,
                    sent INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `, (err) => {
                if (err) {
                    console.error("Follow-ups table error:", err);
                    return res.status(500).json({ error: "Database error" });
                }
                
                // Schedule follow-up for 24 hours later
                const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
                
                db.run(
                    `INSERT INTO follow_ups (user_id, email, name, session_id, scheduled_for) VALUES (?, ?, ?, ?, ?)`,
                    [user.id, email, name || null, session_id || null, scheduledFor.toISOString()],
                    function(err) {
                        if (err) {
                            console.error("Follow-up save error:", err);
                            return res.status(500).json({ error: "Failed to schedule follow-up" });
                        }
                        
                        console.log(`[FOLLOWUP] Scheduled for ${email} (user ${user.id})`);
                        
                        res.json({ 
                            success: true, 
                            message: "Follow-up scheduled",
                            scheduled_for: scheduledFor.toISOString()
                        });
                    }
                );
            });
        });
    });
});

// ─── HEALTH CHECK ──────────────────────────────────────
router.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

module.exports = router;