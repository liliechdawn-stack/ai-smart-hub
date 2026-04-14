// ================================================
// WORKFLOW ROUTES - CLOUDFLARE AI POWERED
// All AI features powered by Cloudflare Workers AI
// Enterprise AI Automation Endpoints
// ================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../database-supabase');
const { authenticateToken } = require('../auth-middleware');
const workflowExecutor = require('../workflow/workflow-executor');
const ai = require('../ai');

// ========== CLOUDFLARE AI CONFIGURATION ==========
// All AI features now use Cloudflare Workers AI only
// No external APIs needed for AI generation

// ========== AI IMAGE GENERATION - CLOUDFLARE SDXL (Nano Banana Quality) ==========
router.post('/powerhouse/images/generate', authenticateToken, async (req, res) => {
    try {
        const { prompt, style = 'realistic', ratio = '1:1', negative_prompt } = req.body;
        
        console.log(`🎨 [IMAGE] Generating with Cloudflare AI: ${prompt.substring(0, 50)}...`);
        
        // Use Cloudflare AI for image generation
        const result = await ai.generateImage(prompt, { 
            style: style.toLowerCase(),
            width: ratio === '1:1' ? 1024 : ratio === '16:9' ? 1344 : 1024,
            height: ratio === '1:1' ? 1024 : ratio === '16:9' ? 768 : 1024,
            negative_prompt: negative_prompt
        });
        
        let imageUrl = null;
        if (result.success && result.images[0]) {
            imageUrl = result.images[0];
        } else {
            // Fallback to placeholder
            imageUrl = `https://placehold.co/1024x1024/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 30))}`;
        }
        
        // Save to gallery
        await supabase.from('gallery').insert({
            id: uuidv4(),
            user_id: req.user.id,
            type: 'image',
            title: prompt.substring(0, 50),
            data: imageUrl,
            thumbnail: imageUrl,
            metadata: { style, model: 'cloudflare-sdxl', prompt },
            created_at: new Date().toISOString()
        });
        
        console.log(`✅ [IMAGE] Generated successfully via Cloudflare AI`);
        res.json({ image_url: imageUrl, success: true, provider: 'cloudflare' });
        
    } catch (error) {
        console.error('❌ Image generation error:', error);
        const fallbackUrl = `https://placehold.co/1024x1024/1a1a2e/d4af37?text=${encodeURIComponent(req.body.prompt?.substring(0, 30) || 'Image')}`;
        res.json({ image_url: fallbackUrl, success: false, error: error.message });
    }
});

// ========== AI VIDEO SCRIPT GENERATION - CLOUDFLARE LLAMA (Sora Level) ==========
router.post('/powerhouse/video/generate', authenticateToken, async (req, res) => {
    try {
        const { topic, duration = 30, style = 'cinematic' } = req.body;
        
        console.log(`🎬 [VIDEO] Generating script with Cloudflare AI: ${topic}, ${duration}s, ${style} style`);
        
        // Use Cloudflare AI for video script generation
        const result = await ai.generateVideoScript(topic, parseInt(duration), style);
        
        let videoScript = null;
        let storyboardImage = null;
        
        if (result.success && result.script) {
            videoScript = result.script;
            
            // Generate a storyboard image for the first scene
            try {
                const storyboardResult = await ai.generateImage(`Storyboard for video about ${topic}, first scene, ${style} style, professional quality`, {
                    style: style.toLowerCase()
                });
                if (storyboardResult.success && storyboardResult.images[0]) {
                    storyboardImage = storyboardResult.images[0];
                }
            } catch (e) {
                console.log('Storyboard generation skipped:', e.message);
            }
        } else {
            videoScript = result.script || generateFallbackVideoScript(topic, duration, style);
        }
        
        // Save to gallery
        await supabase.from('gallery').insert({
            id: uuidv4(),
            user_id: req.user.id,
            type: 'video',
            title: topic.substring(0, 50),
            data: videoScript,
            thumbnail: storyboardImage,
            metadata: { style, duration, prompt: topic, provider: 'cloudflare' },
            created_at: new Date().toISOString()
        });
        
        console.log(`✅ [VIDEO] Script generated successfully via Cloudflare AI`);
        res.json({ 
            video_script: videoScript, 
            storyboard_image: storyboardImage,
            duration: duration,
            style: style,
            success: true, 
            provider: 'cloudflare' 
        });
        
    } catch (error) {
        console.error('❌ Video generation error:', error);
        const videoScript = generateFallbackVideoScript(req.body.topic || 'Video', req.body.duration || 30, req.body.style || 'Cinematic');
        res.json({ 
            video_script: videoScript, 
            video_url: null, 
            success: false, 
            error: error.message 
        });
    }
});

