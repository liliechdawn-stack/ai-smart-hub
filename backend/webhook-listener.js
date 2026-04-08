cat > backend/webhook-listener.js << 'EOF'
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

const router = express.Router();

// Store active webhooks in memory for fast lookup
const webhookRegistry = new Map();

// Load existing webhooks from database on startup
async function loadWebhooks() {
  const { data: webhooks, error } = await supabase
    .from('webhooks')
    .select('*');
  
  if (!error && webhooks) {
    webhooks.forEach(webhook => {
      webhookRegistry.set(webhook.path, {
        workflow_id: webhook.workflow_id,
        method: webhook.method,
        user_id: webhook.user_id
      });
    });
    console.log(`✅ Loaded ${webhooks.length} webhooks into registry`);
  }
}

// Register a new webhook endpoint
router.post('/api/webhooks/register', async (req, res) => {
  try {
    const { path, workflow_id, method = 'POST' } = req.body;
    const userId = req.user?.id || req.body.user_id;
    
    if (!path || !workflow_id) {
      return res.status(400).json({ error: 'path and workflow_id are required' });
    }
    
    // Save to database
    const { data, error } = await supabase
      .from('webhooks')
      .insert({
        id: uuidv4(),
        path: path,
        workflow_id: workflow_id,
        method: method.toUpperCase(),
        user_id: userId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Register in memory
    webhookRegistry.set(path, {
      workflow_id: workflow_id,
      method: method.toUpperCase(),
      user_id: userId
    });
    
    res.json({ 
      success: true, 
      webhook: data,
      webhook_url: `/webhook/${path}`
    });
  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dynamic webhook endpoint for receiving external triggers
router.all('/webhook/:path', async (req, res) => {
  const { path } = req.params;
  const webhook = webhookRegistry.get(path);
  
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  
  // Build trigger data from request
  const triggerData = {
    method: req.method,
    headers: req.headers,
    query: req.query,
    body: req.body,
    params: req.params,
    timestamp: new Date().toISOString(),
    ip: req.ip,
    user_agent: req.get('user-agent')
  };
  
  console.log(`🔔 Webhook triggered: ${path} for workflow ${webhook.workflow_id}`);
  
  try {
    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      webhook.workflow_id,
      triggerData,
      webhook.user_id
    );
    
    res.json({ 
      success: true, 
      execution_id: result.executionId,
      message: 'Workflow triggered successfully',
      duration: result.duration
    });
  } catch (error) {
    console.error('Webhook execution failed:', error);
    res.status(500).json({ 
      error: error.message,
      webhook_path: path,
      workflow_id: webhook.workflow_id
    });
  }
});

// List all registered webhooks
router.get('/api/webhooks', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
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
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize on startup
loadWebhooks();

module.exports = { webhookRouter: router, webhookRegistry };
EOF