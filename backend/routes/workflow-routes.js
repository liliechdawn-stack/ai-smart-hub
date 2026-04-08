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

// ===== EXECUTE WORKFLOW (Production) =====
router.post('/workflows/:id/execute', authenticateToken, async (req, res) => {
  try {
    const { trigger_data } = req.body;
    
    // Validate workflow exists before execution
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    
    if (workflowError || !workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
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
    
    // Validate required fields
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request: nodes array is required and cannot be empty' 
      });
    }
    
    if (!edges || !Array.isArray(edges)) {
      return res.status(400).json({ 
        error: 'Invalid request: edges array is required' 
      });
    }
    
    console.log(`🧪 [ROUTE] Executing temp workflow with ${nodes.length} nodes and ${edges.length} edges`);
    
    // Execute the temporary workflow
    const result = await workflowExecutor.executeTempWorkflow(
      nodes, 
      edges, 
      input || {}, 
      req.user.id
    );
    
    // Return appropriate response based on success/failure
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('Error executing temp workflow:', error);
    res.status(500).json({ 
      error: error.message,
      success: false,
      message: 'Failed to execute temporary workflow'
    });
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
    
    if (!data) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
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
      .eq('user_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== GET ALL EXECUTIONS (for current user) =====
router.get('/executions', authenticateToken, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
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
    // Verify execution belongs to user
    const { data: execution, error: fetchError } = await supabase
      .from('workflow_executions')
      .select('user_id, status')
      .eq('id', req.params.id)
      .single();
    
    if (fetchError || !execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    if (execution.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to cancel this execution' });
    }
    
    if (execution.status !== 'running') {
      return res.status(400).json({ error: `Cannot cancel execution with status: ${execution.status}` });
    }
    
    const cancelled = await workflowExecutor.cancelExecution(req.params.id);
    
    if (cancelled) {
      res.json({ success: true, message: 'Execution cancelled successfully' });
    } else {
      res.status(404).json({ error: 'Execution not found or already completed' });
    }
  } catch (error) {
    console.error('Error cancelling execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== RETRY FAILED EXECUTION =====
router.post('/executions/:id/retry', authenticateToken, async (req, res) => {
  try {
    const { data: execution, error: fetchError } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    
    if (fetchError || !execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    if (execution.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed executions can be retried' });
    }
    
    // Re-execute the workflow with the same trigger data
    const result = await workflowExecutor.executeWorkflow(
      execution.workflow_id,
      execution.trigger_data || {},
      req.user.id
    );
    
    res.json({ 
      success: true, 
      new_execution: result,
      previous_execution_id: req.params.id 
    });
    
  } catch (error) {
    console.error('Error retrying execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== DUPLICATE WORKFLOW =====
router.post('/workflows/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    // Fetch original workflow
    const { data: original, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    
    if (fetchError || !original) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    // Create duplicate
    const newWorkflowId = uuidv4();
    const { data, error } = await supabase
      .from('workflows')
      .insert({
        id: newWorkflowId,
        user_id: req.user.id,
        name: `${original.name} (Copy)`,
        nodes: original.nodes,
        edges: original.edges,
        execution_mode: original.execution_mode,
        status: 'inactive', // Start as inactive to avoid accidental triggers
        run_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
    
  } catch (error) {
    console.error('Error duplicating workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== BULK DELETE WORKFLOWS =====
router.post('/workflows/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { workflow_ids } = req.body;
    
    if (!workflow_ids || !Array.isArray(workflow_ids) || workflow_ids.length === 0) {
      return res.status(400).json({ error: 'workflow_ids array is required' });
    }
    
    const { error } = await supabase
      .from('workflows')
      .delete()
      .in('id', workflow_ids)
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ success: true, deleted_count: workflow_ids.length });
    
  } catch (error) {
    console.error('Error bulk deleting workflows:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== TOGGLE WORKFLOW STATUS (activate/deactivate) =====
router.patch('/workflows/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "active" or "inactive"' });
    }
    
    const { data, error } = await supabase
      .from('workflows')
      .update({
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
    console.error('Error toggling workflow status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== VALIDATE WORKFLOW (check for errors before saving) =====
router.post('/workflows/validate', authenticateToken, async (req, res) => {
  try {
    const { nodes, edges } = req.body;
    
    const errors = [];
    const warnings = [];
    
    if (!nodes || nodes.length === 0) {
      errors.push('Workflow must contain at least one node');
    }
    
    // Check for start nodes
    const startNodes = nodes.filter(node => {
      const hasIncoming = edges.some(edge => edge.target === node.id);
      return !hasIncoming;
    });
    
    if (startNodes.length === 0) {
      errors.push('Workflow has no start node (every node has an incoming connection)');
    }
    
    if (startNodes.length > 1) {
      warnings.push(`Workflow has ${startNodes.length} start nodes - they will execute in parallel`);
    }
    
    // Check for orphaned nodes
    const connectedNodes = new Set();
    edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });
    
    const orphanedNodes = nodes.filter(node => !connectedNodes.has(node.id));
    if (orphanedNodes.length > 0) {
      warnings.push(`${orphanedNodes.length} node(s) are not connected to the workflow`);
    }
    
    // Check for nodes with missing configuration
    nodes.forEach(node => {
      if (node.type === 'condition' && (!node.config || !node.config.condition)) {
        warnings.push(`Condition node "${node.name || node.id}" has no condition defined`);
      }
      if (node.type === 'send_email' && (!node.config || !node.config.to)) {
        warnings.push(`Email node "${node.name || node.id}" has no recipient defined`);
      }
      if (node.type === 'http_request' && (!node.config || !node.config.url)) {
        warnings.push(`HTTP Request node "${node.name || node.id}" has no URL defined`);
      }
    });
    
    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      startNodeCount: startNodes.length
    });
    
  } catch (error) {
    console.error('Error validating workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;