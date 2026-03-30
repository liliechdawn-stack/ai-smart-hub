// ================================================
// WORKFLOW EXECUTOR - Node-based workflow execution
// Extends your existing automation system
// ================================================

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../database-supabase');
const nodeRegistry = require('./node-registry');

class WorkflowExecutor {
  constructor() {
    this.activeExecutions = new Map();
    this.executionTimeout = 30000; // 30 seconds
  }

  async executeWorkflow(automation, triggerData = {}, userId) {
    const executionId = uuidv4();
    const startTime = Date.now();
    
    console.log(`🚀 [WORKFLOW] Starting execution: ${automation.name} (${automation.id})`);
    
    // Create execution record
    const { data: execution, error } = await supabase
      .from('workflow_executions')
      .insert({
        id: executionId,
        automation_id: automation.id,
        user_id: userId,
        workflow_version: automation.workflow_version || 1,
        trigger_data: triggerData,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Failed to create execution record:', error);
    }
    
    // Store execution context
    this.activeExecutions.set(executionId, {
      automation,
      triggerData,
      userId,
      startTime,
      nodeResults: new Map(),
      status: 'running'
    });
    
    try {
      // Parse workflow nodes and edges
      const nodes = automation.workflow_nodes || [];
      const edges = automation.workflow_edges || [];
      const executionMode = automation.execution_mode || 'sequential';
      
      if (nodes.length === 0) {
        throw new Error('No workflow nodes found');
      }
      
      // Find start nodes (nodes with no incoming edges)
      const startNodes = nodes.filter(node => {
        const hasIncoming = edges.some(edge => edge.target === node.id);
        return !hasIncoming;
      });
      
      if (startNodes.length === 0) {
        throw new Error('No start node found in workflow');
      }
      
      // Execute based on mode
      let finalResults;
      if (executionMode === 'parallel') {
        finalResults = await this.executeParallel(startNodes, nodes, edges, triggerData, executionId);
      } else {
        finalResults = await this.executeSequential(startNodes, nodes, edges, triggerData, executionId);
      }
      
      // Update execution record
      const executionTime = Date.now() - startTime;
      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          node_results: finalResults,
          completed_at: new Date().toISOString(),
          execution_time_ms: executionTime
        })
        .eq('id', executionId);
      
      // Update automation stats
      await supabase
        .from('user_automations')
        .update({
          run_count: (automation.run_count || 0) + 1,
          success_count: (automation.success_count || 0) + 1,
          last_run_at: new Date().toISOString()
        })
        .eq('id', automation.id);
      
      // Broadcast real-time update
      if (global.io) {
        global.io.to(`user:${userId}`).emit('workflow_executed', {
          automation_id: automation.id,
          execution_id: executionId,
          status: 'completed',
          duration: executionTime,
          results: finalResults
        });
      }
      
      console.log(`✅ [WORKFLOW] Execution completed in ${executionTime}ms`);
      
      return {
        success: true,
        executionId,
        results: finalResults,
        duration: executionTime
      };
      
    } catch (error) {
      console.error(`❌ [WORKFLOW] Execution failed:`, error);
      
      // Update execution record with error
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', executionId);
      
      // Broadcast error
      if (global.io) {
        global.io.to(`user:${userId}`).emit('workflow_error', {
          automation_id: automation.id,
          execution_id: executionId,
          error: error.message
        });
      }
      
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }
  
  async executeSequential(startNodes, allNodes, edges, triggerData, executionId) {
    const results = {};
    const visited = new Set();
    const queue = [...startNodes];
    
    while (queue.length > 0) {
      const node = queue.shift();
      
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      
      // Get input from previous nodes
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      let nodeInput = {};
      
      for (const edge of incomingEdges) {
        const sourceResult = results[edge.source];
        if (sourceResult) {
          nodeInput = { ...nodeInput, ...sourceResult.output };
        }
      }
      
      // If no input, use trigger data
      if (Object.keys(nodeInput).length === 0 && incomingEdges.length === 0) {
        nodeInput = triggerData;
      }
      
      // Execute node
      const nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId);
      results[node.id] = nodeResult;
      
      // Add next nodes to queue based on outputs
      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      
      // If node has specific next outputs (for conditional branching)
      if (nodeResult.next && nodeResult.next.length > 0) {
        for (const nextOutput of nodeResult.next) {
          const matchingEdge = outgoingEdges.find(edge => edge.sourceHandle === nextOutput);
          if (matchingEdge) {
            const targetNode = allNodes.find(n => n.id === matchingEdge.target);
            if (targetNode && !visited.has(targetNode.id)) {
              queue.push(targetNode);
            }
          }
        }
      } else {
        // Default: follow all outgoing edges
        for (const edge of outgoingEdges) {
          const targetNode = allNodes.find(n => n.id === edge.target);
          if (targetNode && !visited.has(targetNode.id)) {
            // Check if all incoming edges to target are satisfied
            const allIncomingSatisfied = edges
              .filter(e => e.target === targetNode.id)
              .every(e => visited.has(e.source));
            
            if (allIncomingSatisfied) {
              queue.push(targetNode);
            }
          }
        }
      }
    }
    
