// ================================================
// WEBHOOK HANDLER - SECURE GATEWAY
// Features: HMAC signature validation, Credential-based secrets
// Event persistence, Platform-specific verifiers
// ================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

// ================================================
// SECURITY VERIFIER MIDDLEWARE
// ================================================

class SecurityVerifier {
  constructor() {
    this.verifiers = new Map();
    this.initializeVerifiers();
  }

  initializeVerifiers() {
    // GitHub verifier
    this.verifiers.set('github', {
      getSecret: async (userId) => {
        const { data } = await supabase
          .from('credentials')
          .select('token')
          .eq('user_id', userId)
          .eq('service', 'github')
          .eq('type', 'webhook_secret')
          .single();
        return data?.token;
      },
      verify: (req, secret) => {
        const signature = req.headers['x-hub-signature-256'];
        if (!signature) return false;
        
        const payload = JSON.stringify(req.body);
        const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
        
        try {
          return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
        } catch {
          return false;
        }
      },
      extractEvent: (req) => ({
        type: req.headers['x-github-event'],
        id: req.headers['x-github-delivery'],
        repository: req.body.repository?.full_name,
        sender: req.body.sender?.login,
        action: req.body.action
      })
    });

    // Shopify verifier
    this.verifiers.set('shopify', {
      getSecret: async (userId, shopDomain) => {
        const { data } = await supabase
          .from('credentials')
          .select('token, additional_data')
          .eq('user_id', userId)
          .eq('service', 'shopify')
          .eq('type', 'webhook_secret')
          .single();
        
        // Check if secret matches shop domain
        if (data?.additional_data?.shop_domain === shopDomain) {
          return data.token;
        }
        return null;
      },
      verify: (req, secret) => {
        const hmac = req.headers['x-shopify-hmac-sha256'];
        if (!hmac) return false;
        
        const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('base64');
        return hash === hmac;
      },
      extractEvent: (req) => ({
        type: req.params.topic || req.headers['x-shopify-topic'],
        shopDomain: req.headers['x-shopify-shop-domain'],
        resourceId: req.body.id,
        action: req.body.status
      })
    });

    // Stripe verifier
    this.verifiers.set('stripe', {
      getSecret: async (userId) => {
        const { data } = await supabase
          .from('credentials')
          .select('token')
          .eq('user_id', userId)
          .eq('service', 'stripe')
          .eq('type', 'webhook_secret')
          .single();
        return data?.token;
      },
      verify: (req, secret, rawBody) => {
        const signature = req.headers['stripe-signature'];
        if (!signature) return false;
        
        try {
          const Stripe = require('stripe');
          const webhookSecret = secret;
          const event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
          return event;
        } catch (err) {
          return false;
        }
      },
      extractEvent: (req, verifiedEvent) => ({
        type: verifiedEvent?.type,
        id: verifiedEvent?.id,
        customer: verifiedEvent?.data?.object?.customer,
        amount: verifiedEvent?.data?.object?.amount,
        status: verifiedEvent?.data?.object?.status
      })
    });

    // Slack verifier
    this.verifiers.set('slack', {
      getSecret: async (userId) => {
        const { data } = await supabase
          .from('credentials')
          .select('token')
          .eq('user_id', userId)
          .eq('service', 'slack')
          .eq('type', 'signing_secret')
          .single();
        return data?.token;
      },
      verify: (req, secret) => {
        const timestamp = req.headers['x-slack-request-timestamp'];
        const signature = req.headers['x-slack-signature'];
        if (!timestamp || !signature) return false;
        
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - parseInt(timestamp)) > 300) return false;
        
        const baseString = `v0:${timestamp}:${JSON.stringify(req.body)}`;
        const hash = crypto.createHmac('sha256', secret).update(baseString).digest('hex');
        return `v0=${hash}` === signature;
      },
      extractEvent: (req) => ({
        type: req.body.event?.type,
        user: req.body.event?.user,
        channel: req.body.event?.channel,
        text: req.body.event?.text,
        teamId: req.body.team_id
      })
    });

    // Pabbly / Make / Zapier webhook (no signature, just token check)
    this.verifiers.set('custom', {
      getSecret: async (userId, webhookId) => {
        const { data } = await supabase
          .from('webhook_registrations')
          .select('secret_token')
          .eq('id', webhookId)
          .eq('user_id', userId)
          .single();
        return data?.secret_token;
      },
      verify: (req, secret) => {
        const token = req.headers['x-webhook-token'] || req.query.token;
        return token === secret;
      },
      extractEvent: (req) => ({
        type: 'custom',
        data: req.body,
        headers: req.headers,
        timestamp: new Date().toISOString()
      })
    });
  }

  async verify(platform, req, userId = null, webhookId = null, rawBody = null) {
    const verifier = this.verifiers.get(platform);
    if (!verifier) {
      return { verified: false, error: `Unknown platform: ${platform}` };
    }

    // Get secret based on platform
    let secret;
    if (platform === 'shopify') {
      const shopDomain = req.headers['x-shopify-shop-domain'];
      secret = await verifier.getSecret(userId, shopDomain);
    } else if (platform === 'custom') {
      secret = await verifier.getSecret(userId, webhookId);
    } else {
      secret = await verifier.getSecret(userId);
    }

    if (!secret) {
      return { verified: false, error: 'Webhook secret not configured' };
    }

    // Verify signature
    let verifiedEvent = null;
    let isValid = false;

    if (platform === 'stripe' && rawBody) {
      verifiedEvent = verifier.verify(req, secret, rawBody);
      isValid = !!verifiedEvent;
    } else {
      isValid = verifier.verify(req, secret);
    }

    if (!isValid) {
      return { verified: false, error: 'Invalid signature' };
    }

    // Extract event data
    const eventData = verifier.extractEvent(req, verifiedEvent);

    return {
      verified: true,
      eventData,
      platform
    };
  }
}

