// backend/routes/coach.js
// ================================================
// AI BUSINESS COACH ROUTES - REAL SUPABASE INTEGRATION
// Production-ready endpoints with full error handling
// ================================================

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../auth-middleware');
const businessCoach = require('../services/business-coach');

// ================================================
// GET PERSONALIZED RECOMMENDATIONS
// ================================================
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    const recommendations = await businessCoach.getRecommendations(req.user.id);
    res.json({ 
      success: true, 
      recommendations,
      count: recommendations.length
    });
  } catch (err) {
    console.error('Error getting recommendations:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get recommendations',
      message: err.message
    });
  }
});

// ================================================
// GET BUSINESS PROFILE
// ================================================
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const profile = await businessCoach.getProfile(req.user.id);
    res.json({ 
      success: true, 
      profile,
      has_profile: Object.keys(profile).length > 0
    });
  } catch (err) {
    console.error('Error getting profile:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get profile'
    });
  }
});

// ================================================
// UPDATE BUSINESS PROFILE
// ================================================
router.post('/profile', authenticateToken, async (req, res) => {
  try {
    const profileData = req.body;
    await businessCoach.updateProfile(req.user.id, profileData);
    res.json({ 
      success: true, 
      message: 'Profile updated successfully'
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update profile'
    });
  }
});

// ================================================
// RUN BUSINESS HEALTH SCAN
// ================================================
router.post('/scan', authenticateToken, async (req, res) => {
  try {
    const scan = await businessCoach.runHealthScan(req.user.id);
    if (!scan) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to run health scan' 
      });
    }
    res.json({ 
      success: true, 
      scan
    });
  } catch (err) {
    console.error('Error running health scan:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Health scan failed',
      message: err.message
    });
  }
});

// ================================================
// GET WEEKLY IMPACT REPORT
// ================================================
router.get('/weekly-report', authenticateToken, async (req, res) => {
  try {
    const report = await businessCoach.generateWeeklyReport(req.user.id);
    if (!report) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to generate weekly report' 
      });
    }
    res.json({ 
      success: true, 
      report
    });
  } catch (err) {
    console.error('Error generating weekly report:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate weekly report'
    });
  }
});

// ================================================
// GET WEEKLY REPORTS HISTORY
// ================================================
router.get('/reports/history', authenticateToken, async (req, res) => {
  try {
    const reports = await businessCoach.getWeeklyReports(req.user.id);
    res.json({ 
      success: true, 
      reports
    });
  } catch (err) {
    console.error('Error getting weekly reports:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get weekly reports'
    });
  }
});

// ================================================
// GET HEALTH SCANS HISTORY
// ================================================
router.get('/scans/history', authenticateToken, async (req, res) => {
  try {
    const scans = await businessCoach.getHealthScans(req.user.id);
    res.json({ 
      success: true, 
      scans
    });
  } catch (err) {
    console.error('Error getting health scans:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get health scans'
    });
  }
});

// ================================================
// DEPLOY RECOMMENDED AUTOMATION
// ================================================
router.post('/deploy/:templateId', authenticateToken, async (req, res) => {
  const { templateId } = req.params;
  const userId = req.user.id;
  
  try {
    // Get the template details
    const { data: template, error: templateError } = await supabase
      .from('automation_templates')
      .select('*')
      .eq('slug', templateId)
      .single();
    
    if (templateError) {
      return res.status(404).json({ 
        success: false, 
        error: 'Template not found' 
      });
    }
    
    // Create automation from template
    const automationId = uuidv4();
    const now = new Date().toISOString();
    
    const { data: automation, error: createError } = await supabase
      .from('user_automations')
      .insert({
        id: automationId,
        user_id: userId,
        template_id: template.id,
        name: `AI Recommended: ${template.name}`,
        description: template.description,
        status: 'active',
        trigger_type: template.trigger_schema?.type || 'event',
        trigger_config: template.default_config?.trigger || {},
        actions: template.default_config?.actions || [],
        created_at: now,
        updated_at: now,
        metadata: { source: 'ai_recommendation', deployed_via: 'business_coach' }
      })
      .select()
      .single();
    
    if (createError) throw createError;
    
    res.json({ 
      success: true, 
      automation,
      message: 'Automation deployed successfully!'
    });
    
  } catch (error) {
    console.error('Error deploying recommendation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to deploy automation',
      message: error.message
    });
  }
});

module.exports = router;