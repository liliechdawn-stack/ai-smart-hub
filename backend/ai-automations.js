// backend/ai-automations.js
// ================================================
// AI AUTOMATIONS - ENTERPRISE AUTOMATION ENGINE
// Features: Sora-level Video Generation, TikTok, Instagram, Facebook, Email, Slack
// GitHub Webhooks, Database Queries, CRM Updates, Inventory Checks, Cart Recovery
// Lead Scoring with Cloudflare AI, Video Script Generation
// ================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const { authenticateToken } = require("./auth-middleware");
const { supabase } = require("./database-supabase");
const ai = require("./ai");

// ================================================
// SORA-LEVEL VIDEO GENERATION (Cloudflare AI + External APIs)
// ================================================

/**
 * Generate Sora-level video using Cloudflare AI + optional external APIs
 * Supports: Runway Gen-3, Pika 2.0, Kling, Luma Dream Machine, Cloudflare AI
 */
async function generateSoraVideo(prompt, duration = 10, style = "cinematic", resolution = "1080p", aspectRatio = "16:9") {
    console.log(`🎬 [SORA-VIDEO] Generating ${duration}s video: ${prompt.substring(0, 50)}...`);
    
    const stylePrompts = {
        'cinematic': 'cinematic video, movie quality, dramatic lighting, professional camera work, smooth motion, 4K',
        'animation': '2D animation, smooth movement, vibrant colors, professional animation, fluid motion, 60fps',
        'realistic': 'ultra realistic video, 4K quality, natural lighting, smooth 60fps, detailed textures, HDR',
        'artistic': 'artistic video, creative visuals, beautiful composition, abstract elements, artistic style',
        'sci-fi': 'science fiction, futuristic, holographic effects, neon lights, advanced technology, epic scale',
        'fantasy': 'fantasy video, magical effects, mythical creatures, enchanted landscapes, dreamlike',
        'action': 'action video, dynamic camera, fast-paced, exciting, high energy, epic scale',
        'slow-motion': 'slow motion video, dramatic, detailed, smooth, high frame rate, cinematic'
    };
    
    const enhancedPrompt = `${stylePrompts[style] || stylePrompts['cinematic']}. ${prompt}. High quality, smooth motion, detailed.`;
    
    let videoUrl = null;
    let videoScript = null;
    
    // Try Runway Gen-3 first (best quality - Sora level)
    if (process.env.RUNWAY_API_KEY) {
        try {
            const runwayResponse = await fetch('https://api.runwayml.com/v1/generate', {
                method: 'POST',
                headers: {
                    'X-API-Key': process.env.RUNWAY_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: enhancedPrompt,
                    duration: duration,
                    aspect_ratio: aspectRatio,
                    resolution: resolution,
                    cfg_scale: 7.0,
                    seed: Math.floor(Math.random() * 1000000)
                })
            });
            
            if (runwayResponse.ok) {
                const result = await runwayResponse.json();
                if (result.id) {
                    // Poll for completion
                    for (let i = 0; i < 60; i++) {
                        await new Promise(r => setTimeout(r, 2000));
                        const statusRes = await fetch(`https://api.runwayml.com/v1/generations/${result.id}`, {
                            headers: { 'X-API-Key': process.env.RUNWAY_API_KEY }
                        });
                        const status = await statusRes.json();
                        if (status.status === 'succeeded') {
                            videoUrl = status.output_url;
                            break;
                        } else if (status.status === 'failed') {
                            break;
                        }
                    }
                }
            }
        } catch (e) { console.log('Runway API error:', e.message); }
    }
    
    // Try Pika Labs 2.0
    if (!videoUrl && process.env.PIKA_API_KEY) {
        try {
            const pikaResponse = await fetch('https://api.pika.art/v1/generate', {
                method: 'POST',
                headers: {
                    'X-API-Key': process.env.PIKA_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: enhancedPrompt,
                    duration: duration,
                    aspect_ratio: aspectRatio,
                    motion: 5,
                    negative_prompt: 'blurry, low quality, distorted'
                })
            });
            
            if (pikaResponse.ok) {
                const result = await pikaResponse.json();
                if (result.task_id) {
                    for (let i = 0; i < 60; i++) {
                        await new Promise(r => setTimeout(r, 2000));
                        const statusRes = await fetch(`https://api.pika.art/v1/generations/${result.task_id}`, {
                            headers: { 'X-API-Key': process.env.PIKA_API_KEY }
                        });
                        const status = await statusRes.json();
                        if (status.status === 'completed') {
                            videoUrl = status.video_url;
                            break;
                        }
                    }
                }
            }
        } catch (e) { console.log('Pika API error:', e.message); }
    }
    
    // Try Kling AI
    if (!videoUrl && process.env.KLING_API_KEY) {
        try {
            const klingResponse = await fetch('https://api.klingai.com/v1/videos/generations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.KLING_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model_name: 'kling-v1',
                    prompt: enhancedPrompt,
                    duration: duration,
                    aspect_ratio: aspectRatio,
                    mode: 'pro',
                    cfg_scale: 0.5
                })
            });
            
            if (klingResponse.ok) {
                const result = await klingResponse.json();
                if (result.data?.task_id) {
                    for (let i = 0; i < 90; i++) {
                        await new Promise(r => setTimeout(r, 2000));
                        const statusRes = await fetch(`https://api.klingai.com/v1/videos/generations/${result.data.task_id}`, {
                            headers: { 'Authorization': `Bearer ${process.env.KLING_API_KEY}` }
                        });
                        const status = await statusRes.json();
                        if (status.data?.task_status === 'succeeded') {
                            videoUrl = status.data.task_result?.videos[0]?.url;
                            break;
                        }
                    }
                }
            }
        } catch (e) { console.log('Kling API error:', e.message); }
    }
    
    // Try Luma Dream Machine
    if (!videoUrl && process.env.LUMA_API_KEY) {
        try {
            const lumaResponse = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.LUMA_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: enhancedPrompt,
                    duration: duration,
                    aspect_ratio: aspectRatio,
                    resolution: resolution
                })
            });
            
            if (lumaResponse.ok) {
                const result = await lumaResponse.json();
                if (result.id) {
                    for (let i = 0; i < 60; i++) {
                        await new Promise(r => setTimeout(r, 2000));
                        const statusRes = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${result.id}`, {
                            headers: { 'Authorization': `Bearer ${process.env.LUMA_API_KEY}` }
                        });
                        const status = await statusRes.json();
                        if (status.status === 'completed') {
                            videoUrl = status.video_url;
                            break;
                        }
                    }
                }
            }
        } catch (e) { console.log('Luma API error:', e.message); }
    }
    
    // Generate video script using Cloudflare AI as fallback
    if (!videoUrl) {
        const scriptResult = await ai.generateVideoScript(prompt, duration, style);
        videoScript = scriptResult.script || generateFallbackVideoScript(prompt, duration, style);
    }
    
    return {
        success: videoUrl ? true : false,
        video_url: videoUrl,
        video_script: videoScript,
        prompt: enhancedPrompt,
        duration: duration,
        style: style,
        resolution: resolution,
        aspect_ratio: aspectRatio,
        generated_at: new Date().toISOString()
    };
}

// ================================================
// REAL TIKTOK POSTING
// ================================================

async function postToTikTok(videoUrl, caption, hashtags, thumbnailUrl, scheduleTime = null) {
    console.log(`📱 [TIKTOK] Posting video: ${caption.substring(0, 50)}...`);
    
    const fullCaption = `${caption}\n\n${hashtags?.join(' ') || ''}`;
    
    if (!process.env.TIKTOK_ACCESS_TOKEN) {
        throw new Error('TikTok access token not configured');
    }
    
    // Step 1: Initialize upload
    const initResponse = await fetch('https://open-api.tiktok.com/share/video/upload/init/', {
        method: 'POST',
        headers: {
            'access-token': process.env.TIKTOK_ACCESS_TOKEN,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            access_token: process.env.TIKTOK_ACCESS_TOKEN
        })
    });
    
    const initData = await initResponse.json();
    
    if (!initData.data || !initData.data.upload_url) {
        throw new Error('Failed to initialize TikTok upload');
    }
    
    // Step 2: Upload video
    const videoResponse = await fetch(videoUrl);
    const videoBuffer = await videoResponse.buffer();
    
    const uploadResponse = await fetch(initData.data.upload_url, {
        method: 'PUT',
        body: videoBuffer,
        headers: { 'Content-Type': 'video/mp4' }
    });
    
    if (!uploadResponse.ok) {
        throw new Error('Failed to upload video to TikTok');
    }
    
    // Step 3: Publish video
    const publishResponse = await fetch('https://open-api.tiktok.com/share/video/upload/finish/', {
        method: 'POST',
        headers: {
            'access-token': process.env.TIKTOK_ACCESS_TOKEN,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            access_token: process.env.TIKTOK_ACCESS_TOKEN,
            video_id: initData.data.video_id,
            text: fullCaption,
            cover_url: thumbnailUrl,
            schedule_time: scheduleTime
        })
    });
    
    const publishData = await publishResponse.json();
    
    return {
        success: true,
        post_id: publishData.data?.share_id || initData.data.video_id,
        video_id: initData.data.video_id,
        url: `https://www.tiktok.com/@user/video/${publishData.data?.share_id}`,
        posted_at: scheduleTime ? null : new Date().toISOString(),
        scheduled_for: scheduleTime
    };
}

// ================================================
// REAL INSTAGRAM POSTING
// ================================================

async function postToInstagram(content, mediaUrl, mediaType = 'CAROUSEL') {
    console.log(`📱 [INSTAGRAM] Posting: ${content.substring(0, 50)}...`);
    
    if (!process.env.INSTAGRAM_ACCESS_TOKEN || !process.env.INSTAGRAM_BUSINESS_ID) {
        throw new Error('Instagram credentials not configured');
    }
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` },
        body: JSON.stringify({
            caption: content,
            media_type: mediaType,
            media_url: mediaUrl
        })
    });
    
    const data = await response.json();
    
    if (!data.id) {
        throw new Error('Failed to create Instagram media');
    }
    
    // Publish the media
    const publishResponse = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media_publish`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` },
        body: JSON.stringify({ creation_id: data.id })
    });
    
    const publishData = await publishResponse.json();
    
    return {
        success: true,
        post_id: publishData.id,
        posted_at: new Date().toISOString()
    };
}

// ================================================
// REAL FACEBOOK POSTING
// ================================================

async function postToFacebook(content, link = null) {
    console.log(`📱 [FACEBOOK] Posting: ${content.substring(0, 50)}...`);
    
    if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN || !process.env.FACEBOOK_PAGE_ID) {
        throw new Error('Facebook credentials not configured');
    }
    
    const body = { message: content };
    if (link) body.link = link;
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}` },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    return {
        success: true,
        post_id: data.id,
        posted_at: new Date().toISOString()
    };
}

