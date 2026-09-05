// ============================================================
// backend/entitlements.js - SINGLE SOURCE OF TRUTH
// Plan definitions, feature entitlements, and usage limits
// ============================================================

/**
 * AI Smart Hub Plan Definitions
 * 
 * This is the SINGLE SOURCE OF TRUTH for all plan-related data.
 * All other files should import from here.
 * 
 * DO NOT define PLAN_LIMITS or pricing anywhere else.
 */

const PLANS = {
  free: {
    id: "free",
    name: "Free",
    tier: 0,
    price_usd: 0,
    price_usd_annual: 0,
    limits: {
      messages: 50,
      leads: 10,
      automations: 1,
      workflows: 1,
      team_members: 1,
      workspaces: 1,
      ai_requests: 50,
      file_uploads: 10,
      storage_mb: 100,
      api_calls: 100,
    },
    features: [
      "basic_chat",
      "lead_capture",
      "widget",
      "email_support",
    ],
    description: "Get started with basic AI chat and lead capture.",
  },
  
  basic: {
    id: "basic",
    name: "Basic",
    tier: 1,
    price_usd: 7,
    price_usd_annual: 70,
    limits: {
      messages: 500,
      leads: 500,
      automations: 5,
      workflows: 5,
      team_members: 3,
      workspaces: 1,
      ai_requests: 500,
      file_uploads: 50,
      storage_mb: 500,
      api_calls: 1000,
    },
    features: [
      "basic_chat",
      "lead_capture",
      "widget",
      "knowledge_base",
      "broadcast_emails",
      "email_support",
      "analytics_basic",
    ],
    description: "Perfect for small businesses getting started with AI.",
  },
  
  pro: {
    id: "pro",
    name: "Pro",
    tier: 2,
    price_usd: 100,
    price_usd_annual: 1000,
    limits: {
      messages: 3000,
      leads: 3000,
      automations: 20,
      workflows: 20,
      team_members: 10,
      workspaces: 3,
      ai_requests: 3000,
      file_uploads: 200,
      storage_mb: 2000,
      api_calls: 10000,
    },
    features: [
      "advanced_chat",
      "lead_capture",
      "widget",
      "knowledge_base",
      "broadcast_emails",
      "automations",
      "workflows",
      "business_intelligence",
      "api_access",
      "custom_branding",
      "priority_support",
      "analytics_advanced",
      "vision_ai",
      "sentiment_analysis",
    ],
    description: "For growing businesses that need advanced AI and automation.",
  },
  
  agency: {
    id: "agency",
    name: "Agency",
    tier: 3,
    price_usd: 160,
    price_usd_annual: 1600,
    limits: {
      messages: Infinity,
      leads: Infinity,
      automations: 100,
      workflows: 100,
      team_members: 50,
      workspaces: 10,
      ai_requests: Infinity,
      file_uploads: 1000,
      storage_mb: 10000,
      api_calls: 100000,
    },
    features: [
      "unlimited_chat",
      "unlimited_leads",
      "white_label",
      "api_access",
      "team_management",
      "all_automations",
      "all_workflows",
      "business_intelligence",
      "custom_integrations",
      "advanced_analytics",
      "vision_ai",
      "sentiment_analysis",
      "multi_workspace",
      "priority_support",
      "slack_integration",
      "webhook_access",
    ],
    description: "For agencies managing multiple clients with white-label capabilities.",
  },
  
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tier: 4,
    price_usd: 499,
    price_usd_annual: 4990,
    limits: {
      messages: Infinity,
      leads: Infinity,
      automations: Infinity,
      workflows: Infinity,
      team_members: Infinity,
      workspaces: Infinity,
      ai_requests: Infinity,
      file_uploads: Infinity,
      storage_mb: Infinity,
      api_calls: Infinity,
    },
    features: [
      "everything_in_agency",
      "custom_ai_models",
      "dedicated_support",
      "sla",
      "custom_integrations",
      "on_premise_deployment",
      "sso_saml",
      "audit_logs",
      "compliance_reports",
      "custom_contracts",
      "account_manager",
      "training_sessions",
    ],
    description: "For large enterprises requiring custom AI models and dedicated support.",
  },
};

// ============================================================
// FEATURE FLAGS
// ============================================================