    return results;
  }
  
  async executeParallel(startNodes, allNodes, edges, triggerData, executionId) {
    const results = {};
    const promises = [];
    
    // Execute all start nodes in parallel
    for (const startNode of startNodes) {
      const promise = this.executeNodeWithDependencies(startNode, allNodes, edges, triggerData, results, executionId);
      promises.push(promise);
    }
    
    await Promise.all(promises);
    return results;
  }
  
  async executeNodeWithDependencies(node, allNodes, edges, triggerData, results, executionId) {
    // Get input from dependencies
    const incomingEdges = edges.filter(edge => edge.target === node.id);
    let nodeInput = {};
    
    for (const edge of incomingEdges) {
      if (!results[edge.source]) {
        // Wait for dependency to complete
        await this.waitForResult(edge.source, results);
      }
      const sourceResult = results[edge.source];
      if (sourceResult) {
        nodeInput = { ...nodeInput, ...sourceResult.output };
      }
    }
    
    // Execute node
    const nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId);
    results[node.id] = nodeResult;
    
    // Execute child nodes
    const outgoingEdges = edges.filter(edge => edge.source === node.id);
    const childPromises = [];
    
    for (const edge of outgoingEdges) {
      const childNode = allNodes.find(n => n.id === edge.target);
      if (childNode) {
        childPromises.push(this.executeNodeWithDependencies(childNode, allNodes, edges, triggerData, results, executionId));
      }
    }
    
    await Promise.all(childPromises);
  }
  
  async executeNode(node, input, triggerData, executionId) {
    const startTime = Date.now();
    const nodeDefinition = nodeRegistry.getNode(node.type);
    
    if (!nodeDefinition) {
      throw new Error(`Unknown node type: ${node.type}`);
    }
    
    console.log(`  🔧 [NODE] Executing: ${nodeDefinition.name} (${node.id})`);
    
    // Prepare context for node execution
    const context = {
      nodeInput: input,
      triggerData: triggerData,
      nodeOutput: null,
      executionId: executionId,
      config: node.config || {}
    };
    
    try {
      // Execute node with timeout
      const executionPromise = nodeDefinition.execute(node, context);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Node execution timeout after ${this.executionTimeout}ms`)), this.executionTimeout);
      });
      
      const result = await Promise.race([executionPromise, timeoutPromise]);
      const executionTime = Date.now() - startTime;
      
      // Log node execution
      await supabase
        .from('automation_runs')
        .insert({
          id: uuidv4(),
          automation_id: executionId,
          user_id: triggerData.userId || 'system',
          status: 'completed',
          results: [{
            node_id: node.id,
            node_type: node.type,
            node_name: nodeDefinition.name,
            input: input,
            output: result.output,
            execution_time: executionTime
          }],
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString()
        })
        .catch(err => console.warn('Failed to log node execution:', err.message));
      
      return {
        nodeId: node.id,
        nodeType: node.type,
        nodeName: nodeDefinition.name,
        output: result.output,
        next: result.next,
        executionTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error(`Node execution failed:`, error);
      
      await supabase
        .from('automation_runs')
        .insert({
          id: uuidv4(),
          automation_id: executionId,
          user_id: triggerData.userId || 'system',
          status: 'failed',
          results: [{
            node_id: node.id,
            node_type: node.type,
            node_name: nodeDefinition.name,
            input: input,
            error: error.message,
            execution_time: executionTime
          }],
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString()
        })
        .catch(err => console.warn('Failed to log node error:', err.message));
      
      throw new Error(`Node ${nodeDefinition.name} (${node.id}) failed: ${error.message}`);
    }
  }
  
  waitForResult(nodeId, results) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (results[nodeId]) {
          clearInterval(checkInterval);
          resolve(results[nodeId]);
        }
      }, 100);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 30000);
    });
  }
  
  getExecutionStatus(executionId) {
    return this.activeExecutions.get(executionId);
  }
  
  async cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      execution.status = 'cancelled';
      this.activeExecutions.delete(executionId);
      
      await supabase
        .from('workflow_executions')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('id', executionId);
      
      return true;
    }
    return false;
  }
}

module.exports = new WorkflowExecutor();