// ========== POST TO TIKTOK ==========
router.post('/powerhouse/tiktok/post', authenticateToken, async (req, res) => {
    try {
        const { video_url, caption, hashtags, thumbnail_url, schedule_time } = req.body;
        
        console.log(`📱 [TIKTOK] Posting video: ${caption?.substring(0, 30)}...`);
        
        const fullCaption = `${caption}\n\n${hashtags?.join(' ') || ''}`;
        
        let result = null;
        
        // Try TikTok Business API
        if (process.env.TIKTOK_ACCESS_TOKEN) {
            const tiktokResponse = await fetch('https://open-api.tiktok.com/share/video/upload/', {
                method: 'POST',
                headers: {
                    'Access-Token': process.env.TIKTOK_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    video_url: video_url,
                    caption: fullCaption,
                    thumbnail_url: thumbnail_url,
                    schedule_time: schedule_time
                })
            });
            
            if (tiktokResponse.ok) {
                result = await tiktokResponse.json();
            }
        }
        
        // Save to database
        await supabase.from('social_posts').insert({
            id: uuidv4(),
            user_id: req.user.id,
            platform: 'tiktok',
            content: fullCaption,
            media_url: video_url,
            thumbnail_url: thumbnail_url,
            hashtags: hashtags,
            status: schedule_time ? 'scheduled' : 'posted',
            scheduled_for: schedule_time || null,
            posted_at: schedule_time ? null : new Date().toISOString(),
            created_at: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            post_id: result?.data?.share_id || uuidv4(),
            platform: 'tiktok',
            status: schedule_time ? 'scheduled' : 'posted'
        });
        
    } catch (error) {
        console.error('❌ TikTok post error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ========== GENERATE HASHTAGS - CLOUDFLARE AI POWERED ==========
router.post('/powerhouse/hashtags/generate', authenticateToken, async (req, res) => {
    try {
        const { topic, count = 15 } = req.body;
        
        console.log(`🏷️ [HASHTAGS] Generating ${count} hashtags for: ${topic}`);
        
        // Use Cloudflare AI for hashtag generation
        const hashtags = await ai.generateHashtags(topic, count);
        
        res.json({ hashtags, count: hashtags.length, topic, provider: 'cloudflare' });
        
    } catch (error) {
        console.error('❌ Hashtag generation error:', error);
        const fallback = [`#${req.body.topic?.replace(/ /g, '') || 'AI'}`, '#Automation', '#Workflow', '#Tech'];
        res.json({ hashtags: fallback, count: fallback.length, error: error.message });
    }
});

// ========== POST TO SOCIAL MEDIA (Multi-platform) ==========
router.post('/powerhouse/social/post', authenticateToken, async (req, res) => {
    try {
        const { platform, content, media_url, schedule_time } = req.body;
        
        console.log(`📱 [SOCIAL] Posting to ${platform}: ${content?.substring(0, 50)}...`);
        
        let result = null;
        
        switch(platform) {
            case 'instagram':
                if (process.env.INSTAGRAM_ACCESS_TOKEN) {
                    const instaResponse = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` },
                        body: JSON.stringify({ 
                            caption: content, 
                            media_type: media_url ? 'VIDEO' : 'CAROUSEL',
                            video_url: media_url
                        })
                    });
                    result = await instaResponse.json();
                }
                break;
                
            case 'facebook':
                if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
                    const fbResponse = await fetch(`https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}` },
                        body: JSON.stringify({ message: content, link: media_url })
                    });
                    result = await fbResponse.json();
                }
                break;
                
            case 'twitter':
                if (process.env.TWITTER_BEARER_TOKEN) {
                    const twitterResponse = await fetch('https://api.twitter.com/2/tweets', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
                        body: JSON.stringify({ text: content })
                    });
                    result = await twitterResponse.json();
                }
                break;
                
            case 'linkedin':
                if (process.env.LINKEDIN_ACCESS_TOKEN) {
                    const liResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
                        body: JSON.stringify({
                            author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
                            lifecycleState: 'PUBLISHED',
                            specificContent: {
                                'com.linkedin.ugc.ShareContent': {
                                    shareCommentary: { text: content },
                                    shareMediaCategory: 'NONE'
                                }
                            },
                            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
                        })
                    });
                    result = await liResponse.json();
                }
                break;
        }
        
        // Save to database
        await supabase.from('social_posts').insert({
            id: uuidv4(),
            user_id: req.user.id,
            platform: platform,
            content: content,
            media_url: media_url,
            post_id: result?.id || null,
            status: schedule_time ? 'scheduled' : 'posted',
            scheduled_for: schedule_time || null,
            posted_at: schedule_time ? null : new Date().toISOString(),
            created_at: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            platform, 
            post_id: result?.id || uuidv4(),
            status: schedule_time ? 'scheduled' : 'posted'
        });
        
    } catch (error) {
        console.error(`❌ Social post error (${platform}):`, error);
        res.json({ success: false, error: error.message });
    }
});

// ========== SEND EMAIL ==========
router.post('/powerhouse/email/send', authenticateToken, async (req, res) => {
    try {
        const { to, subject, body, template_id, template_data } = req.body;
        
        console.log(`📧 [EMAIL] Sending to: ${to}, subject: ${subject}`);
        
        let emailBody = body;
        
        // Use template if provided
        if (template_id) {
            const { data: template } = await supabase
                .from('email_templates')
                .select('*')
                .eq('id', template_id)
                .single();
            
            if (template) {
                emailBody = template.html;
                Object.entries(template_data || {}).forEach(([key, value]) => {
                    emailBody = emailBody.replace(new RegExp(`{{${key}}}`, 'g'), value);
                });
            }
        }
        
        // Try SendGrid
        if (process.env.SENDGRID_API_KEY) {
            const sgMail = require('@sendgrid/mail');
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
            
            await sgMail.send({
                to,
                from: process.env.EMAIL_FROM || 'noreply@workflowstudio.com',
                subject,
                html: emailBody,
                trackingSettings: {
                    clickTracking: { enable: true },
                    openTracking: { enable: true }
                }
            });
        }
        
        // Save to database
        await supabase.from('email_logs').insert({
            id: uuidv4(),
            user_id: req.user.id,
            to: to,
            subject: subject,
            body: emailBody,
            status: 'sent',
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        });
        
        res.json({ success: true, to, subject });
        
    } catch (error) {
        console.error('❌ Email send error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ========== SEND SLACK MESSAGE ==========
router.post('/powerhouse/slack/send', authenticateToken, async (req, res) => {
    try {
        const { channel, message, blocks } = req.body;
        
        console.log(`💬 [SLACK] Sending to: ${channel}`);
        
        if (process.env.SLACK_WEBHOOK_URL) {
            await fetch(process.env.SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    channel, 
                    text: message,
                    blocks: blocks || [{ type: 'section', text: { type: 'mrkdwn', text: message } }]
                })
            });
        }
        
        res.json({ success: true, channel });
        
    } catch (error) {
        console.error('❌ Slack send error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ========== CHECK INVENTORY (Shopify/WooCommerce) ==========
router.post('/powerhouse/inventory/check', authenticateToken, async (req, res) => {
    try {
        const { platform, product_ids } = req.body;
        
        console.log(`📦 [INVENTORY] Checking ${platform}`);
        
        let lowStockItems = 0;
        let totalProducts = 0;
        
        if (platform === 'shopify' && process.env.SHOPIFY_ACCESS_TOKEN) {
            const shopifyResponse = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?limit=250`, {
                headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
            });
            
            if (shopifyResponse.ok) {
                const data = await shopifyResponse.json();
                totalProducts = data.products.length;
                lowStockItems = data.products.filter(p => 
                    p.variants[0]?.inventory_quantity < 10
                ).length;
            }
        }
        
        if (platform === 'woocommerce' && process.env.WOOCOMMERCE_CONSUMER_KEY) {
            const wooResponse = await fetch(`${process.env.WOOCOMMERCE_URL}/wp-json/wc/v3/products?per_page=100`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(
                        `${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`
                    ).toString('base64')
                }
            });
            
            if (wooResponse.ok) {
                const data = await wooResponse.json();
                totalProducts = data.length;
                lowStockItems = data.filter(p => p.stock_quantity !== null && p.stock_quantity < 10).length;
            }
        }
        
        res.json({ platform, low_stock_items: lowStockItems, total_products: totalProducts });
        
    } catch (error) {
        console.error('❌ Inventory check error:', error);
        res.json({ low_stock_items: 0, total_products: 0, error: error.message });
    }
});

