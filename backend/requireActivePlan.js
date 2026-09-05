// ============================================================
// backend/requireActivePlan.js - Plan Enforcement Middleware
// ============================================================
// 
// This middleware enforces plan-based access control for routes.
// It integrates with the centralized plan system in config/index.js
// and works with the existing auth system.
// 
// USAGE:
//   const { requireActivePlan, requireFeature } = require("./requireActivePlan");
//   
//   // Require any active plan (not expired)
//   router.get("/protected", auth, requireActivePlan, handler);
//   
//   // Require a specific feature
//   router.post("/ai-chat", auth, requireActivePlan, requireFeature("advanced_chat"), handler);
//   
//   // Require a minimum plan tier
//   router.post("/enterprise", auth, requireActivePlan, requireMinTier(3), handler);
// ============================================================

const { supabase, getUserById, getUsageStats } = require("./database-supabase.js");
const {
  getPlan,
  getPlanLimits,
  isValidPlan,
  hasFeature,
  getPlanPrice,
  getAllPlans,
  isLimitReached,
  getRemainingAllowance,
  getUsagePercentage,
} = require("./config");

// ============================================================
// PLAN STATUS TYPES
// ============================================================

const PLAN_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  OVER_LIMIT: "over_limit",
  NOT_FOUND: "not_found",
  INVALID: "invalid",
  FREE_TIER: "free_tier",
  PAID_TIER: "paid_tier",
};

// ============================================================
// CORE MIDDLEWARE
// ============================================================

/**
 * Main middleware: Require an active plan.
 * Checks if user has a valid, non-expired plan.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function requireActivePlan(req, res, next) {
  try {
    // Ensure user is authenticated first
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(401).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Get plan information
    const planId = user.plan || "free";
    const plan = getPlan(planId);

    // Check if plan is valid
    if (!plan) {
      return res.status(403).json({
        error: "Invalid plan configuration",
        code: "INVALID_PLAN",
      });
    }

    // Check if plan has expired
    if (user.plan_expires && new Date(user.plan_expires) < new Date()) {
      return res.status(403).json({
        error: "Your plan has expired. Please renew to continue.",
        code: "PLAN_EXPIRED",
        expired_at: user.plan_expires,
        current_plan: planId,
      });
    }

    // Check if user is over any critical limits
    const usageCheck = await checkUsageLimits(user, plan);
    if (usageCheck.exceeded) {
      return res.status(403).json({
        error: usageCheck.message,
        code: "LIMIT_EXCEEDED",
        limit: usageCheck.limit,
        used: usageCheck.used,
        resource: usageCheck.resource,
        plan: planId,
      });
    }

    // Attach plan info to request for downstream use
    req.plan = plan;
    req.planId = planId;
    req.planLimits = getPlanLimits(planId);
    req.planStatus = PLAN_STATUS.ACTIVE;

    // Check if it's a free or paid plan
    req.isFreePlan = plan.price_usd === 0;
    req.isPaidPlan = plan.price_usd > 0;

    next();
  } catch (error) {
    console.error("Plan check error:", error);
    res.status(500).json({
      error: "Failed to verify plan status",
      code: "PLAN_CHECK_ERROR",
    });
  }
}

/**
 * Middleware: Require a specific feature.
 * @param {string} featureKey - Feature key (e.g., "advanced_chat", "automations")
 * @returns {Function} Express middleware
 */
function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      // Ensure plan is already checked
      if (!req.plan) {
        // If plan not attached, run the full check
        return requireActivePlan(req, res, () => {
          checkFeature(req, res, next, featureKey);
        });
      }

      checkFeature(req, res, next, featureKey);
    } catch (error) {
      console.error("Feature check error:", error);
      res.status(500).json({
        error: "Failed to verify feature access",
        code: "FEATURE_CHECK_ERROR",
      });
    }
  };
}

/**
 * Helper: Check feature access
 */
