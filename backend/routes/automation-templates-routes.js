// ================================================
// AUTOMATION TEMPLATES ROUTES - REAL PRODUCTION CODE
// 20+ Pre-built Templates for Lead Generation
// ================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../database-supabase');
const { authenticateToken } = require('../auth-middleware');

console.log('📋 AUTOMATION TEMPLATES ROUTES: Loading...');

// ================================================
// TEST ENDPOINT - Check if table exists
// ================================================
router.get('/test', authenticateToken, async (req, res) => {
  console.log('🧪 GET /api/automation/test - User:', req.user?.id);
  
  try {
    // Test if templates table exists
    const { data, error } = await supabase
      .from('automation_templates')
      .select('count')
      .limit(1);
    
    if (error) {
      return res.status(500).json({ 
        success: false,
        error: 'Database error', 
        details: error.message,
        hint: 'Make sure automation_templates table exists. Run the SQL migration.'
      });
    }
    
    // Get count of templates
    const { count, error: countError } = await supabase
      .from('automation_templates')
      .select('*', { count: 'exact', head: true });
    
    res.json({ 
      success: true, 
      message: 'Templates table exists',
      tableExists: true,
      templateCount: count || 0,
      hasData: (count || 0) > 0
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      hint: 'Database connection issue'
    });
  }
});

// ================================================
// GET ALL TEMPLATES (with filters)
// ================================================
router.get('/templates', authenticateToken, async (req, res) => {
  console.log('📋 GET /api/automation/templates - User:', req.user?.id);
  
  const { category, industry, complexity, featured, search } = req.query;
  
  try {
    // First check if table exists
    const { error: tableCheck } = await supabase
      .from('automation_templates')
      .select('id')
      .limit(1);
    
    if (tableCheck && tableCheck.message.includes('does not exist')) {
      console.warn('⚠️ automation_templates table does not exist yet');
      return res.json({
        success: true,
        templates: [],
        total: 0,
        message: 'Templates table not created yet. Please run database migration.'
      });
    }
    
    let query = supabase
      .from('automation_templates')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('usage_count', { ascending: false });
    
    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    if (industry && industry !== 'all') {
      query = query.contains('industry', [industry]);
    }
    
    if (complexity && complexity !== 'all') {
      query = query.eq('complexity', complexity);
    }
    
    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    const { data: templates, error } = await query;
    
    if (error) throw error;
    
    // Get usage stats for each template (with error handling for missing user_automations table)
    const templatesWithStats = await Promise.all((templates || []).map(async (template) => {
      let userCount = 0;
      try {
        const { count, error: countError } = await supabase
          .from('user_automations')
          .select('*', { count: 'exact', head: true })
          .eq('template_id', template.id);
        
        if (!countError) {
          userCount = count || 0;
        }
      } catch (err) {
        console.warn('Could not get user count for template:', template.id);
      }
      
      return {
        ...template,
        user_count: userCount
      };
    }));
    
    res.json({
      success: true,
      templates: templatesWithStats,
      total: templatesWithStats.length
    });
    
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch templates', 
      details: error.message,
      hint: 'Check that the automation_templates table exists in Supabase'
    });
  }
});

// ================================================
// GET SINGLE TEMPLATE
// ================================================
router.get('/templates/:slug', authenticateToken, async (req, res) => {
  const { slug } = req.params;
  
  try {
    const { data: template, error } = await supabase
      .from('automation_templates')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Template not found' });
      }
      throw error;
    }
    
    // Get examples of this template in use (with error handling)
    let examples = [];
    try {
      const { data: exampleData, error: exampleError } = await supabase
        .from('user_automations')
        .select(`
          id,
          name,
          run_count,
          success_count
        `)
        .eq('template_id', template.id)
        .eq('status', 'active')
        .limit(5);
      
      if (!exampleError) {
        examples = exampleData || [];
      }
    } catch (err) {
      console.warn('Could not fetch examples for template:', template.id);
    }
    
    // Calculate success rate
    const successRate = examples?.length > 0 
      ? examples.reduce((acc, ex) => acc + ((ex.success_count / (ex.run_count || 1)) * 100 || 0), 0) / examples.length
      : template.success_rate || 85;
    
    res.json({
      success: true,
      template: {
        ...template,
        success_rate: Math.round(successRate),
        examples: examples || []
      }
    });
    
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template', details: error.message });
  }
});

// ================================================
// CREATE AUTOMATION FROM TEMPLATE
// ================================================
router.post('/automations/from-template/:templateId', authenticateToken, async (req, res) => {
  const { templateId } = req.params;
  const { name, customizations } = req.body;
  const userId = req.user.id;
  
  try {
    // Get template
    const { data: template, error: templateError } = await supabase
      .from('automation_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    
    if (templateError) throw templateError;
    
    // Merge default config with customizations
    const triggerConfig = {
      ...template.default_config?.trigger,
      ...customizations?.trigger
    };
    
    const actions = customizations?.actions || template.default_config?.actions || [];
    
    // Create automation
    const automationId = uuidv4();
    const now = new Date().toISOString();
    
    const { data: automation, error: createError } = await supabase
      .from('user_automations')
      .insert([{
        id: automationId,
        user_id: userId,
        template_id: templateId,
        name: name || template.name,
        description: template.description,
        status: 'draft',
        trigger_type: template.trigger_schema?.type || 'event',
        trigger_config: triggerConfig,
        actions: actions,
        connected_accounts: [],
        ai_config: customizations?.ai || {},
        created_at: now,
        updated_at: now
      }])
      .select()
      .single();
    
    if (createError) throw createError;
    
    // Increment template usage count
    await supabase
      .from('automation_templates')
      .update({ usage_count: (template.usage_count || 0) + 1 })
      .eq('id', templateId);
    
    // Log activity
    await supabase
      .from('activity_log')
      .insert([{
        user_id: userId,
        action: 'automation_created',
        details: `Created automation from template: ${template.name}`,
        type: 'automation',
        timestamp: now
      }]);
    
    res.json({
      success: true,
      automation: automation,
      message: 'Automation created successfully',
      next_step: '/builder.html?id=' + automationId
    });
    
  } catch (error) {
    console.error('Error creating automation:', error);
    res.status(500).json({ error: 'Failed to create automation', details: error.message });
  }
});

// ================================================
// HEALTH CHECK ENDPOINT
// ================================================
router.get('/health', async (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Automation templates routes are working',
    timestamp: new Date().toISOString()
  });
});

// ================================================
// ADMIN ONLY: CREATE/UPDATE TEMPLATES
// ================================================
router.post('/admin/templates', authenticateToken, async (req, res) => {
  // Check if user is admin
  if (req.user.email !== 'ericchung992@gmail.com') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const template = req.body;
  
  try {
    const { data, error } = await supabase
      .from('automation_templates')
      .insert([{
        ...template,
        id: uuidv4(),
        slug: template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      template: data
    });
    
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

console.log('✅ AUTOMATION TEMPLATES ROUTES: All routes registered');
console.log('   - GET /test');
console.log('   - GET /templates');
console.log('   - GET /templates/:slug');
console.log('   - POST /automations/from-template/:templateId');
console.log('   - GET /health');
console.log('   - POST /admin/templates');

module.exports = router;