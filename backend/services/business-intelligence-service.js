// ============================================================
// backend/services/business-intelligence-service.js
// Business Intelligence Service
// ============================================================

/**
 * Calculate ROI for an automation type based on user profile
 * @param {string} automationType - Type of automation
 * @param {object} userProfile - User's business profile
 * @returns {object} ROI metrics
 */
function calculateAutomationROI(automationType, userProfile) {
  const roiData = {
    "cart-recovery": { hoursSaved: 5, revenueImpact: 2500, leadsGenerated: 45 },
    "lead-scoring": { hoursSaved: 10, revenueImpact: 1200, leadsGenerated: 85 },
    "ai-social-media-scheduler": { hoursSaved: 8, revenueImpact: 600, leadsGenerated: 30 },
    "video-script-generator": { hoursSaved: 4, revenueImpact: 800, leadsGenerated: 25 },
    "lead-capture-crm-slack": { hoursSaved: 3, revenueImpact: 800, leadsGenerated: 65 },
    "price-monitoring-alert": { hoursSaved: 6, revenueImpact: 1200, leadsGenerated: 20 },
    "auto-responder": { hoursSaved: 15, revenueImpact: 1000, leadsGenerated: 55 },
  };

  const baseROI = roiData[automationType] || { hoursSaved: 2, revenueImpact: 500, leadsGenerated: 15 };

  // Adjust based on business size
  let sizeMultiplier = 1;
  if (userProfile.size === "1-5") sizeMultiplier = 1.2;
  else if (userProfile.size === "6-20") sizeMultiplier = 1.5;
  else if (userProfile.size === "21-50") sizeMultiplier = 2;
  else if (userProfile.size === "51+") sizeMultiplier = 3;

  // Adjust based on hours spent
  let hoursMultiplier = 1;
  if (userProfile.hours === "5-15") hoursMultiplier = 1.3;
  else if (userProfile.hours === "15-25") hoursMultiplier = 1.8;
  else if (userProfile.hours === "25-40") hoursMultiplier = 2.2;
  else if (userProfile.hours === "40+") hoursMultiplier = 3;

  return {
    hours_saved_per_week: Math.round(baseROI.hoursSaved * sizeMultiplier * hoursMultiplier),
    revenue_impact_monthly: Math.round(baseROI.revenueImpact * sizeMultiplier),
    leads_generated_monthly: Math.round(baseROI.leadsGenerated * sizeMultiplier),
    confidence_score: Math.min(95, Math.round(70 + sizeMultiplier * 5 + hoursMultiplier * 5)),
  };
}

/**
 * Generate business insights based on user profile
 * @param {object} profile - User's business profile
 * @param {object} roiCalculator - ROI calculation function
 * @returns {Array} Insights
 */
