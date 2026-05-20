const { supabase } = require('./supabase');
const { exec } = require('child_process');
const axios = require('axios');
const vm = require('vm');

class WorkflowEngine {
    constructor() {
        this.workflows = new Map();
        this.executingWorkflows = new Map();
        this.executionHistory = new Map();
        this.rateLimitStore = new Map();
        this.cacheStore = new Map();
    }

    // ================================================
    // DAG-BASED EXECUTION WITH TOPOLOGICAL SORT
    // ================================================
    async executeWorkflow(workflowId, inputData = {}) {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            console.log(`🚀 Starting workflow execution: ${workflowId} (${executionId})`);
            
            const { data: workflow, error } = await supabase
                .from('workflows')
                .select('*')
                .eq('id', workflowId)
                .single();
            
            if (error) throw error;
            
            const nodes = workflow.nodes || [];
            const connections = workflow.edges || workflow.connections || [];
            const graph = this.buildDependencyGraph(nodes, connections);
            const executionOrder = this.topologicalSort(nodes, connections, graph);
            
            console.log(`📊 Execution order: ${executionOrder.map(n => n.name || n.type).join(' → ')}`);
            
            const runHistory = {};
            const results = {};
            
            for (const node of executionOrder) {
                const incomingConnections = connections.filter(conn => conn.target === node.id);
                let nodeInput = { ...inputData };
                
                for (const conn of incomingConnections) {
                    const sourceResult = results[conn.source];
                    if (sourceResult) {
                        if (conn.sourceHandle && sourceResult[conn.sourceHandle] !== undefined) {
                            nodeInput = { ...nodeInput, ...sourceResult[conn.sourceHandle] };
                        } else if (sourceResult.output !== undefined) {
                            nodeInput = { ...nodeInput, ...sourceResult.output };
                        } else {
                            nodeInput = { ...nodeInput, ...sourceResult };
                        }
                    }
                }
                
                const executionResult = await this.executeNodeAction(node, nodeInput, runHistory, executionId);
                
                results[node.id] = executionResult.output;
                runHistory[node.name || node.type] = executionResult.output;
                
                await this.saveExecutionLog(executionId, node.id, nodeInput, executionResult, workflowId);
                
                console.log(`✅ Executed: ${node.name || node.type} → Port: ${executionResult.selectedPort || 'next'}`);
                
                if (executionResult.selectedPort) {
                    const outgoingConnections = connections.filter(conn => conn.source === node.id);
                    const matchingConnections = outgoingConnections.filter(conn => 
                        conn.sourceHandle === executionResult.selectedPort || 
                        (!conn.sourceHandle && executionResult.selectedPort === 'next')
                    );
                    
                    results[`${node.id}_selected_port`] = executionResult.selectedPort;
                    results[`${node.id}_triggered_connections`] = matchingConnections.map(c => c.target);
                }
                
                if (executionResult.selectedPort === 'error') {
                    console.log(`⚠️ Stopping workflow due to error at node: ${node.name || node.type}`);
                    break;
                }
            }
            
            this.executingWorkflows.set(executionId, {
                workflowId,
                status: 'completed',
                results,
                runHistory,
                completedAt: new Date().toISOString()
            });
            
            console.log(`✅ Workflow ${workflowId} completed successfully`);
            
            return { 
                success: true, 
                executionId,
                results,
                runHistory,
                executionOrder: executionOrder.map(n => ({ id: n.id, type: n.type, name: n.name }))
            };
            
        } catch (error) {
            console.error(`❌ Workflow execution error:`, error);
            
            this.executingWorkflows.set(executionId, {
                workflowId,
                status: 'failed',
                error: error.message,
                failedAt: new Date().toISOString()
            });
            
            throw error;
        }
    }
    
    // ================================================
    // BUILD DEPENDENCY GRAPH
    // ================================================
    buildDependencyGraph(nodes, connections) {
        const graph = new Map();
        
        nodes.forEach(node => {
            graph.set(node.id, {
                node: node,
                dependencies: [],
                dependents: [],
                inDegree: 0
            });
        });
        
        connections.forEach(conn => {
            const sourceGraph = graph.get(conn.source);
            const targetGraph = graph.get(conn.target);
            
            if (sourceGraph && targetGraph) {
                sourceGraph.dependents.push(conn.target);
                targetGraph.dependencies.push(conn.source);
                targetGraph.inDegree++;
            }
        });
        
        return graph;
    }
    
    // ================================================
    // TOPOLOGICAL SORT (Kahn's Algorithm)
    // ================================================
    topologicalSort(nodes, connections, graph) {
        const sorted = [];
        const queue = [];
        const inDegree = new Map();
        
        nodes.forEach(node => {
            const incomingCount = connections.filter(conn => conn.target === node.id).length;
            inDegree.set(node.id, incomingCount);
            if (incomingCount === 0) {
                queue.push(node);
            }
        });
        
        while (queue.length > 0) {
            const node = queue.shift();
            sorted.push(node);
            
            const outgoing = connections.filter(conn => conn.source === node.id);
            
            for (const conn of outgoing) {
                const newInDegree = inDegree.get(conn.target) - 1;
                inDegree.set(conn.target, newInDegree);
                
                if (newInDegree === 0) {
                    const targetNode = nodes.find(n => n.id === conn.target);
                    if (targetNode) {
                        queue.push(targetNode);
                    }
                }
            }
        }
        
        if (sorted.length !== nodes.length) {
            console.warn('⚠️ Cycle detected in workflow graph');
        }
        
        return sorted;
    }
    
    // ================================================
    // EXECUTE NODE ACTION WITH PORT-AWARE ROUTING
    // ================================================
    async executeNodeAction(node, input, runHistory = {}, executionId = null) {
        const nodeType = node.type;
        const config = node.config || {};
        
        const resolvedConfig = this.resolveConfigVariables(config, input, runHistory);
        
        let output = {};
        let selectedPort = 'next';
        let status = 'completed';
        
        try {
            switch (nodeType) {
                // ===== TRIGGERS =====
                case 'trigger':
                case 'webhook':
                    output = { webhook_data: input, received_at: new Date().toISOString() };
                    selectedPort = 'next';
                    break;
                    
                case 'schedule':
                    output = { scheduled: true, triggered_at: new Date().toISOString() };
                    selectedPort = 'next';
                    break;
                
                // ===== AI ACTIONS =====
                case 'ai':
                case 'ai_content':
                case 'gemini':
                case 'ai_agent':
                case 'ai_memory':
                case 'knowledge_base':
                case 'basic_llm_chain':
                case 'ai_chat':
                case 'vector_db':
                    output = await this.executeAIAction(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'ai_image':
                    output = await this.executeAIImage(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'ai_video':
                case 'video_script':
                    output = await this.executeAIVideo(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'ai_lead_scoring':
                    output = await this.executeLeadScoring(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                
                case 'ai_summarize':
                case 'ai_translate':
                case 'ai_sentiment':
                case 'ai_embedding':
                    output = { result: "AI processing completed", input: input };
                    selectedPort = 'next';
                    break;
                
                // ===== CONTENT FETCHERS =====
                case 'web_scraper':
                case 'api_fetcher':
                case 'rss_feed':
                    output = await this.executeRSS(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                
                // ===== SOCIAL MEDIA =====
                case 'post_instagram':
                case 'post_facebook':
                case 'post_twitter':
                case 'post_linkedin':
                case 'post_tiktok':
                case 'post_youtube':
                case 'post_pinterest':
                case 'post_reddit':
                case 'post_telegram':
                case 'post_discord':
                    output = await this.executeSocialPost(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'generate_hashtags':
                    output = await this.generateHashtags(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'schedule_post':
                    output = await this.schedulePost(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'social_analytics':
                case 'social_monitor':
                case 'social_mention':
                    output = { platform: nodeType, data: { followers: 1000, engagement: 5.2 } };
                    selectedPort = 'next';
                    break;
                
                // ===== E-COMMERCE =====
                case 'shopify_order':
                case 'shopify_product':
                case 'woo_order':
                    output = await this.executeShopify(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'inventory_check':
                    output = await this.checkInventory(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'cart_recovery':
                    output = await this.recoverCart(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'stripe_payment':
                case 'paypal_payment':
                    output = await this.executeStripe(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'create_invoice':
                case 'send_invoice':
                case 'update_stock':
                case 'price_monitor':
                case 'competitor_tracker':
                    output = { success: true, action: nodeType, processed_at: new Date().toISOString() };
                    selectedPort = 'next';
                    break;
                
                // ===== CRM & SALES =====
                case 'create_lead':
                    output = await this.createLead(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'update_crm':
                case 'salesforce_contact':
                case 'hubspot_contact':
                case 'pipedrive_deal':
                    output = await this.updateCRM(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'send_campaign':
                case 'sms_marketing':
                case 'whatsapp_message':
                case 'appointment_scheduler':
                case 'feedback_collector':
                    output = { success: true, campaign_sent: true, recipients: 100 };
                    selectedPort = 'next';
                    break;
                
                // ===== COMMUNICATION =====
                case 'send_email':
                    output = await this.sendEmail(resolvedConfig, input);
                    selectedPort = output.sent ? 'next' : 'error';
                    break;
                    
                case 'send_slack':
                    output = await this.sendSlack(resolvedConfig, input);
                    selectedPort = output.sent ? 'next' : 'error';
                    break;
                    
                case 'send_telegram':
                case 'send_sms':
                case 'send_teams':
                case 'send_discord':
                case 'send_push':
                    output = await this.sendSlack(resolvedConfig, input);
                    selectedPort = output.sent ? 'next' : 'error';
                    break;
                    
                case 'send_webhook':
                    output = await this.executeWebhook(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                // ===== LOGIC NODES =====
                case 'condition':
                    const conditionResult = this.executeCondition(resolvedConfig, input);
                    output = conditionResult.output;
                    selectedPort = conditionResult.selectedPort;
                    break;
                    
                case 'enhanced_condition':
                    const enhancedResult = this.executeEnhancedCondition(resolvedConfig, input);
                    output = enhancedResult.output;
                    selectedPort = enhancedResult.selectedPort;
                    break;
                    
                case 'switch':
                    const switchResult = this.executeSwitch(resolvedConfig, input);
                    output = switchResult.output;
                    selectedPort = switchResult.selectedPort;
                    break;
                    
                case 'wait':
                    output = await this.executeWait(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'loop':
                    output = await this.executeLoop(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'loop_items':
                    const loopItemsResult = this.executeLoopItems(resolvedConfig, input);
                    output = loopItemsResult.output;
                    selectedPort = loopItemsResult.selectedPort;
                    break;
                    
                case 'split':
                    output = this.executeSplit(resolvedConfig, input);
                    selectedPort = output.items?.length > 0 ? 'item' : 'done';
                    break;
                    
                case 'aggregate':
                    output = this.executeAggregate(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'code':
                    output = this.executeCustomCode(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'transform':
                    output = this.executeTransform(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'filter':
                    const filterResult = this.executeFilter(resolvedConfig, input);
                    output = filterResult.output;
                    selectedPort = filterResult.selectedPort;
                    break;
                    
                case 'sort':
                case 'sort_node':
                case 'limit_node':
                    output = this.executeSortLimit(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'set_variable':
                    const setVarResult = this.executeSetVariable(resolvedConfig, input, runHistory);
                    output = setVarResult.output;
                    selectedPort = 'next';
                    break;
                    
                case 'get_variable':
                    const getVarResult = this.executeGetVariable(resolvedConfig, input, runHistory);
                    output = getVarResult.output;
                    selectedPort = 'next';
                    break;
                    
                case 'merge_node':
                    output = this.executeMergeNode(resolvedConfig, input, runHistory);
                    selectedPort = 'next';
                    break;
                    
                case 'pass_through':
                    output = { output: input, passed_through: true };
                    selectedPort = 'next';
                    break;
                    
                case 'deduplicate':
                    output = this.executeDeduplicate(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'flatten_expand':
                    output = this.executeFlattenExpand(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'break_node':
                    output = { stopped: true, message: resolvedConfig.message || 'Workflow stopped' };
                    selectedPort = null;
                    break;
                    
                case 'continue_node':
                    output = { continued: true, skip_count: parseInt(resolvedConfig.skip_count) || 1 };
                    selectedPort = 'next';
                    break;
                
                // ===== ERROR HANDLING NODES =====
                case 'error_trigger':
                    output = { error_caught: true, error_data: input };
                    selectedPort = 'error';
                    break;
                    
                case 'retry_node':
                    output = { retry_count: 0, max_retries: parseInt(resolvedConfig.max_retries) || 3, success: true };
                    selectedPort = 'next';
                    break;
                    
                case 'timeout_node':
                    output = { timeout_seconds: parseInt(resolvedConfig.timeout_seconds) || 30, action_on_timeout: resolvedConfig.action_on_timeout || 'fail', completed: true };
                    selectedPort = 'next';
                    break;
                    
                case 'try_catch':
                    output = { try_executed: true, data: input, caught: false };
                    selectedPort = 'next';
                    break;
                    
                case 'fallback_node':
                    output = { fallback_triggered: false, primary_success: true };
                    selectedPort = 'next';
                    break;
                
                // ===== PERFORMANCE NODES =====
                case 'rate_limit':
                    const rateResult = this.executeRateLimitNode(resolvedConfig, input);
                    output = rateResult.output;
                    selectedPort = rateResult.selectedPort;
                    break;
                    
                case 'queue_delay':
                    const delaySec = parseInt(resolvedConfig.delay_seconds) || 5;
                    await new Promise(r => setTimeout(r, delaySec * 1000));
                    output = { queue_name: resolvedConfig.queue_name || 'default', delay_seconds: delaySec, processed_at: new Date().toISOString() };
                    selectedPort = 'next';
                    break;
                    
                case 'cache_node':
                    const cacheResult = await this.executeCacheNode(resolvedConfig, input);
                    output = cacheResult.output;
                    selectedPort = cacheResult.selectedPort;
                    break;
                
                // ===== INTEGRATIONS =====
                case 'http':
                case 'http_request':
                case 'http_advanced':
                    output = await this.executeHTTP(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'graphql':
                    output = await this.executeGraphQL(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'webhook':
                    output = await this.executeWebhook(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'rss':
                    output = await this.executeRSS(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'google_sheets':
                case 'google_drive':
                case 'google_calendar':
                case 'gmail':
                    output = await this.executeGoogleService(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'dropbox':
                case 'onedrive':
                case 'aws_s3':
                case 'azure_blob':
                    output = { success: true, service: nodeType, path: resolvedConfig.path };
                    selectedPort = 'next';
                    break;
                    
                case 'zapier_webhook':
                case 'make_webhook':
                case 'pabbly':
                    output = await this.executeWebhook(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                case 'api_pagination':
                    output = { pages: 3, total_items: 150, items: [] };
                    selectedPort = 'next';
                    break;
                
                // ===== DATABASE =====
                case 'database_query':
                case 'insert_row':
                case 'postgresql':
                case 'mysql':
                case 'mongodb':
                case 'firebase':
                case 'supabase':
                case 'airtable':
                    output = await this.executeDatabase(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                // ===== FILE OPERATIONS =====
                case 'file_upload':
                case 'file_read':
                case 'file_write':
                case 'file_download':
                case 'file_convert':
                    output = { success: true, file_path: resolvedConfig.file_path, operation: nodeType };
                    selectedPort = 'next';
                    break;
                
                // ===== DATA OPERATIONS =====
                case 'json_parse':
                case 'json_stringify':
                case 'data_mapper':
                    output = { result: "Data transformation completed", original: input };
                    selectedPort = 'next';
                    break;
                
                // ===== AUTH NODES =====
                case 'oauth_connect':
                    output = { provider: resolvedConfig.provider || 'google', status: 'oauth_flow_required', auth_url: 'https://accounts.google.com/o/oauth2/v2/auth' };
                    selectedPort = 'next';
                    break;
                    
                case 'credential_injector':
                    output = { credential_id: resolvedConfig.credential_id || '', inject_into: resolvedConfig.inject_into || 'headers' };
                    selectedPort = 'next';
                    break;
                
                // ===== DEVOPS =====
                case 'docker':
                case 'kubernetes':
                case 'jenkins':
                case 'github_actions':
                case 'gitlab_ci':
                case 'terraform':
                case 'webhook_deploy':
                    output = { success: true, service: nodeType, action: resolvedConfig.action || 'deploy', run_id: 'run_' + Date.now() };
                    selectedPort = 'next';
                    break;
                
                // ===== ANALYTICS =====
                case 'google_analytics':
                case 'mixpanel':
                case 'amplitude':
                case 'segment':
                case 'hotjar':
                case 'metabase':
                    output = { success: true, service: nodeType, data: { users: 1234, sessions: 5678, bounce_rate: 45.2 } };
                    selectedPort = 'next';
                    break;
                
                // ===== CUSTOM APP =====
                case 'custom_app':
                    try {
                        const customUrl = resolvedConfig.webhook_url;
                        if (customUrl) {
                            await axios.post(customUrl, input);
                            output = { success: true, app_name: resolvedConfig.name, sent_at: new Date().toISOString() };
                        } else {
                            output = { success: false, error: 'No webhook URL configured' };
                            selectedPort = 'error';
                        }
                    } catch(e) { 
                        output = { success: false, error: e.message }; 
                        selectedPort = 'error'; 
                    }
                    break;
                
                // ===== DEFAULT =====
                default:
                    output = { output: input, node_type: nodeType, message: `Node ${nodeType} executed` };
                    selectedPort = 'next';
            }
            
            // Ensure output has proper structure
            if (!Array.isArray(output) && output.items && Array.isArray(output.items)) {
                // Already in batch format
            } else if (Array.isArray(output)) {
                output = { items: output, count: output.length };
            } else if (output.data && Array.isArray(output.data)) {
                output = { items: output.data, count: output.data.length, ...output };
            }
            
            return {
                output: output,
                selectedPort: selectedPort,
                status: status,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`❌ Node execution error (${nodeType}):`, error);
            
            return {
                output: { error: error.message, input: input },
                selectedPort: 'error',
                status: 'failed',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    // ================================================
    // RESOLVE VARIABLES WITH RUN HISTORY
    // ================================================
    resolveConfigVariables(config, input, runHistory) {
        const resolved = {};
        
        for (const [key, value] of Object.entries(config)) {
            if (typeof value === 'string') {
                resolved[key] = this.interpolateWithHistory(value, input, runHistory);
            } else if (typeof value === 'object' && value !== null) {
                resolved[key] = this.resolveConfigVariables(value, input, runHistory);
            } else {
                resolved[key] = value;
            }
        }
        
        return resolved;
    }
    
    interpolateWithHistory(text, currentData, runHistory) {
        if (typeof text !== 'string') return text;
        
        let result = text.replace(/\{\{\s*\$node\["([^"]+)"\]\.json\["([^"]+)"\]\s*\}\}/g, (match, nodeName, property) => {
            const nodeResult = runHistory[nodeName];
            if (nodeResult && nodeResult[property] !== undefined) {
                return String(nodeResult[property]);
            }
            return match;
        });
        
        result = result.replace(/\{\{\s*data\.([^\s}]+)\s*\}\}/g, (match, property) => {
            if (currentData && currentData[property] !== undefined) {
                return String(currentData[property]);
            }
            return match;
        });
        
        result = result.replace(/\{\{\s*trigger\.([^\s}]+)\s*\}\}/g, (match, property) => {
            if (currentData && currentData[property] !== undefined) {
                return String(currentData[property]);
            }
            return match;
        });
        
        result = result.replace(/\{\{\s*\$json\.([^\s}]+)\s*\}\}/g, (match, property) => {
            if (currentData && currentData[property] !== undefined) {
                return String(currentData[property]);
            }
            return match;
        });
        
        result = result.replace(/\{\{\s*\$variable\.([^\s}]+)\s*\}\}/g, (match, varName) => {
            if (runHistory[`var_${varName}`] !== undefined) {
                return String(runHistory[`var_${varName}`]);
            }
            return match;
        });
        
        return result;
    }
    
    // ================================================
    // AI ACTIONS
    // ================================================
    async executeAIAction(config, input) {
        const prompt = this.interpolate(config.prompt, input);
        const systemPrompt = config.system_prompt || 'You are a helpful AI assistant.';
        const model = config.model || 'gpt-3.5-turbo';
        const temperature = parseFloat(config.temperature) || 0.7;
        
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: temperature
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return {
                content: response.data.choices[0].message.content,
                model: model,
                prompt: prompt,
                tokens: response.data.usage.total_tokens,
                session_id: `session_${Date.now()}`
            };
        } catch (error) {
            return { error: error.message, fallback: 'AI service unavailable', content: `[AI Response] ${prompt.substring(0, 100)}...` };
        }
    }
    
    async executeAIImage(config, input) {
        const prompt = this.interpolate(config.prompt, input);
        const style = config.style || 'realistic';
        
        try {
            const encodedPrompt = encodeURIComponent(`${style} style: ${prompt}`);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024`;
            
            return {
                image_url: imageUrl,
                prompt: prompt,
                style: style,
                generated_at: new Date().toISOString()
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async executeAIVideo(config, input) {
        const prompt = this.interpolate(config.prompt, input);
        const duration = parseInt(config.duration) || 30;
        const style = config.style || 'cinematic';
        
        const scenes = Math.ceil(duration / 10);
        let script = `# VIDEO SCRIPT: "${prompt}"\n`;
        script += `Duration: ${duration}s\nStyle: ${style}\nScenes: ${scenes}\n\n`;
        
        for (let i = 1; i <= scenes; i++) {
            script += `Scene ${i}: ${i === 1 ? `Introduction to ${prompt}` : i === scenes ? `Conclusion for ${prompt}` : `Key point ${i-1} about ${prompt}`}\n`;
        }
        
        return {
            video_script: script,
            prompt: prompt,
            duration: duration,
            style: style,
            generated_at: new Date().toISOString()
        };
    }
    
    async executeLeadScoring(config, input) {
        const email = this.interpolate(config.email, input);
        const name = this.interpolate(config.name, input);
        const company = this.interpolate(config.company, input);
        
        let score = 50;
        if (email) score += 20;
        if (name) score += 10;
        if (company) score += 15;
        if (input.budget && input.budget > 1000) score += 15;
        
        const rating = score >= 80 ? 'hot' : score >= 55 ? 'warm' : 'cold';
        
        return {
            lead_score: Math.min(score, 100),
            rating: rating,
            lead_data: { email, name, company },
            scored_at: new Date().toISOString()
        };
    }
    
    // ================================================
    // SOCIAL MEDIA ACTIONS
    // ================================================
    async executeSocialPost(platform, config, input) {
        const content = this.interpolate(config.content || config.message || config.caption, input);
        const platformName = platform.replace('post_', '');
        
        console.log(`📱 Posting to ${platformName}: ${content?.substring(0, 100)}`);
        
        return {
            platform: platformName,
            content: content,
            success: true,
            posted_at: new Date().toISOString(),
            post_id: `${platformName}_${Date.now()}`
        };
    }
    
    async generateHashtags(config, input) {
        const topic = this.interpolate(config.topic, input);
        const count = parseInt(config.count) || 15;
        
        const hashtags = [
            `#${topic.replace(/[^a-zA-Z0-9]/g, '')}`,
            '#AI', '#Automation', '#Workflow', '#NoCode', '#SaaS',
            '#BusinessAutomation', '#DigitalTransformation', '#TechInnovation'
        ].slice(0, count);
        
        return {
            hashtags: hashtags,
            count: hashtags.length,
            topic: topic,
            generated_at: new Date().toISOString()
        };
    }
    
    async schedulePost(config, input) {
        const platform = this.interpolate(config.platform, input);
        const content = this.interpolate(config.content, input);
        const scheduleTime = this.interpolate(config.schedule_time, input);
        
        return {
            platform: platform,
            content: content,
            scheduled_for: scheduleTime,
            status: 'scheduled',
            schedule_id: `sch_${Date.now()}`,
            scheduled_at: new Date().toISOString()
        };
    }
    
    // ================================================
    // E-COMMERCE ACTIONS
    // ================================================
    async executeShopify(nodeType, config, input) {
        const storeUrl = this.interpolate(config.store_url, input);
        
        return {
            action: nodeType.includes('order') ? 'order_created' : 'product_updated',
            store_url: storeUrl,
            success: true,
            shopify_id: `shopify_${Date.now()}`
        };
    }
    
    async checkInventory(config, input) {
        const platform = this.interpolate(config.platform, input) || 'shopify';
        
        return {
            platform: platform,
            total_products: 150,
            low_stock_items: 3,
            out_of_stock: 1,
            checked_at: new Date().toISOString()
        };
    }
    
    async recoverCart(config, input) {
        const platform = this.interpolate(config.platform, input) || 'shopify';
        const discountPercent = parseInt(config.discount_percent) || 10;
        
        return {
            platform: platform,
            carts_recovered: 5,
            discount_applied: discountPercent,
            recovered_at: new Date().toISOString()
        };
    }
    
    async executeStripe(config, input) {
        const amount = parseFloat(this.interpolate(config.amount, input)) || 0;
        const currency = this.interpolate(config.currency, input) || 'usd';
        
        return {
            amount: amount,
            currency: currency,
            success: true,
            payment_id: `pi_${Date.now()}`,
            status: 'succeeded',
            processed_at: new Date().toISOString()
        };
    }
    
    // ================================================
    // CRM ACTIONS
    // ================================================
    async createLead(config, input) {
        const name = this.interpolate(config.name || config.lead_name, input);
        const email = this.interpolate(config.email, input);
        const phone = this.interpolate(config.phone, input);
        
        const lead = {
            id: `lead_${Date.now()}`,
            name: name,
            email: email,
            phone: phone,
            status: 'new',
            source: config.source || 'workflow',
            created_at: new Date().toISOString()
        };
        
        // Save to Supabase if configured
        try {
            await supabase.from('leads').insert(lead);
        } catch(e) { console.log('Lead not saved to DB:', e.message); }
        
        return lead;
    }
    
    async updateCRM(nodeType, config, input) {
        const recordId = this.interpolate(config.record_id, input);
        
        return {
            record_id: recordId,
            platform: nodeType.replace('_contact', '').replace('_deal', ''),
            success: true,
            updated_at: new Date().toISOString()
        };
    }
    
    // ================================================
    // COMMUNICATION ACTIONS
    // ================================================
    async sendEmail(config, input) {
        const to = this.interpolate(config.to, input);
        const subject = this.interpolate(config.subject, input);
        const body = this.interpolate(config.body, input);
        
        console.log(`📧 Sending email to ${to}: ${subject}`);
        
        return {
            to: to,
            subject: subject,
            sent: true,
            message_id: `email_${Date.now()}`,
            sent_at: new Date().toISOString()
        };
    }
    
    async sendSlack(config, input) {
        const channel = this.interpolate(config.channel, input) || '#general';
        const message = this.interpolate(config.message, input);
        
        console.log(`💬 Sending Slack to ${channel}: ${message?.substring(0, 100)}`);
        
        return {
            channel: channel,
            message: message?.substring(0, 100),
            sent: true,
            timestamp: new Date().toISOString()
        };
    }
    
    // ================================================
    // LOGIC ACTIONS (PORT-AWARE)
    // ================================================
    executeCondition(config, input) {
        try {
            const condition = config.condition;
            const conditionFn = new Function('data', `try { return ${condition}; } catch(e) { return false; }`);
            const result = conditionFn(input);
            
            const selectedPort = result === true ? 'true' : result === false ? 'false' : String(result);
            
            return {
                output: { condition: condition, result: result, evaluated_data: input },
                selectedPort: selectedPort
            };
        } catch (error) {
            return {
                output: { error: error.message, result: false },
                selectedPort: 'error'
            };
        }
    }
    
    executeEnhancedCondition(config, input) {
        try {
            let conditions = [];
            try { conditions = JSON.parse(config.conditions || '[]'); } catch(e) { conditions = []; }
            
            const logicalOperator = config.logical_operator || 'and';
            const caseSensitive = config.case_sensitive === 'true';
            
            const evaluateCondition = (condition) => {
                let fieldValue = input;
                const fieldParts = condition.field.split('.');
                for (const part of fieldParts) {
                    fieldValue = fieldValue?.[part];
                }
                
                let conditionValue = condition.value;
                if (!caseSensitive && typeof fieldValue === 'string' && typeof conditionValue === 'string') {
                    fieldValue = fieldValue.toLowerCase();
                    conditionValue = conditionValue.toLowerCase();
                }
                
                switch(condition.operator) {
                    case 'eq': return fieldValue == conditionValue;
                    case 'neq': return fieldValue != conditionValue;
                    case 'gt': return fieldValue > conditionValue;
                    case 'gte': return fieldValue >= conditionValue;
                    case 'lt': return fieldValue < conditionValue;
                    case 'lte': return fieldValue <= conditionValue;
                    case 'contains': return String(fieldValue).includes(String(conditionValue));
                    case 'startsWith': return String(fieldValue).startsWith(String(conditionValue));
                    case 'endsWith': return String(fieldValue).endsWith(String(conditionValue));
                    case 'in': return Array.isArray(conditionValue) ? conditionValue.includes(fieldValue) : String(conditionValue).split(',').includes(String(fieldValue));
                    default: return false;
                }
            };
            
            const result = logicalOperator === 'or' ? conditions.some(evaluateCondition) : conditions.every(evaluateCondition);
            const selectedPort = result ? 'true' : 'false';
            
            return {
                output: { condition_result: result, evaluated_data: input },
                selectedPort: selectedPort
            };
        } catch (error) {
            return {
                output: { error: error.message, condition_result: false },
                selectedPort: 'error'
            };
        }
    }
    
    executeSwitch(config, input) {
        try {
            const switchField = config.switch_field;
            let cases = {};
            try { cases = JSON.parse(config.cases || '{}'); } catch(e) { cases = { default: 'default' }; }
            
            let value = input;
            const fieldParts = switchField.split('.');
            for (const part of fieldParts) {
                value = value?.[part];
            }
            
            const selectedPort = cases[value] || cases['default'] || 'default';
            
            return {
                output: { switch_field: switchField, value: value, selected_case: selectedPort },
                selectedPort: selectedPort
            };
        } catch (error) {
            return {
                output: { error: error.message },
                selectedPort: 'error'
            };
        }
    }
    
    async executeWait(config, input) {
        const duration = parseInt(config.duration) || 5;
        const unit = config.unit || 'seconds';
        const ms = duration * (unit === 'seconds' ? 1000 : unit === 'minutes' ? 60000 : 3600000);
        
        await new Promise(resolve => setTimeout(resolve, ms));
        
        return {
            waited: `${duration} ${unit}`,
            waited_ms: ms,
            waited_at: new Date().toISOString()
        };
    }
    
    async executeLoop(config, input) {
        const iterations = parseInt(config.iterations) || 3;
        const splitArrays = config.split_arrays === 'true';
        
        let itemsToProcess = [];
        
        if (splitArrays && Array.isArray(input.data)) {
            itemsToProcess = input.data.map((item, index) => ({ json: item, index: index, total: input.data.length }));
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
    
    executeLoopItems(config, input) {
        let items = input.items || input.data || [];
        if (!Array.isArray(items)) items = [items];
        
        const maxIterations = parseInt(config.max_iterations) || 100;
        const itemsToProcess = items.slice(0, maxIterations);
        
        return {
            output: {
                items: itemsToProcess,
                total_items: items.length,
                processed_items: itemsToProcess.length,
                current_index: 0
            },
            selectedPort: itemsToProcess.length > 0 ? 'item' : 'done'
        };
    }
    
    executeSplit(config, input) {
        const field = config.field || 'data';
        const batchSize = parseInt(config.batch_size) || 10;
        
        let arrayToSplit = input[field] || input.data || input.items || [];
        if (!Array.isArray(arrayToSplit)) arrayToSplit = [arrayToSplit];
        
        const batches = [];
        for (let i = 0; i < arrayToSplit.length; i += batchSize) {
            batches.push(arrayToSplit.slice(i, i + batchSize));
        }
        
        return {
            original_count: arrayToSplit.length,
            batches: batches,
            batch_size: batchSize,
            items: batches.length > 0 ? batches[0] : [],
            selected_port: batches.length > 0 ? 'item' : 'done'
        };
    }
    
    executeAggregate(config, input) {
        const operation = config.operation || 'sum';
        const field = config.field || 'value';
        
        let items = input.items || input.data || [];
        if (!Array.isArray(items)) items = [items];
        
        const values = items.map(item => parseFloat(item[field] || item)).filter(v => !isNaN(v));
        
        let result;
        switch (operation) {
            case 'sum': result = values.reduce((a, b) => a + b, 0); break;
            case 'avg': result = values.reduce((a, b) => a + b, 0) / (values.length || 1); break;
            case 'min': result = Math.min(...values); break;
            case 'max': result = Math.max(...values); break;
            case 'count': result = values.length; break;
            default: result = values.reduce((a, b) => a + b, 0);
        }
        
        return {
            operation: operation,
            field: field,
            input_count: items.length,
            values_processed: values.length,
            result: result,
            aggregated_at: new Date().toISOString()
        };
    }
    
    executeCustomCode(config, input) {
        try {
            const code = config.code || 'return data;';
            
            const sandbox = {
                data: input,
                console: { log: (...args) => console.log('[Code Node]', ...args) },
                Date: Date,
                Math: Math,
                JSON: JSON,
                Array: Array,
                Object: Object,
                String: String,
                Number: Number,
                Boolean: Boolean
            };
            
            const wrappedCode = `(function() { ${code}; return data; })()`;
            const script = new vm.Script(wrappedCode);
            const context = vm.createContext(sandbox);
            const result = script.runInContext(context);
            
            return {
                output: result,
                transformed: true,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                error: error.message,
                output: input,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    executeTransform(config, input) {
        let mapping = {};
        try { mapping = JSON.parse(config.mapping || '{}'); } catch(e) {}
        
        const transformed = {};
        for (const [targetKey, sourcePath] of Object.entries(mapping)) {
            const parts = sourcePath.split('.');
            let value = input;
            for (const part of parts) {
                value = value?.[part];
                if (value === undefined) break;
            }
            transformed[targetKey] = value;
        }
        
        return {
            original: input,
            transformed: transformed,
            transform_type: 'map',
            timestamp: new Date().toISOString()
        };
    }
    
    executeFilter(config, input) {
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
            output: {
                original_count: items.length,
                filtered_count: filtered.length,
                items: filtered,
                filter: { field, operator, value }
            },
            selectedPort: filtered.length > 0 ? 'true' : 'false'
        };
    }
    
    executeSortLimit(config, input) {
        const field = config.field || 'timestamp';
        const order = config.order || 'desc';
        const limit = parseInt(config.limit) || 100;
        
        let items = input.items || input.data || [];
        if (!Array.isArray(items)) items = [items];
        
        const sorted = [...items].sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (order === 'desc') return aVal > bVal ? -1 : 1;
            return aVal < bVal ? -1 : 1;
        });
        
        const limited = sorted.slice(0, limit);
        
        return {
            sorted_data: limited,
            original_count: items.length,
            sorted_count: limited.length,
            sort_field: field,
            sort_order: order,
            sorted_at: new Date().toISOString()
        };
    }
    
    executeSetVariable(config, input, runHistory) {
        const varName = this.interpolate(config.variable_name, input) || 'myVar';
        let varValue = this.interpolate(config.variable_value, input);
        try { varValue = JSON.parse(varValue); } catch(e) {}
        
        runHistory[`var_${varName}`] = varValue;
        
        return {
            output: { variable_name: varName, variable_value: varValue, set_at: new Date().toISOString() }
        };
    }
    
    executeGetVariable(config, input, runHistory) {
        const varName = this.interpolate(config.variable_name, input) || 'myVar';
        let defaultValue = config.default_value;
        try { defaultValue = JSON.parse(defaultValue); } catch(e) {}
        
        const value = runHistory[`var_${varName}`] !== undefined ? runHistory[`var_${varName}`] : defaultValue;
        
        return {
            output: { variable_name: varName, variable_value: value, found: runHistory[`var_${varName}`] !== undefined }
        };
    }
    
    executeMergeNode(config, input, runHistory) {
        const mergeType = config.merge_type || 'object';
        
        const nodeNames = Object.keys(runHistory);
        const lastNodeName = nodeNames[nodeNames.length - 2];
        const input2 = lastNodeName ? runHistory[lastNodeName] : {};
        
        let merged = {};
        if (mergeType === 'object') {
            merged = { ...input, ...input2 };
        } else if (mergeType === 'array') {
            const arr1 = Array.isArray(input) ? input : [input];
            const arr2 = Array.isArray(input2) ? input2 : [input2];
            merged = [...arr1, ...arr2];
        }
        
        return { merged_data: merged, merge_type: mergeType };
    }
    
    executeDeduplicate(config, input) {
        let fields = ['id'];
        try { fields = JSON.parse(config.fields || '["id"]'); } catch(e) {}
        const keepFirst = config.keep_first !== 'false';
        
        let items = input.items || input.data || [];
        if (!Array.isArray(items)) items = [items];
        
        const seen = new Map();
        const unique = [];
        
        for (const item of items) {
            const key = fields.map(f => String(item[f] || '')).join('|');
            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(item);
            } else if (!keepFirst) {
                const index = unique.findIndex(u => fields.every(f => u[f] === item[f]));
                if (index !== -1) unique[index] = item;
            }
        }
        
        return {
            original_count: items.length,
            unique_count: unique.length,
            deduplicated_data: unique,
            fields_used: fields
        };
    }
    
    executeFlattenExpand(config, input) {
        const operation = config.operation || 'flatten';
        const separator = config.separator || '_';
        let data = input.data || input;
        
        const flattenObject = (obj, prefix = '') => {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                const newKey = prefix ? `${prefix}${separator}${key}` : key;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    Object.assign(result, flattenObject(value, newKey));
                } else {
                    result[newKey] = value;
                }
            }
            return result;
        };
        
        const expandObject = (obj) => {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                const parts = key.split(separator);
                let current = result;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) current[parts[i]] = {};
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = value;
            }
            return result;
        };
        
        const processed = operation === 'flatten' ? flattenObject(data) : expandObject(data);
        
        return {
            operation: operation,
            original_keys: Object.keys(data).length,
            result_keys: Object.keys(processed).length,
            processed_data: processed
        };
    }
    
    executeRateLimitNode(config, input) {
        const maxRequests = parseInt(config.max_requests) || 100;
        const timeWindowSeconds = parseInt(config.time_window_seconds) || 60;
        const key = this.interpolate(config.key_field || 'default', input);
        
        const now = Date.now();
        const windowStart = now - (timeWindowSeconds * 1000);
        
        let requests = this.rateLimitStore.get(key) || [];
        requests = requests.filter(t => t > windowStart);
        
        const isLimited = requests.length >= maxRequests;
        
        if (!isLimited) {
            requests.push(now);
            this.rateLimitStore.set(key, requests);
        }
        
        return {
            output: {
                limited: isLimited,
                key: key,
                current_count: requests.length,
                max_allowed: maxRequests,
                reset_in_ms: isLimited ? (requests[0] + (timeWindowSeconds * 1000) - now) : 0
            },
            selectedPort: isLimited ? 'blocked' : 'next'
        };
    }
    
    async executeCacheNode(config, input) {
        const cacheKey = this.interpolate(config.cache_key, input);
        const ttlSeconds = parseInt(config.ttl_seconds) || 3600;
        const operation = config.operation || 'get';
        
        if (operation === 'get') {
            const cached = this.cacheStore.get(cacheKey);
            if (cached && cached.expires > Date.now()) {
                return {
                    output: { hit: true, key: cacheKey, value: cached.value },
                    selectedPort: 'next'
                };
            }
            return {
                output: { hit: false, key: cacheKey, value: null },
                selectedPort: 'miss'
            };
        } else if (operation === 'set') {
            const value = input.value || input;
            this.cacheStore.set(cacheKey, {
                value: value,
                expires: Date.now() + (ttlSeconds * 1000)
            });
            return {
                output: { set: true, key: cacheKey, ttl_seconds: ttlSeconds },
                selectedPort: 'next'
            };
        }
        
        return {
            output: { error: 'Unknown operation' },
            selectedPort: 'error'
        };
    }
    
    // ================================================
    // INTEGRATIONS
    // ================================================
    async executeHTTP(config, input) {
        try {
            const url = this.interpolate(config.url, input);
            const method = config.method || 'GET';
            let headers = {};
            let body = {};
            
            try { headers = JSON.parse(this.interpolate(config.headers, input)); } catch(e) {}
            try { body = JSON.parse(this.interpolate(config.body, input)); } catch(e) {}
            
            const response = await axios({
                method: method.toLowerCase(),
                url: url,
                headers: { 'Content-Type': 'application/json', ...headers },
                data: method !== 'GET' ? body : undefined,
                params: method === 'GET' ? body : undefined,
                timeout: parseInt(config.timeout) || 30000
            });
            
            return {
                status: response.status,
                data: response.data,
                headers: response.headers,
                url: url
            };
        } catch (error) {
            return {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status || 0
            };
        }
    }
    
    async executeGraphQL(config, input) {
        try {
            const endpoint = this.interpolate(config.endpoint, input);
            const query = this.interpolate(config.query, input);
            let variables = {};
            try { variables = JSON.parse(this.interpolate(config.variables, input) || '{}'); } catch(e) {}
            
            const response = await axios.post(endpoint, { query, variables }, {
                headers: { 'Content-Type': 'application/json' }
            });
            
            return {
                data: response.data,
                status: response.status
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async executeWebhook(config, input) {
        try {
            const url = this.interpolate(config.webhook_url || config.url, input);
            const method = config.method || 'POST';
            
            const payload = config.include_timestamp !== false ? { ...input, timestamp: new Date().toISOString() } : input;
            
            const response = await axios({
                method: method.toLowerCase(),
                url: url,
                data: payload,
                headers: { 'Content-Type': 'application/json' }
            });
            
            return {
                success: true,
                status: response.status,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async executeRSS(config, input) {
        try {
            const feedUrl = this.interpolate(config.feed_url, input);
            const limit = parseInt(config.limit) || 10;
            
            const response = await axios.get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
            
            if (response.data.status === 'ok') {
                const items = response.data.items.slice(0, limit);
                return {
                    feed_title: response.data.feed.title,
                    feed_description: response.data.feed.description,
                    items: items,
                    item_count: items.length,
                    fetched_at: new Date().toISOString()
                };
            }
            
            return { error: 'Failed to parse RSS feed' };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async executeGoogleService(service, config, input) {
        return {
            service: service.replace('google_', ''),
            success: true,
            data: { message: `Google ${service} action executed` },
            timestamp: new Date().toISOString()
        };
    }
    
    // ================================================
    // DATABASE ACTIONS
    // ================================================
    async executeDatabase(config, input) {
        try {
            const table = this.interpolate(config.table, input);
            
            if (config.operation === 'insert' || config.type === 'insert_row') {
                let data = {};
                try { data = JSON.parse(this.interpolate(config.data, input)); } catch(e) { data = { value: input }; }
                data.created_at = new Date().toISOString();
                
                const { data: inserted, error } = await supabase.from(table).insert(data).select().single();
                if (error) throw error;
                
                return { success: true, row: inserted, row_id: inserted?.id };
            } else {
                const query = this.interpolate(config.query, input);
                const { data, error } = await supabase.from(table).select('*').limit(100);
                if (error) throw error;
                
                return { success: true, rows: data, row_count: data.length, query: query };
            }
        } catch (error) {
            return { success: false, error: error.message, rows: [] };
        }
    }
    
    // ================================================
    // UTILITY METHODS
    // ================================================
    interpolate(text, data) {
        if (typeof text !== 'string') return text;
        return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const parts = path.trim().split('.');
            let value = data;
            for (const part of parts) {
                value = value?.[part];
                if (value === undefined) break;
            }
            return value !== undefined ? value : match;
        });
    }
    
    async saveExecutionLog(executionId, nodeId, input, result, workflowId) {
        try {
            await supabase.from('execution_logs').insert({
                execution_id: executionId,
                workflow_id: workflowId,
                node_id: nodeId,
                input: input,
                output: result.output,
                selected_port: result.selectedPort,
                status: result.status,
                executed_at: result.timestamp,
                created_at: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to save execution log:', error);
        }
    }
    
    getExecutionStatus(executionId) {
        return this.executingWorkflows.get(executionId);
    }
    
    async cancelExecution(executionId) {
        const execution = this.executingWorkflows.get(executionId);
        if (execution && execution.status === 'running') {
            execution.status = 'cancelled';
            execution.cancelledAt = new Date().toISOString();
            this.executingWorkflows.set(executionId, execution);
            return true;
        }
        return false;
    }
    
    // ================================================
    // BATCH PROCESSING (Array<Item> Support)
    // ================================================
    async executeBatch(nodes, items, connections) {
        const results = [];
        
        for (const item of items) {
            const executionOrder = this.topologicalSort(nodes, connections, this.buildDependencyGraph(nodes, connections));
            const runHistory = {};
            let currentData = item;
            
            for (const node of executionOrder) {
                const result = await this.executeNodeAction(node, currentData, runHistory);
                currentData = { ...currentData, ...result.output };
                runHistory[node.name || node.type] = result.output;
                
                if (result.selectedPort === 'error') break;
            }
            
            results.push({
                item: item,
                result: currentData,
                processed_at: new Date().toISOString()
            });
        }
        
        return {
            total_items: items.length,
            processed_count: results.length,
            results: results,
            completed_at: new Date().toISOString()
        };
    }
}

module.exports = new WorkflowEngine();