// ================================================
// REAL EMAIL SENDING (SendGrid)
// ================================================

async function sendEmail(to, subject, body, templateId = null, templateData = {}) {
    console.log(`📧 [EMAIL] Sending to: ${to}, subject: ${subject}`);
    
    if (!process.env.SENDGRID_API_KEY) {
        throw new Error('SendGrid API key not configured');
    }
    
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    let emailBody = body;
    let htmlContent = body;
    
    if (templateId) {
        const { data: template } = await supabase
            .from('email_templates')
            .select('html')
            .eq('id', templateId)
            .single();
        
        if (template) {
            htmlContent = template.html;
            Object.entries(templateData).forEach(([key, value]) => {
                htmlContent = htmlContent.replace(new RegExp(`{{${key}}}`, 'g'), value);
            });
        }
    }
    
    const msg = {
        to,
        from: process.env.EMAIL_FROM || 'noreply@workflowstudio.com',
        subject,
        html: htmlContent,
        text: emailBody,
        trackingSettings: {
            clickTracking: { enable: true },
            openTracking: { enable: true }
        }
    };
    
    await sgMail.send(msg);
    
    return {
        success: true,
        to,
        subject,
        sent_at: new Date().toISOString()
    };
}

// ================================================
// REAL SLACK MESSAGING
// ================================================

