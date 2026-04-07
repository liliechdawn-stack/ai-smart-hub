// ================================================
// WORKFLOW ROUTES - REAL API ENDPOINTS
// ================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../database-supabase');
const { authenticateToken } = require('../auth-middleware');
const workflowExecutor = require('../workflow/workflow-executor');

// ===== GET ALL WORKFLOWS =====
router.get('/workflows', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== GET SINGLE WORKFLOW =====
router.get('/workflows/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== CREATE WORKFLOW =====
router.post('/workflows', authenticateToken, async (req, res) => {
  try {
    const { name, nodes, edges, execution_mode } = req.body;
    
    const workflowId = uuidv4();
    const { data, error } = await supabase
      .from('workflows')
      .insert({
        id: workflowId,
        user_id: req.user.id,
        name: name || 'Untitled Workflow',
        nodes: nodes || [],
        edges: edges || [],
        execution_mode: execution_mode || 'sequential',
        status: 'active',
        run_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== UPDATE WORKFLOW =====
router.put('/workflows/:id', authenticateToken, async (req, res) => {
  try {
    const { name, nodes, edges, execution_mode, status } = req.body;
    
    const { data, error } = await supabase
      .from('workflows')
      .update({
        name: name,
        nodes: nodes,
        edges: edges,
        execution_mode: execution_mode,
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE WORKFLOW =====
router.delete('/workflows/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== EXECUTE WORKFLOW =====
router.post('/workflows/:id/execute', authenticateToken, async (req, res) => {
  try {
    const { trigger_data } = req.body;
    
    const result = await workflowExecutor.executeWorkflow(
      req.params.id,
      trigger_data || {},
      req.user.id
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error executing workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== EXECUTE TEMPORARY WORKFLOW (for testing) =====
router.post('/workflows/execute', authenticateToken, async (req, res) => {
  try {
    const { nodes, edges, input } = req.body;
    
    // Create temporary workflow ID
    const tempWorkflowId = `temp_${Date.now()}`;
    
    // Store temporarily in active executions
    const result = await workflowExecutor.executeTempWorkflow(nodes, edges, input || {}, req.user.id);
    
    res.json(result);
  } catch (error) {
    console.error('Error executing temp workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== GET EXECUTION STATUS =====
router.get('/executions/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== GET WORKFLOW EXECUTIONS =====
router.get('/workflows/:id/executions', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('workflow_id', req.params.id)
      .order('started_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== CANCEL EXECUTION =====
router.post('/executions/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const cancelled = await workflowExecutor.cancelExecution(req.params.id);
    
    if (cancelled) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Execution not found' });
    }
  } catch (error) {
    console.error('Error cancelling execution:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;