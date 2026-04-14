// ================================================
// WEBHOOK HANDLER - REAL-TIME EXTERNAL TRIGGERS
// Supports: GitHub, TikTok, Instagram, Facebook, Shopify, Stripe, Slack, Custom Webhooks
// ================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

// ================================================
// WEBHOOK VERIFICATION & SECURITY
// ================================================

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(req, secret) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;
    
    const payload = JSON.stringify(req.body);
    const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Verify Shopify webhook signature
 */
function verifyShopifySignature(req, secret) {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    if (!hmac) return false;
    
    const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('base64');
    return hash === hmac;
}

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(req, secret) {
    const signature = req.headers['stripe-signature'];
    if (!signature) return false;
    
    try {
        const stripe = require('stripe')(secret);
        const event = stripe.webhooks.constructEvent(JSON.stringify(req.body), signature, secret);
        return event;
    } catch (err) {
        return false;
    }
}

/**
 * Verify Slack webhook signature
 */
function verifySlackSignature(req, secret) {
    const timestamp = req.headers['x-slack-request-timestamp'];
    const signature = req.headers['x-slack-signature'];
    if (!timestamp || !signature) return false;
    
    const baseString = `v0:${timestamp}:${JSON.stringify(req.body)}`;
    const hash = crypto.createHmac('sha256', secret).update(baseString).digest('hex');
    return `v0=${hash}` === signature;
}

// ================================================
// MAIN WEBHOOK HANDLER - YOUR ORIGINAL FUNCTION (INTACT)
// ================================================

