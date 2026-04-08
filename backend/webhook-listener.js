const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

const router = express.Router();

// Store active webhooks in memory for fast lookup
const webhookRegistry = new Map();

// Store webhook execution attempts for retry logic
const webhookRetryStore = new Map();

// Rate limiting for webhooks (per webhook path)
const webhookRateLimit = new Map();

// Configuration
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff: 1s, 2s, 4s, 8s, 16s
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // Max 100 requests per minute per webhook

// Load existing webhooks from database on startup
async function loadWebhooks() {
  try {
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('*');
    
    if (!error && webhooks) {
      webhooks.forEach(webhook => {
        webhookRegistry.set(webhook.path, {
          workflow_id: webhook.workflow_id,
          method: webhook.method,
          user_id: webhook.user_id,
          secret: webhook.secret,
          retry_enabled: webhook.retry_enabled !== false,
          rate_limit: webhook.rate_limit || MAX_REQUESTS_PER_WINDOW,
          created_at: webhook.created_at
        });
      });
      console.log(`✅ Loaded ${webhooks.length} webhooks into registry`);
    }
  } catch (error) {
    console.error('Error loading webhooks:', error);
  }
}

// Check rate limit for webhook
function checkRateLimit(path) {
  const now = Date.now();
  const record = webhookRateLimit.get(path);
  
  if (!record) {
    webhookRateLimit.set(path, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  
  if (now > record.resetTime) {
    // Reset window
    webhookRateLimit.set(path, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetTime: record.resetTime 
    };
  }
  
  record.count++;
  webhookRateLimit.set(path, record);
  return { 
    allowed: true, 
    remaining: MAX_REQUESTS_PER_WINDOW - record.count,
    resetTime: record.resetTime
  };
}

// Verify webhook signature (for security)
function verifySignature(body, signature, secret) {
  if (!secret || !signature) return true; // No signature required
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Retry webhook execution with exponential backoff
async function retryWebhookExecution(webhook, triggerData, attempt = 1, originalRes = null) {
  const maxRetries = webhook.retry_enabled ? MAX_RETRIES : 1;
  const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
  
  try {
    console.log(`🔄 Webhook retry ${attempt}/${maxRetries} for ${webhook.path}`);
    
    const result = await workflowExecutor.executeWorkflow(
      webhook.workflow_id,
      triggerData,
      webhook.user_id
    );
    
    console.log(`✅ Webhook retry ${attempt} succeeded for ${webhook.path}`);
    
    // Log successful retry
    await supabase.from('webhook_logs').insert({
      id: uuidv4(),
      path: webhook.path,
      workflow_id: webhook.workflow_id,
      status: 'success',
      attempt: attempt,
      execution_id: result.executionId,
      created_at: new Date().toISOString()
    });
    
    return { success: true, result };
    
  } catch (error) {
    console.error(`❌ Webhook retry ${attempt} failed:`, error.message);
    
    if (attempt < maxRetries) {
      console.log(`⏳ Scheduling retry ${attempt + 1} in ${delay}ms...`);
      
      // Store retry info
      const retryKey = `${webhook.path}_${Date.now()}`;
      webhookRetryStore.set(retryKey, {
        path: webhook.path,
        attempt,
        nextRetry: Date.now() + delay,
        error: error.message
      });
      
      // Schedule retry
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWebhookExecution(webhook, triggerData, attempt + 1);
      
    } else {
      // All retries exhausted
      console.error(`❌ Webhook failed after ${maxRetries} retries for ${webhook.path}`);
      
      // Log final failure
      await supabase.from('webhook_failures').insert({
        id: uuidv4(),
        path: webhook.path,
        workflow_id: webhook.workflow_id,
        error: error.message,
        attempts: maxRetries,
        trigger_data: triggerData,
        created_at: new Date().toISOString()
      });
      
      return { success: false, error: error.message };
    }
  }
}

// Register a new webhook endpoint
router.post('/api/webhooks/register', async (req, res) => {
  try {
    const { 
      path, 
      workflow_id, 
      method = 'POST',
      secret = null,
      retry_enabled = true,
      rate_limit = MAX_REQUESTS_PER_WINDOW
    } = req.body;
    const userId = req.user?.id || req.body.user_id;
    
    if (!path || !workflow_id) {
      return res.status(400).json({ error: 'path and workflow_id are required' });
    }
    
    // Check if path already exists
    const { data: existing } = await supabase
      .from('webhooks')
      .select('path')
      .eq('path', path)
      .eq('user_id', userId)
      .single();
    
    if (existing) {
      return res.status(409).json({ error: 'Webhook path already exists for this user' });
    }
    
    // Validate workflow exists
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', workflow_id)
      .eq('user_id', userId)
      .single();
    
    if (workflowError || !workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    // Generate webhook secret if not provided
    const webhookSecret = secret || crypto.randomBytes(32).toString('hex');
    
    // Save to database
    const { data, error } = await supabase
      .from('webhooks')
      .insert({
        id: uuidv4(),
        path: path,
        workflow_id: workflow_id,
        method: method.toUpperCase(),
        user_id: userId,
        secret: webhookSecret,
        retry_enabled: retry_enabled,
        rate_limit: rate_limit,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Register in memory
    webhookRegistry.set(path, {
      workflow_id: workflow_id,
      method: method.toUpperCase(),
      user_id: userId,
      secret: webhookSecret,
      retry_enabled: retry_enabled,
      rate_limit: rate_limit,
      created_at: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      webhook: {
        ...data,
        secret: webhookSecret // Show secret only once
      },
      webhook_url: `/webhook/${path}`,
      curl_example: `curl -X POST https://your-domain.com/webhook/${path} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Signature: your-signature" \\
  -d '{"test": true}'`
    });
    
  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dynamic webhook endpoint for receiving external triggers
router.all('/webhook/:path', async (req, res) => {
  const startTime = Date.now();
  const { path } = req.params;
  const webhook = webhookRegistry.get(path);
  
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  
  // Check rate limit
  const rateLimitCheck = checkRateLimit(path);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${MAX_REQUESTS_PER_WINDOW} requests per minute`,
      resetAt: new Date(rateLimitCheck.resetTime).toISOString()
    });
  }
  
  // Verify signature if secret is set
  const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
  if (webhook.secret && !verifySignature(req.body, signature, webhook.secret)) {
    await supabase.from('webhook_logs').insert({
      id: uuidv4(),
      path: path,
      workflow_id: webhook.workflow_id,
      status: 'failed',
      error: 'Invalid signature',
      created_at: new Date().toISOString()
    });
    
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  
  // Build trigger data from request
  const triggerData = {
    method: req.method,
    headers: {
      'user-agent': req.get('user-agent'),
      'content-type': req.get('content-type'),
      'x-forwarded-for': req.get('x-forwarded-for')
    },
    query: req.query,
    body: req.body,
    params: req.params,
    timestamp: new Date().toISOString(),
    ip: req.ip || req.connection.remoteAddress,
    user_agent: req.get('user-agent'),
    webhook_path: path
  };
  
  console.log(`🔔 Webhook triggered: ${path} for workflow ${webhook.workflow_id}`);
  
  // Log webhook receipt
  const webhookLogId = uuidv4();
  await supabase.from('webhook_logs').insert({
    id: webhookLogId,
    path: path,
    workflow_id: webhook.workflow_id,
    status: 'processing',
    trigger_data: triggerData,
    created_at: new Date().toISOString()
  });
  
  try {
    // Execute the workflow with retry support
    let result;
    
    if (webhook.retry_enabled) {
      // Use retry logic
      const retryResult = await retryWebhookExecution(webhook, triggerData, 1);
      if (retryResult.success) {
        result = retryResult.result;
      } else {
        throw new Error(retryResult.error);
      }
    } else {
      // Execute without retry
      result = await workflowExecutor.executeWorkflow(
        webhook.workflow_id,
        triggerData,
        webhook.user_id
      );
    }
    
    const duration = Date.now() - startTime;
    
    // Update webhook log with success
    await supabase
      .from('webhook_logs')
      .update({
        status: 'success',
        execution_id: result.executionId,
        duration_ms: duration,
        completed_at: new Date().toISOString()
      })
      .eq('id', webhookLogId);
    
    // Update webhook stats
    await supabase
      .from('webhooks')
      .update({
        last_triggered_at: new Date().toISOString(),
        trigger_count: supabase.raw('trigger_count + 1')
      })
      .eq('path', path);
    
    res.json({ 
      success: true, 
      execution_id: result.executionId,
      message: 'Workflow triggered successfully',
      duration: duration,
      retries_used: webhook.retry_enabled ? (result.retries || 0) : 0
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Webhook execution failed:', error);
    
    // Update webhook log with failure
    await supabase
      .from('webhook_logs')
      .update({
        status: 'failed',
        error: error.message,
        duration_ms: duration,
        completed_at: new Date().toISOString()
      })
      .eq('id', webhookLogId);
    
    // Update webhook stats
    await supabase
      .from('webhooks')
      .update({
        last_error_at: new Date().toISOString(),
        error_count: supabase.raw('error_count + 1')
      })
      .eq('path', path);
    
    res.status(500).json({ 
      error: error.message,
      webhook_path: path,
      workflow_id: webhook.workflow_id,
      execution_id: null
    });
  }
});

// List all registered webhooks for a user
router.get('/api/webhooks', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Don't send secrets back
    const sanitizedData = data.map(webhook => ({
      ...webhook,
      secret: webhook.secret ? '••••••••' : null
    }));
    
    res.json(sanitizedData || []);
  } catch (error) {
    console.error('Error listing webhooks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific webhook
router.get('/api/webhooks/:path', async (req, res) => {
  try {
    const { path } = req.params;
    const userId = req.user?.id;
    
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('path', path)
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    // Don't send secret back
    const { secret, ...webhookWithoutSecret } = data;
    res.json({ ...webhookWithoutSecret, has_secret: !!data.secret });
    
  } catch (error) {
    console.error('Error getting webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a webhook
router.put('/api/webhooks/:path', async (req, res) => {
  try {
    const { path } = req.params;
    const userId = req.user?.id;
    const { workflow_id, method, retry_enabled, rate_limit, regenerate_secret } = req.body;
    
    const updateData = {
      updated_at: new Date().toISOString()
    };
    
    if (workflow_id) updateData.workflow_id = workflow_id;
    if (method) updateData.method = method.toUpperCase();
    if (retry_enabled !== undefined) updateData.retry_enabled = retry_enabled;
    if (rate_limit) updateData.rate_limit = rate_limit;
    
    if (regenerate_secret) {
      updateData.secret = crypto.randomBytes(32).toString('hex');
    }
    
    const { data, error } = await supabase
      .from('webhooks')
      .update(updateData)
      .eq('path', path)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Update in memory
    const existing = webhookRegistry.get(path);
    if (existing) {
      webhookRegistry.set(path, {
        ...existing,
        workflow_id: workflow_id || existing.workflow_id,
        method: method?.toUpperCase() || existing.method,
        retry_enabled: retry_enabled !== undefined ? retry_enabled : existing.retry_enabled,
        rate_limit: rate_limit || existing.rate_limit,
        secret: updateData.secret || existing.secret
      });
    }
    
    res.json({ success: true, webhook: data });
    
  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a webhook
router.delete('/api/webhooks/:path', async (req, res) => {
  try {
    const { path } = req.params;
    const userId = req.user?.id;
    
    const { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('path', path)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    webhookRegistry.delete(path);
    webhookRateLimit.delete(path);
    
    res.json({ success: true, message: 'Webhook deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get webhook logs
router.get('/api/webhooks/:path/logs', async (req, res) => {
  try {
    const { path } = req.params;
    const userId = req.user?.id;
    const { limit = 50, offset = 0 } = req.query;
    
    // Verify webhook ownership
    const { data: webhook, error: webhookError } = await supabase
      .from('webhooks')
      .select('id')
      .eq('path', path)
      .eq('user_id', userId)
      .single();
    
    if (webhookError) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('path', path)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    if (error) throw error;
    
    res.json(data || []);
    
  } catch (error) {
    console.error('Error getting webhook logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get webhook stats
router.get('/api/webhooks/:path/stats', async (req, res) => {
  try {
    const { path } = req.params;
    const userId = req.user?.id;
    
    const { data: webhook, error: webhookError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('path', path)
      .eq('user_id', userId)
      .single();
    
    if (webhookError) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    // Get stats from logs
    const { data: stats } = await supabase
      .from('webhook_logs')
      .select('status, duration_ms')
      .eq('path', path);
    
    const totalRequests = stats?.length || 0;
    const successfulRequests = stats?.filter(s => s.status === 'success').length || 0;
    const failedRequests = stats?.filter(s => s.status === 'failed').length || 0;
    const avgDuration = stats?.reduce((sum, s) => sum + (s.duration_ms || 0), 0) / (totalRequests || 1);
    
    // Get last 24 hours trend
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('webhook_logs')
      .select('created_at, status')
      .eq('path', path)
      .gte('created_at', last24h);
    
    const hourlyTrend = {};
    recent?.forEach(log => {
      const hour = new Date(log.created_at).getHours();
      if (!hourlyTrend[hour]) hourlyTrend[hour] = { total: 0, success: 0 };
      hourlyTrend[hour].total++;
      if (log.status === 'success') hourlyTrend[hour].success++;
    });
    
    res.json({
      webhook: {
        path: webhook.path,
        workflow_id: webhook.workflow_id,
        method: webhook.method,
        retry_enabled: webhook.retry_enabled,
        rate_limit: webhook.rate_limit,
        created_at: webhook.created_at,
        last_triggered_at: webhook.last_triggered_at,
        last_error_at: webhook.last_error_at,
        trigger_count: webhook.trigger_count || 0,
        error_count: webhook.error_count || 0
      },
      stats: {
        total_requests: totalRequests,
        successful_requests: successfulRequests,
        failed_requests: failedRequests,
        success_rate: totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(2) : 100,
        average_duration_ms: Math.round(avgDuration),
        hourly_trend: hourlyTrend
      }
    });
    
  } catch (error) {
    console.error('Error getting webhook stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test webhook endpoint
router.post('/api/webhooks/:path/test', async (req, res) => {
  try {
    const { path } = req.params;
    const userId = req.user?.id;
    const testData = req.body;
    
    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('path', path)
      .eq('user_id', userId)
      .single();
    
    if (error) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    const testTriggerData = {
      test: true,
      test_data: testData,
      timestamp: new Date().toISOString(),
      webhook_path: path,
      message: 'This is a test webhook trigger'
    };
    
    const result = await workflowExecutor.executeWorkflow(
      webhook.workflow_id,
      testTriggerData,
      userId
    );
    
    res.json({
      success: true,
      message: 'Test webhook triggered successfully',
      execution_id: result.executionId,
      test_data_sent: testData
    });
    
  } catch (error) {
    console.error('Error testing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regenerate webhook secret
router.post('/api/webhooks/:path/regenerate-secret', async (req, res) => {
  try {
    const { path } = req.params;
    const userId = req.user?.id;
    
    const newSecret = crypto.randomBytes(32).toString('hex');
    
    const { data, error } = await supabase
      .from('webhooks')
      .update({
        secret: newSecret,
        updated_at: new Date().toISOString()
      })
      .eq('path', path)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Update in memory
    const existing = webhookRegistry.get(path);
    if (existing) {
      webhookRegistry.set(path, {
        ...existing,
        secret: newSecret
      });
    }
    
    res.json({
      success: true,
      secret: newSecret,
      message: 'Webhook secret regenerated successfully'
    });
    
  } catch (error) {
    console.error('Error regenerating secret:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize on startup
loadWebhooks();

// Clean up old retry entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of webhookRetryStore.entries()) {
    if (now - value.nextRetry > 3600000) {
      webhookRetryStore.delete(key);
    }
  }
}, 3600000);

// Clean up rate limit entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [path, record] of webhookRateLimit.entries()) {
    if (now > record.resetTime) {
      webhookRateLimit.delete(path);
    }
  }
}, 60000);

module.exports = { webhookRouter: router, webhookRegistry };