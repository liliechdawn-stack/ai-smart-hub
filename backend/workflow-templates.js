// ================================================
// WORKFLOW TEMPLATES - PRODUCTION SaaS
// Prebuilt workflow templates users can apply to their account.
// ================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');
const { authenticateToken } = require('./auth-middleware');

const router = express.Router();

// ================================================
// TEMPLATE DEFINITIONS
// ================================================
//
// IMPORTANT: These templates reference node types that must exist in the
// workflow executor. If a node type is not supported by the executor, the
// workflow will fail explicitly rather than simulate success.
//
// Only node types that are currently SUPPORTED by the executor should be used:
//   - trigger, schedule, manual_trigger, webhook_custom
//   - ai_content, ai_summarize, ai_chat, ai_agent, ai_lead_scoring, basic_llm_chain
//   - condition, enhanced_condition, switch
//   - wait, loop, loop_items
//   - filter, sort, transform, split, aggregate, limit_node, deduplicate
//   - set_variable, get_variable, pass_through
//   - http_request, webhook, graphql, api_fetcher
//   - json_parse, json_stringify, data_mapper
//   - create_lead, insert_row, knowledge_base
//
// Node types that are NOT yet supported by the executor (email, slack, social,
// shopify, stripe, etc.) must NOT be used in templates until real integrations
// are connected. Using them would cause the workflow to fail at runtime with
// INTEGRATION_NOT_CONFIGURED.
// ================================================

const templates = {
  'lead-scoring': {
    name: 'Lead Scoring & Routing',
    description: 'Automatically score incoming leads using AI and route them based on quality.',
    category: 'Sales',
    icon: '🎯',
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        name: 'Webhook Trigger',
        config: {},
      },
      {
        id: 'score',
        type: 'ai_lead_scoring',
        name: 'Score Lead',
        config: {},
      },
      {
        id: 'condition',
        type: 'condition',
        name: 'Is Hot Lead?',
        config: {
          field: 'lead_score',
          operator: 'gte',
          value: 70,
        },
      },
      {
        id: 'hot_branch',
        type: 'set_variable',
        name: 'Mark as Hot Lead',
        config: {
          variable_name: 'lead_tier',
          variable_value: 'hot',
        },
      },
      {
        id: 'warm_branch',
        type: 'set_variable',
        name: 'Mark as Warm Lead',
        config: {
          variable_name: 'lead_tier',
          variable_value: 'warm',
        },
      },
      {
        id: 'save',
        type: 'create_lead',
        name: 'Save Lead',
        config: { source: 'webhook' },
      },
    ],
    edges: [
      { source: 'trigger', target: 'score' },
      { source: 'score', target: 'condition' },
      { source: 'condition', target: 'hot_branch', sourceHandle: 'true' },
      { source: 'condition', target: 'warm_branch', sourceHandle: 'false' },
      { source: 'hot_branch', target: 'save' },
      { source: 'warm_branch', target: 'save' },
    ],
  },

  'ai-content-pipeline': {
    name: 'AI Content Pipeline',
    description: 'Generate AI content on a schedule and save it for review.',
    category: 'Marketing',
    icon: '✍️',
    nodes: [
      {
        id: 'schedule',
        type: 'schedule',
        name: 'Daily Trigger',
        config: { cron: '0 9 * * *' },
      },
      {
        id: 'generate',
        type: 'ai_content',
        name: 'Generate Content',
        config: {
          type: 'blog',
          tone: 'professional',
          prompt: 'Write a short blog post about a trending topic in our industry.',
        },
      },
      {
        id: 'save',
        type: 'insert_row',
        name: 'Save to Content Library',
        config: {
          table: 'gallery',
          data: {
            type: 'content',
            title: 'Daily AI Draft',
          },
        },
      },
    ],
    edges: [
      { source: 'schedule', target: 'generate' },
      { source: 'generate', target: 'save' },
    ],
  },

  'lead-intake-pipeline': {
    name: 'Lead Intake Pipeline',
    description: 'Receive a lead from an external system, enrich it, and store it.',
    category: 'Sales',
    icon: '📥',
    nodes: [
      {
        id: 'webhook',
        type: 'webhook_custom',
        name: 'Incoming Lead Webhook',
        config: {},
      },
      {
        id: 'transform',
        type: 'transform',
        name: 'Normalize Fields',
        config: {
          mapping: {
            full_name: 'name',
            contact_email: 'email',
            contact_phone: 'phone',
          },
        },
      },
      {
        id: 'dedupe_check',
        type: 'condition',
        name: 'Has Email?',
        config: {
          field: 'email',
          operator: 'exists',
        },
      },
      {
        id: 'save',
        type: 'create_lead',
        name: 'Create Lead',
        config: { source: 'api' },
      },
      {
        id: 'skip',
        type: 'pass_through',
        name: 'Skip (no email)',
        config: {},
      },
    ],
    edges: [
      { source: 'webhook', target: 'transform' },
      { source: 'transform', target: 'dedupe_check' },
      { source: 'dedupe_check', target: 'save', sourceHandle: 'true' },
      { source: 'dedupe_check', target: 'skip', sourceHandle: 'false' },
    ],
  },

  'http-poller': {
    name: 'HTTP Poller with Filtering',
    description: 'Poll an external API on a schedule and store matching records.',
    category: 'Integration',
    icon: '🌐',
    nodes: [
      {
        id: 'schedule',
        type: 'schedule',
        name: 'Poll Every Hour',
        config: { cron: '0 * * * *' },
      },
      {
        id: 'fetch',
        type: 'http_request',
        name: 'Fetch External Data',
        config: {
          url: 'https://api.example.com/items',
          method: 'GET',
        },
      },
      {
        id: 'filter',
        type: 'filter',
        name: 'Keep Only Active Items',
        config: {
          field: 'status',
          operator: 'equals',
          value: 'active',
        },
      },
      {
        id: 'store',
        type: 'insert_row',
        name: 'Store Item',
        config: {
          table: 'gallery',
          data: { type: 'external_item' },
        },
      },
    ],
    edges: [
      { source: 'schedule', target: 'fetch' },
      { source: 'fetch', target: 'filter' },
      { source: 'filter', target: 'store', sourceHandle: 'true' },
    ],
  },

  'webhook-to-http': {
    name: 'Webhook Forwarder',
    description: 'Receive a webhook and forward the payload to another HTTP endpoint.',
    category: 'Integration',
    icon: '📧',
    nodes: [
      {
        id: 'webhook',
        type: 'webhook_custom',
        name: 'Webhook Receiver',
        config: {},
      },
      {
        id: 'forward',
        type: 'http_request',
        name: 'Forward Payload',
        config: {
          url: 'https://api.example.com/forward',
          method: 'POST',
          body: '{}',
        },
      },
    ],
    edges: [
      { source: 'webhook', target: 'forward' },
    ],
  },

  'ai-summary-pipeline': {
    name: 'AI Summary Pipeline',
    description: 'Summarize incoming text using AI and store the summary.',
    category: 'AI',
    icon: '📝',
    nodes: [
      {
        id: 'webhook',
        type: 'webhook_custom',
        name: 'Text Input',
        config: {},
      },
      {
        id: 'summarize',
        type: 'ai_summarize',
        name: 'Summarize',
        config: {
          text: 'Please summarize the incoming content.',
        },
      },
      {
        id: 'store',
        type: 'insert_row',
        name: 'Store Summary',
        config: {
          table: 'gallery',
          data: { type: 'summary' },
        },
      },
    ],
    edges: [
      { source: 'webhook', target: 'summarize' },
      { source: 'summarize', target: 'store' },
    ],
  },
};