function generateBusinessInsights(profile, roiCalculator = calculateAutomationROI) {
  const insights = [];

  // E-commerce insights
  if (profile.industry === "ecommerce" || profile.tools?.includes("shopify")) {
    const roi = roiCalculator("cart-recovery", profile);
    insights.push({
      type: "ecommerce",
      title: "🛒 E-commerce Opportunity",
      description: `Based on your business type, you could recover 15% of abandoned carts with automated follow-up emails. This could save you ${roi.hours_saved_per_week} hours/week and add $${roi.revenue_impact_monthly}/month.`,
      priority: "high",
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });
  }

  // Agency insights
  if (profile.industry === "agency") {
    const roi = roiCalculator("lead-scoring", profile);
    insights.push({
      type: "operations",
      title: "🏢 Agency Efficiency",
      description: `Automate client reporting and save ${roi.hours_saved_per_week} hours per week per client with AI-powered reports.`,
      priority: "high",
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });
  }

  // Lead generation insights
  if (profile.goal === "leads") {
    const roi = roiCalculator("lead-scoring", profile);
    insights.push({
      type: "lead_generation",
      title: "🎯 Lead Generation Potential",
      description: `AI lead scoring can increase conversion by 45%. Based on your profile, this could generate ${roi.leads_generated_monthly} leads/month and save ${roi.hours_saved_per_week} hours/week.`,
      priority: "high",
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });
  }

  // Content creation insights
  if (profile.goal === "content") {
    const roi = roiCalculator("ai-social-media-scheduler", profile);
    insights.push({
      type: "content",
      title: "✍️ Content Scaling",
      description: `AI content generation can 3x your output. Save ${roi.hours_saved_per_week} hours/week and generate ${roi.leads_generated_monthly} more leads.`,
      priority: "medium",
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });
  }

  // Customer support insights
  if (profile.goal === "support") {
    const roi = roiCalculator("auto-responder", profile);
    insights.push({
      type: "customer_support",
      title: "💬 24/7 Support",
      description: `AI auto-responder can handle 70% of common questions automatically. Save ${roi.hours_saved_per_week} hours/week on support.`,
      priority: "high",
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });
  }

  // Sales insights
  if (profile.goal === "sales") {
    const roi = roiCalculator("cart-recovery", profile);
    insights.push({
      type: "sales",
      title: "📈 Sales Growth Opportunity",
      description: `Automated cart recovery and follow-up sequences can boost sales by 15-25%. Potential revenue increase: $${roi.revenue_impact_monthly}/month.`,
      priority: "high",
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });
  }

  // Hours-based insights
  if (profile.hours && profile.hours !== "0-5") {
    const hoursMap = { "5-15": 10, "15-25": 20, "25-40": 32, "40+": 45 };
    const currentHours = hoursMap[profile.hours] || 5;
    const savedHours = Math.floor(currentHours * 0.7);
    insights.push({
      type: "operations",
      title: "⏰ Time Savings Opportunity",
      description: `You spend ~${currentHours} hours/week on manual tasks. Automations could save you ${savedHours} hours/week - that's ${Math.floor(savedHours / 8)} extra days per week!`,
      priority: "high",
      roi: savedHours * 50,
      hours_saved: savedHours,
    });
  }

  // Challenge-based insights
  if (profile.challenge === "manual_data") {
    insights.push({
      type: "operations",
      title: "📊 Data Entry Automation",
      description: `Manual data entry is a major time sink. Automate form submissions and CRM updates to save 8+ hours/week.`,
      priority: "high",
      roi: 600,
      hours_saved: 8,
    });
  }

  if (profile.challenge === "followups") {
    insights.push({
      type: "sales",
      title: "📧 Follow-up Automation",
      description: `Automated follow-up sequences can increase response rates by 3x and save 5+ hours/week.`,
      priority: "high",
      roi: 1500,
      hours_saved: 5,
    });
  }

  // Tool-based insights
  if (profile.tools && profile.tools.includes("shopify")) {
    const roi = roiCalculator("cart-recovery", profile);
    insights.push({
      type: "ecommerce",
      title: "💰 E-commerce Revenue Opportunity",
      description: `You're losing 15-25% of potential sales from abandoned carts. Automated recovery could add $${roi.revenue_impact_monthly}/month.`,
      priority: "high",
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });
  }

  if (profile.tools && profile.tools.includes("slack")) {
    insights.push({
      type: "operations",
      title: "💬 Team Communication Boost",
      description: `Connect your automations to Slack for real-time team notifications on leads, sales, and support tickets.`,
      priority: "medium",
      roi: 400,
      hours_saved: 2,
    });
  }

  return insights;
}

/**
 * Generate recommendations based on user profile
 * @param {object} profile - User's business profile
 * @param {function} roiCalculator - ROI calculation function
 * @returns {Array} Recommendations
 */