async function sendSlackMessage(channel, message, blocks = null) {
    console.log(`💬 [SLACK] Sending to: ${channel}`);
    
    if (!process.env.SLACK_WEBHOOK_URL) {
        throw new Error('Slack webhook URL not configured');
    }
    
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            channel,
            text: message,
            blocks: blocks || [{ type: 'section', text: { type: 'mrkdwn', text: message } }]
        })
    });
    
    if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
    }
    
    return {
        success: true,
        channel,
        sent_at: new Date().toISOString()
    };
}

// ================================================
// REAL GITHUB WEBHOOKS
// ================================================

async function processGitHubWebhook(event, payload) {
    console.log(`🐙 [GITHUB] Processing ${event} event`);
    
    const { repository, sender, action, pull_request, issue } = payload;
    
    const result = {
        event,
        repository: repository?.full_name,
        sender: sender?.login,
        action,
        processed_at: new Date().toISOString()
    };
    
    if (pull_request) {
        result.pull_request = {
            number: pull_request.number,
            title: pull_request.title,
            url: pull_request.html_url,
            state: pull_request.state
        };
    }
    
    if (issue) {
        result.issue = {
            number: issue.number,
            title: issue.title,
            url: issue.html_url,
            state: issue.state
        };
    }
    
    return result;
}

