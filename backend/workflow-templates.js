cat > backend/workflow-templates.js << 'EOF'
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');

const router = express.Router();

const templates = {
  'lead-scoring': {
    name: 'Lead Scoring & Routing',
    description: 'Automatically score leads and route hot leads to sales team',
    category: 'Sales',
    icon: '🎯',
    nodes: [
      { id: 'webhook', type: 'trigger', name: 'Webhook Trigger', config: {} },
      { id: 'score', type: 'ai_lead_scoring', name: 'Score Lead', config: { max_score: 100 } },
      { id: 'condition', type: 'condition', name: 'Is Hot Lead?', config: { condition: 'return data.lead_score > 70;' } },
      { id: 'slack', type: 'send_slack', name: 'Notify Sales', config: { channel: '#sales-leads', message: '🔥 Hot lead! Score: {{lead_score}}\nName: {{name}}\nEmail: {{email}}' } },
      { id: 'email', type: 'send_email', name: 'Send Auto-Reply', config: { subject: 'Thanks for your interest!', body: 'We will contact you soon.' } },
      { id: 'crm', type: 'create_lead', name: 'Save to CRM', config: { source: 'webhook' } }
    ],
    edges: [
      { source: 'webhook', target: 'score' },
      { source: 'score', target: 'condition' },
      { source: 'condition', target: 'slack', sourceHandle: 'true' },
      { source: 'condition', target: 'email', sourceHandle: 'false' },
      { source: 'email', target: 'crm' },
      { source: 'slack', target: 'crm' }
    ]
  },
  
  'social-media-auto': {
    name: 'Social Media Auto-Poster',
    description: 'Generate and post content to social media daily',
    category: 'Marketing',
    icon: '📱',
    nodes: [
      { id: 'schedule', type: 'schedule', name: 'Daily at 9 AM', config: { cron: '0 9 * * *', unit: 'cron' } },
      { id: 'ai', type: 'ai_content', name: 'Generate Content', config: { type: 'social', tone: 'professional', prompt: 'Generate engaging social media post about {{topic}}' } },
      { id: 'linkedin', type: 'post_social', name: 'Post to LinkedIn', config: { platform: 'linkedin' } },
      { id: 'twitter', type: 'post_social', name: 'Post to Twitter', config: { platform: 'twitter' } },
      { id: 'log', type: 'http_request', name: 'Log to Analytics', config: { url: 'https://analytics.example.com/log', method: 'POST' } }
    ],
    edges: [
      { source: 'schedule', target: 'ai' },
      { source: 'ai', target: 'linkedin' },
      { source: 'ai', target: 'twitter' },
      { source: 'linkedin', target: 'log' },
      { source: 'twitter', target: 'log' }
    ]
  },
  
  'cart-recovery': {
    name: 'Abandoned Cart Recovery',
    description: 'Recover lost sales from abandoned carts',
    category: 'E-commerce',
    icon: '🛒',
    nodes: [
      { id: 'webhook', type: 'trigger', name: 'Cart Abandoned', config: {} },
      { id: 'wait1', type: 'wait', name: 'Wait 1 Hour', config: { duration: 1, unit: 'hours' } },
      { id: 'email1', type: 'send_email', name: 'First Reminder', config: { subject: 'Forgot something?', body: 'Your cart is waiting!' } },
      { id: 'wait2', type: 'wait', name: 'Wait 24 Hours', config: { duration: 24, unit: 'hours' } },
      { id: 'discount', type: 'cart_recovery', name: 'Apply 10% Discount', config: { discount_percent: 10, platform: 'shopify' } },
      { id: 'email2', type: 'send_email', name: 'Discount Offer', config: { subject: '10% off your cart!', body: 'Use code SAVE10' } }
    ],
    edges: [
      { source: 'webhook', target: 'wait1' },
      { source: 'wait1', target: 'email1' },
      { source: 'email1', target: 'wait2' },
      { source: 'wait2', target: 'discount' },
      { source: 'discount', target: 'email2' }
    ]
  },
  
  'inventory-alert': {
    name: 'Low Inventory Alert',
    description: 'Get alerted when inventory is low',
    category: 'E-commerce',
    icon: '⚠️',
    nodes: [
      { id: 'schedule', type: 'schedule', name: 'Check every hour', config: { cron: '0 * * * *' } },
      { id: 'inventory', type: 'inventory_check', name: 'Check Inventory', config: { platform: 'shopify' } },
      { id: 'condition', type: 'condition', name: 'Low Stock?', config: { condition: 'return data.low_stock_items > 0;' } },
      { id: 'slack', type: 'send_slack', name: 'Alert Team', config: { channel: '#inventory', message: '⚠️ Low inventory alert! {{low_stock_items}} items need reordering.' } },
      { id: 'email', type: 'send_email', name: 'Email Report', config: { to: 'purchasing@example.com', subject: 'Low Inventory Report', body: 'Items below threshold: {{low_stock_items}}' } }
    ],
    edges: [
      { source: 'schedule', target: 'inventory' },
      { source: 'inventory', target: 'condition' },
      { source: 'condition', target: 'slack', sourceHandle: 'true' },
      { source: 'condition', target: 'email', sourceHandle: 'true' }
    ]
  },
  
  'webhook-to-email': {
    name: 'Webhook to Email Forwarder',
    description: 'Forward any webhook to email',
    category: 'Integration',
    icon: '📧',
    nodes: [
      { id: 'webhook', type: 'trigger', name: 'Webhook Receiver', config: {} },
      { id: 'transform', type: 'http_request', name: 'Transform Data', config: { url: 'https://api.example.com/transform', method: 'POST' } },
      { id: 'email', type: 'send_email', name: 'Send Email', config: { subject: 'Webhook Received: {{event_type}}', body: 'Data: {{JSON.stringify(data)}}' } }
    ],
    edges: [
      { source: 'webhook', target: 'transform' },
      { source: 'transform', target: 'email' }
    ]
  }
};

// Get all templates
router.get('/api/workflow-templates', (req, res) => {
  const templatesList = Object.entries(templates).map(([id, template]) => ({
    id,
    ...template,
    node_count: template.nodes.length
  }));
  res.json(templatesList);
});

// Get specific template
router.get('/api/workflow-templates/:templateId', (req, res) => {
  const template = templates[req.params.templateId];
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

// Apply template to create a workflow
router.post('/api/workflow-templates/:templateId/apply', async (req, res) => {
  try {
    const template = templates[req.params.templateId];
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const userId = req.user?.id;
    const { name } = req.body;
    
    const workflowId = uuidv4();
    const { data, error } = await supabase
      .from('workflows')
      .insert({
        id: workflowId,
        user_id: userId,
        name: name || template.name,
        nodes: template.nodes,
        edges: template.edges,
        execution_mode: 'sequential',
        status: 'inactive',
        run_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      workflow: data,
      message: `Template "${template.name}" applied successfully`
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
EOF