function generateRecommendations(profile, roiCalculator = calculateAutomationROI) {
  const recommendations = [];

  // E-commerce recommendations
  if (profile.industry === "ecommerce" || profile.tools?.includes("shopify")) {
    const roi = roiCalculator("cart-recovery", profile);
    recommendations.push({
      id: `rec_${Date.now()}_1`,
      automation_template_id: "cart-recovery",
      title: "Abandoned Cart Recovery",
      reason: `You use e-commerce tools. This automation recovers lost sales by sending follow-up emails to customers who leave items in cart. Estimated ROI: $${roi.revenue_impact_monthly}/month`,
      confidence: roi.confidence_score,
      roi: roi.revenue_impact_monthly,
      hours_saved: roi.hours_saved_per_week,
    });

    const priceRoi = roiCalculator("price-monitoring-alert", profile);
    recommendations.push({
      id: `rec_${Date.now()}_2`,
      automation_template_id: "price-monitoring-alert",
      title: "Competitor Price Monitoring",
      reason: `Stay competitive with real-time price alerts when competitors change prices. Estimated savings: $${priceRoi.revenue_impact_monthly}/month.`,
      confidence: priceRoi.confidence_score,
      roi: priceRoi.revenue_impact_monthly,
      hours_saved: priceRoi.hours_saved_per_week,
    });
  }

  // Lead generation recommendations
  if (profile.goal === "leads") {
    const leadRoi = roiCalculator("lead-scoring", profile);
    recommendations.push({
      id: `rec_${Date.now()}_3`,
      automation_template_id: "lead-scoring",
      title: "AI Lead Scoring",
      reason: `Automatically score leads based on behavior and engagement. Focus your sales team on hot leads first. Estimated: ${leadRoi.leads_generated_monthly} leads/month.`,
      confidence: leadRoi.confidence_score,
      roi: leadRoi.revenue_impact_monthly,
      hours_saved: leadRoi.hours_saved_per_week,
      leads_generated: leadRoi.leads_generated_monthly,
    });

    const captureRoi = roiCalculator("lead-capture-crm-slack", profile);
    recommendations.push({
      id: `rec_${Date.now()}_4`,
      automation_template_id: "lead-capture-crm-slack",
      title: "Lead to CRM + Slack",
      reason: `Capture leads from your website and instantly notify your team on Slack. Estimated: ${captureRoi.leads_generated_monthly} more leads/month.`,
      confidence: captureRoi.confidence_score,
      roi: captureRoi.revenue_impact_monthly,
      hours_saved: captureRoi.hours_saved_per_week,
      leads_generated: captureRoi.leads_generated_monthly,
    });
  }

  // Content creation recommendations
  if (profile.goal === "content") {
    const socialRoi = roiCalculator("ai-social-media-scheduler", profile);
    recommendations.push({
      id: `rec_${Date.now()}_5`,
      automation_template_id: "ai-social-media-scheduler",
      title: "AI Social Media Scheduler",
      reason: `Auto-generate and schedule posts across all platforms with optimal timing for maximum engagement. Save ${socialRoi.hours_saved_per_week} hours/week.`,
      confidence: socialRoi.confidence_score,
      roi: socialRoi.revenue_impact_monthly,
      hours_saved: socialRoi.hours_saved_per_week,
    });

    const videoRoi = roiCalculator("video-script-generator", profile);
    recommendations.push({
      id: `rec_${Date.now()}_6`,
      automation_template_id: "video-script-generator",
      title: "Video Script Generator",
      reason: `Generate engaging TikTok/Reel scripts in seconds. 10x your video output and save ${videoRoi.hours_saved_per_week} hours/week.`,
      confidence: videoRoi.confidence_score,
      roi: videoRoi.revenue_impact_monthly,
      hours_saved: videoRoi.hours_saved_per_week,
    });
  }

  // Customer support recommendations
  if (profile.goal === "support" || profile.tools?.includes("slack")) {
    const supportRoi = roiCalculator("auto-responder", profile);
    recommendations.push({
      id: `rec_${Date.now()}_7`,
      automation_template_id: "auto-responder",
      title: "AI Auto-Responder",
      reason: `Automatically respond to common customer questions 24/7. Reduce response time by 80% and save ${supportRoi.hours_saved_per_week} hours/week.`,
      confidence: supportRoi.confidence_score,
      roi: supportRoi.revenue_impact_monthly,
      hours_saved: supportRoi.hours_saved_per_week,
    });
  }

  // Sort by ROI (highest first)
  return recommendations.sort((a, b) => (b.roi || 0) - (a.roi || 0));
}

/**
 * Calculate total ROI from recommendations
 * @param {Array} recommendations - List of recommendations
 * @returns {object} Total ROI metrics
 */
function calculateTotalROI(recommendations) {
  return {
    hours_saved_per_week: recommendations.reduce((sum, rec) => sum + (rec.hours_saved || 0), 0),
    revenue_impact_monthly: recommendations.reduce((sum, rec) => sum + (rec.roi || 0), 0),
    leads_generated_monthly: recommendations.reduce((sum, rec) => sum + (rec.leads_generated || 0), 0),
  };
}

module.exports = {
  calculateAutomationROI,
  generateBusinessInsights,
  generateRecommendations,
  calculateTotalROI,
};