// ================================================
// REAL DATABASE QUERIES
// ================================================

async function executeDatabaseQuery(userId, query, params = {}) {
    console.log(`📊 [DATABASE] Executing query: ${query.substring(0, 100)}`);
    
    // Get user's database connection
    const { data: dbConnection, error } = await supabase
        .from('database_connections')
        .select('connection_string, type')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
    
    if (error || !dbConnection) {
        // Fallback to Supabase RPC
        const { data, error: rpcError } = await supabase.rpc('execute_sql', { sql_query: query });
        if (rpcError) throw rpcError;
        return { rows: data || [], row_count: data?.length || 0 };
    }
    
    if (dbConnection.type === 'postgresql') {
        const { Client } = require('pg');
        const client = new Client({ connectionString: dbConnection.connection_string });
        await client.connect();
        const result = await client.query(query, Object.values(params));
        await client.end();
        return { rows: result.rows, row_count: result.rowCount, fields: result.fields?.map(f => f.name) };
    }
    
    throw new Error('Unsupported database type');
}

// ================================================
// REAL CRM UPDATES
// ================================================

async function updateCRMRecord(userId, recordId, updateData) {
    console.log(`📝 [CRM] Updating record ${recordId}`);
    
    const { data, error } = await supabase
        .from('crm_records')
        .update({
            ...updateData,
            updated_at: new Date().toISOString()
        })
        .eq('id', recordId)
        .eq('user_id', userId)
        .select()
        .single();
    
    if (error) throw error;
    
    return {
        success: true,
        record_id: recordId,
        updated_data: data,
        timestamp: new Date().toISOString()
    };
}

// ================================================
// REAL INVENTORY CHECKS (Shopify)
// ================================================

