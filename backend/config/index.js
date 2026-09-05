// ============================================================
// backend/config/index.js - Centralized Configuration
// ============================================================

require("dotenv").config();

// ============================================================
// VALIDATION
// ============================================================

function validateConfig() {
  const required = ["JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  // JWT_SECRET must not use fallback in production
  if (process.env.JWT_SECRET === "super_secret_key" && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a secure value in production");
  }

  // Paystack secret must exist if billing is enabled
  if (process.env.ENABLE_BILLING !== "false" && !process.env.PAYSTACK_SECRET_KEY) {
    console.warn("⚠️ PAYSTACK_SECRET_KEY not set. Billing will not work.");
  }
}

// Only validate in production or when explicitly enabled
if (process.env.NODE_ENV === "production" || process.env.VALIDATE_CONFIG === "true") {
  validateConfig();
}

// ============================================================
// PLAN DEFINITIONS - SINGLE SOURCE OF TRUTH
// ============================================================

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
// FEATURE FLAGS MAPPING
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
// PLAN HELPER FUNCTIONS
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
// MODULE EXPORTS
// ============================================================

module.exports = {
  // ==========================================================
  // SERVER CONFIGURATION
  // ==========================================================
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // ==========================================================
  // SECURITY
  // ==========================================================
  JWT_SECRET: process.env.JWT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "ericchung992@gmail.com",
  ADMIN_USER_ID: process.env.ADMIN_USER_ID,

  // ==========================================================
  // CORS
  // ==========================================================
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : true,

  // ==========================================================
  // SOCKET.IO
  // ==========================================================
  SOCKET_CORS: {
    origin: process.env.SOCKET_CORS_ORIGIN
      ? process.env.SOCKET_CORS_ORIGIN.split(",")
      : "*",
  },

  // ==========================================================
  // DATABASE
  // ==========================================================
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // ==========================================================
  // CLOUDFLARE AI
  // ==========================================================
  CLOUDFLARE_AI_API_TOKEN: process.env.CLOUDFLARE_AI_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,

  // ==========================================================
  // EMAIL
  // ==========================================================
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || "AI Smart Hub <noreply@aismarthub.website>",

  // ==========================================================
  // PAYMENT / BILLING
  // ==========================================================
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  USD_TO_NGN_RATE: parseInt(process.env.USD_TO_NGN_RATE) || 1500,
  ENABLE_BILLING: process.env.ENABLE_BILLING !== "false",

  // ==========================================================
  // PLAN DEFINITIONS - SINGLE SOURCE OF TRUTH
  // ==========================================================
  PLANS,
  FEATURES,

  // Plan Helper Functions
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
  isLimitReached,
  getRemainingAllowance,
  getUsagePercentage,

  // ==========================================================
  // LEGACY PRICING (DEPRECATED - use PLANS instead)
  // ==========================================================
  PRICES_USD: {
    basic: 7,
    pro: 100,
    agency: 160,
    enterprise: 499,
  },
  PRICES_USD_ANNUAL: {
    basic: 70,
    pro: 1000,
    agency: 1600,
    enterprise: 4990,
  },

  // ==========================================================
  // LIMITS
  // ==========================================================
  MAX_JSON_SIZE: process.env.MAX_JSON_SIZE || "50mb",
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,

  // ==========================================================
  // RATE LIMITING
  // ==========================================================
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 60 * 1000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  CHAT_RATE_LIMIT_MAX: parseInt(process.env.CHAT_RATE_LIMIT_MAX) || 30,

  // ==========================================================
  // REDIS (optional)
  // ==========================================================
  REDIS_URL: process.env.REDIS_URL,

  // ==========================================================
  // FEATURE FLAGS
  // ==========================================================
  AI_POWERHOUSE_ENABLED: !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_API_TOKEN),
  WORKFLOW_ENGINE_ENABLED: process.env.WORKFLOW_ENGINE_ENABLED !== "false",
  ANALYTICS_ENABLED: process.env.ANALYTICS_ENABLED !== "false",

  // ==========================================================
  // SESSION
  // ==========================================================
  SESSION_EXPIRY: process.env.SESSION_EXPIRY || "7d",
  VERIFICATION_CODE_EXPIRY: parseInt(process.env.VERIFICATION_CODE_EXPIRY) || 24 * 60 * 60 * 1000,

  // ==========================================================
  // FILE UPLOADS
  // ==========================================================
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES
    ? process.env.ALLOWED_FILE_TYPES.split(",")
    : ["pdf", "docx", "doc", "txt", "csv", "jpg", "jpeg", "png", "gif"],

  // ==========================================================
  // WEBHOOK
  // ==========================================================
  WEBHOOK_TIMEOUT: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000,
};