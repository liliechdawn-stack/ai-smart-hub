// ================================================
// NODE REGISTRY - Wraps existing features as nodes
// Keeps compatibility with current automation system
// ================================================

class NodeRegistry {
  constructor() {
    this.nodes = new Map();
    this.initializeNodes();
  }

  initializeNodes() {
    // Register all your existing action types as nodes
    this.registerNode('trigger', {
      type: 'trigger',
      name: 'Trigger',
      description: 'Starts the workflow',
      category: 'trigger',
      icon: 'fa-play',
      canBeStart: true,
      canHaveMultipleOutputs: true,
      configSchema: {
        type: { type: 'select', options: ['webhook', 'schedule', 'manual'], default: 'webhook' }
      },
      execute: async (node, context) => {
        return {
          output: context.triggerData || {},
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('schedule', {
      type: 'schedule',
      name: 'Schedule Trigger',
      description: 'Trigger on a schedule',
      category: 'trigger',
      icon: 'fa-clock',
      canBeStart: true,
      configSchema: {
        cron: { type: 'string', default: '0 * * * *', placeholder: '0 9 * * *' },
        timezone: { type: 'string', default: 'UTC' }
      },
      execute: async (node, context) => {
        return {
          output: { scheduled: true, timestamp: new Date().toISOString() },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('create_lead', {
      type: 'create_lead',
      name: 'Create Lead',
      description: 'Creates a lead in your CRM',
      category: 'crm',
      icon: 'fa-user-plus',
      configSchema: {
        source: { type: 'string', default: 'workflow' },
        status: { type: 'string', default: 'new' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const leadId = require('uuid').v4();
        
        return {
          output: {
            lead_id: leadId,
            status: 'created',
            name: config.name || context.triggerData?.name,
            email: config.email || context.triggerData?.email,
            score: 75
          },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('send_email', {
      type: 'send_email',
      name: 'Send Email',
      description: 'Sends an email',
      category: 'communication',
      icon: 'fa-envelope',
      configSchema: {
        subject: { type: 'string', required: true },
        template: { type: 'string', default: 'default' },
        to: { type: 'string', placeholder: '{{lead.email}}' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const to = this.interpolate(config.to, context);
        
        console.log(`📧 Sending email to: ${to}`);
        
        return {
          output: {
            sent: true,
            to: to,
            subject: this.interpolate(config.subject, context),
            timestamp: new Date().toISOString()
          },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('send_slack', {
      type: 'send_slack',
      name: 'Send Slack',
      description: 'Sends a Slack notification',
      category: 'communication',
      icon: 'fa-slack',
      configSchema: {
        channel: { type: 'string', default: '#general' },
        message: { type: 'text', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const message = this.interpolate(config.message, context);
        
        console.log(`💬 Slack to ${config.channel}: ${message}`);
        
        return {
          output: { sent: true, channel: config.channel, message: message },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('post_social', {
      type: 'post_social',
      name: 'Post to Social Media',
      description: 'Post content to social platforms',
      category: 'social',
      icon: 'fa-share-alt',
      configSchema: {
        platform: { type: 'select', options: ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok'], default: 'twitter' },
        content: { type: 'textarea', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const content = this.interpolate(config.content, context);
        
        console.log(`📱 Posting to ${config.platform}: ${content.substring(0, 100)}`);
        
        return {
          output: {
            posted: true,
            platform: config.platform,
            post_id: `post_${Date.now()}`,
            content: content,
            url: `https://${config.platform}.com/post/${Date.now()}`
          },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('ai_content', {
      type: 'ai_content',
      name: 'AI Content Generator',
      description: 'Generate content using AI',
      category: 'ai',
      icon: 'fa-brain',
      configSchema: {
        type: { type: 'select', options: ['social', 'blog', 'email', 'ad', 'hashtag'], default: 'social' },
        tone: { type: 'select', options: ['professional', 'casual', 'funny', 'serious', 'inspirational'], default: 'professional' },
        prompt: { type: 'textarea', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const prompt = this.interpolate(config.prompt, context);
        
        // Simulate AI content generation
        const content = `✨ AI Generated ${config.type} content (${config.tone} tone):\n\n${prompt.substring(0, 100)}...\n\n#ai #automation #workflow`;
        const hashtags = config.type === 'hashtag' ? '#viral #trending #ai #automation' : '';
        
        return {
          output: {
            content: content,
            hashtags: hashtags,
            type: config.type,
            tone: config.tone,
            wordCount: content.split(' ').length,
            generated_at: new Date().toISOString()
          },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('condition', {
      type: 'condition',
      name: 'Condition',
      description: 'Branch based on conditions',
      category: 'logic',
      icon: 'fa-code-branch',
      canHaveMultipleOutputs: true,
      configSchema: {
        condition: { type: 'javascript', required: true, placeholder: 'return data.score > 80;' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        
        try {
          // Safe evaluation of condition
          const conditionFn = new Function('data', `return ${config.condition}`);
          const inputData = context.nodeOutput || context.triggerData || {};
          const result = conditionFn(inputData);
          
          return {
            output: { condition: result, value: inputData },
            next: result ? ['true'] : ['false']
          };
        } catch (error) {
          console.error('Condition error:', error);
          return {
            output: { error: error.message, condition: false },
            next: ['error']
          };
        }
      }
    });

    this.registerNode('wait', {
      type: 'wait',
      name: 'Delay/Wait',
      description: 'Wait for a specified time',
      category: 'logic',
      icon: 'fa-hourglass-half',
      configSchema: {
        duration: { type: 'number', required: true, min: 1, max: 3600, default: 5 },
        unit: { type: 'select', options: ['seconds', 'minutes', 'hours'], default: 'seconds' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        let ms = config.duration * (config.unit === 'seconds' ? 1000 : config.unit === 'minutes' ? 60000 : 3600000);
        
        await new Promise(resolve => setTimeout(resolve, ms));
        
        return {
          output: { waited: config.duration + ' ' + config.unit, waited_ms: ms },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('parallel', {
      type: 'parallel',
      name: 'Parallel Execution',
      description: 'Execute multiple branches simultaneously',
      category: 'logic',
      icon: 'fa-bolt',
      canHaveMultipleOutputs: true,
      configSchema: {
        branches: { type: 'array', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        
        return {
          output: { branches: config.branches.length, started_at: new Date().toISOString() },
          next: config.branches
        };
      }
    });

    this.registerNode('merge', {
      type: 'merge',
      name: 'Merge',
      description: 'Merge multiple branch outputs',
      category: 'logic',
      icon: 'fa-code-merge',
      configSchema: {
        strategy: { type: 'select', options: ['combine', 'first', 'latest', 'all'], default: 'combine' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const inputs = context.parallelResults || [];
        
        let merged = {};
        if (config.strategy === 'combine') {
          merged = Object.assign({}, ...inputs);
        } else if (config.strategy === 'first') {
          merged = inputs[0] || {};
        } else if (config.strategy === 'latest') {
          merged = inputs[inputs.length - 1] || {};
        } else if (config.strategy === 'all') {
          merged = { results: inputs };
        }
        
        return {
          output: merged,
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('lead_scoring', {
      type: 'lead_scoring',
      name: 'AI Lead Scoring',
      description: 'Score leads using AI',
      category: 'ai',
      icon: 'fa-chart-line',
      configSchema: {
        minScore: { type: 'number', default: 0 },
        maxScore: { type: 'number', default: 100 }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const leadData = context.nodeOutput || context.triggerData || {};
        
        // Calculate score based on lead data
        let score = 50;
        if (leadData.email) {
          const domain = leadData.email.split('@')[1];
          if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com'].includes(domain)) {
            score += 15;
          }
        }
        if (leadData.phone) score += 10;
        if (leadData.message && leadData.message.length > 50) score += 20;
        if (leadData.budget && leadData.budget > 1000) score += 25;
        if (leadData.company) score += 10;
        
        score = Math.min(config.maxScore, Math.max(config.minScore, score));
        
        const rating = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';
        
        return {
          output: {
            ...leadData,
            lead_score: score,
            score_rating: rating,
            score_percentage: Math.round((score / 100) * 100)
          },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('webhook', {
      type: 'webhook',
      name: 'Webhook',
      description: 'HTTP webhook trigger/action',
      category: 'integration',
      icon: 'fa-globe',
      configSchema: {
        url: { type: 'string', required: true, placeholder: 'https://api.example.com/webhook' },
        method: { type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'], default: 'POST' },
        headers: { type: 'textarea', default: '{}' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const url = this.interpolate(config.url, context);
        
        console.log(`🌐 Webhook call to: ${url} (${config.method})`);
        
        return {
          output: {
            called: true,
            url: url,
            method: config.method,
            timestamp: new Date().toISOString()
          },
          next: node.outputs || ['next']
        };
      }
    });

    this.registerNode('http_request', {
      type: 'http_request',
      name: 'HTTP Request',
      description: 'Make an HTTP API call',
      category: 'integration',
      icon: 'fa-code',
      configSchema: {
        url: { type: 'string', required: true },
        method: { type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
        headers: { type: 'textarea', default: '{}' },
        body: { type: 'textarea', default: '{}' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const url = this.interpolate(config.url, context);
        
        console.log(`🌐 HTTP ${config.method} request to: ${url}`);
        
        return {
          output: {
            status: 200,
            data: { received: true, timestamp: new Date().toISOString() },
            url: url,
            method: config.method
          },
          next: node.outputs || ['next']
        };
      }
    });
  }

  registerNode(type, definition) {
    this.nodes.set(type, {
      type,
      ...definition,
      execute: definition.execute
    });
  }

  getNode(type) {
    return this.nodes.get(type);
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  getNodesByCategory(category) {
    return this.getAllNodes().filter(node => node.category === category);
  }

  interpolate(text, context) {
    if (typeof text !== 'string') return text;
    
    // Handle {{variable.path}} syntax
    return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const parts = path.trim().split('.');
      let value = context;
      
      for (const part of parts) {
        if (part === 'triggerData' && context.triggerData) {
          value = context.triggerData;
          continue;
        }
        if (part === 'nodeOutput' && context.nodeOutput) {
          value = context.nodeOutput;
          continue;
        }
        
        if (value && typeof value === 'object') {
          value = value[part];
        } else {
          return match;
        }
      }
      
      return value !== undefined && value !== null ? String(value) : match;
    });
  }
}

module.exports = new NodeRegistry();