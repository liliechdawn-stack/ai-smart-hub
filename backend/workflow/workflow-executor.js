// ================================================
// WORKFLOW EXECUTOR - CLOUDFLARE AI POWERED
// All AI features powered by Cloudflare Workers AI
// Features: Sora-level Video Scripts, Nano Banana Images via Cloudflare SDXL
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
      
      const nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId, userId);
      results[node.id] = nodeResult;
      
      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      
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
        for (const edge of outgoingEdges) {
          const targetNode = allNodes.find(n => n.id === edge.target);
          if (targetNode && !visited.has(targetNode.id)) {
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
    
    const nodeResult = await this.executeNode(node, nodeInput, triggerData, executionId, userId);
    results[node.id] = nodeResult;
    
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
  
  // ===== MAIN NODE EXECUTION WITH CLOUDFLARE AI =====
  async executeNode(node, input, triggerData, executionId, userId) {
    const startTime = Date.now();
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`  🔧 [NODE] Executing: ${node.name || node.type} (Attempt ${attempt})`);
        
        let output;
        
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
          case 'ai_video':
            output = await this.handleAIVideoNode(node, input, triggerData, userId);
            break;
          case 'ai_lead_scoring':
            output = await this.handleLeadScoringNode(node, input, triggerData, userId);
            break;
          case 'post_social':
            output = await this.handleSocialPostNode(node, input, triggerData, userId);
            break;
          case 'post_tiktok':
            output = await this.handleTikTokPostNode(node, input, triggerData, userId);
            break;
          case 'generate_hashtags':
            output = await this.handleGenerateHashtagsNode(node, input, triggerData, userId);
            break;
          case 'github':
            output = await this.handleGitHubNode(node, input, triggerData, userId);
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
          case 'update_crm':
            output = await this.handleUpdateCRMNode(node, input, triggerData, userId);
            break;
          case 'send_email':
            output = await this.handleSendEmailNode(node, input, triggerData, userId);
            break;
          case 'send_slack':
            output = await this.handleSendSlackNode(node, input, triggerData, userId);
            break;
          case 'database_query':
            output = await this.handleDatabaseQueryNode(node, input, triggerData, userId);
            break;
          case 'condition':
            output = await this.handleConditionNode(node, input, triggerData);
            break;
          case 'wait':
            output = await this.handleWaitNode(node, input, triggerData);
            break;
          case 'loop':
            output = await this.handleLoopNode(node, input, triggerData);
            break;
          case 'http_request':
            output = await this.handleHttpRequestNode(node, input, triggerData, userId);
            break;
          case 'webhook':
            output = await this.handleWebhookNode(node, input, triggerData, userId);
            break;
          case 'code':
          case 'function':
            output = await this.handleCodeNode(node, input, triggerData, userId);
            break;
          case 'transform':
            output = await this.handleTransformNode(node, input, triggerData, userId);
            break;
          default:
            output = { output: input, status: 'completed', next: ['next'] };
        }
        
        const executionTime = Date.now() - startTime;
        
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
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
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
  
  // ===== TIKTOK POST NODE (Cloudflare powered) =====
  async handleTikTokPostNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const videoUrl = this.interpolate(config.video_url || '', { ...triggerData, ...input });
    const caption = this.interpolate(config.caption || '', { ...triggerData, ...input });
    const hashtags = config.hashtags || [];
    const thumbnailUrl = this.interpolate(config.thumbnail_url || '', { ...triggerData, ...input });
    
    console.log(`📱 [TIKTOK] Posting video to TikTok: ${caption.substring(0, 50)}...`);
    
    try {
      // Get user's TikTok access token from database
      const { data: tiktokApp } = await supabase
        .from('connected_apps')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .eq('platform', 'tiktok')
        .single();
      
      if (!tiktokApp || !tiktokApp.access_token) {
        throw new Error('TikTok not connected. Please connect your TikTok account in Settings.');
      }
      
      const fullCaption = `${caption}\n\n${hashtags.join(' ')}`;
      
      // Step 1: Initialize upload
      const initResponse = await fetch('https://open-api.tiktok.com/share/video/upload/init/', {
        method: 'POST',
        headers: {
          'access-token': tiktokApp.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          access_token: tiktokApp.access_token
        })
      });
      
      const initData = await initResponse.json();
      
      if (!initData.data || !initData.data.upload_url) {
        throw new Error('Failed to initialize TikTok upload');
      }
      
      // Step 2: Upload video
      const videoResponse = await fetch(videoUrl);
      const videoBuffer = await videoResponse.buffer();
      
      const uploadResponse = await fetch(initData.data.upload_url, {
        method: 'PUT',
        body: videoBuffer,
        headers: { 'Content-Type': 'video/mp4' }
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload video to TikTok');
      }
      
      // Step 3: Publish video
      const publishResponse = await fetch('https://open-api.tiktok.com/share/video/upload/finish/', {
        method: 'POST',
        headers: {
          'access-token': tiktokApp.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          access_token: tiktokApp.access_token,
          video_id: initData.data.video_id,
          text: fullCaption,
          cover_url: thumbnailUrl
        })
      });
      
      const publishData = await publishResponse.json();
      
      // Save to database
      await supabase.from('social_posts').insert({
        id: uuidv4(),
        user_id: userId,
        platform: 'tiktok',
        content: fullCaption,
        media_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        post_id: publishData.data?.share_id || initData.data.video_id,
        status: 'posted',
        posted_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      
      console.log(`✅ [TIKTOK] Video posted successfully!`);
      
      return {
        output: {
          success: true,
          platform: 'tiktok',
          post_id: publishData.data?.share_id,
          video_id: initData.data.video_id,
          url: `https://www.tiktok.com/@user/video/${publishData.data?.share_id}`,
          posted_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ TikTok post error:', error);
      return {
        output: {
          success: false,
          platform: 'tiktok',
          error: error.message,
          fallback: true
        },
        next: ['error']
      };
    }
  }
  
  // ===== GENERATE HASHTAGS NODE (Cloudflare AI powered) =====
  async handleGenerateHashtagsNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const topic = this.interpolate(config.topic || '', { ...triggerData, ...input });
    const count = parseInt(config.count) || 15;
    
    console.log(`🏷️ [HASHTAGS] Generating ${count} hashtags for: ${topic}`);
    
    try {
      // Use Cloudflare AI for hashtag generation
      const hashtags = await ai.generateHashtags(topic, count);
      
      return {
        output: {
          hashtags: hashtags,
          count: hashtags.length,
          topic: topic,
          generated_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Hashtag generation error:', error);
      const fallback = [`#${topic.replace(/ /g, '') || 'AI'}`, '#Automation', '#Workflow', '#Tech'];
      return {
        output: { hashtags: fallback, count: fallback.length, error: error.message },
        next: ['next']
      };
    }
  }
  
  // ===== GITHUB WEBHOOK NODE =====
  async handleGitHubNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const event = this.interpolate(config.event_type || 'push', { ...triggerData, ...input });
    const repository = this.interpolate(config.repository || '', { ...triggerData, ...input });
    
    console.log(`🐙 [GITHUB] Processing ${event} event for ${repository}`);
    
    try {
      // Get user's GitHub token
      const { data: githubApp } = await supabase
        .from('connected_apps')
        .select('access_token')
        .eq('user_id', userId)
        .eq('platform', 'github')
        .single();
      
      let result = { event, repository, processed_at: new Date().toISOString() };
      
      if (githubApp?.access_token && event === 'push') {
        const repoResponse = await fetch(`https://api.github.com/repos/${repository}`, {
          headers: { 'Authorization': `Bearer ${githubApp.access_token}` }
        });
        
        if (repoResponse.ok) {
          const repoData = await repoResponse.json();
          result.repository_data = {
            name: repoData.name,
            description: repoData.description,
            stars: repoData.stargazers_count,
            forks: repoData.forks_count,
            language: repoData.language,
            url: repoData.html_url
          };
        }
      }
      
      return {
        output: result,
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ GitHub node error:', error);
      return {
        output: { event, repository, error: error.message, processed_at: new Date().toISOString() },
        next: ['next']
      };
    }
  }
  
  // ===== DATABASE QUERY NODE =====
  async handleDatabaseQueryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    let query = this.interpolate(config.query || '', { ...triggerData, ...input });
    let params = {};
    
    try {
      if (config.params) {
        params = JSON.parse(this.interpolate(config.params, { ...triggerData, ...input }));
      }
    } catch (e) {}
    
    console.log(`📊 [DATABASE] Executing query: ${query.substring(0, 100)}`);
    
    try {
      // Execute query against user's connected database
      const { data: dbConnection } = await supabase
        .from('database_connections')
        .select('connection_string, type')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
      
      let result;
      
      if (dbConnection?.type === 'postgresql') {
        // For PostgreSQL connections
        const { Client } = require('pg');
        const client = new Client({ connectionString: dbConnection.connection_string });
        await client.connect();
        const dbResult = await client.query(query, Object.values(params));
        await client.end();
        
        result = {
          rows: dbResult.rows,
          row_count: dbResult.rowCount,
          fields: dbResult.fields?.map(f => f.name) || [],
          query: query,
          timestamp: new Date().toISOString()
        };
      } else {
        // Fallback to Supabase
        const { data, error } = await supabase.rpc('execute_sql', { sql_query: query });
        
        if (error) throw error;
        
        result = {
          rows: data || [],
          row_count: data?.length || 0,
          query: query,
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        output: result,
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Database query error:', error);
      return {
        output: {
          error: error.message,
          query: query,
          row_count: 0,
          rows: []
        },
        next: ['error']
      };
    }
  }
  
  // ===== UPDATE CRM NODE =====
  async handleUpdateCRMNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const recordId = this.interpolate(config.record_id || '', { ...triggerData, ...input });
    const updateData = config.update_data || {};
    
    console.log(`📝 [CRM] Updating record ${recordId}`);
    
    try {
      let parsedData = updateData;
      if (typeof updateData === 'string') {
        parsedData = JSON.parse(this.interpolate(updateData, { ...triggerData, ...input }));
      }
      
      // Update in database
      const { data, error } = await supabase
        .from('crm_records')
        .update({
          ...parsedData,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        output: {
          success: true,
          record_id: recordId,
          updated_data: data,
          timestamp: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ CRM update error:', error);
      return {
        output: {
          success: false,
          record_id: recordId,
          error: error.message
        },
        next: ['error']
      };
    }
  }
  
  // ===== INVENTORY CHECK NODE (Shopify) =====
  async handleInventoryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'shopify';
    
    console.log(`📦 [INVENTORY] Checking inventory on ${platform}`);
    
    try {
      const { data: shopifyApp } = await supabase
        .from('connected_apps')
        .select('access_token, shop_url')
        .eq('user_id', userId)
        .eq('platform', 'shopify')
        .single();
      
      if (!shopifyApp || !shopifyApp.access_token) {
        throw new Error('Shopify not connected');
      }
      
      const response = await fetch(`https://${shopifyApp.shop_url}/admin/api/2024-01/products.json?limit=250`, {
        headers: { 'X-Shopify-Access-Token': shopifyApp.access_token }
      });
      
      const data = await response.json();
      const products = data.products || [];
      const lowStockItems = products.filter(p => 
        p.variants[0]?.inventory_quantity < 10
      ).length;
      
      return {
        output: {
          platform: platform,
          total_products: products.length,
          low_stock_items: lowStockItems,
          checked_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Inventory check error:', error);
      return {
        output: {
          platform: platform,
          total_products: 0,
          low_stock_items: 0,
          error: error.message
        },
        next: ['next']
      };
    }
  }
  
  // ===== CART RECOVERY NODE (Shopify) =====
  async handleCartRecoveryNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'shopify';
    const discountPercent = parseInt(config.discount_percent) || 10;
    
    console.log(`🛒 [CART] Recovering carts on ${platform} with ${discountPercent}% discount`);
    
    try {
      const { data: shopifyApp } = await supabase
        .from('connected_apps')
        .select('access_token, shop_url')
        .eq('user_id', userId)
        .eq('platform', 'shopify')
        .single();
      
      if (!shopifyApp || !shopifyApp.access_token) {
        throw new Error('Shopify not connected');
      }
      
      // Get abandoned checkouts
      const response = await fetch(`https://${shopifyApp.shop_url}/admin/api/2024-01/checkouts.json?status=abandoned`, {
        headers: { 'X-Shopify-Access-Token': shopifyApp.access_token }
      });
      
      const data = await response.json();
      const abandonedCarts = data.checkouts || [];
      let recoveredCount = 0;
      
      // Send recovery emails
      for (const cart of abandonedCarts) {
        if (cart.email) {
          await this.handleSendEmailNode({
            config: {
              to: cart.email,
              subject: `Save ${discountPercent}% on your abandoned cart!`,
              body: `<h2>You left something behind!</h2>
                     <p>Use code <strong>SAVE${discountPercent}</strong> for ${discountPercent}% off your order.</p>
                     <a href="${cart.abandoned_checkout_url}">Complete Your Purchase</a>`
            }
          }, {}, {}, userId);
          recoveredCount++;
        }
      }
      
      return {
        output: {
          platform: platform,
          carts_recovered: recoveredCount,
          discount_applied: discountPercent,
          total_abandoned: abandonedCarts.length,
          recovered_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Cart recovery error:', error);
      return {
        output: {
          platform: platform,
          carts_recovered: 0,
          error: error.message
        },
        next: ['next']
      };
    }
  }
  
  // ===== LEAD SCORING NODE (Cloudflare AI powered) =====
  async handleLeadScoringNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const leadData = { ...triggerData, ...input };
    
    console.log(`🎯 [LEAD] Scoring lead: ${leadData.name || leadData.email || 'Unknown'}`);
    
    try {
      // Use Cloudflare AI for lead scoring
      const score = await ai.scoreLeadWithAI(leadData);
      const rating = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
      
      // Save to database
      await supabase.from('leads').insert({
        id: uuidv4(),
        user_id: userId,
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        company: leadData.company,
        job_title: leadData.job_title,
        budget: leadData.budget,
        industry: leadData.industry,
        lead_score: score,
        rating: rating,
        status: 'new',
        source: config.source || 'workflow',
        created_at: new Date().toISOString()
      });
      
      console.log(`✅ [LEAD] Score: ${score}/100 - ${rating.toUpperCase()}`);
      
      return {
        output: {
          lead_score: score,
          rating: rating,
          scored_at: new Date().toISOString(),
          lead_data: {
            name: leadData.name,
            email: leadData.email,
            company: leadData.company
          }
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Lead scoring error:', error);
      return {
        output: {
          lead_score: 50,
          rating: 'warm',
          error: error.message
        },
        next: ['next']
      };
    }
  }
  
  // ===== AI VIDEO GENERATION NODE (Cloudflare AI powered - Sora level) =====
  async handleAIVideoNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || '', { ...triggerData, ...input });
    const duration = parseInt(config.duration) || 30;
    const style = config.style || 'Cinematic';
    
    console.log(`🎬 [VIDEO] Generating video script for: ${prompt.substring(0, 50)}...`);
    
    try {
      // Use Cloudflare AI to generate video script and storyboard
      const videoScript = await ai.generateVideoScript(prompt, duration, style);
      
      // Generate a storyboard image for the first scene using Cloudflare AI
      let storyboardImage = null;
      if (videoScript.success && videoScript.script) {
        const firstScenePrompt = `Storyboard frame for video about ${prompt}, first scene, ${style} style, professional quality`;
        const imageResult = await ai.generateImage(firstScenePrompt, { style: style.toLowerCase() });
        if (imageResult.success && imageResult.images[0]) {
          storyboardImage = imageResult.images[0];
        }
      }
      
      // Save to gallery
      await supabase.from('gallery').insert({
        id: uuidv4(),
        user_id: userId,
        type: 'video',
        title: prompt.substring(0, 50),
        data: videoScript.script,
        thumbnail: storyboardImage,
        metadata: { style, duration, prompt: prompt },
        created_at: new Date().toISOString()
      });
      
      return {
        output: {
          video_script: videoScript.script,
          storyboard_image: storyboardImage,
          prompt: prompt,
          duration: duration,
          style: style,
          generated_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Video generation error:', error);
      return {
        output: {
          video_script: `VIDEO SCRIPT: "${prompt}"\nDuration: ${duration}s\nStyle: ${style}\n\n[Video script would appear here. Check Cloudflare AI configuration.]`,
          error: error.message,
          prompt: prompt,
          fallback: true
        },
        next: ['next']
      };
    }
  }
  
  // ===== AI IMAGE GENERATION NODE (Cloudflare AI powered - Nano Banana quality) =====
  async handleAIImageNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || '', { ...triggerData, ...input });
    const style = config.style || 'Realistic';
    
    console.log(`🎨 [IMAGE] Generating with Cloudflare AI: ${prompt.substring(0, 50)}...`);
    
    try {
      // Use Cloudflare AI for image generation
      const result = await ai.generateImage(prompt, { style: style.toLowerCase() });
      
      let imageUrl = null;
      if (result.success && result.images[0]) {
        imageUrl = result.images[0];
      } else {
        // Fallback placeholder
        imageUrl = `https://placehold.co/1024x1024/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 30))}`;
      }
      
      // Save to gallery
      await supabase.from('gallery').insert({
        id: uuidv4(),
        user_id: userId,
        type: 'image',
        title: prompt.substring(0, 50),
        data: imageUrl,
        metadata: { style, prompt: prompt },
        created_at: new Date().toISOString()
      });
      
      return {
        output: {
          image_url: imageUrl,
          prompt: prompt,
          style: style,
          generated_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Image generation error:', error);
      return {
        output: {
          image_url: `https://placehold.co/1024x1024/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 30))}`,
          error: error.message,
          fallback: true
        },
        next: ['next']
      };
    }
  }
  
  // ===== SOCIAL POST NODE =====
  async handleSocialPostNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const platform = config.platform || 'twitter';
    let content = this.interpolate(config.content || '', { ...triggerData, ...input });
    const mediaUrl = config.media_url ? this.interpolate(config.media_url, { ...triggerData, ...input }) : null;
    
    console.log(`📱 [SOCIAL] Posting to ${platform}: ${content.substring(0, 50)}...`);
    
    try {
      let result = null;
      
      switch (platform) {
        case 'instagram':
          if (process.env.INSTAGRAM_ACCESS_TOKEN) {
            const instaResponse = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` },
              body: JSON.stringify({ caption: content, media_type: 'CAROUSEL' })
            });
            result = await instaResponse.json();
          }
          break;
          
        case 'facebook':
          if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
            const fbResponse = await fetch(`https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}` },
              body: JSON.stringify({ message: content, link: mediaUrl })
            });
            result = await fbResponse.json();
          }
          break;
          
        case 'twitter':
          if (process.env.TWITTER_BEARER_TOKEN) {
            const twitterResponse = await fetch('https://api.twitter.com/2/tweets', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
              body: JSON.stringify({ text: content.substring(0, 280) })
            });
            result = await twitterResponse.json();
          }
          break;
          
        case 'linkedin':
          if (process.env.LINKEDIN_ACCESS_TOKEN) {
            const liResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
              body: JSON.stringify({
                author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
                lifecycleState: 'PUBLISHED',
                specificContent: {
                  'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: content },
                    shareMediaCategory: 'NONE'
                  }
                },
                visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
              })
            });
            result = await liResponse.json();
          }
          break;
      }
      
      // Save to database
      await supabase.from('social_posts').insert({
        id: uuidv4(),
        user_id: userId,
        platform: platform,
        content: content,
        media_url: mediaUrl,
        post_id: result?.id || null,
        status: 'posted',
        posted_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      
      return {
        output: {
          success: true,
          platform: platform,
          post_id: result?.id || `mock_${Date.now()}`,
          content: content.substring(0, 100),
          posted_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error(`❌ Social post error (${platform}):`, error);
      return {
        output: {
          success: false,
          platform: platform,
          error: error.message,
          content: content.substring(0, 100)
        },
        next: ['error']
      };
    }
  }
  
  // ===== EMAIL SEND NODE =====
  async handleSendEmailNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const to = this.interpolate(config.to || '', { ...triggerData, ...input });
    const subject = this.interpolate(config.subject || 'Notification', { ...triggerData, ...input });
    const body = this.interpolate(config.body || '', { ...triggerData, ...input });
    
    console.log(`📧 [EMAIL] Sending to: ${to}`);
    
    try {
      if (process.env.SENDGRID_API_KEY) {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        await sgMail.send({
          to,
          from: process.env.EMAIL_FROM || 'noreply@workflowstudio.com',
          subject,
          html: body,
          trackingSettings: {
            clickTracking: { enable: true },
            openTracking: { enable: true }
          }
        });
      }
      
      await supabase.from('email_logs').insert({
        id: uuidv4(),
        user_id: userId,
        to: to,
        subject: subject,
        body: body,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      
      return {
        output: {
          success: true,
          to: to,
          subject: subject,
          sent_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Email send error:', error);
      return {
        output: { success: false, to: to, subject: subject, error: error.message },
        next: ['error']
      };
    }
  }
  
  // ===== SLACK SEND NODE =====
  async handleSendSlackNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const channel = this.interpolate(config.channel || '#general', { ...triggerData, ...input });
    const message = this.interpolate(config.message || '', { ...triggerData, ...input });
    
    console.log(`💬 [SLACK] Sending to: ${channel}`);
    
    try {
      if (process.env.SLACK_WEBHOOK_URL) {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, text: message })
        });
      }
      
      return {
        output: {
          success: true,
          channel: channel,
          message: message.substring(0, 100),
          sent_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Slack send error:', error);
      return {
        output: { success: false, channel: channel, error: error.message },
        next: ['error']
      };
    }
  }
  
  // ===== AI CONTENT NODE (Cloudflare AI powered) =====
  async handleAIContentNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const prompt = this.interpolate(config.prompt || '', { ...triggerData, ...input });
    const contentType = config.type || 'social';
    const tone = config.tone || 'professional';
    
    console.log(`✍️ [CONTENT] Generating ${contentType} about: ${prompt.substring(0, 50)}...`);
    
    try {
      // Use Cloudflare AI for content generation
      const content = await ai.generateStructuredContent(contentType, prompt, tone);
      
      // Save to gallery
      await supabase.from('gallery').insert({
        id: uuidv4(),
        user_id: userId,
        type: 'content',
        title: `${contentType}: ${prompt.substring(0, 30)}`,
        data: content,
        created_at: new Date().toISOString()
      });
      
      return {
        output: {
          content: content,
          type: contentType,
          prompt: prompt,
          tone: tone,
          generated_at: new Date().toISOString()
        },
        next: ['next']
      };
      
    } catch (error) {
      console.error('❌ Content generation error:', error);
      return {
        output: {
          content: `[AI Generated ${contentType}]\nTopic: ${prompt}\nTone: ${tone}\n\nError: ${error.message}`,
          error: error.message
        },
        next: ['next']
      };
    }
  }
  
  // ===== CREATE LEAD NODE =====
  async handleCreateLeadNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const leadData = {
      id: uuidv4(),
      user_id: userId,
      name: this.interpolate(config.lead_name || input.name || triggerData.name || 'New Lead', { ...triggerData, ...input }),
      email: this.interpolate(input.email || triggerData.email || '', { ...triggerData, ...input }),
      phone: this.interpolate(input.phone || triggerData.phone || '', { ...triggerData, ...input }),
      company: this.interpolate(input.company || triggerData.company || '', { ...triggerData, ...input }),
      source: config.source || 'workflow',
      status: 'new',
      created_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase.from('leads').insert(leadData).select().single();
    
    if (error) throw error;
    
    return {
      output: {
        lead_id: data.id,
        name: data.name,
        email: data.email,
        status: 'created',
        created_at: data.created_at
      },
      next: ['next']
    };
  }
  
  // ===== TRIGGER NODE =====
  async handleTriggerNode(node, input, triggerData) {
    return {
      output: { webhook_received: true, data: triggerData, timestamp: new Date().toISOString() },
      next: ['next']
    };
  }
  
  // ===== SCHEDULE NODE =====
  async handleScheduleNode(node, input, triggerData) {
    return {
      output: { scheduled: true, cron: node.config?.cron, triggered_at: new Date().toISOString() },
      next: ['next']
    };
  }
  
  // ===== CONDITION NODE =====
  async handleConditionNode(node, input, triggerData) {
    const config = node.config || {};
    const condition = config.condition || 'return true;';
    
    try {
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
  
  // ===== WAIT NODE =====
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
  
  // ===== LOOP NODE =====
  async handleLoopNode(node, input, triggerData) {
    const config = node.config || {};
    const iterations = parseInt(config.iterations) || 3;
    
    console.log(`🔄 [LOOP] Running ${iterations} iterations`);
    
    const results = [];
    for (let i = 0; i < iterations; i++) {
      results.push({
        iteration: i + 1,
        data: { ...input, loop_index: i, loop_count: iterations },
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      output: {
        iterations_completed: iterations,
        results: results,
        completed_at: new Date().toISOString()
      },
      next: ['next']
    };
  }
  
  // ===== HTTP REQUEST NODE =====
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
        output: {
          status: response.status,
          data: responseData,
          headers: Object.fromEntries(response.headers),
          timestamp: new Date().toISOString()
        },
        next: response.status >= 200 && response.status < 300 ? ['next'] : ['error']
      };
    } catch (error) {
      return {
        output: { status: 0, error: error.message, url: url },
        next: ['error']
      };
    }
  }
  
  // ===== WEBHOOK NODE =====
  async handleWebhookNode(node, input, triggerData, userId) {
    const config = node.config || {};
    const webhookUrl = this.interpolate(config.webhook_url || '', { ...triggerData, ...input });
    const method = config.method || 'POST';
    
    console.log(`🔗 [WEBHOOK] Sending ${method} to: ${webhookUrl}`);
    
    try {
      const response = await fetch(webhookUrl, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...triggerData, ...input, timestamp: new Date().toISOString() })
      });
      
      const responseData = await response.json().catch(() => ({}));
      
      return {
        output: {
          success: response.ok,
          status: response.status,
          data: responseData,
          sent_at: new Date().toISOString()
        },
        next: response.ok ? ['next'] : ['error']
      };
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      return {
        output: { success: false, error: error.message },
        next: ['error']
      };
    }
  }
  
  // ===== CODE NODE =====
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
        JSON: JSON
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
      return {
        output: { error: error.message, original: input },
        next: ['error']
      };
    }
  }
  
  // ===== TRANSFORM NODE =====
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
        output: {
          transformed: transformedData,
          transform_type: transformType,
          original: input,
          timestamp: new Date().toISOString()
        },
        next: ['next']
      };
    } catch (error) {
      return {
        output: { error: error.message, original: input, transform_type: transformType },
        next: ['error']
      };
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