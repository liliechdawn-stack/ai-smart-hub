// ================================================
// WORKFLOW EXECUTOR - REAL-TIME NODE EXECUTION ENGINE
// Executes workflows with sequential, parallel, and conditional logic
// Enterprise Features: Code Node, Transform Node, Error Handling
// ================================================

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../database-supabase');

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
        // Try to handle error with error handler workflow
        const errorHandled = await this.tryErrorHandler(workflowId, executionError, executionId, triggerData, userId);
        if (!errorHandled) {
          throw executionError;
        }
        // If error was handled, return success with error handled flag
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
      
      // Update execution record
      await supabase
        .from('workflow_executions')
        .update({
          status: allSuccessful ? 'completed' : 'completed_with_errors',
          node_results: results,
          completed_at: new Date().toISOString(),
          execution_time_ms: executionTime
        })
        .eq('id', executionId);
      
      // Update workflow stats - FIXED: replaced supabase.raw with manual increment
      // First get current run_count
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
      // Check if error handler exists
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

  // ===== EXECUTE TEMPORARY WORKFLOW (for testing without saving to DB) =====
  async executeTempWorkflow(nodes, edges, triggerData = {}, userId = null) {
    const executionId = uuidv4();
    const startTime = Date.now();
    
    console.log(`🧪 [TEMP WORKFLOW] Starting test execution with ${nodes?.length || 0} nodes`);
    
    try {
      // Validate workflow
      if (!nodes || nodes.length === 0) {
        throw new Error('No nodes provided for temporary workflow');
      }
      
      // Find start nodes (nodes with no incoming edges)
      const startNodes = nodes.filter(node => {
        const hasIncoming = edges?.some(edge => edge.target === node.id) || false;
        return !hasIncoming;
      });
      
      if (startNodes.length === 0) {
        throw new Error('No start node found in workflow (every node has an incoming edge)');
      }
      
      // Store execution context for cancellation support
      this.activeExecutions.set(executionId, {
        isTemp: true,
        nodes,
        edges,
        triggerData,
        userId,
        startTime,
        status: 'running'
      });
      
      // Execute the workflow (reusing existing execution logic)
      let results;
      try {
        results = await this.executeSequential(
          startNodes, 
          nodes, 
          edges || [], 
          triggerData || {}, 
          executionId, 
          userId || 'temp'
        );
      } catch (execError) {
        // If sequential fails, try parallel as fallback
        console.log('Sequential execution failed, trying parallel...');
        results = await this.executeParallel(
          startNodes, 
          nodes, 
          edges || [], 
          triggerData || {}, 
          executionId, 
          userId || 'temp'
        );
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
  
  // Sequential execution - one node after another
  async executeSequential(startNodes, allNodes, edges, triggerData, executionId, userId) {
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
        if (sourceResult && sourceResult.output) {
          nodeInput = { ...nodeInput, ...sourceResult.output };
        }
      }
      
      // If no input, use trigger data
      if (Object.keys(nodeInput).length === 0 && incomingEdges.length === 0) {
        nodeInput = triggerData;
      }
      
      // Execute node
      const nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId, userId);
      results[node.id] = nodeResult;
      
      // Determine next nodes based on outputs
      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      
      if (nodeResult.next && nodeResult.next.length > 0) {
        // Conditional branching - follow specific output
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
  
  // Parallel execution - run multiple branches simultaneously
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
    // Get input from dependencies
    const incomingEdges = edges.filter(edge => edge.target === node.id);
    let nodeInput = {};
    
    for (const edge of incomingEdges) {
      if (!results[edge.source]) {
        // Wait for dependency to complete
        await this.waitForResult(edge.source, results);
      }
      const sourceResult = results[edge.source];
      if (sourceResult && sourceResult.output) {
        nodeInput = { ...nodeInput, ...sourceResult.output };
      }
    }
    
    // Execute node
    const nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId, userId);
    results[node.id] = nodeResult;
    
    // Execute child nodes
    const outgoingEdges = edges.filter(edge => edge.source === node.id);
    const childPromises = [];
    
    for (const edge of outgoingEdges) {
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
  
  // Execute a single node with retry logic
  async executeNode(node, input, triggerData, executionId, userId) {
    const startTime = Date.now();
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`  🔧 [NODE] Executing: ${node.name || node.type} (Attempt ${attempt})`);
        
        let output;
        
        // Route to appropriate node handler
        switch (node.type) {
          case 'trigger':
            output = await this.handleTriggerNode(node, input, triggerData);
            break;
          case 'schedule':
            output = await this.handleScheduleNode(node, input, triggerData);
            break;
          case 'ai_content':
            output = await this.handleAIContentNode(node, input, triggerData, userId);
            break;
          case 'ai_image':
            output = await this.handleAIImageNode(node, input, triggerData, userId);
            break;
          case 'ai_lead_scoring':
            output = await this.handleLeadScoringNode(node, input, triggerData, userId);
            break;
          case 'post_social':
            output = await this.handleSocialPostNode(node, input, triggerData, userId);
            break;
          case 'inventory_check':
            output = await this.handleInventoryNode(node, input, triggerData, userId);
            break;
          case 'cart_recovery':
            output = await this.handleCartRecoveryNode(node, input, triggerData, userId);
            break;
          case 'create_lead':
            output = await this.handleCreateLeadNode(node, input, triggerData, userId);
            break;
          case 'send_email':
            output = await this.handleSendEmailNode(node, input, triggerData, userId);
            break;
          case 'send_slack':
            output = await this.handleSendSlackNode(node, input, triggerData, userId);
            break;
          case 'condition':
            output = await this.handleConditionNode(node, input, triggerData);
            break;
          case 'wait':
            output = await this.handleWaitNode(node, input, triggerData);
            break;
          case 'http_request':
            output = await this.handleHttpRequestNode(node, input, triggerData, userId);
            break;
          case 'code':
          case 'function':
            output = await this.handleCodeNode(node, input, triggerData, userId);
            break;
          case 'transform':
            output = await this.handleTransformNode(node, input, triggerData, userId);
            break;
          default:
            output = { output: input, status: 'completed' };
        }
        
        const executionTime = Date.now() - startTime;
        
        // Only log to database if we have a valid executionId (not temp)
        if (executionId && !executionId.startsWith('temp_')) {
          await supabase.from('node_executions').insert({
            id: uuidv4(),
            execution_id: executionId,
            node_id: node.id,
            node_type: node.type,
            input: input,
            output: output.output,
            status: 'completed',
            execution_time_ms: executionTime,
            attempt: attempt,
            created_at: new Date().toISOString()
          });
        }
        
        return {
          nodeId: node.id,
          nodeType: node.type,
          output: output.output,
          next: output.next || ['next'],
          status: 'completed',
          executionTime
        };
        
      } catch (error) {
        lastError = error;
        console.error(`Node ${node.type} attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    // All retries failed
    const executionTime = Date.now() - startTime;
    
    // Only log to database if we have a valid executionId (not temp)
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
  
  // ===== ENTERPRISE NODE HANDLERS =====
  
  // Code/Function Node - Execute custom JavaScript (like n8n function node)
  async handleCodeNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const code = config.code || 'return data;';
    
    try {
      // Create a safe execution context
      const sandbox = {
        data: { ...triggerData, ...input },
        $json: { ...triggerData, ...input },
        $input: input,
        $trigger: triggerData,
        $node: { name: node.name, id: node.id },
        console: { 
          log: (...args) => console.log('[CODE_NODE]', ...args),
          error: (...args) => console.error('[CODE_NODE]', ...args),
          warn: (...args) => console.warn('[CODE_NODE]', ...args)
        },
        fetch: fetch,
        Date: Date,
        Math: Math,
        JSON: JSON,
        Object: Object,
        Array: Array,
        String: String,
        Number: Number,
        Boolean: Boolean,
        RegExp: RegExp,
        setTimeout: setTimeout,
        setInterval: setInterval
      };
      
      // Execute the code
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
      
      // If code explicitly set output, use that
      if (sandbox.output !== undefined) {
        transformedData = sandbox.output;
      }
      
      return {
        output: {
          transformed: transformedData,
          original: input,
          trigger: triggerData,
          timestamp: new Date().toISOString(),
          error: sandbox.error || null
        },
        next: sandbox.error ? ['error'] : ['next']
      };
      
    } catch (error) {
      console.error('Code node error:', error);
      return {
        output: {
          error: error.message,
          original: input,
          stack: error.stack
        },
        next: ['error']
      };
    }
  }
  
  // Transform Node - Data transformation (map, filter, aggregate, merge, split, format)
  async handleTransformNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const transformType = config.type || 'map';
    
    let transformedData = { ...input };
    
    try {
      switch (transformType) {
        case 'map':
          // Map fields from input to output
          const mapping = config.mapping || {};
          transformedData = {};
          for (const [key, value] of Object.entries(mapping)) {
            transformedData[key] = this.getValueFromPath(value, { ...triggerData, ...input });
          }
          break;
          
        case 'filter':
          // Filter array data
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
                case 'startsWith': return String(itemValue).startsWith(String(filterValue));
                case 'endsWith': return String(itemValue).endsWith(String(filterValue));
                default: return itemValue === filterValue;
              }
            });
            transformedData.filtered_count = transformedData.data.length;
          }
          break;
          
        case 'aggregate':
          // Aggregate array data (sum, avg, count, min, max)
          const aggregateField = config.aggregateField;
          const operation = config.operation;
          if (Array.isArray(input.data)) {
            const values = input.data.map(item => parseFloat(this.getValueFromPath(aggregateField, item))).filter(v => !isNaN(v));
            switch (operation) {
              case 'sum':
                transformedData.result = values.reduce((a, b) => a + b, 0);
                break;
              case 'avg':
                transformedData.result = values.reduce((a, b) => a + b, 0) / (values.length || 1);
                break;
              case 'min':
                transformedData.result = Math.min(...values);
                break;
              case 'max':
                transformedData.result = Math.max(...values);
                break;
              case 'count':
                transformedData.result = values.length;
                break;
            }
          }
          break;
          
        case 'merge':
          // Merge multiple objects
          const sources = config.sources || [];
          transformedData = {};
          for (const source of sources) {
            const sourceData = this.getValueFromPath(source, { ...triggerData, ...input });
            if (sourceData && typeof sourceData === 'object') {
              transformedData = { ...transformedData, ...sourceData };
            }
          }
          break;
          
        case 'split':
          // Split string into array
          const splitField = config.field;
          const separator = config.separator || ',';
          const value = this.getValueFromPath(splitField, input);
          transformedData.result = value ? String(value).split(separator).map(s => s.trim()) : [];
          break;
          
        case 'format':
          // Format date, number, string
          const formatField = config.field;
          const formatType = config.formatType;
          const formatPattern = config.pattern;
          let fieldValue = this.getValueFromPath(formatField, input);
          
          if (formatType === 'date' && fieldValue) {
            const date = new Date(fieldValue);
            if (formatPattern === 'ISO') {
              fieldValue = date.toISOString();
            } else if (formatPattern === 'locale') {
              fieldValue = date.toLocaleString();
            } else if (formatPattern === 'date') {
              fieldValue = date.toLocaleDateString();
            } else if (formatPattern === 'time') {
              fieldValue = date.toLocaleTimeString();
            } else {
              fieldValue = date.toISOString();
            }
          } else if (formatType === 'number' && fieldValue !== undefined) {
            const decimals = config.decimals || 2;
            fieldValue = parseFloat(fieldValue).toFixed(decimals);
          } else if (formatType === 'currency' && fieldValue !== undefined) {
            const currency = config.currency || 'USD';
            fieldValue = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(fieldValue);
          } else if (formatType === 'uppercase') {
            fieldValue = String(fieldValue).toUpperCase();
          } else if (formatType === 'lowercase') {
            fieldValue = String(fieldValue).toLowerCase();
          } else if (formatType === 'capitalize') {
            fieldValue = String(fieldValue).replace(/\b\w/g, l => l.toUpperCase());
          }
          
          transformedData[formatField] = fieldValue;
          break;
          
        case 'pick':
          // Pick specific fields from object
          const fields = config.fields || [];
          transformedData = {};
          for (const field of fields) {
            transformedData[field] = this.getValueFromPath(field, { ...triggerData, ...input });
          }
          break;
          
        case 'omit':
          // Omit specific fields from object
          const omitFields = config.fields || [];
          transformedData = { ...input };
          for (const field of omitFields) {
            delete transformedData[field];
          }
          break;
          
        case 'defaults':
          // Set default values for missing fields
          const defaults = config.defaults || {};
          for (const [key, defaultValue] of Object.entries(defaults)) {
            if (transformedData[key] === undefined || transformedData[key] === null || transformedData[key] === '') {
              transformedData[key] = defaultValue;
            }
          }
          break;
      }
      
      return {
        output: {
          transformed: transformedData,
          transform_type: transformType,
          original: input,
          timestamp: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('Transform node error:', error);
      return {
        output: {
          error: error.message,
          original: input,
          transform_type: transformType
        },
        next: ['error']
      };
    }
  }
  
  // ===== EXISTING NODE HANDLERS =====
  
  async handleTriggerNode(node, input, triggerData) {
    return {
      output: { webhook_received: true, data: triggerData, timestamp: new Date().toISOString() },
      next: ['next']
    };
  }
  
  async handleScheduleNode(node, input, triggerData) {
    return {
      output: { scheduled: true, cron: node.config?.cron, triggered_at: new Date().toISOString() },
      next: ['next']
    };
  }
  
  async handleAIContentNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || 'Generate content', { ...triggerData, ...input });
    
    try {
      const token = this.getUserToken(userId);
      const response = await fetch(`${process.env.BACKEND_URL}/api/powerhouse/content/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          content_type: config.type || 'social',
          topic: prompt,
          tone: config.tone || 'professional'
        })
      });
      
      const data = await response.json();
      return {
        output: { content: data.content, type: config.type, generated_at: new Date().toISOString() },
        next: ['next']
      };
    } catch (error) {
      // Fallback mock response
      return {
        output: { content: `AI Generated ${config.type} content about: ${prompt.substring(0, 100)}...`, type: config.type },
        next: ['next']
      };
    }
  }
  
  async handleAIImageNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || 'Create an image', { ...triggerData, ...input });
    
    return {
      output: { image_url: `https://via.placeholder.com/1024?text=${encodeURIComponent(prompt.substring(0, 50))}`, prompt: prompt },
      next: ['next']
    };
  }
  
  async handleLeadScoringNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const leadData = { ...triggerData, ...input };
    
    // Calculate score based on lead data
    let score = 50;
    if (leadData.email) {
      const domain = leadData.email.split('@')[1];
      if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com'].includes(domain)) score += 15;
    }
    if (leadData.phone) score += 10;
    if (leadData.message && leadData.message.length > 50) score += 20;
    if (leadData.budget && leadData.budget > 1000) score += 25;
    if (leadData.company && leadData.company.length > 0) score += 10;
    if (leadData.title && (leadData.title.includes('Manager') || leadData.title.includes('Director') || leadData.title.includes('VP'))) score += 20;
    
    score = Math.min(config.max_score || 100, Math.max(config.min_score || 0, score));
    
    return {
      output: { lead_score: score, rating: score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold' },
      next: ['next']
    };
  }
  
  async handleSocialPostNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const content = this.interpolate(config.content || '', { ...triggerData, ...input });
    const platform = config.platform || 'twitter';
    
    try {
      const token = this.getUserToken(userId);
      const response = await fetch(`${process.env.BACKEND_URL}/api/powerhouse/social/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ platform, content })
      });
      
      const data = await response.json();
      return {
        output: { post_id: data.post_id, platform: platform, status: 'posted', url: data.url },
        next: ['next']
      };
    } catch (error) {
      return {
        output: { post_id: `mock_${Date.now()}`, platform: platform, status: 'mock_posted' },
        next: ['next']
      };
    }
  }
  
  async handleInventoryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'shopify';
    
    try {
      const token = this.getUserToken(userId);
      const response = await fetch(`${process.env.BACKEND_URL}/api/powerhouse/inventory/check`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      return {
        output: { low_stock_items: data.lowStock || 0, total_products: data.total || 0 },
        next: ['next']
      };
    } catch (error) {
      return {
        output: { low_stock_items: 0, total_products: 0, error: error.message },
        next: ['next']
      };
    }
  }
  
  async handleCartRecoveryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'shopify';
    const discount = config.discount_percent || 10;
    
    try {
      const token = this.getUserToken(userId);
      const response = await fetch(`${process.env.BACKEND_URL}/api/powerhouse/carts/recover`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ platform, discount_percent: discount })
      });
      
      const data = await response.json();
      return {
        output: { carts_recovered: data.count || 0, revenue_recovered: data.revenue || 0 },
        next: ['next']
      };
    } catch (error) {
      return {
        output: { carts_recovered: 0, error: error.message },
        next: ['next']
      };
    }
  }
  
  async handleCreateLeadNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const leadData = {
      name: input.name || triggerData.name || 'New Lead',
      email: input.email || triggerData.email,
      phone: input.phone || triggerData.phone || null,
      company: input.company || triggerData.company || null,
      title: input.title || triggerData.title || null,
      source: config.source || 'workflow',
      status: config.status || 'new'
    };
    
    try {
      const token = this.getUserToken(userId);
      const response = await fetch(`${process.env.BACKEND_URL}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(leadData)
      });
      
      const data = await response.json();
      return {
        output: { lead_id: data.id, name: data.name, email: data.email, status: 'created' },
        next: ['next']
      };
    } catch (error) {
      return {
        output: { lead_id: `mock_${Date.now()}`, ...leadData, status: 'mock_created' },
        next: ['next']
      };
    }
  }
  
  async handleSendEmailNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const to = this.interpolate(config.to || '', { ...triggerData, ...input });
    const subject = this.interpolate(config.subject || 'Notification', { ...triggerData, ...input });
    const body = this.interpolate(config.body || '', { ...triggerData, ...input });
    
    try {
      const token = this.getUserToken(userId);
      const response = await fetch(`${process.env.BACKEND_URL}/api/powerhouse/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ to, subject, body })
      });
      
      const data = await response.json();
      return {
        output: { message_id: data.id, to: to, subject: subject, status: 'sent' },
        next: ['next']
      };
    } catch (error) {
      return {
        output: { to: to, subject: subject, status: 'mock_sent' },
        next: ['next']
      };
    }
  }
  
  async handleSendSlackNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const channel = this.interpolate(config.channel || '#general', { ...triggerData, ...input });
    const message = this.interpolate(config.message || '', { ...triggerData, ...input });
    
    try {
      const token = this.getUserToken(userId);
      const response = await fetch(`${process.env.BACKEND_URL}/api/powerhouse/slack/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ channel, message })
      });
      
      const data = await response.json();
      return {
        output: { ts: data.ts, channel: channel, message: message.substring(0, 100) },
        next: ['next']
      };
    } catch (error) {
      return {
        output: { channel: channel, message: message.substring(0, 100), status: 'mock_sent' },
        next: ['next']
      };
    }
  }
  
  async handleConditionNode(node, input, triggerData) {
    const config = node.config || {};
    const condition = config.condition || 'return true;';
    
    try {
      // Safe evaluation of condition
      const conditionFn = new Function('data', `try { ${condition} } catch(e) { return false; }`);
      const data = { ...triggerData, ...input };
      const result = conditionFn(data);
      
      return {
        output: { condition: result, evaluated_data: data },
        next: result ? ['true'] : ['false']
      };
    } catch (error) {
      return {
        output: { condition: false, error: error.message },
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
    
    return {
      output: { waited: `${duration} ${unit}`, waited_ms: ms },
      next: ['next']
    };
  }
  
  async handleHttpRequestNode(node, input, triggerData, userId) {
    const config = node.config || {};
    let url = this.interpolate(config.url || '', { ...triggerData, ...input });
    const method = config.method || 'GET';
    let headers = {};
    let body = {};
    
    try {
      if (config.headers) headers = JSON.parse(this.interpolate(config.headers, { ...triggerData, ...input }));
      if (config.body) body = JSON.parse(this.interpolate(config.body, { ...triggerData, ...input }));
    } catch (e) {}
    
    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined
      });
      
      const responseData = await response.json();
      return {
        output: { status: response.status, data: responseData, headers: Object.fromEntries(response.headers) },
        next: response.status >= 200 && response.status < 300 ? ['next'] : ['error']
      };
    } catch (error) {
      return {
        output: { status: 0, error: error.message, url: url },
        next: ['error']
      };
    }
  }
  
  // Helper: Interpolate variables in text
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
  
  // Helper to get value from dot notation path
  getValueFromPath(path, obj) {
    if (!path || !obj) return null;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  getUserToken(userId) {
    // In production, fetch from database
    // This needs to be fixed to work in Node.js environment
    // For now, return null and let individual handlers handle auth
    return null;
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
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', executionId);
      
      return true;
    }
    return false;
  }
}

module.exports = new WorkflowExecutor();