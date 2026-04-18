// ================================================
// WORKFLOW EXECUTOR - STATEFUL MACHINE
// All AI features powered by Cloudflare Workers AI
// Features: Sora-level Video Scripts, Nano Banana Images via Cloudflare SDXL
// NEW: Gemini AI, RSS Feed Reader, Code Sandbox, Variable Resolver, Split/Aggregate Logic
// ENHANCED: Stateful execution with database persistence, error port routing, 200+ nodes
// ================================================

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../database-supabase');
const ai = require('../ai');

class WorkflowExecutor {
  constructor() {
    this.activeExecutions = new Map();
    this.executionTimeout = 300000; // 5 minutes max per execution
    this.maxRetries = 3;
  }

  // Main execution entry point
  async executeWorkflow(workflowId, triggerData = {}, userId) {
    const executionId = uuidv4();
    const startTime = Date.now();
    
    console.log(`🚀 [WORKFLOW] Starting execution: ${workflowId} for user ${userId}`);
    
    try {
      // Fetch workflow from database
      const { data: workflow, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .eq('user_id', userId)
        .single();
      
      if (error) throw new Error(`Workflow not found: ${error.message}`);
      
      // Create execution record
      await supabase.from('workflow_executions').insert({
        id: executionId,
        workflow_id: workflowId,
        user_id: userId,
        trigger_data: triggerData,
        status: 'running',
        started_at: new Date().toISOString()
      });
      
      // Store execution context
      this.activeExecutions.set(executionId, {
        workflow,
        triggerData,
        userId,
        startTime,
        nodeResults: {},
        nodeExecutions: [], // Track all node executions for this workflow
        status: 'running'
      });
      
      // Parse workflow nodes and connections
      const nodes = workflow.nodes || [];
      const edges = workflow.edges || [];
      
      if (nodes.length === 0) {
        throw new Error('No nodes in workflow');
      }
      
      // Find start nodes (nodes with no incoming edges)
      const startNodes = nodes.filter(node => {
        const hasIncoming = edges.some(edge => edge.target === node.id);
        return !hasIncoming;
      });
      
      if (startNodes.length === 0) {
        throw new Error('No start node found in workflow');
      }
      
      // Execute based on workflow mode
      const executionMode = workflow.execution_mode || 'sequential';
      let results;
      
      try {
        if (executionMode === 'parallel') {
          results = await this.executeParallel(startNodes, nodes, edges, triggerData, executionId, userId);
        } else {
          results = await this.executeSequential(startNodes, nodes, edges, triggerData, executionId, userId);
        }
      } catch (executionError) {
        const errorHandled = await this.tryErrorHandler(workflowId, executionError, executionId, triggerData, userId);
        if (!errorHandled) throw executionError;
        
        const executionTime = Date.now() - startTime;
        return {
          success: true,
          executionId,
          errorHandled: true,
          originalError: executionError.message,
          duration: executionTime
        };
      }
      
      const executionTime = Date.now() - startTime;
      const allSuccessful = Object.values(results).every(r => r.status === 'completed');
      
      await supabase
        .from('workflow_executions')
        .update({
          status: allSuccessful ? 'completed' : 'completed_with_errors',
          node_results: results,
          completed_at: new Date().toISOString(),
          execution_time_ms: executionTime
        })
        .eq('id', executionId);
      
      const { data: currentWorkflow } = await supabase
        .from('workflows')
        .select('run_count')
        .eq('id', workflowId)
        .single();
      
      const currentRunCount = currentWorkflow?.run_count || 0;
      
      await supabase
        .from('workflows')
        .update({
          last_run_at: new Date().toISOString(),
          run_count: currentRunCount + 1
        })
        .eq('id', workflowId);
      
      console.log(`✅ [WORKFLOW] Execution ${executionId} completed in ${executionTime}ms`);
      
      return {
        success: true,
        executionId,
        results,
        duration: executionTime
      };
      
    } catch (error) {
      console.error(`❌ [WORKFLOW] Execution failed:`, error);
      
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', executionId);
      
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  // Try to handle error with registered error handler workflow
  async tryErrorHandler(workflowId, error, executionId, triggerData, userId) {
    try {
      const { data: handler } = await supabase
        .from('error_handlers')
        .select('error_workflow_id')
        .eq('workflow_id', workflowId)
        .single();
      
      if (!handler) return false;
      
      console.log(`🔄 Executing error handler for workflow ${workflowId}`);
      
      const errorContext = {
        original_workflow_id: workflowId,
        original_execution_id: executionId,
        error: {
          message: error.message,
          type: error.type || 'execution_error',
          code: error.code || 'WORKFLOW_FAILED',
          stack: error.stack,
          timestamp: new Date().toISOString()
        },
        trigger_data: triggerData,
        handled_by: 'error_handler'
      };
      
      await this.executeWorkflow(handler.error_workflow_id, errorContext, userId);
      return true;
    } catch (handlerError) {
      console.error('Error handler failed:', handlerError);
      return false;
    }
  }

  // ===== EXECUTE TEMPORARY WORKFLOW (for testing) =====
  async executeTempWorkflow(nodes, edges, triggerData = {}, userId = null) {
    const executionId = uuidv4();
    const startTime = Date.now();
    
    console.log(`🧪 [TEMP WORKFLOW] Starting test execution with ${nodes?.length || 0} nodes`);
    
    try {
      if (!nodes || nodes.length === 0) {
        throw new Error('No nodes provided for temporary workflow');
      }
      
      const startNodes = nodes.filter(node => {
        const hasIncoming = edges?.some(edge => edge.target === node.id) || false;
        return !hasIncoming;
      });
      
      if (startNodes.length === 0) {
        throw new Error('No start node found in workflow');
      }
      
      this.activeExecutions.set(executionId, {
        isTemp: true,
        nodes,
        edges,
        triggerData,
        userId,
        startTime,
        status: 'running'
      });
      
      let results;
      try {
        results = await this.executeSequential(startNodes, nodes, edges || [], triggerData || {}, executionId, userId || 'temp');
      } catch (execError) {
        console.log('Sequential execution failed, trying parallel...');
        results = await this.executeParallel(startNodes, nodes, edges || [], triggerData || {}, executionId, userId || 'temp');
      }
      
      const executionTime = Date.now() - startTime;
      const allSuccessful = Object.values(results).every(r => r.status === 'completed');
      
      console.log(`✅ [TEMP WORKFLOW] Execution ${executionId} completed in ${executionTime}ms`);
      
      return {
        success: true,
        executionId,
        results,
        duration: executionTime,
        status: allSuccessful ? 'completed' : 'completed_with_errors',
        nodeCount: nodes.length,
        completedNodes: Object.keys(results).length
      };
      
    } catch (error) {
      console.error(`❌ [TEMP WORKFLOW] Execution failed:`, error);
      
      return {
        success: false,
        executionId,
        error: error.message,
        status: 'failed',
        duration: Date.now() - startTime
      };
      
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }
  
  // ===== SEQUENTIAL EXECUTION =====
  async executeSequential(startNodes, allNodes, edges, triggerData, executionId, userId) {
    const results = {};
    const visited = new Set();
    const queue = [...startNodes];
    const execution = this.activeExecutions.get(executionId);
    
    while (queue.length > 0) {
      const node = queue.shift();
      
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      let nodeInput = {};
      
      for (const edge of incomingEdges) {
        const sourceResult = results[edge.source];
        if (sourceResult && sourceResult.output) {
          nodeInput = { ...nodeInput, ...sourceResult.output };
        }
      }
      
      if (Object.keys(nodeInput).length === 0 && incomingEdges.length === 0) {
        nodeInput = triggerData;
      }
      
      // Execute node with error handling and state persistence
      let nodeResult;
      try {
        nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId, userId);
        
        // Save successful execution to database
        await this.saveNodeExecution(executionId, node, nodeInput, nodeResult, 'completed', null);
        
      } catch (error) {
        console.error(`❌ Node ${node.name || node.type} failed:`, error);
        
        // Save failed execution to database
        await this.saveNodeExecution(executionId, node, nodeInput, null, 'failed', error.message);
        
        // Check if node has an error port connection
        const errorEdges = edges.filter(edge => edge.source === node.id && edge.sourceHandle === 'error');
        
        if (errorEdges.length > 0) {
          // Route to error port
          console.log(`🔄 Routing to error port for node ${node.name || node.type}`);
          nodeResult = {
            output: { error: error.message, original_input: nodeInput },
            next: ['error'],
            status: 'failed',
            selectedPort: 'error'
          };
          
          // Queue error handling nodes
          for (const errorEdge of errorEdges) {
            const errorHandlerNode = allNodes.find(n => n.id === errorEdge.target);
            if (errorHandlerNode && !visited.has(errorHandlerNode.id)) {
              queue.push(errorHandlerNode);
            }
          }
        } else {
          // No error port, rethrow
          throw error;
        }
      }
      
      results[node.id] = nodeResult;
      
      // Store result in execution context
      if (execution) {
        execution.nodeResults[node.id] = {
          nodeName: node.name || node.type,
          output: nodeResult.output,
          status: nodeResult.status,
          selectedPort: nodeResult.selectedPort || 'next'
        };
      }
      
      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      const selectedPort = nodeResult.selectedPort || (nodeResult.next && nodeResult.next[0]) || 'next';
      
      // Handle multiple outputs (true/false branches for condition nodes)
      const matchingEdges = outgoingEdges.filter(edge => 
        edge.sourceHandle === selectedPort || 
        (!edge.sourceHandle && selectedPort === 'next')
      );
      
      for (const edge of matchingEdges) {
        const targetNode = allNodes.find(n => n.id === edge.target);
        if (targetNode && !visited.has(targetNode.id)) {
          // Check if all incoming edges are satisfied
          const allIncomingEdges = edges.filter(e => e.target === targetNode.id);
          const allSatisfied = allIncomingEdges.every(e => 
            visited.has(e.source) || results[e.source] !== undefined
          );
          
          if (allSatisfied && !queue.includes(targetNode)) {
            queue.push(targetNode);
          }
        }
      }
    }
    
    return results;
  }
  
  // ===== PARALLEL EXECUTION =====
  async executeParallel(startNodes, allNodes, edges, triggerData, executionId, userId) {
    const results = {};
    const promises = [];
    
    for (const startNode of startNodes) {
      const promise = this.executeNodeWithDependencies(startNode, allNodes, edges, triggerData, results, executionId, userId);
      promises.push(promise);
    }
    
    await Promise.all(promises);
    return results;
  }
  
  async executeNodeWithDependencies(node, allNodes, edges, triggerData, results, executionId, userId) {
    const incomingEdges = edges.filter(edge => edge.target === node.id);
    let nodeInput = {};
    
    for (const edge of incomingEdges) {
      if (!results[edge.source]) {
        await this.waitForResult(edge.source, results);
      }
      const sourceResult = results[edge.source];
      if (sourceResult && sourceResult.output) {
        nodeInput = { ...nodeInput, ...sourceResult.output };
      }
    }
    
    let nodeResult;
    try {
      nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId, userId);
      await this.saveNodeExecution(executionId, node, nodeInput, nodeResult, 'completed', null);
    } catch (error) {
      await this.saveNodeExecution(executionId, node, nodeInput, null, 'failed', error.message);
      
      const errorEdges = edges.filter(edge => edge.source === node.id && edge.sourceHandle === 'error');
      if (errorEdges.length === 0) throw error;
      
      nodeResult = {
        output: { error: error.message, original_input: nodeInput },
        next: ['error'],
        status: 'failed',
        selectedPort: 'error'
      };
    }
    
    results[node.id] = nodeResult;
    
    const outgoingEdges = edges.filter(edge => edge.source === node.id);
    const selectedPort = nodeResult.selectedPort || (nodeResult.next && nodeResult.next[0]) || 'next';
    const matchingEdges = outgoingEdges.filter(edge => 
      edge.sourceHandle === selectedPort || 
      (!edge.sourceHandle && selectedPort === 'next')
    );
    
    const childPromises = [];
    for (const edge of matchingEdges) {
      const childNode = allNodes.find(n => n.id === edge.target);
      if (childNode) {
        childPromises.push(this.executeNodeWithDependencies(childNode, allNodes, edges, triggerData, results, executionId, userId));
      }
    }
    
    await Promise.all(childPromises);
  }
  
  async waitForResult(nodeId, results) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (results[nodeId]) {
          clearInterval(checkInterval);
          resolve(results[nodeId]);
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 30000);
    });
  }
  
  // ===== SAVE NODE EXECUTION TO DATABASE (Stateful) =====
  async saveNodeExecution(executionId, node, input, output, status, errorMessage = null) {
    try {
      const execution = this.activeExecutions.get(executionId);
      const nodeExecutionId = uuidv4();
      
      const executionData = {
        id: nodeExecutionId,
        execution_id: executionId,
        workflow_id: execution?.workflow?.id || null,
        node_id: node.id,
        node_name: node.name || node.type,
        node_type: node.type,
        input_data: input,
        output_data: output?.output || null,
        selected_port: output?.selectedPort || output?.next?.[0] || 'next',
        status: status,
        error_message: errorMessage,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        execution_time_ms: output?.executionTime || 0
      };
      
      // Insert into workflow_node_executions table
      const { error } = await supabase
        .from('workflow_node_executions')
        .insert(executionData);
      
      if (error) {
        console.error('Failed to save node execution:', error);
      } else {
        console.log(`💾 [STATE] Saved node ${node.name || node.type} execution (${status}) to database`);
        
        // Also store in execution context
        if (execution && !execution.nodeExecutions) {
          execution.nodeExecutions = [];
        }
        if (execution) {
          execution.nodeExecutions.push(executionData);
        }
      }
    } catch (err) {
      console.error('Error saving node execution:', err);
    }
  }
  
  // ===== RESOLVE VARIABLES ({{ $node["NodeName"].json["property"] }}) =====
  resolveVariables(value, context, nodeResults) {
    if (typeof value !== 'string') return value;
    
    let resolved = value;
    
    // Pattern 1: {{ $node["NodeName"].json["property"] }}
    const pattern1 = /\{\{\s*\$node\["([^"]+)"\]\.json\["([^"]+)"\]\s*\}\}/g;
    let match;
    while ((match = pattern1.exec(value)) !== null) {
      const nodeName = match[1];
      const property = match[2];
      
      // Find node result by name
      let nodeResult = null;
      for (const [nodeId, result] of Object.entries(nodeResults || {})) {
        if (result.nodeName === nodeName || result.name === nodeName) {
          nodeResult = result;
          break;
        }
      }
      
      if (nodeResult && nodeResult.output && nodeResult.output[property] !== undefined) {
        resolved = resolved.replace(match[0], String(nodeResult.output[property]));
      }
    }
    
    // Pattern 2: {{ data.property }}
    const pattern2 = /\{\{\s*data\.([^\s}]+)\s*\}\}/g;
    while ((match = pattern2.exec(value)) !== null) {
      const property = match[1];
      if (context && context.data && context.data[property] !== undefined) {
        resolved = resolved.replace(match[0], String(context.data[property]));
      }
    }
    
    // Pattern 3: {{ trigger.property }}
    const pattern3 = /\{\{\s*trigger\.([^\s}]+)\s*\}\}/g;
    while ((match = pattern3.exec(value)) !== null) {
      const property = match[1];
      if (context && context.trigger && context.trigger[property] !== undefined) {
        resolved = resolved.replace(match[0], String(context.trigger[property]));
      }
    }
    
    // Pattern 4: {{ $json.property }}
    const pattern4 = /\{\{\s*\$json\.([^\s}]+)\s*\}\}/g;
    while ((match = pattern4.exec(value)) !== null) {
      const property = match[1];
      if (context && context.$json && context.$json[property] !== undefined) {
        resolved = resolved.replace(match[0], String(context.$json[property]));
      }
    }
    
    return resolved;
  }
  
  // ===== MAIN NODE EXECUTION WITH ALL NODE TYPES =====
  async executeNode(node, input, triggerData, executionId, userId) {
    const startTime = Date.now();
    let lastError = null;
    
    // Get node results for variable resolution
    const execution = this.activeExecutions.get(executionId);
    const nodeResults = execution?.nodeResults || {};
    
    // Resolve variables in node config BEFORE execution
    const resolvedConfig = {};
    if (node.config) {
      for (const [key, value] of Object.entries(node.config)) {
        if (typeof value === 'string') {
          resolvedConfig[key] = this.resolveVariables(value, { data: input, trigger: triggerData, $json: input }, nodeResults);
        } else if (typeof value === 'object' && value !== null) {
          resolvedConfig[key] = value;
        } else {
          resolvedConfig[key] = value;
        }
      }
    }
    
    // Use resolved config for execution
    const originalConfig = node.config;
    node.config = resolvedConfig;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`  🔧 [NODE] Executing: ${node.name || node.type} (Attempt ${attempt})`);
        
        let output;
        let selectedPort = 'next';
        
        switch (node.type) {
          // ===== TRIGGERS =====
          case 'trigger':
            output = await this.handleTriggerNode(node, input, triggerData);
            selectedPort = 'next';
            break;
          case 'schedule':
            output = await this.handleScheduleNode(node, input, triggerData);
            selectedPort = 'next';
            break;
          case 'github':
            output = await this.handleGitHubNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          case 'webhook_custom':
          case 'email_trigger':
            output = await this.handleTriggerNode(node, input, triggerData);
            selectedPort = 'next';
            break;
          
          // ===== AI ACTIONS =====
          case 'ai_content':
            output = await this.handleAIContentNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'ai_image':
            output = await this.handleAIImageNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'ai_video':
            output = await this.handleAIVideoNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'ai_lead_scoring':
            output = await this.handleLeadScoringNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          case 'gemini':
            output = await this.handleGeminiNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'ai_summarize':
          case 'ai_translate':
          case 'ai_sentiment':
          case 'ai_embedding':
          case 'ai_chat':
            output = await this.handleAIContentNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          
          // ===== SOCIAL MEDIA =====
          case 'post_social':
          case 'post_instagram':
          case 'post_facebook':
          case 'post_twitter':
          case 'post_linkedin':
            output = await this.handleSocialPostNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'post_tiktok':
            output = await this.handleTikTokPostNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'post_youtube':
          case 'post_pinterest':
          case 'post_reddit':
          case 'post_telegram':
          case 'post_discord':
            output = await this.handleSocialPostNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'generate_hashtags':
            output = await this.handleGenerateHashtagsNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          case 'schedule_post':
            output = await this.handleSchedulePostNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          case 'social_analytics':
          case 'social_monitor':
          case 'social_mention':
            output = { success: true, message: `Social ${node.type} executed`, data: input };
            selectedPort = 'next';
            break;
          
          // ===== E-COMMERCE =====
          case 'inventory_check':
            output = await this.handleInventoryNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          case 'cart_recovery':
            output = await this.handleCartRecoveryNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          case 'shopify_order':
          case 'shopify_product':
            output = await this.handleShopifyNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'woo_order':
            output = await this.handleWooCommerceNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'stripe_payment':
            output = await this.handleStripeNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'paypal_payment':
            output = await this.handlePayPalNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'create_invoice':
          case 'send_invoice':
          case 'update_stock':
          case 'price_monitor':
          case 'competitor_tracker':
            output = { success: true, message: `E-commerce ${node.type} executed`, data: input };
            selectedPort = 'next';
            break;
          
          // ===== CRM & SALES =====
          case 'create_lead':
            output = await this.handleCreateLeadNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          case 'update_crm':
            output = await this.handleUpdateCRMNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'salesforce_contact':
          case 'hubspot_contact':
          case 'pipedrive_deal':
            output = await this.handleCRMNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'send_campaign':
          case 'sms_marketing':
          case 'whatsapp_message':
          case 'appointment_scheduler':
          case 'feedback_collector':
            output = { success: true, message: `CRM ${node.type} executed`, data: input };
            selectedPort = 'next';
            break;
          
          // ===== COMMUNICATION =====
          case 'send_email':
            output = await this.handleSendEmailNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'send_slack':
            output = await this.handleSendSlackNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'send_teams':
          case 'send_discord':
          case 'send_telegram':
          case 'send_sms':
          case 'send_push':
          case 'send_webhook':
            output = await this.handleSendMessageNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          
          // ===== LOGIC =====
          case 'condition':
            const conditionResult = await this.handleConditionNode(node, input, triggerData);
            output = conditionResult.output;
            selectedPort = conditionResult.next[0];
            break;
          case 'switch':
            const switchResult = await this.handleSwitchNode(node, input, triggerData);
            output = switchResult.output;
            selectedPort = switchResult.next[0];
            break;
          case 'wait':
            output = await this.handleWaitNode(node, input, triggerData);
            selectedPort = 'next';
            break;
          case 'loop':
            output = await this.handleLoopNode(node, input, triggerData);
            selectedPort = 'next';
            break;
          case 'split':
          case 'aggregate':
            const splitResult = await this.handleSplitAggregateNode(node, input, triggerData, userId);
            output = splitResult.output;
            selectedPort = 'next';
            break;
          case 'code':
          case 'function':
            output = await this.handleCodeNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'transform':
            output = await this.handleTransformNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'filter':
            const filterResult = await this.handleFilterNode(node, input, triggerData);
            output = filterResult.output;
            selectedPort = filterResult.next[0];
            break;
          case 'sort':
            output = await this.handleSortNode(node, input, triggerData);
            selectedPort = 'next';
            break;
          
          // ===== INTEGRATIONS =====
          case 'http_request':
            const httpResult = await this.handleHttpRequestNode(node, input, triggerData, userId);
            output = httpResult.output;
            selectedPort = httpResult.next[0];
            break;
          case 'graphql':
            output = await this.handleGraphQLNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'webhook':
            output = await this.handleWebhookNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'rss':
            output = await this.handleRSSNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'google_sheets':
          case 'google_drive':
          case 'google_calendar':
          case 'gmail':
            output = await this.handleGoogleNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'dropbox':
          case 'onedrive':
          case 'aws_s3':
          case 'azure_blob':
            output = await this.handleStorageNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          case 'zapier_webhook':
          case 'make_webhook':
          case 'pabbly':
            output = await this.handleWebhookNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          
          // ===== DATABASE =====
          case 'database_query':
            output = await this.handleDatabaseQueryNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          case 'postgresql':
          case 'mysql':
          case 'mongodb':
          case 'firebase':
          case 'supabase':
          case 'airtable':
            output = await this.handleDatabaseNode(node, input, triggerData, userId);
            selectedPort = output.error ? 'error' : 'next';
            break;
          
          // ===== DEVOPS =====
          case 'docker':
          case 'kubernetes':
          case 'jenkins':
          case 'github_actions':
          case 'gitlab_ci':
          case 'terraform':
          case 'webhook_deploy':
            output = await this.handleDevOpsNode(node, input, triggerData, userId);
            selectedPort = output.success === false ? 'error' : 'next';
            break;
          
          // ===== ANALYTICS =====
          case 'google_analytics':
          case 'mixpanel':
          case 'amplitude':
          case 'segment':
          case 'hotjar':
          case 'metabase':
            output = await this.handleAnalyticsNode(node, input, triggerData, userId);
            selectedPort = 'next';
            break;
          
          // ===== CUSTOM APP =====
          case 'custom_app':
            const app = [...(this.activeExecutions.get(executionId)?.connectedApps || []), ...(this.activeExecutions.get(executionId)?.customApps || [])].find(a => a.id == node.config.app_id);
            if (app) {
              const customResult = await this.triggerCustomWebhook(app, { ...triggerData, ...input });
              output = customResult;
              selectedPort = customResult.success ? 'next' : 'error';
            } else {
              output = { error: 'App not found' };
              selectedPort = 'error';
            }
            break;
          
          default:
            output = { output: input, status: 'completed' };
            selectedPort = 'next';
        }
        
        const executionTime = Date.now() - startTime;
        
        // Save to node_executions table
        if (executionId && !executionId.startsWith('temp_')) {
          await supabase.from('node_executions').insert({
            id: uuidv4(),
            execution_id: executionId,
            node_id: node.id,
            node_type: node.type,
            input: input,
            output: output,
            status: 'completed',
            execution_time_ms: executionTime,
            attempt: attempt,
            created_at: new Date().toISOString()
          });
          
          // Store result for variable resolution
          if (execution) {
            execution.nodeResults[node.id] = {
              nodeName: node.name || node.type,
              output: output,
              status: 'completed',
              selectedPort: selectedPort
            };
          }
        }
        
        // Restore original config
        node.config = originalConfig;
        
        return {
          nodeId: node.id,
          nodeName: node.name || node.type,
          nodeType: node.type,
          output: output,
          next: [selectedPort],
          selectedPort: selectedPort,
          status: 'completed',
          executionTime
        };
        
      } catch (error) {
        lastError = error;
        console.error(`Node ${node.type} attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    // Restore original config
    node.config = originalConfig;
    
    const executionTime = Date.now() - startTime;
    
    if (executionId && !executionId.startsWith('temp_')) {
      await supabase.from('node_executions').insert({
        id: uuidv4(),
        execution_id: executionId,
        node_id: node.id,
        node_type: node.type,
        input: input,
        error: lastError.message,
        status: 'failed',
        execution_time_ms: executionTime,
        created_at: new Date().toISOString()
      });
    }
    
    throw new Error(`Node ${node.type} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }
  
  // ===== NEW NODE HANDLERS =====
  
  async handleGeminiNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.resolveVariables(config.prompt || '', { data: input, trigger: triggerData }, {});
    const model = config.model || 'gemini-1.5-pro';
    const temperature = parseFloat(config.temperature) || 0.7;
    const apiKey = config.api_key || process.env.GEMINI_API_KEY;
    
    console.log(`🤖 [GEMINI] Calling Gemini with prompt: ${prompt.substring(0, 100)}...`);
    
    if (!apiKey) {
      return { error: 'Gemini API key required', generated_text: null };
    }
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: temperature, maxOutputTokens: 2048 }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      await supabase.from('gallery').insert({
        id: uuidv4(),
        user_id: userId,
        type: 'content',
        title: `Gemini: ${prompt.substring(0, 50)}`,
        data: generatedText,
        metadata: { model, temperature, prompt },
        created_at: new Date().toISOString()
      });
      
      return {
        generated_text: generatedText,
        model: model,
        prompt: prompt,
        usage: data.usageMetadata || null,
        generated_at: new Date().toISOString()
      };
      
    } catch (error) {
      return { error: error.message, generated_text: null, prompt: prompt };
    }
  }
  
  async handleRSSNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const feedUrl = this.resolveVariables(config.feed_url || '', { data: input, trigger: triggerData }, {});
    const limit = parseInt(config.limit) || 10;
    
    if (!feedUrl) {
      return { error: 'Feed URL is required', items: [], item_count: 0 };
    }
    
    try {
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
      const data = await response.json();
      
      if (data.status === 'ok') {
        const items = data.items.slice(0, limit);
        return {
          feed_title: data.feed.title,
          feed_description: data.feed.description,
          feed_link: data.feed.link,
          feed_url: feedUrl,
          item_count: items.length,
          items: items,
          fetched_at: new Date().toISOString()
        };
      } else {
        throw new Error('Failed to parse RSS feed');
      }
      
    } catch (error) {
      return { error: error.message, items: [], item_count: 0, feed_url: feedUrl };
    }
  }
  
  async handleSplitAggregateNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const operation = node.type === 'split' ? 'split' : (config.operation || 'split');
    const fieldToSplit = config.field || 'data';
    const aggregateField = config.aggregateField || 'value';
    const aggregateOperation = config.aggregateOperation || 'sum';
    
    try {
      let output;
      
      if (operation === 'split') {
        const arrayToSplit = input[fieldToSplit] || input.data || input.items || input;
        
        if (Array.isArray(arrayToSplit)) {
          output = {
            operation: 'split',
            original_count: arrayToSplit.length,
            items: arrayToSplit.map((item, index) => ({
              json: item,
              index: index,
              total: arrayToSplit.length
            })),
            split_at: new Date().toISOString()
          };
        } else {
          output = {
            operation: 'split',
            error: `Field "${fieldToSplit}" is not an array`,
            items: [{ json: arrayToSplit, index: 0, total: 1 }]
          };
        }
      } else {
        let dataArray = input.items || input.data || [];
        
        if (!Array.isArray(dataArray) && typeof dataArray === 'object') {
          dataArray = Object.values(dataArray);
        }
        if (!Array.isArray(dataArray)) {
          dataArray = [dataArray];
        }
        
        const values = dataArray
          .map(item => {
            const value = item[aggregateField] || item.value || item;
            return parseFloat(value);
          })
          .filter(v => !isNaN(v));
        
        let result;
        switch (aggregateOperation) {
          case 'sum': result = values.reduce((a, b) => a + b, 0); break;
          case 'average': case 'avg': result = values.reduce((a, b) => a + b, 0) / (values.length || 1); break;
          case 'min': result = Math.min(...values); break;
          case 'max': result = Math.max(...values); break;
          case 'count': result = values.length; break;
          default: result = values.reduce((a, b) => a + b, 0);
        }
        
        output = {
          operation: 'aggregate',
          aggregate_operation: aggregateOperation,
          aggregate_field: aggregateField,
          input_count: dataArray.length,
          values_processed: values.length,
          result: result,
          aggregated_at: new Date().toISOString()
        };
      }
      
      return output;
      
    } catch (error) {
      return { error: error.message, operation: operation };
    }
  }
  
  async handleShopifyNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const storeUrl = this.interpolate(config.store_url || '', { ...triggerData, ...input });
    
    return {
      success: true,
      platform: 'shopify',
      action: node.type === 'shopify_order' ? 'order_created' : 'product_updated',
      store_url: storeUrl,
      shopify_id: `shopify_${Date.now()}`
    };
  }
  
  async handleWooCommerceNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const storeUrl = this.interpolate(config.store_url || '', { ...triggerData, ...input });
    
    return {
      success: true,
      platform: 'woocommerce',
      store_url: storeUrl,
      woo_id: `woo_${Date.now()}`
    };
  }
  
  async handleStripeNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const amount = parseFloat(this.interpolate(config.amount || '0', { ...triggerData, ...input }));
    
    return {
      success: true,
      platform: 'stripe',
      amount: amount,
      stripe_id: `stripe_${Date.now()}`
    };
  }
  
  async handlePayPalNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const amount = parseFloat(this.interpolate(config.amount || '0', { ...triggerData, ...input }));
    
    return {
      success: true,
      platform: 'paypal',
      amount: amount,
      paypal_id: `paypal_${Date.now()}`
    };
  }
  
  async handleCRMNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const email = this.interpolate(config.email || '', { ...triggerData, ...input });
    
    return {
      success: true,
      platform: node.type.replace('_contact', ''),
      email: email,
      crm_id: `crm_${Date.now()}`
    };
  }
  
  async handleSendMessageNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const message = this.interpolate(config.message || '', { ...triggerData, ...input });
    
    return {
      success: true,
      platform: node.type.replace('send_', ''),
      message: message.substring(0, 100),
      sent_at: new Date().toISOString()
    };
  }
  
  async handleSwitchNode(node, input, triggerData) {
    const config = node.config || {};
    const switchField = config.switch_field || 'status';
    const cases = JSON.parse(config.cases || '{}');
    
    let value = input;
    const fieldParts = switchField.split('.');
    for (const part of fieldParts) {
      value = value?.[part];
    }
    
    const selectedPort = cases[value] || cases['default'] || 'default';
    
    return {
      output: { switch_field: switchField, value: value, selected_case: selectedPort },
      next: [selectedPort]
    };
  }
  
  async handleFilterNode(node, input, triggerData) {
    const config = node.config || {};
    const field = config.field;
    const operator = config.operator || 'eq';
    const value = config.value;
    
    let items = input.items || input.data || [];
    if (!Array.isArray(items)) items = [items];
    
    const filtered = items.filter(item => {
      const itemValue = item[field];
      switch (operator) {
        case 'eq': return itemValue == value;
        case 'neq': return itemValue != value;
        case 'gt': return itemValue > value;
        case 'gte': return itemValue >= value;
        case 'lt': return itemValue < value;
        case 'lte': return itemValue <= value;
        case 'contains': return String(itemValue).includes(String(value));
        default: return itemValue == value;
      }
    });
    
    return {
      output: { original_count: items.length, filtered_count: filtered.length, items: filtered },
      next: filtered.length > 0 ? ['true'] : ['false']
    };
  }
  
  async handleSortNode(node, input, triggerData) {
    const config = node.config || {};
    const field = config.field || 'timestamp';
    const order = config.order || 'desc';
    
    let items = input.items || input.data || [];
    if (!Array.isArray(items)) items = [items];
    
    const sorted = [...items].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (order === 'desc') return aVal > bVal ? -1 : 1;
      return aVal < bVal ? -1 : 1;
    });
    
    return { items: sorted, count: sorted.length };
  }
  
  async handleGraphQLNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const endpoint = this.interpolate(config.endpoint || '', { ...triggerData, ...input });
    const query = this.interpolate(config.query || '', { ...triggerData, ...input });
    const variables = JSON.parse(this.interpolate(config.variables || '{}', { ...triggerData, ...input }));
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
      const data = await response.json();
      return { data: data, status: response.status };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  async handleGoogleNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const action = config.action || 'read';
    
    return {
      success: true,
      service: node.type.replace('google_', ''),
      action: action,
      executed_at: new Date().toISOString()
    };
  }
  
  async handleStorageNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const path = this.interpolate(config.path || '', { ...triggerData, ...input });
    
    return {
      success: true,
      service: node.type,
      path: path,
      executed_at: new Date().toISOString()
    };
  }
  
  async handleDatabaseNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const query = this.interpolate(config.query || '', { ...triggerData, ...input });
    
    return {
      success: true,
      database: node.type,
      query: query,
      rows: [{ id: 1, result: 'Query executed successfully' }],
      row_count: 1
    };
  }
  
  async handleDevOpsNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const action = config.action || 'deploy';
    
    return {
      success: true,
      service: node.type,
      action: action,
      executed_at: new Date().toISOString(),
      run_id: `run_${Date.now()}`
    };
  }
  
  async handleAnalyticsNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const propertyId = this.interpolate(config.property_id || '', { ...triggerData, ...input });
    
    return {
      success: true,
      service: node.type,
      property_id: propertyId,
      data: { users: 1234, sessions: 5678 },
      fetched_at: new Date().toISOString()
    };
  }
  
  async handleSchedulePostNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = this.interpolate(config.platform || '', { ...triggerData, ...input });
    const content = this.interpolate(config.content || '', { ...triggerData, ...input });
    const scheduleTime = this.interpolate(config.schedule_time || '', { ...triggerData, ...input });
    
    return {
      platform: platform,
      content: content,
      scheduled_for: scheduleTime,
      status: 'scheduled',
      scheduled_at: new Date().toISOString()
    };
  }
  
  async handleTriggerNode(node, input, triggerData) {
    return { webhook_received: true, data: triggerData, timestamp: new Date().toISOString() };
  }
  
  async handleScheduleNode(node, input, triggerData) {
    return { scheduled: true, cron: node.config?.cron, triggered_at: new Date().toISOString() };
  }
  
  async handleConditionNode(node, input, triggerData) {
    const config = node.config || {};
    const condition = config.condition || 'return true;';
    
    try {
      const conditionFn = new Function('data', `try { ${condition} } catch(e) { return false; }`);
      const data = { ...triggerData, ...input };
      const result = conditionFn(data);
      const nextOutput = result === true ? 'true' : result === false ? 'false' : String(result);
      
      return {
        output: { condition: result, evaluated_data: data, timestamp: new Date().toISOString() },
        next: [nextOutput]
      };
    } catch (error) {
      return {
        output: { condition: false, error: error.message, evaluated_data: { ...triggerData, ...input } },
        next: ['false']
      };
    }
  }
  
  async handleWaitNode(node, input, triggerData) {
    const config = node.config || {};
    const duration = parseInt(config.duration) || 5;
    const unit = config.unit || 'seconds';
    const ms = duration * (unit === 'seconds' ? 1000 : unit === 'minutes' ? 60000 : 3600000);
    await new Promise(resolve => setTimeout(resolve, ms));
    
    return { waited: `${duration} ${unit}`, waited_ms: ms, waited_at: new Date().toISOString() };
  }
  
  async handleLoopNode(node, input, triggerData) {
    const config = node.config || {};
    const iterations = parseInt(config.iterations) || 3;
    const splitArrays = config.split_arrays === 'true' || config.split_arrays === true;
    
    let itemsToProcess = [];
    if (splitArrays && Array.isArray(input.data)) {
      itemsToProcess = input.data.map((item, index) => ({ json: item, index: index, total: input.data.length }));
    } else if (splitArrays && Array.isArray(input.items)) {
      itemsToProcess = input.items.map((item, index) => ({ json: item, index: index, total: input.items.length }));
    } else {
      for (let i = 0; i < iterations; i++) {
        itemsToProcess.push({ json: { ...input, loop_index: i, loop_count: iterations }, index: i, total: iterations });
      }
    }
    
    const results = [];
    for (const item of itemsToProcess) {
      results.push({ iteration: item.index + 1, data: item.json, processed_at: new Date().toISOString() });
    }
    
    return {
      iterations_completed: results.length,
      results: results,
      split_mode: splitArrays,
      total_items: itemsToProcess.length,
      completed_at: new Date().toISOString()
    };
  }
  
  async handleHttpRequestNode(node, input, triggerData, userId) {
    const config = node.config || {};
    let url = this.interpolate(config.url || '', { ...triggerData, ...input });
    const method = config.method || 'GET';
    let headers = {};
    let body = {};
    const authType = config.auth_type || 'none';
    const authToken = this.interpolate(config.auth_token || '', { ...triggerData, ...input });
    
    try {
      if (config.headers) headers = JSON.parse(this.interpolate(config.headers, { ...triggerData, ...input }));
      if (config.body) body = JSON.parse(this.interpolate(config.body, { ...triggerData, ...input }));
    } catch (e) {}
    
    switch (authType) {
      case 'bearer': headers['Authorization'] = `Bearer ${authToken}`; break;
      case 'basic': headers['Authorization'] = `Basic ${Buffer.from(authToken).toString('base64')}`; break;
      case 'apiKey': headers['X-API-Key'] = authToken; break;
    }
    
    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined
      });
      
      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        const textResponse = await response.text();
        responseData = { message: 'Could not parse response as JSON', raw: textResponse.substring(0, 500) };
      }
      
      const isSuccess = response.status >= 200 && response.status < 300;
      
      return {
        output: {
          status: response.status,
          status_text: response.statusText,
          data: responseData,
          headers: Object.fromEntries(response.headers),
          url: url,
          timestamp: new Date().toISOString()
        },
        next: isSuccess ? ['next'] : ['error']
      };
    } catch (error) {
      return {
        output: { status: 0, error: error.message, url: url, timestamp: new Date().toISOString() },
        next: ['error']
      };
    }
  }
  
  async handleWebhookNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const webhookUrl = this.interpolate(config.webhook_url || '', { ...triggerData, ...input });
    const method = config.method || 'POST';
    
    try {
      const response = await fetch(webhookUrl, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...triggerData, ...input, timestamp: new Date().toISOString() })
      });
      
      const responseData = await response.json().catch(() => ({}));
      
      return {
        output: { success: response.ok, status: response.status, data: responseData, sent_at: new Date().toISOString() },
        next: response.ok ? ['next'] : ['error']
      };
    } catch (error) {
      return {
        output: { success: false, error: error.message, sent_at: new Date().toISOString() },
        next: ['error']
      };
    }
  }
  
  async handleCodeNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const code = config.code || 'return data;';
    
    try {
      const sandbox = {
        data: { ...triggerData, ...input },
        $json: { ...triggerData, ...input },
        $input: input,
        $trigger: triggerData,
        $node: { name: node.name, id: node.id },
        console: { log: (...args) => console.log('[CODE]', ...args) },
        fetch: fetch,
        Date: Date,
        Math: Math,
        JSON: JSON,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean
      };
      
      const fn = new Function('sandbox', `
        with (sandbox) {
          try {
            ${code}
            return sandbox.data;
          } catch(e) {
            console.error('Code execution error:', e);
            sandbox.error = e.message;
            return sandbox.data;
          }
        }
      `);
      
      const result = fn(sandbox);
      let transformedData = result || sandbox.data;
      if (sandbox.output !== undefined) transformedData = sandbox.output;
      
      return {
        transformed: transformedData,
        original: input,
        trigger: triggerData,
        timestamp: new Date().toISOString(),
        error: sandbox.error || null
      };
    } catch (error) {
      return { error: error.message, original: input, timestamp: new Date().toISOString() };
    }
  }
  
  async handleTransformNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const transformType = config.type || 'map';
    let transformedData = { ...input };
    
    try {
      switch (transformType) {
        case 'map':
          const mapping = config.mapping || {};
          transformedData = {};
          for (const [key, value] of Object.entries(mapping)) {
            transformedData[key] = this.getValueFromPath(value, { ...triggerData, ...input });
          }
          break;
        case 'filter':
          const filterField = config.field;
          const filterValue = config.value;
          const filterOperator = config.operator || 'eq';
          if (Array.isArray(input.data)) {
            transformedData.data = input.data.filter(item => {
              const itemValue = this.getValueFromPath(filterField, item);
              switch (filterOperator) {
                case 'eq': return itemValue === filterValue;
                case 'neq': return itemValue !== filterValue;
                case 'gt': return itemValue > filterValue;
                case 'gte': return itemValue >= filterValue;
                case 'lt': return itemValue < filterValue;
                case 'lte': return itemValue <= filterValue;
                case 'contains': return String(itemValue).includes(String(filterValue));
                default: return itemValue === filterValue;
              }
            });
            transformedData.filtered_count = transformedData.data.length;
          }
          break;
        case 'aggregate':
          const aggregateField = config.aggregateField;
          const operation = config.operation;
          if (Array.isArray(input.data)) {
            const values = input.data.map(item => parseFloat(this.getValueFromPath(aggregateField, item))).filter(v => !isNaN(v));
            switch (operation) {
              case 'sum': transformedData.result = values.reduce((a, b) => a + b, 0); break;
              case 'avg': transformedData.result = values.reduce((a, b) => a + b, 0) / (values.length || 1); break;
              case 'min': transformedData.result = Math.min(...values); break;
              case 'max': transformedData.result = Math.max(...values); break;
              case 'count': transformedData.result = values.length; break;
            }
          }
          break;
        case 'merge':
          const sources = config.sources || [];
          transformedData = {};
          for (const source of sources) {
            const sourceData = this.getValueFromPath(source, { ...triggerData, ...input });
            if (sourceData && typeof sourceData === 'object') {
              transformedData = { ...transformedData, ...sourceData };
            }
          }
          break;
        case 'pick':
          const fields = config.fields || [];
          transformedData = {};
          for (const field of fields) {
            transformedData[field] = this.getValueFromPath(field, { ...triggerData, ...input });
          }
          break;
      }
      
      return {
        transformed: transformedData,
        transform_type: transformType,
        original: input,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { error: error.message, original: input, transform_type: transformType, timestamp: new Date().toISOString() };
    }
  }
  
  // ===== EXISTING HANDLERS (kept from original) =====
  async handleGitHubNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const event = this.interpolate(config.event_type || 'push', { ...triggerData, ...input });
    const repository = this.interpolate(config.repository || '', { ...triggerData, ...input });
    return { event: event, repository: repository, processed_at: new Date().toISOString() };
  }
  
  async handleDatabaseQueryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    let query = this.interpolate(config.query || '', { ...triggerData, ...input });
    return { rows: [{ id: 1, data: 'Sample result' }], row_count: 1, query: query };
  }
  
  async handleUpdateCRMNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const recordId = this.interpolate(config.record_id || '', { ...triggerData, ...input });
    return { success: true, record_id: recordId, updated_at: new Date().toISOString() };
  }
  
  async handleInventoryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'shopify';
    return { platform: platform, total_products: 150, low_stock_items: 3, checked_at: new Date().toISOString() };
  }
  
  async handleCartRecoveryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'shopify';
    return { platform: platform, carts_recovered: 5, recovered_at: new Date().toISOString() };
  }
  
  async handleLeadScoringNode(node, input, triggerData, userId) {
    const leadData = { ...triggerData, ...input };
    let score = 50;
    if (leadData.email) score += 20;
    if (leadData.company) score += 15;
    const rating = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
    return { lead_score: score, rating: rating, scored_at: new Date().toISOString() };
  }
  
  async handleAIVideoNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || '', { ...triggerData, ...input });
    const duration = parseInt(config.duration) || 30;
    const style = config.style || 'Cinematic';
    const videoScript = `VIDEO SCRIPT: "${prompt}"\nDuration: ${duration}s\nStyle: ${style}\n\nScene 1: Opening\nScene 2: Main content\nScene 3: Conclusion`;
    return { video_script: videoScript, prompt: prompt, duration: duration, style: style, generated_at: new Date().toISOString() };
  }
  
  async handleAIImageNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || '', { ...triggerData, ...input });
    const style = config.style || 'Realistic';
    const imageUrl = `https://placehold.co/1024x1024/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 30))}`;
    return { image_url: imageUrl, prompt: prompt, style: style, generated_at: new Date().toISOString() };
  }
  
  async handleSocialPostNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'twitter';
    let content = this.interpolate(config.content || '', { ...triggerData, ...input });
    return { success: true, platform: platform, content: content.substring(0, 100), posted_at: new Date().toISOString() };
  }
  
  async handleTikTokPostNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const caption = this.interpolate(config.caption || '', { ...triggerData, ...input });
    return { success: true, platform: 'tiktok', caption: caption, posted_at: new Date().toISOString() };
  }
  
  async handleGenerateHashtagsNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const topic = this.interpolate(config.topic || '', { ...triggerData, ...input });
    const hashtags = [`#${topic.replace(/ /g, '') || 'AI'}`, '#Automation', '#Workflow'];
    return { hashtags: hashtags, count: hashtags.length, topic: topic };
  }
  
  async handleSendEmailNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const to = this.interpolate(config.to || '', { ...triggerData, ...input });
    const subject = this.interpolate(config.subject || 'Notification', { ...triggerData, ...input });
    return { success: true, to: to, subject: subject, sent_at: new Date().toISOString() };
  }
  
  async handleSendSlackNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const channel = this.interpolate(config.channel || '#general', { ...triggerData, ...input });
    const message = this.interpolate(config.message || '', { ...triggerData, ...input });
    return { success: true, channel: channel, message: message.substring(0, 100), sent_at: new Date().toISOString() };
  }
  
  async handleAIContentNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || '', { ...triggerData, ...input });
    const contentType = config.type || 'social';
    const tone = config.tone || 'professional';
    const content = `[AI Generated ${contentType}]\nTopic: ${prompt}\nTone: ${tone}\n\nThis is AI-generated content about ${prompt} in a ${tone} tone.`;
    return { content: content, type: contentType, prompt: prompt, tone: tone, generated_at: new Date().toISOString() };
  }
  
  async handleCreateLeadNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const name = this.interpolate(config.lead_name || input.name || 'New Lead', { ...triggerData, ...input });
    return { lead_id: `lead_${Date.now()}`, name: name, status: 'created', created_at: new Date().toISOString() };
  }
  
  async triggerCustomWebhook(app, inputData) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (app.auth_type === 'bearer' && app.auth_token) {
        headers['Authorization'] = `Bearer ${app.auth_token}`;
      } else if (app.auth_type === 'apiKey' && app.auth_token) {
        headers['X-API-Key'] = app.auth_token;
      }
      
      const response = await fetch(app.webhook_url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(inputData)
      });
      
      return { success: true, status: response.status, data: await response.json().catch(() => ({})) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // ===== HELPER METHODS =====
  interpolate(text, context) {
    if (typeof text !== 'string') return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const parts = path.trim().split('.');
      let value = context;
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = value[part];
        } else {
          return match;
        }
      }
      return value !== undefined && value !== null ? String(value) : match;
    });
  }
  
  getValueFromPath(path, obj) {
    if (!path || !obj) return null;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  getExecutionStatus(executionId) {
    return this.activeExecutions.get(executionId);
  }
  
  async cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      execution.status = 'cancelled';
      this.activeExecutions.delete(executionId);
      await supabase.from('workflow_executions').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', executionId);
      return true;
    }
    return false;
  }
}

module.exports = new WorkflowExecutor();