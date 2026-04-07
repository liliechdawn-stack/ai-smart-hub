const { supabase } = require('./supabase');
const { exec } = require('child_process');
const axios = require('axios');

class WorkflowEngine {
    constructor() {
        this.workflows = new Map();
        this.executingWorkflows = new Map();
    }

    async executeWorkflow(workflowId, inputData = {}) {
        try {
            // Get workflow from database
            const { data: workflow, error } = await supabase
                .from('workflows')
                .select('*')
                .eq('id', workflowId)
                .single();
            
            if (error) throw error;
            
            // Parse nodes and connections
            const nodes = workflow.nodes;
            const connections = workflow.connections;
            
            // Find trigger nodes (nodes with no inputs)
            const triggerNodes = nodes.filter(node => {
                const hasInput = connections.some(conn => conn.to === node.id);
                return !hasInput;
            });
            
            const results = {};
            const executed = new Set();
            
            // Execute workflow starting from triggers
            for (const trigger of triggerNodes) {
                await this.executeNode(trigger, nodes, connections, results, executed, inputData);
            }
            
            return { success: true, results };
        } catch (error) {
            console.error('Workflow execution error:', error);
            throw error;
        }
    }
    
    async executeNode(node, allNodes, connections, results, executed, inputData) {
        if (executed.has(node.id)) return results[node.id];
        
        // Get input data from connected nodes
        const inputConnections = connections.filter(conn => conn.to === node.id);
        let nodeInput = {};
        
        for (const conn of inputConnections) {
            const sourceNode = allNodes.find(n => n.id === conn.from);
            if (sourceNode && results[sourceNode.id]) {
                nodeInput = { ...nodeInput, ...results[sourceNode.id] };
            }
        }
        
        // Merge with global input data if this is a trigger
        if (inputConnections.length === 0) {
            nodeInput = { ...nodeInput, ...inputData };
        }
        
        // Execute node based on type
        let output = await this.executeNodeAction(node, nodeInput);
        results[node.id] = output;
        executed.add(node.id);
        
        // Find and execute child nodes
        const outputConnections = connections.filter(conn => conn.from === node.id);
        for (const conn of outputConnections) {
            const childNode = allNodes.find(n => n.id === conn.to);
            if (childNode) {
                await this.executeNode(childNode, allNodes, connections, results, executed, inputData);
            }
        }
        
        return output;
    }
    
    async executeNodeAction(node, input) {
        const fields = {};
        node.fields.forEach(f => { fields[f.name] = f.value; });
        
        switch (node.type) {
            case 'webhook':
                return { webhook_data: input };
                
            case 'schedule':
                return { scheduled: true, timestamp: new Date().toISOString() };
                
            case 'http':
                return await this.executeHTTP(fields, input);
                
            case 'shopify':
                return await this.executeShopify(fields, input);
                
            case 'slack':
                return await this.executeSlack(fields, input);
                
            case 'stripe':
                return await this.executeStripe(fields, input);
                
            case 'mailchimp':
                return await this.executeMailchimp(fields, input);
                
            case 'ai':
                return await this.executeAI(fields, input);
                
            case 'condition':
                return this.executeCondition(fields, input);
                
            case 'loop':
                return await this.executeLoop(fields, input, node);
                
            case 'code':
                return this.executeCustomCode(fields, input);
                
            case 'database-write':
                return await this.executeDatabaseWrite(fields, input);
                
            case 'email-send':
                return await this.executeEmailSend(fields, input);
                
            default:
                return { output: input };
        }
    }
    
    async executeHTTP(fields, input) {
        try {
            const url = this.interpolate(fields.url, input);
            const method = fields.method;
            let headers = {};
            let body = {};
            
            try {
                headers = JSON.parse(this.interpolate(fields.headers, input));
                body = JSON.parse(this.interpolate(fields.body, input));
            } catch (e) {
                // Invalid JSON, use as is
            }
            
            const response = await axios({
                method: method.toLowerCase(),
                url: url,
                headers: headers,
                data: method !== 'GET' ? body : undefined,
                params: method === 'GET' ? body : undefined
            });
            
            return {
                status: response.status,
                data: response.data,
                headers: response.headers
            };
        } catch (error) {
            return {
                error: error.message,
                response: error.response?.data
            };
        }
    }
    
    async executeShopify(fields, input) {
        // Implementation would use Shopify API
        const action = fields.action;
        const data = JSON.parse(this.interpolate(fields.data, input));
        
        // Placeholder - would connect to actual Shopify API
        return {
            action: action,
            data: data,
            success: true,
            shopify_id: `shopify_${Date.now()}`
        };
    }
    