const securityVerifier = new SecurityVerifier();

// ================================================
// EVENT PERSISTENCE
// ================================================

async function persistWebhookEvent(platform, eventData, rawPayload, headers, userId = null) {
  const eventId = uuidv4();
  const now = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('webhook_events')
      .insert({
        id: eventId,
        platform: platform,
        event_type: eventData.type || 'unknown',
        event_id: eventData.id || eventId,
        payload: rawPayload,
        headers: headers,
        user_id: userId,
        processed: false,
        received_at: now,
        created_at: now
      });

    if (error) {
      console.error('Failed to persist webhook event:', error);
    } else {
      console.log(`💾 [WEBHOOK] Event ${eventId} persisted for platform ${platform}`);
    }

    return eventId;
  } catch (error) {
    console.error('Error persisting webhook event:', error);
    return null;
  }
}

async function markEventProcessed(eventId, workflowId, executionId) {
  try {
    await supabase
      .from('webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        workflow_id: workflowId,
        execution_id: executionId
      })
      .eq('id', eventId);
  } catch (error) {
    console.error('Failed to mark event as processed:', error);
  }
}

// ================================================
// MAIN WEBHOOK HANDLER - GENERIC ENDPOINT
// ================================================

router.post('/webhook/:path', express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  const webhookPath = `/webhook/${req.params.path}`;
  const method = req.method;
  const payload = req.body;
  const headers = req.headers;
  const timestamp = new Date().toISOString();
  
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
      // Still persist the event for debugging
      await persistWebhookEvent('unknown', { type: 'unregistered' }, payload, headers);
      return res.status(404).json({ error: 'No webhook handler found' });
    }
    
    // Persist event first
    const eventId = await persistWebhookEvent(
      registrations[0]?.platform || 'custom',
      { type: webhookPath },
      payload,
      headers,
      registrations[0]?.user_id
    );
    
    // Execute each workflow asynchronously
    const results = [];
    for (const reg of registrations) {
      try {
        const webhookData = {
          webhook_payload: payload,
          webhook_headers: headers,
          webhook_path: webhookPath,
          method: method,
          event_id: eventId,
          received_at: timestamp
        };
        
        const result = await workflowExecutor.executeWorkflow(
          reg.workflow_id,
          webhookData,
          reg.user_id
        );
        
        results.push({ workflow_id: reg.workflow_id, execution_id: result.executionId });
        
        if (eventId) {
          await markEventProcessed(eventId, reg.workflow_id, result.executionId);
        }
      } catch (err) {
        console.error(`Webhook execution failed for workflow ${reg.workflow_id}:`, err);
        results.push({ workflow_id: reg.workflow_id, error: err.message });
      }
    }
    
    res.json({ received: true, event_id: eventId, executions: results });
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// GITHUB WEBHOOK HANDLER (with signature verification)
// ================================================