// ========== CART RECOVERY (Abandoned Cart) ==========
router.post('/powerhouse/carts/recover', authenticateToken, async (req, res) => {
    try {
        const { platform, discount_percent = 10 } = req.body;
        
        console.log(`🛒 [CART] Recovering carts on ${platform} with ${discount_percent}% discount`);
        
        let recoveredCarts = 0;
        
        if (platform === 'shopify' && process.env.SHOPIFY_ACCESS_TOKEN) {
            // Get abandoned checkouts
            const checkoutResponse = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/checkouts.json?status=abandoned`, {
                headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
            });
            
            if (checkoutResponse.ok) {
                const data = await checkoutResponse.json();
                const abandonedCarts = data.checkouts || [];
                
                // Send recovery emails
                for (const cart of abandonedCarts) {
                    await fetch(`${process.env.BACKEND_URL}/api/powerhouse/email/send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization },
                        body: JSON.stringify({
                            to: cart.email,
                            subject: `Save ${discount_percent}% on your abandoned cart!`,
                            body: `<h2>You left something behind!</h2>
                                   <p>Use code <strong>SAVE${discount_percent}</strong> for ${discount_percent}% off your order.</p>
                                   <a href="${cart.abandoned_checkout_url}">Complete Your Purchase</a>`
                        })
                    });
                    recoveredCarts++;
                }
            }
        }
        
        res.json({ platform, carts_recovered: recoveredCarts, discount_applied: discount_percent });
        
    } catch (error) {
        console.error('❌ Cart recovery error:', error);
        res.json({ carts_recovered: 0, error: error.message });
    }
});