const FEATURES = {
  basic_chat: "Basic AI Chat",
  advanced_chat: "Advanced AI Chat",
  unlimited_chat: "Unlimited AI Chat",
  lead_capture: "Lead Capture",
  widget: "AI Widget",
  knowledge_base: "Knowledge Base",
  broadcast_emails: "Broadcast Emails",
  automations: "Automations",
  workflows: "Workflows",
  all_automations: "All Automations",
  all_workflows: "All Workflows",
  business_intelligence: "Business Intelligence",
  api_access: "API Access",
  custom_branding: "Custom Branding",
  white_label: "White-label",
  team_management: "Team Management",
  custom_integrations: "Custom Integrations",
  advanced_analytics: "Advanced Analytics",
  vision_ai: "Vision AI",
  sentiment_analysis: "Sentiment Analysis",
  multi_workspace: "Multi-workspace",
  slack_integration: "Slack Integration",
  webhook_access: "Webhook Access",
  priority_support: "Priority Support",
  email_support: "Email Support",
  analytics_basic: "Basic Analytics",
  analytics_advanced: "Advanced Analytics",
  everything_in_agency: "Everything in Agency",
  custom_ai_models: "Custom AI Models",
  dedicated_support: "Dedicated Support",
  sla: "SLA",
  on_premise_deployment: "On-premise Deployment",
  sso_saml: "SSO/SAML",
  audit_logs: "Audit Logs",
  compliance_reports: "Compliance Reports",
  custom_contracts: "Custom Contracts",
  account_manager: "Account Manager",
  training_sessions: "Training Sessions",
  unlimited_leads: "Unlimited Leads",
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get plan by ID
 * @param {string} planId - Plan ID (free, basic, pro, agency, enterprise)
 * @returns {object|null} Plan object or null if not found
 */
function getPlan(planId) {
  return PLANS[planId] || null;
}

/**
 * Get plan limits
 * @param {string} planId - Plan ID
 * @returns {object} Plan limits
 */
function getPlanLimits(planId) {
  const plan = getPlan(planId);
  if (!plan) return PLANS.free.limits;
  return { ...plan.limits };
}

/**
 * Get plan features
 * @param {string} planId - Plan ID
 * @returns {string[]} Array of feature keys
 */
function getPlanFeatures(planId) {
  const plan = getPlan(planId);
  if (!plan) return PLANS.free.features;
  return [...plan.features];
}

/**
 * Check if a plan has a specific feature
 * @param {string} planId - Plan ID
 * @param {string} featureKey - Feature key to check
 * @returns {boolean} True if plan has the feature
 */
function hasFeature(planId, featureKey) {
  const features = getPlanFeatures(planId);
  return features.includes(featureKey);
}

/**
 * Get plan price in USD
 * @param {string} planId - Plan ID
 * @param {boolean} isAnnual - Whether to get annual price
 * @returns {number} Price in USD
 */
function getPlanPrice(planId, isAnnual = false) {
  const plan = getPlan(planId);
  if (!plan) return 0;
  return isAnnual ? plan.price_usd_annual : plan.price_usd;
}

/**
 * Get plan price in NGN (for Paystack)
 * @param {string} planId - Plan ID
 * @param {boolean} isAnnual - Whether to get annual price
 * @param {number} rate - USD to NGN conversion rate
 * @returns {number} Price in NGN
 */
function getPlanPriceNGN(planId, isAnnual = false, rate = 1500) {
  const usd = getPlanPrice(planId, isAnnual);
  return usd * rate;
}

/**
 * Get all plans
 * @returns {object[]} Array of all plan objects
 */
function getAllPlans() {
  return Object.values(PLANS);
}

/**
 * Get all plan IDs
 * @returns {string[]} Array of plan IDs
 */
function getAllPlanIds() {
  return Object.keys(PLANS);
}

/**
 * Check if a plan ID is valid
 * @param {string} planId - Plan ID to check
 * @returns {boolean} True if plan exists
 */
function isValidPlan(planId) {
  return !!PLANS[planId];
}

/**
 * Get the next tier plan (for upgrades)
 * @param {string} planId - Current plan ID
 * @returns {string|null} Next plan ID or null if at highest tier
 */
function getNextPlanTier(planId) {
  const tiers = getAllPlans().sort((a, b) => a.tier - b.tier);
  const currentIndex = tiers.findIndex(p => p.id === planId);
  if (currentIndex === -1 || currentIndex === tiers.length - 1) return null;
  return tiers[currentIndex + 1].id;
}

/**
 * Get the previous tier plan (for downgrades)
 * @param {string} planId - Current plan ID
 * @returns {string|null} Previous plan ID or null if at lowest tier
 */
function getPreviousPlanTier(planId) {
  const tiers = getAllPlans().sort((a, b) => a.tier - b.tier);
  const currentIndex = tiers.findIndex(p => p.id === planId);
  if (currentIndex <= 0) return null;
  return tiers[currentIndex - 1].id;
}

/**
 * Check if a plan has reached its limit for a specific resource
 * @param {string} planId - Plan ID
 * @param {string} resource - Resource key (messages, leads, etc.)
 * @param {number} used - Current usage
 * @returns {boolean} True if limit is reached or exceeded
 */
function isLimitReached(planId, resource, used) {
  const limits = getPlanLimits(planId);
  const limit = limits[resource];
  if (limit === Infinity) return false;
  return used >= limit;
}

/**
 * Get remaining allowance for a resource
 * @param {string} planId - Plan ID
 * @param {string} resource - Resource key
 * @param {number} used - Current usage
 * @returns {number} Remaining allowance (Infinity if unlimited)
 */
function getRemainingAllowance(planId, resource, used) {
  const limits = getPlanLimits(planId);
  const limit = limits[resource];
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - used);
}

/**
 * Get usage percentage for a resource
 * @param {string} planId - Plan ID
 * @param {string} resource - Resource key
 * @param {number} used - Current usage
 * @returns {number} Percentage (0-100)
 */
function getUsagePercentage(planId, resource, used) {
  const limits = getPlanLimits(planId);
  const limit = limits[resource];
  if (limit === Infinity || limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Plan data
  PLANS,
  FEATURES,
  
  // Plan helpers
  getPlan,
  getPlanLimits,
  getPlanFeatures,
  hasFeature,
  getPlanPrice,
  getPlanPriceNGN,
  getAllPlans,
  getAllPlanIds,
  isValidPlan,
  getNextPlanTier,
  getPreviousPlanTier,
  
  // Usage helpers
  isLimitReached,
  getRemainingAllowance,
  getUsagePercentage,
};