router.post('/webhooks/github', express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  const event = req.headers['x-github-event'];
  const deliveryId = req.headers['x-github-delivery'];
  const timestamp = new Date().toISOString();
  
  console.log(`🐙 GitHub webhook received: ${event} (${deliveryId})`);
  
  // First, persist the raw event
  const eventId = await persistWebhookEvent(
    'github',
    { type: event, id: deliveryId },
    req.body,
    req.headers
  );
  
  // Find webhook registration to get user_id for verification
  const { data: registration } = await supabase
    .from('webhook_registrations')
    .select('user_id, workflow_id')
    .eq('webhook_path', '/webhooks/github')
    .eq('is_active', true)
    .maybeSingle();
  
  if (registration) {
    // Verify signature using stored credential
    const verification = await securityVerifier.verify('github', req, registration.user_id);
    
    if (!verification.verified) {
      console.error(`❌ GitHub signature verification failed: ${verification.error}`);
      await supabase
        .from('webhook_events')
        .update({ verification_status: 'failed', verification_error: verification.error })
        .eq('id', eventId);
      return res.status(401).json({ error: verification.error });
    }
    
    await supabase
      .from('webhook_events')
      .update({ verification_status: 'passed', user_id: registration.user_id })
      .eq('id', eventId);
    
    const payload = req.body;
    const repository = payload.repository?.full_name;
    const sender = payload.sender?.login;
    const action = payload.action;
    
    const webhookData = {
      event: event,
      repository: repository,
      sender: sender,
      action: action,
      payload: payload,
      delivery_id: deliveryId,
      event_id: eventId,
      received_at: timestamp
    };
    
    try {
      const result = await workflowExecutor.executeWorkflow(
        registration.workflow_id,
        webhookData,
        registration.user_id
      );
      
      await markEventProcessed(eventId, registration.workflow_id, result.executionId);
      
      res.json({ 
        received: true, 
        event: event, 
        repository: repository,
        execution_id: result.executionId,
        event_id: eventId
      });
    } catch (err) {
      console.error('GitHub workflow execution failed:', err);
      res.json({ received: true, event: event, error: err.message, event_id: eventId });
    }
  } else {
    // No workflow registered, just acknowledge
    res.json({ received: true, event: event, event_id: eventId });
  }
});

// ================================================
// SHOPIFY WEBHOOK HANDLER (with signature verification)
// ================================================

router.post('/webhooks/shopify/:topic', express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  const topic = req.params.topic;
  const shopDomain = req.headers['x-shopify-shop-domain'];
  const timestamp = new Date().toISOString();
  
  console.log(`🛒 Shopify webhook received: ${topic} from ${shopDomain}`);
  
  // First, persist the raw event
  const eventId = await persistWebhookEvent(
    'shopify',
    { type: topic, shopDomain },
    req.body,
    req.headers
  );
  
  // Find webhook registration
  const { data: registration } = await supabase
    .from('webhook_registrations')
    .select('user_id, workflow_id')
    .eq('webhook_path', `/webhooks/shopify/${topic}`)
    .eq('is_active', true)
    .maybeSingle();
  
  if (registration) {
    // Verify signature using stored credential
    const verification = await securityVerifier.verify('shopify', req, registration.user_id);
    
    if (!verification.verified) {
      console.error(`❌ Shopify signature verification failed: ${verification.error}`);
      await supabase
        .from('webhook_events')
        .update({ verification_status: 'failed', verification_error: verification.error })
        .eq('id', eventId);
      return res.status(401).json({ error: verification.error });
    }
    
    await supabase
      .from('webhook_events')
      .update({ verification_status: 'passed', user_id: registration.user_id })
      .eq('id', eventId);
    
    const payload = req.body;
    
    const webhookData = {
      topic: topic,
      shop_domain: shopDomain,
      payload: payload,
      event_id: eventId,
      received_at: timestamp
    };
    
    try {
      const result = await workflowExecutor.executeWorkflow(
        registration.workflow_id,
        webhookData,
        registration.user_id
      );
      
      await markEventProcessed(eventId, registration.workflow_id, result.executionId);
      
      res.json({ 
        received: true, 
        topic: topic,
        execution_id: result.executionId,
        event_id: eventId
      });
    } catch (err) {
      console.error('Shopify workflow execution failed:', err);
      res.json({ received: true, topic: topic, error: err.message, event_id: eventId });
    }
  } else {
    res.json({ received: true, topic: topic, event_id: eventId });
  }
});

// ================================================
// STRIPE WEBHOOK HANDLER (with signature verification)
// ================================================