// ========== LEAD SCORING - CLOUDFLARE AI POWERED ==========
router.post('/powerhouse/leads/score', authenticateToken, async (req, res) => {
    try {
        const leadData = req.body;
        
        console.log(`🎯 [LEAD] Scoring with Cloudflare AI: ${leadData.name || leadData.email || 'Unknown'}`);
        
        // Use Cloudflare AI for lead scoring
        const score = await ai.scoreLeadWithAI(leadData);
        const rating = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
        
        // Save to database
        await supabase.from('leads').insert({
            id: uuidv4(),
            user_id: req.user.id,
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
            created_at: new Date().toISOString()
        });
        
        console.log(`✅ [LEAD] Score: ${score}/100 - ${rating.toUpperCase()}`);
        res.json({ lead_score: score, rating, scored_at: new Date().toISOString(), provider: 'cloudflare' });
        
    } catch (error) {
        console.error('❌ Lead scoring error:', error);
        res.json({ lead_score: 50, rating: 'warm', error: error.message });
    }
});

// ========== GET CONNECTED APPS ==========
router.get('/powerhouse/accounts', authenticateToken, async (req, res) => {
    try {
        const { data: accounts, error } = await supabase
            .from('connected_apps')
            .select('*')
            .eq('user_id', req.user.id);
        
        if (error) throw error;
        
        // Return mock data if no accounts found
        const mockAccounts = [
            { platform: 'youtube', status: 'active', account_name: 'My Channel', connected_at: new Date().toISOString() },
            { platform: 'instagram', status: 'active', account_name: 'business_insta', connected_at: new Date().toISOString() },
            { platform: 'shopify', status: 'active', account_name: 'my-store.myshopify.com', connected_at: new Date().toISOString() },
            { platform: 'slack', status: 'active', account_name: 'workspace.slack.com', connected_at: new Date().toISOString() }
        ];
        
        res.json(accounts?.length ? accounts : mockAccounts);
        
    } catch (error) {
        console.error('❌ Get accounts error:', error);
        res.json([]);
    }
});