async function checkInventory(platform, userId) {
    console.log(`📦 [INVENTORY] Checking ${platform}`);
    
    if (platform === 'shopify') {
        const { data: shopifyApp } = await supabase
            .from('connected_apps')
            .select('access_token, shop_url')
            .eq('user_id', userId)
            .eq('platform', 'shopify')
            .single();
        
        if (!shopifyApp) {
            throw new Error('Shopify not connected');
        }
        
        const response = await fetch(`https://${shopifyApp.shop_url}/admin/api/2024-01/products.json?limit=250`, {
            headers: { 'X-Shopify-Access-Token': shopifyApp.access_token }
        });
        
        const data = await response.json();
        const products = data.products || [];
        const lowStockItems = products.filter(p => p.variants[0]?.inventory_quantity < 10).length;
        
        return {
            platform,
            total_products: products.length,
            low_stock_items: lowStockItems,
            checked_at: new Date().toISOString()
        };
    }
    
    throw new Error(`Unsupported platform: ${platform}`);
}

// ================================================
// REAL CART RECOVERY (Shopify)
// ================================================

async function recoverAbandonedCarts(platform, discountPercent, userId) {
    console.log(`🛒 [CART] Recovering carts on ${platform} with ${discountPercent}% discount`);
    
    if (platform === 'shopify') {
        const { data: shopifyApp } = await supabase
            .from('connected_apps')
            .select('access_token, shop_url')
            .eq('user_id', userId)
            .eq('platform', 'shopify')
            .single();
        
        if (!shopifyApp) {
            throw new Error('Shopify not connected');
        }
        
        const response = await fetch(`https://${shopifyApp.shop_url}/admin/api/2024-01/checkouts.json?status=abandoned`, {
            headers: { 'X-Shopify-Access-Token': shopifyApp.access_token }
        });
        
        const data = await response.json();
        const abandonedCarts = data.checkouts || [];
        let recoveredCount = 0;
        
        for (const cart of abandonedCarts) {
            if (cart.email) {
                await sendEmail(
                    cart.email,
                    `Save ${discountPercent}% on your abandoned cart!`,
                    `<h2>You left something behind!</h2>
                     <p>Use code <strong>SAVE${discountPercent}</strong> for ${discountPercent}% off your order.</p>
                     <a href="${cart.abandoned_checkout_url}">Complete Your Purchase</a>`
                );
                recoveredCount++;
            }
        }
        
        return {
            platform,
            carts_recovered: recoveredCount,
            discount_applied: discountPercent,
            total_abandoned: abandonedCarts.length,
            recovered_at: new Date().toISOString()
        };
    }
    
    throw new Error(`Unsupported platform: ${platform}`);
}

// ================================================
// REAL LEAD SCORING (Cloudflare AI)
// ================================================

async function scoreLead(leadData) {
    console.log(`🎯 [LEAD] Scoring lead: ${leadData.name || leadData.email || 'Unknown'}`);
    
    // Use Cloudflare AI for lead scoring
    const score = await ai.scoreLeadWithAI(leadData);
    const rating = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
    
    // Save to database
    const { data, error } = await supabase.from('leads').insert({
        id: uuidv4(),
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        company: leadData.company,
        job_title: leadData.job_title,
        budget: leadData.budget,
        industry: leadData.industry,
        lead_score: score,
        rating: rating,
        status: 'new',
        source: leadData.source || 'automation',
        created_at: new Date().toISOString()
    }).select().single();
    
    if (error) throw error;
    
    return {
        lead_id: data.id,
        lead_score: score,
        rating: rating,
        scored_at: new Date().toISOString()
    };
}

// ================================================
// FALLBACK VIDEO SCRIPT GENERATOR
// ================================================