function checkFeature(req, res, next, featureKey) {
  const planId = req.planId || req.user?.plan || "free";
  const hasFeatureAccess = hasFeature(planId, featureKey);

  if (!hasFeatureAccess) {
    const plan = getPlan(planId);
    return res.status(403).json({
      error: `Feature "${featureKey}" is not available on your current plan.`,
      code: "FEATURE_NOT_AVAILABLE",
      feature: featureKey,
      current_plan: planId,
      plan_name: plan?.name || "Unknown",
    });
  }

  req.hasFeature = true;
  req.featureKey = featureKey;
  next();
}

/**
 * Middleware: Require a minimum plan tier.
 * @param {number} minTier - Minimum tier (0 = free, 1 = basic, 2 = pro, 3 = agency, 4 = enterprise)
 * @returns {Function} Express middleware
 */
function requireMinTier(minTier) {
  return async (req, res, next) => {
    try {
      if (!req.plan) {
        return requireActivePlan(req, res, () => {
          checkTier(req, res, next, minTier);
        });
      }

      checkTier(req, res, next, minTier);
    } catch (error) {
      console.error("Tier check error:", error);
      res.status(500).json({
        error: "Failed to verify tier access",
        code: "TIER_CHECK_ERROR",
      });
    }
  };
}

/**
 * Helper: Check tier access
 */
function checkTier(req, res, next, minTier) {
  const planId = req.planId || req.user?.plan || "free";
  const plan = getPlan(planId);

  if (!plan) {
    return res.status(403).json({
      error: "Invalid plan",
      code: "INVALID_PLAN",
    });
  }

  if (plan.tier < minTier) {
    const allPlans = getAllPlans();
    const requiredPlan = allPlans.find(p => p.tier === minTier);

    return res.status(403).json({
      error: `This feature requires the "${requiredPlan?.name || 'higher'}" plan or above.`,
      code: "INSUFFICIENT_TIER",
      current_plan: planId,
      required_tier: minTier,
      current_tier: plan.tier,
      required_plan: requiredPlan?.id || null,
    });
  }

  req.meetsTier = true;
  req.minTier = minTier;
  next();
}

/**
 * Middleware: Check if user is within a specific usage limit.
 * @param {string} resource - Resource key (e.g., "messages", "leads", "automations")
 * @param {number} threshold - Optional threshold percentage (default: 90%)
 * @param {boolean} blockOnExceed - If true, block request when over threshold
 * @returns {Function} Express middleware
 */
function requireWithinLimit(resource, threshold = 90, blockOnExceed = true) {
  return async (req, res, next) => {
    try {
      if (!req.plan) {
        return requireActivePlan(req, res, () => {
          checkLimit(req, res, next, resource, threshold, blockOnExceed);
        });
      }

      checkLimit(req, res, next, resource, threshold, blockOnExceed);
    } catch (error) {
      console.error("Limit check error:", error);
      res.status(500).json({
        error: "Failed to verify usage limits",
        code: "LIMIT_CHECK_ERROR",
      });
    }
  };
}

/**
 * Helper: Check usage limits
 */