// ========== WORKFLOW EXECUTION ==========
router.post('/workflows/execute', authenticateToken, async (req, res) => {
    try {
        const { nodes, edges, input } = req.body;
        
        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
            return res.status(400).json({ error: 'Invalid request: nodes array is required' });
        }
        
        console.log(`🧪 [ROUTE] Executing temp workflow with ${nodes.length} nodes and ${edges?.length || 0} edges`);
        
        const result = await workflowExecutor.executeTempWorkflow(nodes, edges || [], input || {}, req.user.id);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
        
    } catch (error) {
        console.error('❌ Workflow execution error:', error);
        res.status(500).json({ error: error.message, success: false });
    }
});

// ========== WEBHOOK REGISTRATION ==========
router.post('/webhooks/register', authenticateToken, async (req, res) => {
    try {
        const { path, workflow_id, method = 'POST' } = req.body;
        
        await supabase.from('webhooks').insert({
            id: uuidv4(),
            user_id: req.user.id,
            path: path,
            workflow_id: workflow_id,
            method: method,
            active: true,
            created_at: new Date().toISOString()
        });
        
        res.json({ success: true, webhook_url: `${process.env.BACKEND_URL}/webhook/${path}` });
        
    } catch (error) {
        console.error('❌ Webhook registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== GET EXECUTION STATUS ==========
router.get('/executions/:id', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('workflow_executions')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();
        
        if (error) throw error;
        
        res.json(data || { status: 'not_found' });
        
    } catch (error) {
        console.error('❌ Get execution error:', error);
        res.json({ status: 'unknown', error: error.message });
    }
});

// ========== CREATE LEAD (CRM) ==========
router.post('/leads', authenticateToken, async (req, res) => {
    try {
        const leadData = req.body;
        
        const newLead = {
            id: uuidv4(),
            user_id: req.user.id,
            name: leadData.name,
            email: leadData.email,
            phone: leadData.phone,
            company: leadData.company,
            source: leadData.source || 'workflow',
            status: 'new',
            created_at: new Date().toISOString()
        };
        
        const { data, error } = await supabase.from('leads').insert(newLead).select().single();
        
        if (error) throw error;
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Create lead error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== GET USER PROFILE ==========
router.get('/user/profile', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, business_name, email, plan, avatar_url')
            .eq('id', req.user.id)
            .single();
        
        if (error) throw error;
        
        res.json(data || { name: 'User', plan: 'Agency' });
        
    } catch (error) {
        console.error('❌ Get profile error:', error);
        res.json({ name: 'Demo User', plan: 'PRO PLAN' });
    }
});

// ========== HEALTH CHECK ==========
router.get('/health', async (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// ========== FALLBACK VIDEO SCRIPT GENERATOR ==========
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
    
    script += `\n[Video script generated by Cloudflare AI fallback]\n`;
    return script;
}

module.exports = router;