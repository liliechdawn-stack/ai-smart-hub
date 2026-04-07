// ================================================
// WEBHOOK HANDLER - REAL-TIME EXTERNAL TRIGGERS
// ================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

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

// Register a webhook
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

module.exports = router;