// ================================================
// GET /api/workflow-templates
// List all available workflow templates
// ================================================
router.get('/api/workflow-templates', authenticateToken, (req, res) => {
  try {
    const templatesList = Object.entries(templates).map(([id, template]) => ({
      id,
      name: template.name,
      description: template.description,
      category: template.category,
      icon: template.icon,
      node_count: template.nodes.length,
    }));
    res.json({ success: true, templates: templatesList, total: templatesList.length });
  } catch (error) {
    console.error('Error listing workflow templates:', error);
    res.status(500).json({ error: 'Failed to list workflow templates' });
  }
});

// ================================================
// GET /api/workflow-templates/:templateId
// Get a specific template by ID
// ================================================
router.get('/api/workflow-templates/:templateId', authenticateToken, (req, res) => {
  try {
    const template = templates[req.params.templateId];
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (error) {
    console.error('Error fetching workflow template:', error);
    res.status(500).json({ error: 'Failed to fetch workflow template' });
  }
});

// ================================================
// POST /api/workflow-templates/:templateId/apply
// Apply a template to create a new workflow for the authenticated user
// ================================================
router.post('/api/workflow-templates/:templateId/apply', authenticateToken, async (req, res) => {
  try {
    const template = templates[req.params.templateId];
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // TENANT ISOLATION: userId always comes from authenticated token, never from body
    const userId = req.user.id;
    const { name } = req.body;

    const workflowId = uuidv4();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('workflows')
      .insert({
        id: workflowId,
        user_id: userId,
        name: name || template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
        execution_mode: 'sequential',
        status: 'inactive',
        run_count: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      workflow: data,
      message: `Template "${template.name}" applied successfully`,
    });
  } catch (error) {
    console.error('Error applying workflow template:', error);
    res.status(500).json({ error: 'Failed to apply workflow template' });
  }
});

module.exports = router;