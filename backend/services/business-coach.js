// backend/services/business-coach.js
// ================================================
// AI BUSINESS COACH - REAL SUPABASE INTEGRATION
// Production-ready recommendation engine with ROI calculations
// ================================================

const { supabase } = require('../database-supabase');
const { v4: uuidv4 } = require('uuid');

class BusinessCoach {
  
  // ================================================
  // GET USER BUSINESS PROFILE
  // ================================================
  async getProfile(userId) {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('business_profile, business_name, plan')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      // Parse business_profile if it exists
      let profile = {};
      if (user?.business_profile) {
        profile = typeof user.business_profile === 'string' 
          ? JSON.parse(user.business_profile) 
          : user.business_profile;
      }
      
      return {
        ...profile,
        business_name: user?.business_name,
        plan: user?.plan
      };
    } catch (error) {
      console.error('Error getting business profile:', error);
      return {};
    }
  }

  // ================================================
  // UPDATE BUSINESS PROFILE
  // ================================================
  async updateProfile(userId, profileData) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          business_profile: profileData,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error updating business profile:', error);
      throw error;
    }
  }

  // ================================================
  // ADVANCED RECOMMENDATION ENGINE with ROI
  // ================================================
  async getRecommendations(userId) {
    try {
      const profile = await this.getProfile(userId);
      const industry = profile.industry || 'general';
      const goal = profile.goal || 'leads';
      const tools = profile.tools || [];
      const hoursSpent = profile.hours || '5-15';
      
      // Calculate time multiplier based on hours spent
      const hoursMultiplier = this.getHoursMultiplier(hoursSpent);
      const sizeMultiplier = this.getSizeMultiplier(profile.size);
      
      const recommendations = [];
      
      // ========== INDUSTRY-BASED RECOMMENDATIONS ==========
      
      // Agency/Marketing Agency
      if (industry === 'agency') {
        recommendations.push({
          id: uuidv4(),
          title: "🚀 Auto-Qualify New Leads",
          description: "Automatically score and qualify leads from forms, emails, and chats. Save 4-6 hours/week on manual lead sorting.",
          templateId: "lead-scoring",
          priority: "high",
          roi_hours_saved: Math.round(5 * hoursMultiplier),
          roi_revenue_impact: Math.round(1200 * sizeMultiplier),
          roi_leads_generated: Math.round(45 * sizeMultiplier),
          reason: "Based on your agency business model, lead qualification is your biggest time-waster. This automation pays for itself in 3 days."
        });
        
        recommendations.push({
          id: uuidv4(),
          title: "📊 Client Reporting Automation",
          description: "Auto-generate and email client reports weekly. Save 8+ hours/week on manual reporting.",
          templateId: "report-generator",
          priority: "high",
          roi_hours_saved: Math.round(8 * hoursMultiplier),
          roi_revenue_impact: Math.round(800 * sizeMultiplier),
          roi_leads_generated: 0,
          reason: "Agencies spend 15% of their time on reporting. This automation reclaims that time."
        });
      }
      
      // E-commerce
      if (industry === 'ecommerce' || tools.includes('shopify')) {
        recommendations.push({
          id: uuidv4(),
          title: "🛒 Abandoned Cart Recovery",
          description: "Recover 15-25% of lost sales with automated email/SMS sequences. Save 5 hours/week on manual follow-ups.",
          templateId: "cart-recovery",
          priority: "high",
          roi_hours_saved: Math.round(5 * hoursMultiplier),
          roi_revenue_impact: Math.round(2500 * sizeMultiplier),
          roi_leads_generated: Math.round(45 * sizeMultiplier),
          reason: "Your abandoned cart rate is likely 60-80%. This automation captures revenue you're currently losing."
        });
        
        recommendations.push({
          id: uuidv4(),
          title: "💰 Competitor Price Monitoring",
          description: "Track competitor prices and get alerts when they change. Save 3 hours/week on manual price checks.",
          templateId: "price-monitoring-alert",
          priority: "medium",
          roi_hours_saved: Math.round(3 * hoursMultiplier),
          roi_revenue_impact: Math.round(1200 * sizeMultiplier),
          roi_leads_generated: 0,
          reason: "Stay competitive without manual price tracking. This automation pays for itself with one price adjustment."
        });
      }
      
      // Content Creator / Influencer
      if (industry === 'creator') {
        recommendations.push({
          id: uuidv4(),
          title: "✍️ AI Content Repurposer",
          description: "Turn one blog/video into 10+ social posts automatically. Save 10+ hours/week on content creation.",
          templateId: "ai-social-media-scheduler",
          priority: "high",
          roi_hours_saved: Math.round(10 * hoursMultiplier),
          roi_revenue_impact: Math.round(600 * sizeMultiplier),
          roi_leads_generated: Math.round(30 * sizeMultiplier),
          reason: "Creators spend 50% of their time on content distribution. This automation handles it for you."
        });
        
        recommendations.push({
          id: uuidv4(),
          title: "🎬 Viral Video Script Generator",
          description: "Generate engaging scripts for TikTok, Reels, and YouTube in seconds.",
          templateId: "video-script-generator",
          priority: "medium",
          roi_hours_saved: Math.round(4 * hoursMultiplier),
          roi_revenue_impact: Math.round(800 * sizeMultiplier),
          roi_leads_generated: Math.round(25 * sizeMultiplier),
          reason: "Stop staring at blank pages. Generate viral scripts instantly with AI."
        });
      }
      
      // Local Business
      if (industry === 'local_business') {
        recommendations.push({
          id: uuidv4(),
          title: "⭐ Automated Review Requests",
          description: "Auto-request reviews after service completion. Get 3x more reviews without lifting a finger.",
          templateId: "review-requests",
          priority: "high",
          roi_hours_saved: Math.round(3 * hoursMultiplier),
          roi_revenue_impact: Math.round(400 * sizeMultiplier),
          roi_leads_generated: Math.round(20 * sizeMultiplier),
          reason: "Reviews are your #1 lead source. This automation turns customers into advocates."
        });
      }
      
      // ========== GOAL-BASED RECOMMENDATIONS ==========
      
      if (goal === 'leads') {
        recommendations.push({
          id: uuidv4(),
          title: "🎯 AI Lead Scoring",
          description: "Automatically score leads based on behavior and engagement. Focus on hot leads first.",
          templateId: "lead-scoring",
          priority: "high",
          roi_hours_saved: Math.round(8 * hoursMultiplier),
          roi_revenue_impact: Math.round(1200 * sizeMultiplier),
          roi_leads_generated: Math.round(85 * sizeMultiplier),
          reason: "Sales teams waste 40% of time on cold leads. This automation shows you exactly who to call."
        });
      }
      
      if (goal === 'content') {
        recommendations.push({
          id: uuidv4(),
          title: "📱 AI Social Media Scheduler",
          description: "Auto-generate and schedule posts across all platforms. Save 8+ hours/week.",
          templateId: "ai-social-media-scheduler",
          priority: "high",
          roi_hours_saved: Math.round(8 * hoursMultiplier),
          roi_revenue_impact: Math.round(600 * sizeMultiplier),
          roi_leads_generated: Math.round(30 * sizeMultiplier),
          reason: "Posting manually takes hours. Let AI do it for you with optimal timing."
        });
      }
      
      if (goal === 'support') {
        recommendations.push({
          id: uuidv4(),
          title: "💬 AI Auto-Responder",
          description: "Handle 70% of common customer questions automatically, 24/7.",
          templateId: "auto-responder",
          priority: "high",
          roi_hours_saved: Math.round(15 * hoursMultiplier),
          roi_revenue_impact: Math.round(1000 * sizeMultiplier),
          roi_leads_generated: Math.round(55 * sizeMultiplier),
          reason: "Your customers expect instant replies. This automation delivers them while you sleep."
        });
      }
      
      // ========== TOOL-BASED RECOMMENDATIONS ==========
      
      if (tools.includes('slack')) {
        recommendations.push({
          id: uuidv4(),
          title: "💬 Slack Alerts for New Leads",
          description: "Get instant notifications in Slack when new leads come in. Never miss a lead again.",
          templateId: "lead-capture-crm-slack",
          priority: "medium",
          roi_hours_saved: Math.round(2 * hoursMultiplier),
          roi_revenue_impact: Math.round(400 * sizeMultiplier),
          roi_leads_generated: Math.round(15 * sizeMultiplier),
          reason: "Real-time notifications mean faster response times and more conversions."
        });
      }
      
      if (tools.includes('hubspot') || tools.includes('salesforce')) {
        recommendations.push({
          id: uuidv4(),
          title: "🔄 CRM Sync Automation",
          description: "Auto-sync leads and contacts between your CRM and marketing tools.",
          templateId: "lead-capture-crm-slack",
          priority: "medium",
          roi_hours_saved: Math.round(4 * hoursMultiplier),
          roi_revenue_impact: Math.round(600 * sizeMultiplier),
          roi_leads_generated: 0,
          reason: "Manual data entry is error-prone. Let AI handle your CRM updates."
        });
      }
      
      // Remove duplicates (keep highest ROI for each template type)
      const uniqueRecs = [];
      const templateIds = new Set();
      for (const rec of recommendations) {
        if (!templateIds.has(rec.templateId)) {
          templateIds.add(rec.templateId);
          uniqueRecs.push(rec);
        }
      }
      
      // Sort by ROI (highest first)
      return uniqueRecs.sort((a, b) => b.roi_revenue_impact - a.roi_revenue_impact).slice(0, 6);
      
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  }

  // ================================================
  // GENERATE WEEKLY IMPACT REPORT
  // ================================================
  async generateWeeklyReport(userId) {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      
      // Get automation runs in the last week
      const { data: runs, error: runsError } = await supabase
        .from('automation_runs')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', weekStart.toISOString());
      
      if (runsError) throw runsError;
      
      // Get leads generated
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', weekStart.toISOString());
      
      if (leadsError) throw leadsError;
      
      // Get active automations
      const { data: automations, error: autoError } = await supabase
        .from('user_automations')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active');
      
      if (autoError) throw autoError;
      
      // Get user profile for ROI calculations
      const profile = await this.getProfile(userId);
      
      // Calculate metrics
      const totalRuns = runs?.length || 0;
      const successfulRuns = runs?.filter(r => r.status === 'completed').length || 0;
      const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
      
      // Calculate hours saved (based on automation types)
      let hoursSaved = 0;
      let leadsGenerated = leads?.length || 0;
      let revenueImpact = 0;
      
      for (const automation of automations || []) {
        const templateId = automation.template_id;
        const hoursMap = {
          'cart-recovery': 5,
          'lead-scoring': 10,
          'ai-social-media-scheduler': 8,
          'video-script-generator': 4,
          'lead-capture-crm-slack': 3,
          'price-monitoring-alert': 6,
          'auto-responder': 15
        };
        const hoursPerWeek = hoursMap[templateId] || 2;
        hoursSaved += hoursPerWeek;
        
        const revenueMap = {
          'cart-recovery': 2500,
          'lead-scoring': 1200,
          'ai-social-media-scheduler': 600,
          'video-script-generator': 800,
          'lead-capture-crm-slack': 800,
          'price-monitoring-alert': 1200,
          'auto-responder': 1000
        };
        revenueImpact += revenueMap[templateId] || 500;
      }
      
      // Apply multipliers based on business size and hours
      const hoursMultiplier = this.getHoursMultiplier(profile.hours);
      const sizeMultiplier = this.getSizeMultiplier(profile.size);
      
      hoursSaved = Math.round(hoursSaved * hoursMultiplier);
      revenueImpact = Math.round(revenueImpact * sizeMultiplier);
      
      const report = {
        week: weekStart.toISOString().split('T')[0],
        total_runs: totalRuns,
        successful_runs: successfulRuns,
        success_rate: successRate,
        hours_saved: hoursSaved,
        leads_generated: leadsGenerated,
        revenue_impact: revenueImpact,
        active_automations: automations?.length || 0,
        top_automation: automations?.[0]?.name || 'None'
      };
      
      // Save report to database
      const { error: insertError } = await supabase
        .from('weekly_reports')
        .insert({
          id: uuidv4(),
          user_id: userId,
          week_start: report.week,
          report_data: report,
          sent_at: new Date().toISOString()
        });
      
      if (insertError) console.error('Error saving weekly report:', insertError);
      
      return report;
      
    } catch (error) {
      console.error('Error generating weekly report:', error);
      return null;
    }
  }

  // ================================================
  // RUN BUSINESS HEALTH SCAN
  // ================================================
  async runHealthScan(userId) {
    try {
      const profile = await this.getProfile(userId);
      const tools = profile.tools || [];
      
      // Get recent leads
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: recentLeads, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      if (leadsError) throw leadsError;
      
      // Get recent automation runs
      const { data: recentRuns, error: runsError } = await supabase
        .from('automation_runs')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', thirtyDaysAgo.toISOString());
      
      if (runsError) throw runsError;
      
      // Get active automations
      const { data: activeAutomations, error: autoError } = await supabase
        .from('user_automations')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active');
      
      if (autoError) throw autoError;
      
      // Analyze findings
      const findings = [];
      const recommendations = [];
      
      // Lead response time analysis
      if (recentLeads && recentLeads.length > 0) {
        const unrespondedLeads = recentLeads.filter(l => l.status === 'new' || l.status === 'contacted' === false);
        if (unrespondedLeads.length > 10) {
          findings.push(`⚠️ You have ${unrespondedLeads.length} unresponded leads in the last 30 days.`);
          recommendations.push({
            title: "Auto-respond to new leads",
            description: "Set up an AI auto-responder to instantly reply to leads, even outside business hours.",
            templateId: "auto-responder",
            priority: "High"
          });
        }
      }
      
      // E-commerce specific analysis
      if (tools.includes('shopify')) {
        findings.push("🛒 Your store is connected. Abandoned cart recovery can recover 15-25% of lost sales.");
        recommendations.push({
          title: "Abandoned Cart Recovery",
          description: "Send automated emails to customers who leave items in their cart.",
          templateId: "cart-recovery",
          priority: "High"
        });
      }
      
      // Content creator analysis
      if (profile.industry === 'creator') {
        findings.push("📱 As a content creator, repurposing content across platforms saves 10+ hours/week.");
        recommendations.push({
          title: "AI Content Repurposer",
          description: "Turn one blog/video into 10+ social posts automatically.",
          templateId: "ai-social-media-scheduler",
          priority: "High"
        });
      }
      
      // Agency analysis
      if (profile.industry === 'agency') {
        findings.push("📊 Agencies spend 15% of their time on client reporting. Automate it.");
        recommendations.push({
          title: "Auto-Generate Client Reports",
          description: "Pull data from analytics tools and email beautiful reports to clients weekly.",
          templateId: "report-generator",
          priority: "Medium"
        });
      }
      
      // General recommendations based on automation count
      if (activeAutomations.length === 0) {
        findings.push("🤖 You haven't created any automations yet. Let's fix that!");
        recommendations.push({
          title: "Start with a Template",
          description: "Browse our library of pre-built templates to get started quickly.",
          templateId: "templates",
          priority: "High"
        });
      } else if (activeAutomations.length < 3) {
        findings.push(`✨ You have ${activeAutomations.length} active automation(s). Adding 2-3 more can double your time savings.`);
      }
      
      const scan = {
        id: uuidv4(),
        user_id: userId,
        scan_date: new Date().toISOString(),
        findings: findings,
        recommendations: recommendations,
        stats: {
          total_leads_30d: recentLeads?.length || 0,
          total_runs_30d: recentRuns?.length || 0,
          active_automations: activeAutomations?.length || 0,
          connected_tools: tools.length
        }
      };
      
      // Save scan to database
      const { error: insertError } = await supabase
        .from('health_scans')
        .insert({
          id: scan.id,
          user_id: userId,
          scan_date: scan.scan_date,
          findings: JSON.stringify(findings),
          recommendations: JSON.stringify(recommendations),
          stats: scan.stats
        });
      
      if (insertError) console.error('Error saving health scan:', insertError);
      
      return scan;
      
    } catch (error) {
      console.error('Error running health scan:', error);
      return null;
    }
  }

  // ================================================
  // GET USER'S WEEKLY REPORTS HISTORY
  // ================================================
  async getWeeklyReports(userId, limit = 4) {
    try {
      const { data: reports, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      return reports.map(r => ({
        ...r,
        report_data: typeof r.report_data === 'string' ? JSON.parse(r.report_data) : r.report_data
      }));
      
    } catch (error) {
      console.error('Error getting weekly reports:', error);
      return [];
    }
  }

  // ================================================
  // GET USER'S HEALTH SCANS HISTORY
  // ================================================
  async getHealthScans(userId, limit = 3) {
    try {
      const { data: scans, error } = await supabase
        .from('health_scans')
        .select('*')
        .eq('user_id', userId)
        .order('scan_date', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      return scans.map(s => ({
        ...s,
        findings: typeof s.findings === 'string' ? JSON.parse(s.findings) : s.findings,
        recommendations: typeof s.recommendations === 'string' ? JSON.parse(s.recommendations) : s.recommendations
      }));
      
    } catch (error) {
      console.error('Error getting health scans:', error);
      return [];
    }
  }

  // ================================================
  // HELPER: Get hours multiplier based on time spent
  // ================================================
  getHoursMultiplier(hours) {
    const multipliers = {
      '0-5': 0.5,
      '5-15': 1,
      '15-25': 1.5,
      '25-40': 2,
      '40+': 2.5
    };
    return multipliers[hours] || 1;
  }

  // ================================================
  // HELPER: Get size multiplier based on employee count
  // ================================================
  getSizeMultiplier(size) {
    const multipliers = {
      'solo': 0.8,
      '1-5': 1,
      '6-20': 1.5,
      '21-50': 2,
      '51+': 3
    };
    return multipliers[size] || 1;
  }
}

module.exports = new BusinessCoach();