router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const timestamp = new Date().toISOString();
  
  console.log(`💳 Stripe webhook received`);
  
  // First, persist the raw event (parse raw body as JSON for storage)
  let parsedBody = {};
  try {
    parsedBody = JSON.parse(req.body.toString());
  } catch (e) {
    parsedBody = { raw: req.body.toString() };
  }
  
  const eventId = await persistWebhookEvent(
    'stripe',
    { type: 'unknown' },
    parsedBody,
    req.headers
  );
  
  // Find webhook registration
  const { data: registration } = await supabase
    .from('webhook_registrations')
    .select('user_id, workflow_id')
    .eq('webhook_path', '/webhooks/stripe')
    .eq('is_active', true)
    .maybeSingle();
  
  if (!registration) {
    return res.json({ received: true, event_id: eventId });
  }
  
  // Verify signature using stored credential
  const verification = await securityVerifier.verify('stripe', req, registration.user_id, null, req.body);
  
  if (!verification.verified) {
    console.error(`❌ Stripe signature verification failed: ${verification.error}`);
    await supabase
      .from('webhook_events')
      .update({ verification_status: 'failed', verification_error: verification.error })
      .eq('id', eventId);
    return res.status(401).json({ error: verification.error });
  }
  
  await supabase
    .from('webhook_events')
    .update({ 
      verification_status: 'passed', 
      user_id: registration.user_id,
      event_type: verification.eventData?.type
    })
    .eq('id', eventId);
  
  const webhookData = {
    type: verification.eventData?.type,
    data: verification.eventData,
    event_id: eventId,
    received_at: timestamp
  };
  
  try {
    const result = await workflowExecutor.executeWorkflow(
      registration.workflow_id,
      webhookData,
      registration.user_id
    );
    
    await markEventProcessed(eventId, registration.workflow_id, result.executionId);
    
    res.json({ 
      received: true, 
      type: verification.eventData?.type,
      execution_id: result.executionId,
      event_id: eventId
    });
  } catch (err) {
    console.error('Stripe workflow execution failed:', err);
    res.json({ received: true, error: err.message, event_id: eventId });
  }
});

// ================================================
// SLACK WEBHOOK HANDLER (with signature verification)
// ================================================

router.post('/webhooks/slack', express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  const timestamp = new Date().toISOString();
  
  console.log(`💬 Slack webhook received`);
  
  // Handle Slack URL verification challenge
  if (req.body.type === 'url_verification') {
    return res.json({ challenge: req.body.challenge });
  }
  
  // Persist the raw event
  const eventId = await persistWebhookEvent(
    'slack',
    { type: req.body.event?.type },
    req.body,
    req.headers
  );
  
  // Find webhook registration
  const { data: registration } = await supabase
    .from('webhook_registrations')
    .select('user_id, workflow_id')
    .eq('webhook_path', '/webhooks/slack')
    .eq('is_active', true)
    .maybeSingle();
  
  if (registration) {
    // Verify signature using stored credential
    const verification = await securityVerifier.verify('slack', req, registration.user_id);
    
    if (!verification.verified) {
      console.error(`❌ Slack signature verification failed: ${verification.error}`);
      await supabase
        .from('webhook_events')
        .update({ verification_status: 'failed', verification_error: verification.error })
        .eq('id', eventId);
      return res.status(401).json({ error: verification.error });
    }
    
    await supabase
      .from('webhook_events')
      .update({ verification_status: 'passed', user_id: registration.user_id })
      .eq('id', eventId);
    
    const webhookData = {
      event: req.body.event,
      team_id: req.body.team_id,
      event_type: req.body.event?.type,
      user: req.body.event?.user,
      channel: req.body.event?.channel,
      text: req.body.event?.text,
      event_id: eventId,
      received_at: timestamp
    };
    
    try {
      const result = await workflowExecutor.executeWorkflow(
        registration.workflow_id,
        webhookData,
        registration.user_id
      );
      
      await markEventProcessed(eventId, registration.workflow_id, result.executionId);
      
      res.json({ 
        received: true, 
        execution_id: result.executionId,
        event_id: eventId
      });
    } catch (err) {
      console.error('Slack workflow execution failed:', err);
      res.json({ received: true, error: err.message, event_id: eventId });
    }
  } else {
    res.json({ received: true, event_id: eventId });
  }
});

// ================================================
// REGISTER A WEBHOOK
// ================================================