function generateFallbackVideoScript(topic, duration, style) {
    const scenes = Math.ceil(duration / 5);
    const sceneDuration = Math.floor(duration / scenes);
    
    let script = `VIDEO SCRIPT: "${topic}"\n`;
    script += `Duration: ${duration} seconds\n`;
    script += `Style: ${style}\n`;
    script += `Scenes: ${scenes}\n\n`;
    
    for (let i = 1; i <= scenes; i++) {
        const startTime = (i - 1) * sceneDuration;
        const endTime = i * sceneDuration;
        script += `Scene ${i} (${startTime}s - ${endTime}s): `;
        
        if (i === 1) {
            script += `Opening shot introducing ${topic}\n`;
            script += `  Visual: Wide establishing shot\n`;
            script += `  Audio: Dramatic intro music\n`;
        } else if (i === scenes) {
            script += `Conclusion and call to action for ${topic}\n`;
            script += `  Visual: Closing shot with logo\n`;
            script += `  Audio: Upbeat outro music\n`;
        } else {
            script += `Detailed exploration of ${topic} - key point ${i - 1}\n`;
            script += `  Visual: Close-up details and animations\n`;
            script += `  Audio: Voiceover explaining concept\n`;
        }
    }
    
    return script;
}

// ================================================
// EXPRESS ROUTES
// ================================================

// Debug route
router.get("/debug", (req, res) => {
    res.json({
        status: "alive",
        message: "AI Automations router is working with Sora-level video generation!",
        timestamp: new Date().toISOString(),
        features: {
            video_generation: "Sora-level (Runway, Pika, Kling, Luma)",
            tiktok_posting: true,
            instagram_posting: true,
            facebook_posting: true,
            email_sending: true,
            slack_messaging: true,
            github_webhooks: true,
            database_queries: true,
            crm_updates: true,
            inventory_checks: true,
            cart_recovery: true,
            lead_scoring: "Cloudflare AI"
        }
    });
});