    async executeSlack(fields, input) {
        // Implementation would use Slack Webhook
        const channel = this.interpolate(fields.channel, input);
        const message = this.interpolate(fields.message, input);
        
        // Placeholder - would send actual Slack message
        return {
            channel: channel,
            message: message,
            sent: true,
            timestamp: new Date().toISOString()
        };
    }
    
    async executeStripe(fields, input) {
        // Implementation would use Stripe API
        const action = fields.action;
        const data = JSON.parse(this.interpolate(fields.data, input));
        
        // Placeholder - would connect to actual Stripe API
        return {
            action: action,
            data: data,
            success: true,
            stripe_id: `stripe_${Date.now()}`
        };
    }
    
    async executeMailchimp(fields, input) {
        // Implementation would use Mailchimp API
        return {
            success: true,
            message: 'Mailchimp action executed'
        };
    }
    
    async executeAI(fields, input) {
        const model = fields.model;
        const prompt = this.interpolate(fields.prompt, input);
        const temperature = parseFloat(fields.temperature);
        
        try {
            // Call OpenAI API
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: model === 'gpt-4' ? 'gpt-4' : 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: temperature
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return {
                model: model,
                prompt: prompt,
                response: response.data.choices[0].message.content,
                tokens: response.data.usage.total_tokens
            };
        } catch (error) {
            return {
                error: error.message,
                fallback: 'AI service unavailable'
            };
        }
    }
    
    executeCondition(fields, input) {
        try {
            // Execute condition JavaScript
            const conditionFunc = new Function('data', `return ${fields.condition}`);
            const result = conditionFunc(input);
            
            return {
                condition: fields.condition,
                result: result,
                branch: result ? 'true' : 'false'
            };
        } catch (error) {
            return {
                error: error.message,
                result: false
            };
        }
    }
    
    async executeLoop(fields, input, node) {
        const itemsPath = fields.items;
        const maxIterations = parseInt(fields.max_iterations);
        
        // Get items array from input
        let items = [];
        try {
            const pathParts = itemsPath.split('.');
            let current = input;
            for (const part of pathParts) {
                current = current[part];
            }
            items = Array.isArray(current) ? current : [];
        } catch (e) {
            items = [];
        }
        
        const results = [];
        const iterations = Math.min(items.length, maxIterations);
        
        for (let i = 0; i < iterations; i++) {
            const itemInput = {
                ...input,
                loop: {
                    item: items[i],
                    index: i,
                    total: iterations
                }
            };
            
            // Execute loop body nodes
            const loopResults = {};
            const loopExecuted = new Set();
            
            // Find nodes connected to this loop node
            // This would require tracking loop body connections
            results.push({
                index: i,
                item: items[i],
                result: itemInput
            });
        }
        
        return {
            items_processed: iterations,
            total_items: items.length,
            results: results
        };
    }
    
    executeCustomCode(fields, input) {
        try {
            const code = fields.code;
            const language = fields.language;
            
            if (language === 'javascript') {
                const customFunction = new Function('data', `
                    try {
                        ${code}
                        return data;
                    } catch (e) {
                        return { error: e.message };
                    }
                `);
                const output = customFunction(input);
                return {
                    output: output,
                    language: 'javascript'
                };
            } else {
                // Python would require external process
                return {
                    error: 'Python execution not yet implemented',
                    output: input
                };
            }
        } catch (error) {
            return {
                error: error.message,
                output: input
            };
        }
    }
    
    async executeDatabaseWrite(fields, input) {
        const table = this.interpolate(fields.table, input);
        const operation = fields.operation;
        const data = JSON.parse(this.interpolate(fields.data, input));
        
        try {
            let result;
            if (operation === 'insert') {
                result = await supabase.from(table).insert(data);
            } else if (operation === 'update') {
                const matchField = fields.match_field;
                const matchValue = data[matchField];
                result = await supabase.from(table).update(data).eq(matchField, matchValue);
            }
            
            return {
                success: !result.error,
                data: result.data,
                error: result.error
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async executeEmailSend(fields, input) {
        const to = this.interpolate(fields.to, input);
        const subject = this.interpolate(fields.subject, input);
        const body = this.interpolate(fields.body, input);
        
        // Implementation would use email service (SendGrid, AWS SES, etc.)
        return {
            to: to,
            subject: subject,
            sent: true,
            message_id: `email_${Date.now()}`
        };
    }
    
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
}

module.exports = new WorkflowEngine();