router.post('/webhooks/register', async (req, res) => {
  const { webhook_path, method, workflow_id, platform, secret_token } = req.body;
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!webhook_path || !workflow_id) {
    return res.status(400).json({ error: 'webhook_path and workflow_id are required' });
  }
  
  try {
    // If secret_token provided, store it in credentials
    let credentialId = null;
    if (secret_token && platform) {
      const { data: credential, error: credError } = await supabase
        .from('credentials')
        .insert({
          id: uuidv4(),
          user_id: userId,
          name: `${platform.toUpperCase()} Webhook Secret`,
          service: platform,
          type: 'webhook_secret',
          token: secret_token,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (!credError && credential) {
        credentialId = credential.id;
      }
    }
    
    const { data, error } = await supabase
      .from('webhook_registrations')
      .insert({
        user_id: userId,
        workflow_id: workflow_id,
        webhook_path: webhook_path,
        method: method || 'POST',
        platform: platform || 'custom',
        credential_id: credentialId,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    const webhookUrl = `${process.env.BACKEND_URL || req.headers.origin}${webhook_path}`;
    
    res.json({ 
      success: true, 
      webhook: data, 
      webhook_url: webhookUrl,
      secret_token: secret_token ? 'stored securely' : null
    });
  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// GET ALL WEBHOOK REGISTRATIONS
// ================================================

router.get('/webhooks/registrations', async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { data, error } = await supabase
      .from('webhook_registrations')
      .select('*, credentials!left(service, name)')
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
// GET WEBHOOK REGISTRATION BY ID
// ================================================

router.get('/webhooks/registrations/:id', async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { data, error } = await supabase
      .from('webhook_registrations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching webhook registration:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// UPDATE WEBHOOK REGISTRATION
// ================================================

router.put('/webhooks/registrations/:id', async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  const { is_active, webhook_path, method } = req.body;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { data, error } = await supabase
      .from('webhook_registrations')
      .update({
        is_active: is_active !== undefined ? is_active : true,
        webhook_path: webhook_path,
        method: method,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, webhook: data });
  } catch (error) {
    console.error('Error updating webhook registration:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// DELETE WEBHOOK REGISTRATION
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
// GET WEBHOOK EVENTS LOGS
// ================================================

router.get('/webhooks/events', async (req, res) => {
  const userId = req.user?.id;
  const { limit = 50, offset = 0, platform, processed } = req.query;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    let query = supabase
      .from('webhook_events')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('received_at', { ascending: false });
    
    if (platform) {
      query = query.eq('platform', platform);
    }
    
    if (processed !== undefined) {
      query = query.eq('processed', processed === 'true');
    }
    
    const { data, error, count } = await query
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    if (error) throw error;
    
    res.json({
      events: data || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching webhook events:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// GET SINGLE WEBHOOK EVENT
// ================================================

router.get('/webhooks/events/:id', async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { data, error } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching webhook event:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// REPLAY WEBHOOK EVENT
// ================================================

router.post('/webhooks/events/:id/replay', async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Get the original event
    const { data: event, error: fetchError } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Find webhook registration
    const { data: registration } = await supabase
      .from('webhook_registrations')
      .select('workflow_id')
      .eq('webhook_path', '/webhook/custom')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (registration) {
      const replayData = {
        original_event_id: id,
        replayed: true,
        original_payload: event.payload,
        replayed_at: new Date().toISOString()
      };
      
      const result = await workflowExecutor.executeWorkflow(
        registration.workflow_id,
        replayData,
        userId
      );
      
      res.json({ 
        success: true, 
        execution_id: result.executionId,
        original_event_id: id
      });
    } else {
      res.json({ success: false, message: 'No workflow registered for replay' });
    }
  } catch (error) {
    console.error('Error replaying webhook event:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// TEST WEBHOOK ENDPOINT
// ================================================

router.post('/webhooks/test', async (req, res) => {
  const userId = req.user?.id;
  const { webhook_url, payload, headers = {} } = req.body;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!webhook_url) {
    return res.status(400).json({ error: 'webhook_url is required' });
  }
  
  try {
    const response = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload || { test: true, timestamp: new Date().toISOString() })
    });
    
    let data;
    try {
      data = await response.json();
    } catch {
      data = { message: 'Response not JSON' };
    }
    
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
// GET WEBHOOK STATISTICS
// ================================================

router.get('/webhooks/stats', async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { data: registrations, error: regError } = await supabase
      .from('webhook_registrations')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);
    
    const { data: events, error: eventError } = await supabase
      .from('webhook_events')
      .select('platform, processed', { count: 'exact' })
      .eq('user_id', userId);
    
    const { data: recentEvents, error: recentError } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(10);
    
    if (regError || eventError) throw regError || eventError;
    
    const processedCount = events?.filter(e => e.processed === true).length || 0;
    const unprocessedCount = events?.filter(e => e.processed === false).length || 0;
    
    const platformStats = {};
    events?.forEach(e => {
      platformStats[e.platform] = (platformStats[e.platform] || 0) + 1;
    });
    
    res.json({
      total_registrations: registrations?.length || 0,
      total_events: events?.length || 0,
      processed_events: processedCount,
      unprocessed_events: unprocessedCount,
      platform_breakdown: platformStats,
      recent_events: recentEvents || []
    });
  } catch (error) {
    console.error('Error fetching webhook stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;