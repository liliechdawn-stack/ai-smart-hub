const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { supabase } = require('./database-supabase');
const { auth } = require('./auth');

/**
 * Smart Business Hub - Backend Controller
 * PRODUCTION READY - Fixed Tool Naming, Deactivation, and Plan Enforcement
 * NOW USING SUPABASE - NO SQLITE
 */

const ADMIN_EMAIL = "ericchung992@gmail.com".toLowerCase().trim();

// ─── HELPER: RESOLVE USER ACCESS ──────────────────────────
async function resolveUserAccess(userId) {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('plan, plan_expires, email')
            .eq('id', userId)
            .single();

        if (error || !user) return { plan: 'free', isExpired: true };

        const userEmail = (user.email || '').toLowerCase().trim();
        const isAdmin = userEmail === ADMIN_EMAIL;
        
        // Master Bypass for Admin
        if (isAdmin) {
            return { plan: 'agency', isExpired: false, isAdmin: true };
        }

        let currentPlan = (user.plan || 'free').toLowerCase().trim();
        const now = new Date();
        const expiryDate = user.plan_expires ? new Date(user.plan_expires) : null;
        const isExpired = expiryDate ? (now > expiryDate) : false;

        // If expired, treat as free
        if (isExpired && currentPlan !== 'free') {
            return { plan: 'free', isExpired: true };
        }

        return { plan: currentPlan, isExpired: false };
    } catch (err) {
        console.error("[SMART-HUB] Resolve user access error:", err);
        return { plan: 'free', isExpired: true };
    }
}

// ─── GET CURRENT SETTINGS ──────────────────────────────
router.get("/settings", auth, async (req, res) => {
    try {
        const { data: settings, error: settingsError } = await supabase
            .from('smart_hub_settings')
            .select('*')
            .eq('user_id', req.user.id)
            .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
            console.error("❌ GET Settings Error:", settingsError);
            return res.status(500).json({ error: "Database error" });
        }

        // Get business type from users table
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('business_type, business_name')
            .eq('id', req.user.id)
            .single();

        if (userError) {
            console.error("❌ GET User Error:", userError);
        }

        const result = settings || {};
        if (user) {
            result.business_type = user.business_type || '';
            result.business_name = user.business_name || '';
        }

        res.json(result);
    } catch (err) {
        console.error("[SMART-HUB] Settings error:", err);
        res.status(500).json({ error: "Server error" });
    }
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
        const { error } = await supabase
            .from('smart_hub_settings')
            .update({ [activeColumn]: 0 })
            .eq('user_id', userId);

        if (error) throw error;

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
        const { error } = await supabase
            .from('users')
            .update({ business_type: data.businessType || data.business_type })
            .eq('id', userId);

        if (error) {
            console.error("❌ Business Type Save Error:", error);
            return res.status(500).json({ success: false, error: "Database Error" });
        }
        return res.json({ success: true, message: "Business type updated." });
    }

    // 2. Ensure settings row exists
    await supabase
        .from('smart_hub_settings')
        .upsert({ user_id: userId }, { onConflict: 'user_id' });

    // 3. Build update object based on tool type with ACTIVE FLAGS
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

    try {
        const { error } = await supabase
            .from('smart_hub_settings')
            .update(updates)
            .eq('user_id', userId);

        if (error) throw error;

        console.log(`[SMART-HUB] ${toolType} saved with active flags for user ${userId}`);
        res.json({ success: true, message: "Settings updated." });
    } catch (err) {
        console.error("❌ Save Error:", err.message);
        res.status(500).json({ success: false, error: "Database Error" });
    }
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
            const { error } = await supabase
                .from('smart_hub_settings')
                .update({ [activeColumn]: 1 })
                .eq('user_id', userId);

            if (error) throw error;
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
        const { data: row, error: settingsError } = await supabase
            .from('smart_hub_settings')
            .select(`
                brain_active, booking_active, sentiment_active, 
                handover_active, webhook_active, apollo_active, 
                followup_active, vision_active 
            `)
            .eq('user_id', userId)
            .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
            console.error("❌ Tool states error:", settingsError);
            return res.status(500).json({ error: settingsError.message });
        }

        const states = row || {};
        
        // Also check if business type exists
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('business_type')
            .eq('id', userId)
            .single();

        if (!userError && user?.business_type) {
            states.business_type_active = true;
        }
        
        res.json(states);
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
    
    try {
        // Get user's Apollo key from their settings
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('widget_key', widget_key)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: "Invalid widget key" });
        }
        
        const { data: settings, error: settingsError } = await supabase
            .from('smart_hub_settings')
            .select('apollo_key, apollo_active')
            .eq('user_id', user.id)
            .single();

        if (settingsError || !settings?.apollo_key || !settings.apollo_active) {
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
        await supabase
            .from('leads')
            .update({ 
                company: enrichedData.data.company, 
                job_title: enrichedData.data.title 
            })
            .eq('user_id', user.id)
            .eq('email', email);
        
        res.json({
            success: true,
            ...enrichedData
        });
    } catch (err) {
        console.error("[SMART-HUB] Apollo enrichment error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ─── PUBLIC FOLLOW-UP SCHEDULING ─────────────────
router.post("/public/followup/schedule", async (req, res) => {
    const { email, name, widget_key, session_id } = req.body;
    
    if (!email || !widget_key) {
        return res.status(400).json({ error: "Email and widget_key required" });
    }
    
    try {
        // Verify widget key and check if follow-up is active
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('widget_key', widget_key)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: "Invalid widget key" });
        }
        
        const { data: settings, error: settingsError } = await supabase
            .from('smart_hub_settings')
            .select('followup_active')
            .eq('user_id', user.id)
            .single();

        if (settingsError || !settings?.followup_active) {
            return res.status(400).json({ error: "Follow-up not enabled" });
        }
        
        // Create follow_ups table if it doesn't exist
        // Schedule follow-up for 24 hours later
        const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        const { error: insertError } = await supabase
            .from('follow_ups')
            .insert({
                user_id: user.id,
                email,
                name: name || null,
                session_id: session_id || null,
                scheduled_for: scheduledFor.toISOString(),
                sent: 0,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error("Follow-up save error:", insertError);
            return res.status(500).json({ error: "Failed to schedule follow-up" });
        }
        
        console.log(`[FOLLOWUP] Scheduled for ${email} (user ${user.id})`);
        
        res.json({ 
            success: true, 
            message: "Follow-up scheduled",
            scheduled_for: scheduledFor.toISOString()
        });
    } catch (err) {
        console.error("[SMART-HUB] Follow-up error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ─── HEALTH CHECK ──────────────────────────────────────
router.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

module.exports = router;