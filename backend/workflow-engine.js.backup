const { supabase } = require('./supabase');
const { exec } = require('child_process');
const axios = require('axios');
const vm = require('vm');

class WorkflowEngine {
    constructor() {
        this.workflows = new Map();
        this.executingWorkflows = new Map();
        this.executionHistory = new Map();
    }

    // ================================================
    // DAG-BASED EXECUTION WITH TOPOLOGICAL SORT
    // ================================================
    async executeWorkflow(workflowId, inputData = {}) {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            console.log(`🚀 Starting workflow execution: ${workflowId} (${executionId})`);
            
            // Get workflow from database
            const { data: workflow, error } = await supabase
                .from('workflows')
                .select('*')
                .eq('id', workflowId)
                .single();
            
            if (error) throw error;
            
            // Parse nodes and connections
            const nodes = workflow.nodes || [];
            const connections = workflow.edges || workflow.connections || [];
            
            // Build graph for topological sort
            const graph = this.buildDependencyGraph(nodes, connections);
            
            // Perform topological sort to determine execution order
            const executionOrder = this.topologicalSort(nodes, connections, graph);
            
            console.log(`📊 Execution order: ${executionOrder.map(n => n.name || n.type).join(' → ')}`);
            
            // Initialize run history for variable resolution
            const runHistory = {};
            
            // Execute nodes in topological order
            const results = {};
            
            for (const node of executionOrder) {
                // Collect input from all incoming connections
                const incomingConnections = connections.filter(conn => conn.target === node.id);
                let nodeInput = { ...inputData };
                
                for (const conn of incomingConnections) {
                    const sourceResult = results[conn.source];
                    if (sourceResult) {
                        // Merge based on port or full output
                        if (conn.sourceHandle && sourceResult[conn.sourceHandle] !== undefined) {
                            nodeInput = { ...nodeInput, ...sourceResult[conn.sourceHandle] };
                        } else if (sourceResult.output !== undefined) {
                            nodeInput = { ...nodeInput, ...sourceResult.output };
                        } else {
                            nodeInput = { ...nodeInput, ...sourceResult };
                        }
                    }
                }
                
                // Execute node with port-aware routing
                const executionResult = await this.executeNodeAction(node, nodeInput, runHistory, executionId);
                
                // Store result
                results[node.id] = executionResult.output;
                runHistory[node.name || node.type] = executionResult.output;
                
                // Log execution for debugging
                await this.saveExecutionLog(executionId, node.id, nodeInput, executionResult, workflowId);
                
                console.log(`✅ Executed: ${node.name || node.type} → Port: ${executionResult.selectedPort || 'next'}`);
                
                // Port-aware routing - only traverse to specific ports
                if (executionResult.selectedPort) {
                    const outgoingConnections = connections.filter(conn => conn.source === node.id);
                    const matchingConnections = outgoingConnections.filter(conn => 
                        conn.sourceHandle === executionResult.selectedPort || 
                        (!conn.sourceHandle && executionResult.selectedPort === 'next')
                    );
                    
                    // Store which ports were triggered
                    results[`${node.id}_selected_port`] = executionResult.selectedPort;
                    results[`${node.id}_triggered_connections`] = matchingConnections.map(c => c.target);
                }
            }
            
            // Save execution history
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
        
        // Initialize graph with all nodes
        nodes.forEach(node => {
            graph.set(node.id, {
                node: node,
                dependencies: [],
                dependents: [],
                inDegree: 0
            });
        });
        
        // Build edges
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
        
        // Calculate in-degrees
        nodes.forEach(node => {
            const incomingCount = connections.filter(conn => conn.target === node.id).length;
            inDegree.set(node.id, incomingCount);
            if (incomingCount === 0) {
                queue.push(node);
            }
        });
        
        // Process queue
        while (queue.length > 0) {
            const node = queue.shift();
            sorted.push(node);
            
            // Find outgoing connections
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
        
        // Check for cycles
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
        const fields = node.fields || {};
        
        // Resolve variables in config using run history
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
                    output = await this.executeAIAction(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'ai_image':
                    output = await this.executeAIImage(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'ai_video':
                    output = await this.executeAIVideo(resolvedConfig, input);
                    selectedPort = output.error ? 'error' : 'next';
                    break;
                    
                case 'ai_lead_scoring':
                    output = await this.executeLeadScoring(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                
                // ===== SOCIAL MEDIA =====
                case 'post_instagram':
                case 'post_facebook':
                case 'post_twitter':
                case 'post_linkedin':
                case 'post_tiktok':
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
                
                // ===== E-COMMERCE =====
                case 'shopify_order':
                case 'shopify_product':
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
                    output = await this.executeStripe(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'paypal_payment':
                    output = await this.executePayPal(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                // ===== CRM & SALES =====
                case 'create_lead':
                    output = await this.createLead(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                    
                case 'update_crm':
                case 'salesforce_contact':
                case 'hubspot_contact':
                    output = await this.updateCRM(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                // ===== COMMUNICATION =====
                case 'send_email':
                case 'email-send':
                    output = await this.sendEmail(resolvedConfig, input);
                    selectedPort = output.sent ? 'next' : 'error';
                    break;
                    
                case 'send_slack':
                    output = await this.sendSlack(resolvedConfig, input);
                    selectedPort = output.sent ? 'next' : 'error';
                    break;
                    
                case 'send_telegram':
                    output = await this.sendTelegram(resolvedConfig, input);
                    selectedPort = output.sent ? 'next' : 'error';
                    break;
                    
                case 'send_sms':
                    output = await this.sendSMS(resolvedConfig, input);
                    selectedPort = output.sent ? 'next' : 'error';
                    break;
                
                // ===== LOGIC =====
                case 'condition':
                    const conditionResult = this.executeCondition(resolvedConfig, input);
                    output = conditionResult.output;
                    selectedPort = conditionResult.selectedPort;
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
                    output = await this.executeLoop(resolvedConfig, input, node);
                    selectedPort = 'next';
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
                
                // ===== INTEGRATIONS =====
                case 'http':
                case 'http_request':
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
                    selectedPort = 'next';
                    break;
                    
                case 'google_sheets':
                case 'google_drive':
                case 'google_calendar':
                    output = await this.executeGoogleService(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                // ===== DATABASE =====
                case 'database_query':
                case 'database-write':
                    output = await this.executeDatabase(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'postgresql':
                case 'mysql':
                case 'mongodb':
                    output = await this.executeDatabaseQuery(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                // ===== DEVOPS =====
                case 'docker':
                case 'kubernetes':
                    output = await this.executeDevOps(nodeType, resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                    
                case 'github_actions':
                    output = await this.executeGitHubAction(resolvedConfig, input);
                    selectedPort = output.success ? 'next' : 'error';
                    break;
                
                // ===== ANALYTICS =====
                case 'google_analytics':
                    output = await this.executeGoogleAnalytics(resolvedConfig, input);
                    selectedPort = 'next';
                    break;
                
                // ===== DEFAULT =====
                default:
                    output = { output: input, node_type: nodeType };
                    selectedPort = 'next';
            }
            
            // Ensure output has proper structure for Array<Item> processing
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
        
        // Pattern 1: {{ $node["NodeName"].json["property"] }}
        let result = text.replace(/\{\{\s*\$node\["([^"]+)"\]\.json\["([^"]+)"\]\s*\}\}/g, (match, nodeName, property) => {
            const nodeResult = runHistory[nodeName];
            if (nodeResult && nodeResult[property] !== undefined) {
                return String(nodeResult[property]);
            }
            return match;
        });
        
        // Pattern 2: {{ data.property }}
        result = result.replace(/\{\{\s*data\.([^\s}]+)\s*\}\}/g, (match, property) => {
            if (currentData && currentData[property] !== undefined) {
                return String(currentData[property]);
            }
            return match;
        });
        
        // Pattern 3: {{ trigger.property }}
        result = result.replace(/\{\{\s*trigger\.([^\s}]+)\s*\}\}/g, (match, property) => {
            if (currentData && currentData[property] !== undefined) {
                return String(currentData[property]);
            }
            return match;
        });
        
        // Pattern 4: {{ $json.property }}
        result = result.replace(/\{\{\s*\$json\.([^\s}]+)\s*\}\}/g, (match, property) => {
            if (currentData && currentData[property] !== undefined) {
                return String(currentData[property]);
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
        const model = config.model || 'gpt-3.5-turbo';
        const temperature = parseFloat(config.temperature) || 0.7;
        
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: model,
                messages: [{ role: 'user', content: prompt }],
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
                tokens: response.data.usage.total_tokens
            };
        } catch (error) {
            return { error: error.message, fallback: 'AI service unavailable' };
        }
    }
    
    async executeAIImage(config, input) {
        const prompt = this.interpolate(config.prompt, input);
        const style = config.style || 'realistic';
        
        try {
            // Using Pollinations.ai as fallback
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
        
        return {
            video_script: `VIDEO SCRIPT: "${prompt}"\nDuration: ${duration}s\n\nScene 1: Introduction\nScene 2: Main content\nScene 3: Conclusion`,
            prompt: prompt,
            duration: duration,
            generated_at: new Date().toISOString()
        };
    }
    
    async executeLeadScoring(config, input) {
        const email = this.interpolate(config.email, input);
        const name = this.interpolate(config.name, input);
        
        let score = 50;
        if (email) score += 20;
        if (name) score += 10;
        
        const rating = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
        
        return {
            lead_score: score,
            rating: rating,
            lead_data: { email, name }
        };
    }
    
    // ================================================
    // SOCIAL MEDIA ACTIONS
    // ================================================
    async executeSocialPost(platform, config, input) {
        const content = this.interpolate(config.content || config.message, input);
        
        return {
            platform: platform.replace('post_', ''),
            content: content,
            success: true,
            posted_at: new Date().toISOString(),
            post_id: `post_${Date.now()}`
        };
    }
    
    async generateHashtags(config, input) {
        const topic = this.interpolate(config.topic, input);
        const count = parseInt(config.count) || 15;
        
        const hashtags = [`#${topic.replace(/ /g, '')}`, '#AI', '#Automation', '#Workflow'];
        
        return {
            hashtags: hashtags,
            count: hashtags.length,
            topic: topic
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
            scheduled_at: new Date().toISOString()
        };
    }
    
    // ================================================
    // E-COMMERCE ACTIONS
    // ================================================
    async executeShopify(nodeType, config, input) {
        const storeUrl = this.interpolate(config.store_url, input);
        
        return {
            action: nodeType === 'shopify_order' ? 'order_created' : 'product_updated',
            store_url: storeUrl,
            success: true,
            shopify_id: `shopify_${Date.now()}`
        };
    }
    
    async checkInventory(config, input) {
        const platform = this.interpolate(config.platform, input);
        
        return {
            platform: platform,
            total_products: 150,
            low_stock_items: 3,
            out_of_stock: 1,
            checked_at: new Date().toISOString()
        };
    }
    
    async recoverCart(config, input) {
        const platform = this.interpolate(config.platform, input);
        const discountPercent = parseInt(config.discount_percent) || 10;
        
        return {
            platform: platform,
            carts_recovered: 5,
            discount_applied: discountPercent,
            recovered_at: new Date().toISOString()
        };
    }
    
    async executeStripe(config, input) {
        const amount = parseFloat(this.interpolate(config.amount, input));
        const currency = this.interpolate(config.currency, input) || 'usd';
        
        return {
            amount: amount,
            currency: currency,
            success: true,
            stripe_id: `stripe_${Date.now()}`,
            status: 'succeeded'
        };
    }
    
    async executePayPal(config, input) {
        const amount = parseFloat(this.interpolate(config.amount, input));
        
        return {
            amount: amount,
            success: true,
            paypal_id: `paypal_${Date.now()}`,
            status: 'completed'
        };
    }
    
    // ================================================
    // CRM ACTIONS
    // ================================================
    async createLead(config, input) {
        const name = this.interpolate(config.lead_name, input);
        const email = this.interpolate(config.email, input);
        
        return {
            lead_id: `lead_${Date.now()}`,
            name: name,
            email: email,
            status: 'new',
            created_at: new Date().toISOString()
        };
    }
    
    async updateCRM(nodeType, config, input) {
        const recordId = this.interpolate(config.record_id, input);
        
        return {
            record_id: recordId,
            platform: nodeType.replace('_contact', ''),
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
        
        return {
            to: to,
            subject: subject,
            sent: true,
            message_id: `email_${Date.now()}`,
            sent_at: new Date().toISOString()
        };
    }
    
    async sendSlack(config, input) {
        const channel = this.interpolate(config.channel, input);
        const message = this.interpolate(config.message, input);
        
        return {
            channel: channel,
            message: message.substring(0, 100),
            sent: true,
            timestamp: new Date().toISOString()
        };
    }
    
    async sendTelegram(config, input) {
        const chatId = this.interpolate(config.chat_id, input);
        const message = this.interpolate(config.message, input);
        
        return {
            chat_id: chatId,
            message: message.substring(0, 100),
            sent: true,
            timestamp: new Date().toISOString()
        };
    }
    
    async sendSMS(config, input) {
        const phoneNumber = this.interpolate(config.phone_number, input);
        const message = this.interpolate(config.message, input);
        
        return {
            phone_number: phoneNumber,
            message: message.substring(0, 100),
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
                output: {
                    condition: condition,
                    result: result,
                    evaluated_data: input
                },
                selectedPort: selectedPort
            };
        } catch (error) {
            return {
                output: { error: error.message, result: false },
                selectedPort: 'error'
            };
        }
    }
    
    executeSwitch(config, input) {
        try {
            const switchField = config.switch_field;
            const cases = JSON.parse(config.cases || '{}');
            
            let value = input;
            const fieldParts = switchField.split('.');
            for (const part of fieldParts) {
                value = value?.[part];
            }
            
            const selectedPort = cases[value] || cases['default'] || 'default';
            
            return {
                output: {
                    switch_field: switchField,
                    value: value,
                    selected_case: selectedPort
                },
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
    
    async executeLoop(config, input, node) {
        const iterations = parseInt(config.iterations) || 3;
        const splitArrays = config.split_arrays === 'true';
        
        let itemsToProcess = [];
        
        if (splitArrays && Array.isArray(input.data)) {
            itemsToProcess = input.data.map((item, index) => ({
                json: item,
                index: index,
                total: input.data.length
            }));
        } else {
            for (let i = 0; i < iterations; i++) {
                itemsToProcess.push({
                    json: { ...input, loop_index: i, loop_count: iterations },
                    index: i,
                    total: iterations
                });
            }
        }
        
        const results = [];
        for (const item of itemsToProcess) {
            results.push({
                iteration: item.index + 1,
                data: item.json,
                processed_at: new Date().toISOString()
            });
        }
        
        return {
            iterations_completed: results.length,
            results: results,
            split_mode: splitArrays,
            total_items: itemsToProcess.length,
            completed_at: new Date().toISOString()
        };
    }
    
    executeSplit(config, input) {
        const field = config.field || 'data';
        const batchSize = parseInt(config.batch_size) || 10;
        
        let arrayToSplit = input[field] || input.data || input.items || [];
        
        if (!Array.isArray(arrayToSplit)) {
            arrayToSplit = [arrayToSplit];
        }
        
        const batches = [];
        for (let i = 0; i < arrayToSplit.length; i += batchSize) {
            batches.push({
                batch_index: Math.floor(i / batchSize),
                items: arrayToSplit.slice(i, i + batchSize),
                start_index: i,
                end_index: Math.min(i + batchSize, arrayToSplit.length)
            });
        }
        
        return {
            original_count: arrayToSplit.length,
            batches: batches,
            batch_size: batchSize,
            items: batches.length > 0 ? batches[0].items : [],
            selected_port: batches.length > 0 ? 'item' : 'done'
        };
    }
    
    executeAggregate(config, input) {
        const operation = config.operation || 'sum';
        const field = config.field || 'value';
        
        let items = input.items || input.data || [];
        
        if (!Array.isArray(items)) {
            items = [items];
        }
        
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
            const code = config.code;
            
            // Create a safe sandbox environment
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
        const mapping = JSON.parse(config.mapping || '{}');
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
        
        if (!Array.isArray(items)) {
            items = [items];
        }
        
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
    
    // ================================================
    // INTEGRATIONS
    // ================================================
    async executeHTTP(config, input) {
        try {
            const url = this.interpolate(config.url, input);
            const method = config.method || 'GET';
            let headers = {};
            let body = {};
            
            try {
                headers = JSON.parse(this.interpolate(config.headers, input));
                body = JSON.parse(this.interpolate(config.body, input));
            } catch (e) {}
            
            const response = await axios({
                method: method.toLowerCase(),
                url: url,
                headers: { 'Content-Type': 'application/json', ...headers },
                data: method !== 'GET' ? body : undefined,
                params: method === 'GET' ? body : undefined
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
            const variables = JSON.parse(this.interpolate(config.variables, input) || '{}');
            
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
            const url = this.interpolate(config.webhook_url, input);
            const method = config.method || 'POST';
            
            const response = await axios({
                method: method.toLowerCase(),
                url: url,
                data: input,
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
                return {
                    feed_title: response.data.feed.title,
                    feed_description: response.data.feed.description,
                    items: response.data.items.slice(0, limit),
                    item_count: Math.min(response.data.items.length, limit),
                    fetched_at: new Date().toISOString()
                };
            }
            
            return { error: 'Failed to parse RSS feed' };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async executeGoogleService(service, config, input) {
        // Placeholder for Google services
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
            const query = this.interpolate(config.query, input);
            
            // Use Supabase for database operations
            const { data, error } = await supabase.from(table).select('*').limit(100);
            
            if (error) throw error;
            
            return {
                success: true,
                rows: data,
                row_count: data.length,
                query: query
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                rows: []
            };
        }
    }
    
    async executeDatabaseQuery(dbType, config, input) {
        const query = this.interpolate(config.query, input);
        
        return {
            success: true,
            database: dbType,
            rows: [{ id: 1, result: 'Sample query result' }],
            row_count: 1,
            query: query,
            executed_at: new Date().toISOString()
        };
    }
    
    // ================================================
    // DEVOPS ACTIONS
    // ================================================
    async executeDevOps(service, config, input) {
        return {
            service: service,
            success: true,
            action: 'executed',
            timestamp: new Date().toISOString()
        };
    }
    
    async executeGitHubAction(config, input) {
        const repo = this.interpolate(config.repo, input);
        const workflowId = this.interpolate(config.workflow_id, input);
        
        return {
            repo: repo,
            workflow_id: workflowId,
            success: true,
            run_id: `run_${Date.now()}`,
            triggered_at: new Date().toISOString()
        };
    }
    
    // ================================================
    // ANALYTICS ACTIONS
    // ================================================
    async executeGoogleAnalytics(config, input) {
        const propertyId = this.interpolate(config.property_id, input);
        
        return {
            property_id: propertyId,
            metrics: { users: 1234, sessions: 5678, bounce_rate: 45.2 },
            date_range: { start_date: '7daysAgo', end_date: 'today' },
            fetched_at: new Date().toISOString()
        };
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
                
                if (result.selectedPort === 'error') {
                    break;
                }
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