async function checkLimit(req, res, next, resource, threshold, blockOnExceed) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  const planId = req.planId || req.user?.plan || "free";
  const user = await getUserById(userId);

  if (!user) {
    return res.status(401).json({
      error: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  // Determine current usage
  const usage = await getUsageForResource(userId, resource);
  const limits = getPlanLimits(planId);
  const limit = limits[resource];

  if (limit === Infinity) {
    // Unlimited resource
    req.usageData = {
      resource,
      used: usage,
      limit: Infinity,
      percentage: 0,
      remaining: Infinity,
    };
    return next();
  }

  const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;

  if (blockOnExceed && percentage >= threshold) {
    return res.status(429).json({
      error: `You have used ${percentage}% of your ${resource} limit (${usage}/${limit}).`,
      code: "LIMIT_THRESHOLD_EXCEEDED",
      resource,
      used: usage,
      limit,
      percentage,
      threshold,
      plan: planId,
    });
  }

  // Attach usage info for downstream
  req.usageData = {
    resource,
    used: usage,
    limit,
    percentage,
    remaining: Math.max(0, limit - usage),
    isNearLimit: percentage >= threshold,
    isOverLimit: usage >= limit,
  };

  next();
}

// ============================================================
// USAGE TRACKING HELPERS
// ============================================================

/**
 * Get usage for a specific resource
 * @param {string} userId - User ID
 * @param {string} resource - Resource key
 * @returns {Promise<number>} Current usage count
 */
async function getUsageForResource(userId, resource) {
  const user = await getUserById(userId);
  if (!user) return 0;

  // Map resource to database fields
  const resourceMap = {
    messages: user.messages_used || 0,
    leads: user.leads_used || 0,
    automations: user.automations_used || 0,
    workflows: user.workflows_used || 0,
    team_members: user.team_members_used || 0,
    workspaces: user.workspaces_used || 0,
    ai_requests: user.ai_requests_used || 0,
    file_uploads: user.file_uploads_used || 0,
    storage_mb: user.storage_used_mb || 0,
    api_calls: user.api_calls_used || 0,
  };

  // If not in map, try to query from usage_stats table
  if (!(resource in resourceMap)) {
    try {
      const { data } = await supabase
        .from("usage_stats")
        .select("usage_count")
        .eq("user_id", userId)
        .eq("resource_type", resource)
        .single();
      return data?.usage_count || 0;
    } catch (error) {
      console.warn(`Could not get usage for resource: ${resource}`, error);
      return 0;
    }
  }

  return resourceMap[resource];
}

/**
 * Check if user is over their plan limits
 * @param {Object} user - User object
 * @param {Object} plan - Plan object
 * @returns {Promise<Object>} Result with exceeded status
 */
async function checkUsageLimits(user, plan) {
  const limits = getPlanLimits(plan.id);
  const resources = Object.keys(limits);

  for (const resource of resources) {
    const limit = limits[resource];
    if (limit === Infinity) continue;

    const used = await getUsageForResource(user.id, resource);
    if (used >= limit) {
      return {
        exceeded: true,
        resource,
        used,
        limit,
        message: `You have exceeded your ${resource} limit (${used}/${limit}). Upgrade your plan to continue.`,
      };
    }
  }

  return { exceeded: false };
}

/**
 * Get comprehensive plan status for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Plan status object
 */
async function getPlanStatus(userId) {
  const user = await getUserById(userId);
  if (!user) {
    return {
      status: PLAN_STATUS.NOT_FOUND,
      error: "User not found",
    };
  }

  const planId = user.plan || "free";
  const plan = getPlan(planId);

  if (!plan) {
    return {
      status: PLAN_STATUS.INVALID,
      error: "Invalid plan",
      plan: planId,
    };
  }

  // Check expiration
  const isExpired = user.plan_expires && new Date(user.plan_expires) < new Date();

  // Check usage limits
  const usageCheck = await checkUsageLimits(user, plan);

  // Determine status
  let status = PLAN_STATUS.ACTIVE;
  if (isExpired) {
    status = PLAN_STATUS.EXPIRED;
  } else if (usageCheck.exceeded) {
    status = PLAN_STATUS.OVER_LIMIT;
  } else if (plan.price_usd === 0) {
    status = PLAN_STATUS.FREE_TIER;
  } else {
    status = PLAN_STATUS.PAID_TIER;
  }

  const limits = getPlanLimits(planId);
  const resourceUsage = {};

  // Get usage for all resources
  const resources = Object.keys(limits);
  for (const resource of resources) {
    const used = await getUsageForResource(userId, resource);
    const limit = limits[resource];
    resourceUsage[resource] = {
      used,
      limit,
      remaining: limit === Infinity ? Infinity : Math.max(0, limit - used),
      percentage: limit === Infinity ? 0 : limit > 0 ? Math.round((used / limit) * 100) : 0,
    };
  }

  return {
    status,
    plan: plan,
    planId,
    isExpired,
    isFreePlan: plan.price_usd === 0,
    isPaidPlan: plan.price_usd > 0,
    expiresAt: user.plan_expires,
    usage: resourceUsage,
    hasExceeded: usageCheck.exceeded,
    exceededResource: usageCheck.resource,
    features: plan.features,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Core middleware
  requireActivePlan,
  requireFeature,
  requireMinTier,
  requireWithinLimit,

  // Helpers
  getUsageForResource,
  checkUsageLimits,
  getPlanStatus,

  // Constants
  PLAN_STATUS,
};