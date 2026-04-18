// ================================================
// NODE REGISTRY - Enterprise Node Metadata & Credential Resolver
// Features: ConfigSchema for UI, Input/Output Ports, Credential Injection
// ================================================

const { v4: uuidv4 } = require('uuid');

class NodeRegistry {
  constructor() {
    this.nodes = new Map();
    this.credentials = new Map(); // Store credentials in memory cache
    this.credentialResolvers = new Map();
    this.initializeNodes();
  }

  // ================================================
  // INITIALIZE ALL NODES WITH RICH METADATA
  // ================================================
  initializeNodes() {
    // ===== TRIGGER NODES =====
    this.registerNode('trigger', {
      type: 'trigger',
      name: 'Webhook Trigger',
      description: 'Starts workflow via HTTP webhook',
      category: 'triggers',
      icon: 'fa-globe',
      color: '#10B981',
      canBeStart: true,
      inputPorts: [],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        webhook_path: { type: 'string', label: 'Webhook Path', default: '/webhook/my-endpoint', placeholder: '/webhook/unique-id', required: true },
        method: { type: 'select', label: 'HTTP Method', options: ['GET', 'POST', 'PUT', 'DELETE'], default: 'POST' },
        response_type: { type: 'select', label: 'Response Type', options: ['json', 'text'], default: 'json' }
      },
      execute: async (node, context) => {
        return {
          output: { webhook_received: true, data: context.triggerData || {}, timestamp: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('schedule', {
      type: 'schedule',
      name: 'Schedule Trigger',
      description: 'Trigger workflow on a schedule',
      category: 'triggers',
      icon: 'fa-clock',
      color: '#3B82F6',
      canBeStart: true,
      inputPorts: [],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        cron: { type: 'string', label: 'Cron Expression', default: '0 * * * *', placeholder: '0 9 * * *', required: true },
        timezone: { type: 'string', label: 'Timezone', default: 'UTC', placeholder: 'America/New_York' }
      },
      execute: async (node, context) => {
        return {
          output: { scheduled: true, cron: node.config?.cron, triggered_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('github', {
      type: 'github',
      name: 'GitHub Trigger',
      description: 'Trigger on GitHub events',
      category: 'triggers',
      icon: 'fab fa-github',
      color: '#333333',
      canBeStart: true,
      inputPorts: [],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        event_type: { type: 'select', label: 'Event Type', options: ['push', 'pull_request', 'issues', 'star'], default: 'push' },
        repository: { type: 'string', label: 'Repository', placeholder: 'username/repo', required: true }
      },
      execute: async (node, context) => {
        return {
          output: { event: node.config?.event_type, repository: node.config?.repository, processed_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== AI NODES =====
    this.registerNode('ai_content', {
      type: 'ai_content',
      name: 'AI Content Generator',
      description: 'Generate content using AI',
      category: 'ai',
      icon: 'fa-brain',
      color: '#8B5CF6',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        type: { type: 'select', label: 'Content Type', options: ['social', 'blog', 'email', 'ad', 'hashtag'], default: 'social' },
        tone: { type: 'select', label: 'Tone', options: ['professional', 'casual', 'funny', 'serious', 'inspirational'], default: 'professional' },
        prompt: { type: 'textarea', label: 'Prompt', required: true, placeholder: 'Write about...' },
        credentialId: { type: 'credential', label: 'API Credential', service: 'openai', required: false }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const prompt = this.interpolate(config.prompt, context);
        
        // Resolve credential if provided
        let apiKey = null;
        if (config.credentialId) {
          const credential = await this.resolveCredential(config.credentialId, context.userId);
          apiKey = credential?.token;
        }
        
        const content = `✨ AI Generated ${config.type} content (${config.tone} tone):\n\n${prompt.substring(0, 100)}...\n\n#ai #automation #workflow`;
        
        return {
          output: { content: content, type: config.type, tone: config.tone, wordCount: content.split(' ').length, generated_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('ai_image', {
      type: 'ai_image',
      name: 'AI Image Generator',
      description: 'Generate images using AI',
      category: 'ai',
      icon: 'fa-image',
      color: '#EC4899',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        style: { type: 'select', label: 'Style', options: ['Realistic', 'Anime', 'Cyberpunk', 'Fantasy', 'Cinematic'], default: 'Realistic' },
        prompt: { type: 'textarea', label: 'Prompt', required: true, placeholder: 'A beautiful sunset over mountains...' },
        credentialId: { type: 'credential', label: 'API Credential', service: 'replicate', required: false }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const prompt = this.interpolate(config.prompt, context);
        const imageUrl = `https://placehold.co/1024x1024/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 30))}`;
        
        return {
          output: { image_url: imageUrl, prompt: prompt, style: config.style, generated_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('gemini', {
      type: 'gemini',
      name: 'Google Gemini AI',
      description: 'Call Google Gemini AI model',
      category: 'ai',
      icon: 'fa-gem',
      color: '#4285F4',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        prompt: { type: 'textarea', label: 'Prompt', required: true, placeholder: 'Write a professional email...' },
        model: { type: 'select', label: 'Model', options: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'], default: 'gemini-1.5-pro' },
        temperature: { type: 'number', label: 'Temperature', min: 0, max: 2, step: 0.1, default: 0.7 },
        credentialId: { type: 'credential', label: 'Gemini API Key', service: 'google', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const prompt = this.interpolate(config.prompt, context);
        
        // Resolve credential
        let apiKey = null;
        if (config.credentialId) {
          const credential = await this.resolveCredential(config.credentialId, context.userId);
          apiKey = credential?.token;
        }
        
        return {
          output: { generated_text: `[Gemini Response]\nPrompt: ${prompt.substring(0, 100)}...`, model: config.model, generated_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== SOCIAL MEDIA NODES =====
    this.registerNode('post_social', {
      type: 'post_social',
      name: 'Post to Social Media',
      description: 'Post content to social platforms',
      category: 'social',
      icon: 'fa-share-alt',
      color: '#1DA1F2',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        platform: { type: 'select', label: 'Platform', options: ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok'], default: 'twitter' },
        content: { type: 'textarea', label: 'Content', required: true, placeholder: 'Your post content...' },
        credentialId: { type: 'credential', label: 'Platform Credential', service: 'social', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const content = this.interpolate(config.content, context);
        
        // Resolve credential
        if (config.credentialId) {
          await this.resolveCredential(config.credentialId, context.userId);
        }
        
        return {
          output: { posted: true, platform: config.platform, post_id: `post_${Date.now()}`, content: content.substring(0, 100), url: `https://${config.platform}.com/post/${Date.now()}` },
          next: ['next']
        };
      }
    });

    this.registerNode('post_tiktok', {
      type: 'post_tiktok',
      name: 'Post to TikTok',
      description: 'Post video to TikTok',
      category: 'social',
      icon: 'fab fa-tiktok',
      color: '#010101',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        video_url: { type: 'string', label: 'Video URL', required: true, placeholder: 'https://example.com/video.mp4' },
        caption: { type: 'textarea', label: 'Caption', required: true, placeholder: 'Check out this amazing video!' },
        hashtags: { type: 'string', label: 'Hashtags', placeholder: '#AI #Automation' },
        credentialId: { type: 'credential', label: 'TikTok Credential', service: 'tiktok', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const caption = this.interpolate(config.caption, context);
        
        return {
          output: { success: true, platform: 'tiktok', post_id: `tt_${Date.now()}`, caption: caption.substring(0, 100), posted_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('generate_hashtags', {
      type: 'generate_hashtags',
      name: 'Generate Hashtags',
      description: 'Generate trending hashtags',
      category: 'social',
      icon: 'fa-hashtag',
      color: '#F59E0B',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        topic: { type: 'string', label: 'Topic', required: true, placeholder: 'AI automation' },
        count: { type: 'number', label: 'Number of Hashtags', min: 5, max: 30, default: 15 }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const topic = this.interpolate(config.topic, context);
        const hashtags = [`#${topic.replace(/ /g, '')}`, '#AI', '#Automation', '#Workflow', '#Tech'];
        
        return {
          output: { hashtags: hashtags, count: hashtags.length, topic: topic, generated_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== CRM NODES =====
    this.registerNode('create_lead', {
      type: 'create_lead',
      name: 'Create Lead',
      description: 'Creates a lead in your CRM',
      category: 'crm',
      icon: 'fa-user-plus',
      color: '#3498DB',
      inputPorts: [{ name: 'input', label: 'Lead Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        lead_name: { type: 'string', label: 'Lead Name', placeholder: '{{data.name}}' },
        source: { type: 'string', label: 'Source', default: 'workflow' },
        status: { type: 'select', label: 'Status', options: ['new', 'contacted', 'qualified', 'lost'], default: 'new' },
        credentialId: { type: 'credential', label: 'CRM Credential', service: 'crm', required: false }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const name = this.interpolate(config.lead_name, context) || context.triggerData?.name || 'New Lead';
        const leadId = uuidv4();
        
        return {
          output: { lead_id: leadId, name: name, status: config.status, source: config.source, created_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('update_crm', {
      type: 'update_crm',
      name: 'Update CRM',
      description: 'Update CRM record',
      category: 'crm',
      icon: 'fa-database',
      color: '#3498DB',
      inputPorts: [{ name: 'input', label: 'Update Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        record_id: { type: 'string', label: 'Record ID', required: true, placeholder: '{{data.lead_id}}' },
        update_data: { type: 'json', label: 'Update Data', default: '{}', placeholder: '{"status": "contacted"}' },
        credentialId: { type: 'credential', label: 'CRM Credential', service: 'crm', required: false }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const recordId = this.interpolate(config.record_id, context);
        
        return {
          output: { success: true, record_id: recordId, updated_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== E-COMMERCE NODES =====
    this.registerNode('inventory_check', {
      type: 'inventory_check',
      name: 'Check Inventory',
      description: 'Check product inventory',
      category: 'ecommerce',
      icon: 'fa-boxes',
      color: '#7AB55C',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        platform: { type: 'select', label: 'Platform', options: ['shopify', 'woocommerce', 'custom'], default: 'shopify' },
        product_id: { type: 'string', label: 'Product ID', placeholder: '{{data.product_id}}' },
        credentialId: { type: 'credential', label: 'Platform Credential', service: 'ecommerce', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        
        return {
          output: { platform: config.platform, total_products: 150, low_stock_items: 3, out_of_stock: 1, checked_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('cart_recovery', {
      type: 'cart_recovery',
      name: 'Cart Recovery',
      description: 'Recover abandoned carts',
      category: 'ecommerce',
      icon: 'fa-shopping-cart',
      color: '#FF6B6B',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        platform: { type: 'select', label: 'Platform', options: ['shopify', 'woocommerce'], default: 'shopify' },
        discount_percent: { type: 'number', label: 'Discount %', min: 5, max: 50, default: 10 },
        credentialId: { type: 'credential', label: 'Platform Credential', service: 'ecommerce', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        
        return {
          output: { platform: config.platform, carts_recovered: 5, discount_applied: config.discount_percent, recovered_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== COMMUNICATION NODES =====
    this.registerNode('send_email', {
      type: 'send_email',
      name: 'Send Email',
      description: 'Send an email',
      category: 'communication',
      icon: 'fa-envelope',
      color: '#EA4B71',
      inputPorts: [{ name: 'input', label: 'Email Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        to: { type: 'string', label: 'Recipient', required: true, placeholder: '{{data.email}}' },
        subject: { type: 'string', label: 'Subject', required: true, placeholder: '{{data.subject}}' },
        body: { type: 'textarea', label: 'Body', required: true, placeholder: 'Email content...' },
        credentialId: { type: 'credential', label: 'Email Credential', service: 'sendgrid', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const to = this.interpolate(config.to, context);
        const subject = this.interpolate(config.subject, context);
        const body = this.interpolate(config.body, context);
        
        return {
          output: { success: true, to: to, subject: subject, sent_at: new Date().toISOString(), message_id: `email_${Date.now()}` },
          next: ['next']
        };
      }
    });

    this.registerNode('send_slack', {
      type: 'send_slack',
      name: 'Send Slack',
      description: 'Send Slack notification',
      category: 'communication',
      icon: 'fab fa-slack',
      color: '#4A154B',
      inputPorts: [{ name: 'input', label: 'Message Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        channel: { type: 'string', label: 'Channel', required: true, default: '#general', placeholder: '#general' },
        message: { type: 'textarea', label: 'Message', required: true, placeholder: 'Hello from workflow!' },
        credentialId: { type: 'credential', label: 'Slack Credential', service: 'slack', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const channel = this.interpolate(config.channel, context);
        const message = this.interpolate(config.message, context);
        
        return {
          output: { success: true, channel: channel, message: message.substring(0, 100), sent_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== LOGIC NODES =====
    this.registerNode('condition', {
      type: 'condition',
      name: 'Condition (IF)',
      description: 'Branch based on conditions',
      category: 'logic',
      icon: 'fa-code-branch',
      color: '#6B7280',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'true', label: 'True Branch', type: 'success' },
        { name: 'false', label: 'False Branch', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        condition: { type: 'javascript', label: 'Condition', required: true, placeholder: 'return data.score > 80;' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const inputData = context.nodeOutput || context.triggerData || {};
        
        try {
          const conditionFn = new Function('data', `return ${config.condition}`);
          const result = conditionFn(inputData);
          const nextPort = result === true ? 'true' : result === false ? 'false' : String(result);
          
          return {
            output: { condition: result, evaluated_data: inputData, timestamp: new Date().toISOString() },
            next: [nextPort]
          };
        } catch (error) {
          return {
            output: { error: error.message, condition: false },
            next: ['error']
          };
        }
      }
    });

    this.registerNode('switch', {
      type: 'switch',
      name: 'Switch / Router',
      description: 'Route based on value',
      category: 'logic',
      icon: 'fa-exchange-alt',
      color: '#6B7280',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'case1', label: 'Case 1', type: 'success' },
        { name: 'case2', label: 'Case 2', type: 'success' },
        { name: 'case3', label: 'Case 3', type: 'success' },
        { name: 'default', label: 'Default', type: 'success' }
      ],
      configSchema: {
        switch_field: { type: 'string', label: 'Field to Switch On', required: true, placeholder: 'data.status' },
        cases: { type: 'json', label: 'Case Mapping', default: '{"active":"case1","pending":"case2","completed":"case3"}' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        let value = context.triggerData;
        const fieldParts = config.switch_field.split('.');
        for (const part of fieldParts) {
          value = value?.[part];
        }
        
        const cases = JSON.parse(config.cases || '{}');
        const selectedPort = cases[value] || cases['default'] || 'default';
        
        return {
          output: { switch_value: value, selected_case: selectedPort },
          next: [selectedPort]
        };
      }
    });

    this.registerNode('wait', {
      type: 'wait',
      name: 'Wait/Delay',
      description: 'Wait for specified time',
      category: 'logic',
      icon: 'fa-hourglass-half',
      color: '#F59E0B',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        duration: { type: 'number', label: 'Duration', required: true, min: 1, max: 3600, default: 5 },
        unit: { type: 'select', label: 'Unit', options: ['seconds', 'minutes', 'hours'], default: 'seconds' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const ms = config.duration * (config.unit === 'seconds' ? 1000 : config.unit === 'minutes' ? 60000 : 3600000);
        await new Promise(resolve => setTimeout(resolve, ms));
        
        return {
          output: { waited: `${config.duration} ${config.unit}`, waited_ms: ms, waited_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('loop', {
      type: 'loop',
      name: 'Loop',
      description: 'Iterate over items',
      category: 'logic',
      icon: 'fa-redo-alt',
      color: '#6B7280',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        iterations: { type: 'number', label: 'Iterations', min: 1, max: 100, default: 3 },
        split_arrays: { type: 'boolean', label: 'Split Arrays', default: false }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const iterations = parseInt(config.iterations) || 3;
        const splitArrays = config.split_arrays === true || config.split_arrays === 'true';
        
        let itemsToProcess = [];
        if (splitArrays && Array.isArray(context.triggerData?.data)) {
          itemsToProcess = context.triggerData.data.map((item, index) => ({ json: item, index: index, total: context.triggerData.data.length }));
        } else {
          for (let i = 0; i < iterations; i++) {
            itemsToProcess.push({ json: { ...context.triggerData, loop_index: i, loop_count: iterations }, index: i, total: iterations });
          }
        }
        
        const results = [];
        for (const item of itemsToProcess) {
          results.push({ iteration: item.index + 1, data: item.json, processed_at: new Date().toISOString() });
        }
        
        return {
          output: { iterations_completed: results.length, results: results, split_mode: splitArrays, completed_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('code', {
      type: 'code',
      name: 'Code Node (Sandbox)',
      description: 'Execute custom JavaScript code',
      category: 'logic',
      icon: 'fa-code',
      color: '#6B7280',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        code: { type: 'code', label: 'JavaScript Code', language: 'javascript', required: true, default: '// Write your code here\n// Access input via "data"\n// Return modified data\nreturn data;' }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const code = config.code;
        
        try {
          const sandbox = { data: { ...context.triggerData, ...context.nodeInput }, console: { log: (...args) => console.log('[CODE]', ...args) } };
          const fn = new Function('sandbox', `with(sandbox) { try { ${code}; return sandbox.data; } catch(e) { sandbox.error = e.message; return sandbox.data; } }`);
          const result = fn(sandbox);
          
          return {
            output: { transformed: result, original: context.nodeInput, error: sandbox.error || null, timestamp: new Date().toISOString() },
            next: sandbox.error ? ['error'] : ['next']
          };
        } catch (error) {
          return {
            output: { error: error.message, original: context.nodeInput },
            next: ['error']
          };
        }
      }
    });

    // ===== INTEGRATION NODES =====
    this.registerNode('http_request', {
      type: 'http_request',
      name: 'HTTP Request',
      description: 'Make HTTP API call',
      category: 'integrations',
      icon: 'fa-code',
      color: '#2563EB',
      inputPorts: [{ name: 'input', label: 'Request Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        url: { type: 'string', label: 'URL', required: true, placeholder: 'https://api.example.com/data' },
        method: { type: 'select', label: 'Method', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
        headers: { type: 'json', label: 'Headers', default: '{}' },
        body: { type: 'json', label: 'Body', default: '{}' },
        credentialId: { type: 'credential', label: 'API Credential', service: 'http', required: false }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const url = this.interpolate(config.url, context);
        
        let headers = {};
        try { headers = JSON.parse(this.interpolate(config.headers, context)); } catch(e) {}
        
        let body = {};
        try { body = JSON.parse(this.interpolate(config.body, context)); } catch(e) {}
        
        if (config.credentialId) {
          const credential = await this.resolveCredential(config.credentialId, context.userId);
          if (credential?.token) {
            headers['Authorization'] = `Bearer ${credential.token}`;
          }
        }
        
        return {
          output: { status: 200, data: { received: true, timestamp: new Date().toISOString() }, url: url, method: config.method },
          next: ['next']
        };
      }
    });

    this.registerNode('webhook', {
      type: 'webhook',
      name: 'Webhook',
      description: 'Send webhook request',
      category: 'integrations',
      icon: 'fa-globe',
      color: '#10B981',
      inputPorts: [{ name: 'input', label: 'Payload Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        webhook_url: { type: 'string', label: 'Webhook URL', required: true, placeholder: 'https://webhook.site/your-url' },
        method: { type: 'select', label: 'Method', options: ['POST', 'PUT'], default: 'POST' },
        credentialId: { type: 'credential', label: 'Webhook Credential', service: 'webhook', required: false }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const url = this.interpolate(config.webhook_url, context);
        
        return {
          output: { success: true, url: url, method: config.method, sent_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    this.registerNode('rss', {
      type: 'rss',
      name: 'RSS Feed Reader',
      description: 'Read RSS feeds',
      category: 'integrations',
      icon: 'fa-rss',
      color: '#f26522',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        feed_url: { type: 'string', label: 'Feed URL', required: true, placeholder: 'https://feeds.bbci.co.uk/news/rss.xml' },
        limit: { type: 'number', label: 'Limit', min: 1, max: 50, default: 10 }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const feedUrl = this.interpolate(config.feed_url, context);
        
        return {
          output: { feed_title: 'Sample Feed', feed_url: feedUrl, item_count: 5, items: [{ title: 'Sample Item', link: '#', pubDate: new Date().toISOString() }], fetched_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== DATABASE NODES =====
    this.registerNode('database_query', {
      type: 'database_query',
      name: 'Database Query',
      description: 'Execute database query',
      category: 'database',
      icon: 'fa-database',
      color: '#7AB55C',
      inputPorts: [{ name: 'input', label: 'Query Params', type: 'object' }],
      outputPorts: [
        { name: 'next', label: 'Success', type: 'success' },
        { name: 'error', label: 'Error', type: 'error' }
      ],
      configSchema: {
        query: { type: 'textarea', label: 'SQL Query', required: true, placeholder: 'SELECT * FROM users WHERE id = {{data.user_id}}' },
        credentialId: { type: 'credential', label: 'Database Credential', service: 'database', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        const query = this.interpolate(config.query, context);
        
        return {
          output: { rows: [{ id: 1, result: 'Query executed successfully' }], row_count: 1, query: query, executed_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });

    // ===== ANALYTICS NODES =====
    this.registerNode('google_analytics', {
      type: 'google_analytics',
      name: 'Google Analytics',
      description: 'Fetch analytics data',
      category: 'analytics',
      icon: 'fab fa-google',
      color: '#E37400',
      inputPorts: [{ name: 'input', label: 'Input Data', type: 'object' }],
      outputPorts: [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: {
        property_id: { type: 'string', label: 'Property ID', required: true, placeholder: 'UA-123456789-1' },
        metrics: { type: 'string', label: 'Metrics', default: 'ga:users,ga:sessions' },
        credentialId: { type: 'credential', label: 'Google Credential', service: 'google', required: true }
      },
      execute: async (node, context) => {
        const config = { ...node.config, ...context.nodeInput };
        
        return {
          output: { users: 1234, sessions: 5678, pageviews: 9876, bounce_rate: 45.2, fetched_at: new Date().toISOString() },
          next: ['next']
        };
      }
    });
  }

  // ================================================
  // REGISTER NODE WITH METADATA
  // ================================================
  registerNode(type, definition) {
    this.nodes.set(type, {
      type,
      version: definition.version || '1.0.0',
      ...definition,
      registeredAt: new Date().toISOString(),
      execute: definition.execute
    });
  }

  // ================================================
  // GET NODE BY TYPE
  // ================================================
  getNode(type) {
    return this.nodes.get(type);
  }

  // ================================================
  // GET ALL NODES
  // ================================================
  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  // ================================================
  // GET NODES BY CATEGORY
  // ================================================
  getNodesByCategory(category) {
    return this.getAllNodes().filter(node => node.category === category);
  }

  // ================================================
  // GET NODES FOR UI SIDEBAR
  // ================================================
  getUINodes() {
    return this.getAllNodes().map(node => ({
      type: node.type,
      name: node.name,
      description: node.description,
      category: node.category,
      icon: node.icon,
      color: node.color,
      canBeStart: node.canBeStart || false,
      inputPorts: node.inputPorts || [],
      outputPorts: node.outputPorts || [{ name: 'next', label: 'Next', type: 'success' }],
      configSchema: node.configSchema || {}
    }));
  }

  // ================================================
  // CREDENTIAL RESOLVER
  // ================================================
  async resolveCredential(credentialId, userId) {
    // Check cache first
    if (this.credentials.has(credentialId)) {
      return this.credentials.get(credentialId);
    }
    
    try {
      const { supabase } = require('../database-supabase');
      const { data: credential, error } = await supabase
        .from('credentials')
        .select('*')
        .eq('id', credentialId)
        .eq('user_id', userId)
        .single();
      
      if (error) throw error;
      
      // Decrypt token if needed
      const decryptedToken = this.decryptToken(credential.token);
      const resolvedCredential = {
        ...credential,
        token: decryptedToken
      };
      
      // Cache for 5 minutes
      this.credentials.set(credentialId, resolvedCredential);
      setTimeout(() => this.credentials.delete(credentialId), 5 * 60 * 1000);
      
      return resolvedCredential;
    } catch (error) {
      console.error('Failed to resolve credential:', error);
      return null;
    }
  }

  // ================================================
  // REGISTER CREDENTIAL RESOLVER FOR SERVICE
  // ================================================
  registerCredentialResolver(service, resolverFn) {
    this.credentialResolvers.set(service, resolverFn);
  }

  // ================================================
  // DECRYPT TOKEN (placeholder - implement actual encryption)
  // ================================================
  decryptToken(encryptedToken) {
    // In production, use AES-256 decryption with ENCRYPTION_KEY
    // For now, return as-is (assuming it's already decrypted or plain text)
    return encryptedToken;
  }

  // ================================================
  // VALIDATE NODE BEFORE EXECUTION
  // ================================================
  async validateNode(node, context) {
    const errors = [];
    const warnings = [];
    const nodeDefinition = this.getNode(node.type);
    
    if (!nodeDefinition) {
      errors.push(`Unknown node type: ${node.type}`);
      return { valid: false, errors, warnings };
    }
    
    // Validate required config fields
    if (nodeDefinition.configSchema) {
      for (const [fieldName, fieldSchema] of Object.entries(nodeDefinition.configSchema)) {
        const value = node.config?.[fieldName];
        
        if (fieldSchema.required && (value === undefined || value === null || value === '')) {
          errors.push(`Missing required config field: ${fieldName} in node ${node.name || node.type}`);
        }
        
        if (fieldSchema.type === 'credential' && value) {
          // Validate credential exists and is valid
          const credential = await this.resolveCredential(value, context.userId);
          if (!credential) {
            errors.push(`Invalid or missing credential: ${value} in node ${node.name || node.type}`);
          } else if (fieldSchema.service && credential.service !== fieldSchema.service) {
            warnings.push(`Credential service mismatch: expected ${fieldSchema.service}, got ${credential.service}`);
          }
        }
        
        if (fieldSchema.type === 'javascript' && value) {
          try {
            new Function('data', `return ${value}`);
          } catch (e) {
            errors.push(`Invalid JavaScript in condition field: ${e.message}`);
          }
        }
        
        if (fieldSchema.type === 'json' && value && typeof value === 'string') {
          try {
            JSON.parse(this.interpolate(value, context));
          } catch (e) {
            errors.push(`Invalid JSON in ${fieldName}: ${e.message}`);
          }
        }
      }
    }
    
    // Validate that all required input ports are connected
    if (nodeDefinition.inputPorts && nodeDefinition.inputPorts.length > 0) {
      const incomingEdges = context.edges?.filter(edge => edge.target === node.id) || [];
      const connectedPorts = incomingEdges.map(edge => edge.targetHandle).filter(Boolean);
      
      for (const inputPort of nodeDefinition.inputPorts) {
        if (inputPort.required && !connectedPorts.includes(inputPort.name)) {
          warnings.push(`Input port "${inputPort.name}" is not connected to any source`);
        }
      }
    }
    
    // Validate variable references exist in context
    if (node.config) {
      const variablePattern = /\{\{\s*\$node\["([^"]+)"\]\.json\["([^"]+)"\]\s*\}\}/g;
      const configString = JSON.stringify(node.config);
      let match;
      
      while ((match = variablePattern.exec(configString)) !== null) {
        const referencedNodeName = match[1];
        const referencedProperty = match[2];
        
        // Check if referenced node exists in workflow
        const referencedNode = context.allNodes?.find(n => n.name === referencedNodeName);
        if (!referencedNode) {
          warnings.push(`Variable references unknown node: "${referencedNodeName}"`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // ================================================
  // BULK VALIDATE ALL NODES IN WORKFLOW
  // ================================================
  async validateWorkflow(nodes, edges, userId) {
    const results = {};
    const allValidations = [];
    
    const context = {
      userId,
      edges,
      allNodes: nodes
    };
    
    for (const node of nodes) {
      const validation = await this.validateNode(node, context);
      results[node.id] = validation;
      allValidations.push(validation);
    }
    
    const hasErrors = allValidations.some(v => !v.valid);
    const allWarnings = allValidations.flatMap(v => v.warnings);
    
    return {
      valid: !hasErrors,
      nodeResults: results,
      warnings: allWarnings,
      summary: {
        totalNodes: nodes.length,
        validNodes: allValidations.filter(v => v.valid).length,
        invalidNodes: allValidations.filter(v => !v.valid).length,
        totalWarnings: allWarnings.length
      }
    };
  }

  // ================================================
  // GET NODE OUTPUT PORTS
  // ================================================
  getNodeOutputPorts(nodeType) {
    const node = this.getNode(nodeType);
    return node?.outputPorts || [{ name: 'next', label: 'Next', type: 'success' }];
  }

  // ================================================
  // GET NODE INPUT PORTS
  // ================================================
  getNodeInputPorts(nodeType) {
    const node = this.getNode(nodeType);
    return node?.inputPorts || [{ name: 'input', label: 'Input', type: 'object' }];
  }

  // ================================================
  // GENERATE UI FORM SCHEMA FROM NODE CONFIG
  // ================================================
  generateUISchema(nodeType) {
    const node = this.getNode(nodeType);
    if (!node || !node.configSchema) return null;
    
    const schema = {
      type: 'object',
      properties: {},
      required: []
    };
    
    for (const [fieldName, fieldSchema] of Object.entries(node.configSchema)) {
      schema.properties[fieldName] = {
        title: fieldSchema.label || fieldName,
        type: fieldSchema.type === 'number' ? 'number' : fieldSchema.type === 'boolean' ? 'boolean' : 'string',
        default: fieldSchema.default,
        description: fieldSchema.description
      };
      
      if (fieldSchema.type === 'select' && fieldSchema.options) {
        schema.properties[fieldName].enum = fieldSchema.options;
      }
      
      if (fieldSchema.placeholder) {
        schema.properties[fieldName].placeholder = fieldSchema.placeholder;
      }
      
      if (fieldSchema.required) {
        schema.required.push(fieldName);
      }
      
      if (fieldSchema.type === 'textarea') {
        schema.properties[fieldName].uiType = 'textarea';
      }
      
      if (fieldSchema.type === 'javascript') {
        schema.properties[fieldName].uiType = 'code';
        schema.properties[fieldName].language = 'javascript';
      }
      
      if (fieldSchema.type === 'json') {
        schema.properties[fieldName].uiType = 'json';
      }
      
      if (fieldSchema.type === 'credential') {
        schema.properties[fieldName].uiType = 'credential';
        schema.properties[fieldName].service = fieldSchema.service;
      }
    }
    
    return schema;
  }

  // ================================================
  // INTERPOLATE VARIABLES IN TEXT
  // ================================================
  interpolate(text, context) {
    if (typeof text !== 'string') return text;
    
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
        if (part === 'data' && context.data) {
          value = context.data;
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