// Handle incoming webhooks
router.post('/webhook/:path', async (req, res) => {
  const webhookPath = `/webhook/${req.params.path}`;
  const method = req.method;
  const payload = req.body;
  const headers = req.headers;
  
  console.log(`🔗 Webhook received: ${method} ${webhookPath}`);
  
  try {
    // Find workflow registrations for this webhook
    const { data: registrations, error } = await supabase
      .from('webhook_registrations')
      .select('*, workflows!inner(*)')
      .eq('webhook_path', webhookPath)
      .eq('method', method)
      .eq('is_active', true);
    
    if (error) throw error;
    
    if (!registrations || registrations.length === 0) {
      return res.status(404).json({ error: 'No webhook handler found' });
    }
    
    // Execute each workflow asynchronously
    const results = [];
    for (const reg of registrations) {
      try {
        const result = await workflowExecutor.executeWorkflow(
          reg.workflow_id,
          { webhook_payload: payload, webhook_headers: headers, received_at: new Date().toISOString() },
          reg.user_id
        );
        results.push({ workflow_id: reg.workflow_id, execution_id: result.executionId });
      } catch (err) {
        console.error(`Webhook execution failed for workflow ${reg.workflow_id}:`, err);
        results.push({ workflow_id: reg.workflow_id, error: err.message });
      }
    }
    
    res.json({ received: true, executions: results });
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// GITHUB WEBHOOK HANDLER (NEW)
// ================================================

router.post('/webhooks/github', async (req, res) => {
    const event = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'];
    const signature = req.headers['x-hub-signature-256'];
    
    console.log(`🐙 GitHub webhook received: ${event} (${deliveryId})`);
    
    // Verify signature if secret is configured
    if (process.env.GITHUB_WEBHOOK_SECRET) {
        const isValid = verifyGitHubSignature(req, process.env.GITHUB_WEBHOOK_SECRET);
        if (!isValid) {
            console.error('❌ Invalid GitHub signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }
    
    const payload = req.body;
    const repository = payload.repository?.full_name;
    const sender = payload.sender?.login;
    const action = payload.action;
    
    // Store webhook event
    await supabase.from('github_webhooks').insert({
        id: deliveryId,
        event_type: event,
        payload: payload,
        repository: repository,
        sender: sender,
        action: action,
        received_at: new Date().toISOString()
    });
    
    // Find workflows that listen to GitHub events
    const { data: registrations } = await supabase
        .from('webhook_registrations')
        .select('*, workflows!inner(*)')
        .eq('webhook_path', '/webhooks/github')
        .eq('is_active', true);
    
    if (registrations && registrations.length > 0) {
        const webhookData = {
            event: event,
            repository: repository,
            sender: sender,
            action: action,
            payload: payload,
            delivery_id: deliveryId,
            received_at: new Date().toISOString()
        };
        
        for (const reg of registrations) {
            await workflowExecutor.executeWorkflow(reg.workflow_id, webhookData, reg.user_id);
        }
    }
    
    res.json({ received: true, event: event, repository: repository });
});

// ================================================
// SHOPIFY WEBHOOK HANDLER (NEW)
// ================================================

router.post('/webhooks/shopify/:topic', async (req, res) => {
    const topic = req.params.topic;
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const hmac = req.headers['x-shopify-hmac-sha256'];
    
    console.log(`🛒 Shopify webhook received: ${topic} from ${shopDomain}`);
    
    // Verify signature if secret is configured
    if (process.env.SHOPIFY_WEBHOOK_SECRET) {
        const isValid = verifyShopifySignature(req, process.env.SHOPIFY_WEBHOOK_SECRET);
        if (!isValid) {
            console.error('❌ Invalid Shopify signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }
    
    const payload = req.body;
    
    // Store webhook event
    await supabase.from('shopify_webhooks').insert({
        id: uuidv4(),
        topic: topic,
        shop_domain: shopDomain,
        payload: payload,
        received_at: new Date().toISOString()
    });
    
    // Find workflows that listen to Shopify events
    const { data: registrations } = await supabase
        .from('webhook_registrations')
        .select('*, workflows!inner(*)')
        .eq('webhook_path', `/webhooks/shopify/${topic}`)
        .eq('is_active', true);
    
    if (registrations && registrations.length > 0) {
        const webhookData = {
            topic: topic,
            shop_domain: shopDomain,
            payload: payload,
            received_at: new Date().toISOString()
        };
        
        for (const reg of registrations) {
            await workflowExecutor.executeWorkflow(reg.workflow_id, webhookData, reg.user_id);
        }
    }
    
    res.json({ received: true, topic: topic });
});

// ================================================
// STRIPE WEBHOOK HANDLER (NEW)
// ================================================

router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    console.log(`💳 Stripe webhook received`);
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.warn('⚠️ Stripe webhook secret not configured');
        return res.status(200).json({ received: true });
    }
    
    let event;
    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`❌ Stripe webhook error: ${err.message}`);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
    
    // Store webhook event
    await supabase.from('stripe_webhooks').insert({
        id: event.id,
        type: event.type,
        payload: event.data,
        received_at: new Date().toISOString()
    });
    
    // Find workflows that listen to Stripe events
    const { data: registrations } = await supabase
        .from('webhook_registrations')
        .select('*, workflows!inner(*)')
        .eq('webhook_path', '/webhooks/stripe')
        .eq('is_active', true);
    
    if (registrations && registrations.length > 0) {
        const webhookData = {
            type: event.type,
            data: event.data,
            received_at: new Date().toISOString()
        };
        
        for (const reg of registrations) {
            await workflowExecutor.executeWorkflow(reg.workflow_id, webhookData, reg.user_id);
        }
    }
    
    res.json({ received: true, type: event.type });
});

// ================================================
// SLACK WEBHOOK HANDLER (NEW)
// ================================================

router.post('/webhooks/slack', async (req, res) => {
    console.log(`💬 Slack webhook received`);
    
    // Verify signature if secret is configured
    if (process.env.SLACK_SIGNING_SECRET) {
        const isValid = verifySlackSignature(req, process.env.SLACK_SIGNING_SECRET);
        if (!isValid) {
            console.error('❌ Invalid Slack signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }
    
    const payload = req.body;
    
    // Handle Slack URL verification challenge
    if (payload.type === 'url_verification') {
        return res.json({ challenge: payload.challenge });
    }
    
    // Store webhook event
    await supabase.from('slack_webhooks').insert({
        id: uuidv4(),
        event_type: payload.event?.type || 'unknown',
        payload: payload,
        received_at: new Date().toISOString()
    });
    
    // Find workflows that listen to Slack events
    const { data: registrations } = await supabase
        .from('webhook_registrations')
        .select('*, workflows!inner(*)')
        .eq('webhook_path', '/webhooks/slack')
        .eq('is_active', true);
    
    if (registrations && registrations.length > 0) {
        const webhookData = {
            event: payload.event,
            team_id: payload.team_id,
            event_type: payload.event?.type,
            user: payload.event?.user,
            channel: payload.event?.channel,
            text: payload.event?.text,
            received_at: new Date().toISOString()
        };
        
        for (const reg of registrations) {
            await workflowExecutor.executeWorkflow(reg.workflow_id, webhookData, reg.user_id);
        }
    }
    
    res.json({ received: true });
});

// ================================================
// TIKTOK WEBHOOK HANDLER (NEW)
// ================================================

router.post('/webhooks/tiktok', async (req, res) => {
    console.log(`📱 TikTok webhook received`);
    
    const payload = req.body;
    const eventType = payload.event_type;
    
    // Store webhook event
    await supabase.from('tiktok_webhooks').insert({
        id: uuidv4(),
        event_type: eventType,
        payload: payload,
        received_at: new Date().toISOString()
    });
    
    // Find workflows that listen to TikTok events
    const { data: registrations } = await supabase
        .from('webhook_registrations')
        .select('*, workflows!inner(*)')
        .eq('webhook_path', '/webhooks/tiktok')
        .eq('is_active', true);
    
    if (registrations && registrations.length > 0) {
        const webhookData = {
            event_type: eventType,
            user_id: payload.user_id,
            video_id: payload.video_id,
            comment_id: payload.comment_id,
            received_at: new Date().toISOString()
        };
        
        for (const reg of registrations) {
            await workflowExecutor.executeWorkflow(reg.workflow_id, webhookData, reg.user_id);
        }
    }
    
    res.json({ received: true });
});

// ================================================
// INSTAGRAM WEBHOOK HANDLER (NEW)
// ================================================

router.post('/webhooks/instagram', async (req, res) => {
    console.log(`📸 Instagram webhook received`);
    
    const payload = req.body;
    
    // Handle Instagram verification challenge
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.INSTAGRAM_VERIFY_TOKEN) {
        return res.status(200).send(req.query['hub.challenge']);
    }
    
    // Store webhook event
    for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
            await supabase.from('instagram_webhooks').insert({
                id: uuidv4(),
                field: change.field,
                value: change.value,
                received_at: new Date().toISOString()
            });
            
            // Find workflows that listen to Instagram events
            const { data: registrations } = await supabase
                .from('webhook_registrations')
                .select('*, workflows!inner(*)')
                .eq('webhook_path', '/webhooks/instagram')
                .eq('is_active', true);
            
            if (registrations && registrations.length > 0) {
                const webhookData = {
                    field: change.field,
                    value: change.value,
                    received_at: new Date().toISOString()
                };
                
                for (const reg of registrations) {
                    await workflowExecutor.executeWorkflow(reg.workflow_id, webhookData, reg.user_id);
                }
            }
        }
    }
    
    res.json({ received: true });
});

// ================================================
// FACEBOOK WEBHOOK HANDLER (NEW)
// ================================================

router.post('/webhooks/facebook', async (req, res) => {
    console.log(`📘 Facebook webhook received`);
    
    const payload = req.body;
    
    // Handle Facebook verification challenge
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.FACEBOOK_VERIFY_TOKEN) {
        return res.status(200).send(req.query['hub.challenge']);
    }
    
    // Store webhook event
    for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
            await supabase.from('facebook_webhooks').insert({
                id: uuidv4(),
                field: change.field,
                value: change.value,
                received_at: new Date().toISOString()
            });
            
            // Find workflows that listen to Facebook events
            const { data: registrations } = await supabase
                .from('webhook_registrations')
                .select('*, workflows!inner(*)')
                .eq('webhook_path', '/webhooks/facebook')
                .eq('is_active', true);
            
            if (registrations && registrations.length > 0) {
                const webhookData = {
                    field: change.field,
                    value: change.value,
                    received_at: new Date().toISOString()
                };
                
                for (const reg of registrations) {
                    await workflowExecutor.executeWorkflow(reg.workflow_id, webhookData, reg.user_id);
                }
            }
        }
    }
    
    res.json({ received: true });
});

// ================================================
// REGISTER A WEBHOOK - YOUR ORIGINAL FUNCTION (INTACT)
// ================================================

router.post('/webhooks/register', async (req, res) => {
  const { webhook_path, method, workflow_id } = req.body;
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { data, error } = await supabase
      .from('webhook_registrations')
      .insert({
        user_id: userId,
        workflow_id: workflow_id,
        webhook_path: webhook_path,
        method: method || 'POST',
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, webhook: data, webhook_url: `${process.env.BACKEND_URL}${webhook_path}` });
  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// GET ALL WEBHOOK REGISTRATIONS (NEW)
// ================================================

router.get('/webhooks/registrations', async (req, res) => {
    const userId = req.user?.id;
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const { data, error } = await supabase
            .from('webhook_registrations')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching webhook registrations:', error);
        res.status(500).json({ error: error.message });
    }
});

// ================================================
// DELETE WEBHOOK REGISTRATION (NEW)
// ================================================

router.delete('/webhooks/registrations/:id', async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const { error } = await supabase
            .from('webhook_registrations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);
        
        if (error) throw error;
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting webhook registration:', error);
        res.status(500).json({ error: error.message });
    }
});

// ================================================
// TEST WEBHOOK ENDPOINT (NEW)
// ================================================

router.post('/webhooks/test', async (req, res) => {
    const userId = req.user?.id;
    const { webhook_url, payload } = req.body;
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!webhook_url) {
        return res.status(400).json({ error: 'webhook_url is required' });
    }
    
    try {
        const response = await fetch(webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || { test: true, timestamp: new Date().toISOString() })
        });
        
        const data = await response.json();
        
        res.json({
            success: response.ok,
            status: response.status,
            response: data,
            sent_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Test webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ================================================
// WEBHOOK LOGS (NEW)
// ================================================

router.get('/webhooks/logs', async (req, res) => {
    const userId = req.user?.id;
    const { limit = 50, offset = 0 } = req.query;
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const { data, error } = await supabase
            .from('webhook_logs')
            .select('*')
            .eq('user_id', userId)
            .order('received_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
        
        if (error) throw error;
        
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching webhook logs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;