// ===== VIDEO GENERATION (Sora-level) =====
router.post("/video/generate", authenticateToken, async (req, res) => {
    try {
        const { prompt, duration = 10, style = "cinematic", resolution = "1080p", aspect_ratio = "16:9" } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }
        
        const result = await generateSoraVideo(prompt, duration, style, resolution, aspect_ratio);
        
        // Save to database
        await supabase.from('generated_videos').insert({
            id: uuidv4(),
            user_id: req.user.id,
            prompt: prompt,
            video_url: result.video_url,
            video_script: result.video_script,
            duration: duration,
            style: style,
            resolution: resolution,
            aspect_ratio: aspect_ratio,
            created_at: new Date().toISOString()
        });
        
        res.json(result);
    } catch (error) {
        console.error("❌ Video generation error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== TIKTOK POSTING =====
router.post("/tiktok/post", authenticateToken, async (req, res) => {
    try {
        const { video_url, caption, hashtags, thumbnail_url, schedule_time } = req.body;
        
        if (!video_url || !caption) {
            return res.status(400).json({ error: "video_url and caption are required" });
        }
        
        const result = await postToTikTok(video_url, caption, hashtags || [], thumbnail_url, schedule_time);
        
        await supabase.from('social_posts').insert({
            id: uuidv4(),
            user_id: req.user.id,
            platform: 'tiktok',
            content: caption,
            media_url: video_url,
            post_id: result.post_id,
            status: schedule_time ? 'scheduled' : 'posted',
            scheduled_for: schedule_time || null,
            posted_at: result.posted_at,
            created_at: new Date().toISOString()
        });
        
        res.json(result);
    } catch (error) {
        console.error("❌ TikTok post error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== INSTAGRAM POSTING =====
router.post("/instagram/post", authenticateToken, async (req, res) => {
    try {
        const { content, media_url, media_type = "CAROUSEL" } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: "content is required" });
        }
        
        const result = await postToInstagram(content, media_url, media_type);
        
        await supabase.from('social_posts').insert({
            id: uuidv4(),
            user_id: req.user.id,
            platform: 'instagram',
            content: content,
            media_url: media_url,
            post_id: result.post_id,
            status: 'posted',
            posted_at: result.posted_at,
            created_at: new Date().toISOString()
        });
        
        res.json(result);
    } catch (error) {
        console.error("❌ Instagram post error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== FACEBOOK POSTING =====
router.post("/facebook/post", authenticateToken, async (req, res) => {
    try {
        const { content, link } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: "content is required" });
        }
        
        const result = await postToFacebook(content, link);
        
        await supabase.from('social_posts').insert({
            id: uuidv4(),
            user_id: req.user.id,
            platform: 'facebook',
            content: content,
            post_id: result.post_id,
            status: 'posted',
            posted_at: result.posted_at,
            created_at: new Date().toISOString()
        });
        
        res.json(result);
    } catch (error) {
        console.error("❌ Facebook post error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== EMAIL SENDING =====
router.post("/email/send", authenticateToken, async (req, res) => {
    try {
        const { to, subject, body, template_id, template_data } = req.body;
        
        if (!to || !subject) {
            return res.status(400).json({ error: "to and subject are required" });
        }
        
        const result = await sendEmail(to, subject, body, template_id, template_data);
        
        await supabase.from('email_logs').insert({
            id: uuidv4(),
            user_id: req.user.id,
            to: to,
            subject: subject,
            body: body,
            status: 'sent',
            sent_at: result.sent_at,
            created_at: new Date().toISOString()
        });
        
        res.json(result);
    } catch (error) {
        console.error("❌ Email send error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== SLACK MESSAGING =====
router.post("/slack/send", authenticateToken, async (req, res) => {
    try {
        const { channel, message, blocks } = req.body;
        
        if (!channel || !message) {
            return res.status(400).json({ error: "channel and message are required" });
        }
        
        const result = await sendSlackMessage(channel, message, blocks);
        res.json(result);
    } catch (error) {
        console.error("❌ Slack send error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== GITHUB WEBHOOK =====
router.post("/github/webhook", authenticateToken, async (req, res) => {
    try {
        const { event, payload } = req.body;
        
        if (!event || !payload) {
            return res.status(400).json({ error: "event and payload are required" });
        }
        
        const result = await processGitHubWebhook(event, payload);
        
        await supabase.from('github_events').insert({
            id: uuidv4(),
            user_id: req.user.id,
            event_type: event,
            payload: payload,
            processed_at: result.processed_at,
            created_at: new Date().toISOString()
        });
        
        res.json(result);
    } catch (error) {
        console.error("❌ GitHub webhook error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== DATABASE QUERY =====
router.post("/database/query", authenticateToken, async (req, res) => {
    try {
        const { query, params = {} } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: "query is required" });
        }
        
        const result = await executeDatabaseQuery(req.user.id, query, params);
        res.json(result);
    } catch (error) {
        console.error("❌ Database query error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== CRM UPDATE =====
router.put("/crm/record/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        if (!updateData || Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "update data is required" });
        }
        
        const result = await updateCRMRecord(req.user.id, id, updateData);
        res.json(result);
    } catch (error) {
        console.error("❌ CRM update error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== INVENTORY CHECK =====
router.post("/inventory/check", authenticateToken, async (req, res) => {
    try {
        const { platform = "shopify" } = req.body;
        
        const result = await checkInventory(platform, req.user.id);
        res.json(result);
    } catch (error) {
        console.error("❌ Inventory check error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== CART RECOVERY =====
router.post("/carts/recover", authenticateToken, async (req, res) => {
    try {
        const { platform = "shopify", discount_percent = 10 } = req.body;
        
        const result = await recoverAbandonedCarts(platform, discount_percent, req.user.id);
        res.json(result);
    } catch (error) {
        console.error("❌ Cart recovery error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== LEAD SCORING =====
router.post("/leads/score", authenticateToken, async (req, res) => {
    try {
        const leadData = req.body;
        
        if (!leadData.name && !leadData.email) {
            return res.status(400).json({ error: "name or email is required" });
        }
        
        const result = await scoreLead(leadData);
        res.json(result);
    } catch (error) {
        console.error("❌ Lead scoring error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== GET ALL AUTOMATIONS =====
router.get("/automations", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    console.log(`[AI-AUTOMATIONS] GET /automations for user: ${userId}`);

    try {
        const { data: automations, error } = await supabase
            .from('automations')
            .select(`
                id, 
                name as title, 
                icon, 
                trigger_type as trigger, 
                action_type as action, 
                is_active as enabled, 
                status,
                created_at
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const mappedAutomations = (automations || []).map(a => ({
            ...a,
            live: a.status === 'active' ? 1 : 0,
            enabled: a.enabled ? 1 : 0
        }));

        console.log(`[AI-AUTOMATIONS] Returning ${mappedAutomations.length} automations`);
        res.json(mappedAutomations);
    } catch (err) {
        console.error("[AI-AUTOMATIONS] Database error:", err.message);
        res.status(500).json({ error: "Database error: " + err.message });
    }
});

// ===== CREATE AUTOMATION =====
router.post("/automations", authenticateToken, bodyParser.json(), async (req, res) => {
    const userId = req.user.id;
    const { title, trigger, action, icon = '⚙️' } = req.body;

    console.log(`[AI-AUTOMATIONS] POST create automation by user ${userId}`);

    if (!title || !trigger || !action) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const { data, error } = await supabase
            .from('automations')
            .insert({
                user_id: userId,
                name: title,
                trigger_type: trigger,
                action_type: action,
                icon: icon,
                is_active: true,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            id: data.id, 
            success: true,
            message: "Automation created successfully" 
        });
    } catch (err) {
        console.error("[AI-AUTOMATIONS] Insert error:", err.message);
        res.status(500).json({ error: "Failed to create automation" });
    }
});

// ===== TOGGLE AUTOMATION =====
router.put("/automations/:id/toggle", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    console.log(`[AI-AUTOMATIONS] PUT toggle /automations/${id} by user ${userId}`);

    try {
        const { data: automation, error: fetchError } = await supabase
            .from('automations')
            .select('is_active, status')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !automation) {
            return res.status(404).json({ error: "Automation not found" });
        }

        const newIsActive = !automation.is_active;
        const newStatus = newIsActive ? 'active' : 'paused';

        const { error: updateError } = await supabase
            .from('automations')
            .update({ 
                is_active: newIsActive, 
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', userId);

        if (updateError) throw updateError;

        res.json({ 
            success: true,
            enabled: newIsActive ? 1 : 0,
            live: newIsActive ? 1 : 0
        });
    } catch (err) {
        console.error("[AI-AUTOMATIONS] Toggle error:", err.message);
        res.status(500).json({ error: "Failed to toggle automation" });
    }
});

// ===== DELETE AUTOMATION =====
router.delete("/automations/:id", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    console.log(`[AI-AUTOMATIONS] DELETE /automations/${id} by user ${userId}`);

    try {
        const { data: automation, error: fetchError } = await supabase
            .from('automations')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !automation) {
            return res.status(404).json({ error: "Automation not found" });
        }

        const { error: deleteError } = await supabase
            .from('automations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        console.log(`[AI-AUTOMATIONS] Automation ${id} deleted successfully`);
        res.json({ 
            success: true, 
            message: "Automation deleted successfully" 
        });
    } catch (err) {
        console.error("[AI-AUTOMATIONS] Delete error:", err.message);
        res.status(500).json({ error: "Failed to delete automation" });
    }
});

// ===== UPDATE AUTOMATION =====
router.put("/automations/:id", authenticateToken, bodyParser.json(), async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, trigger, action, icon } = req.body;

    console.log(`[AI-AUTOMATIONS] PUT update /automations/${id} by user ${userId}`);

    const updateData = {};
    
    if (title) updateData.name = title;
    if (trigger) updateData.trigger_type = trigger;
    if (action) updateData.action_type = action;
    if (icon) updateData.icon = icon;
    
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    try {
        const { error } = await supabase
            .from('automations')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ success: true, message: "Automation updated successfully" });
    } catch (err) {
        console.error("[AI-AUTOMATIONS] Update error:", err.message);
        res.status(500).json({ error: "Failed to update automation" });
    }
});

module.exports = router;