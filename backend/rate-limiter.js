// ================================================
// RATE LIMITER - No Redis Required
// ================================================

const { supabase } = require('./database-supabase');
const { getPlanLimits, isValidPlan } = require('./config');

const rateLimitStore = new Map();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > 60000) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

/**
 * Check rate limit for a user
 * @param {string} userId - User ID
 * @param {string} workflowId - Optional workflow ID for per-workflow limits
 * @param {string} limitType - Type of limit to check ('executions' | 'api_calls' | 'ai_requests')
 * @returns {Promise<Object>} Result with allowed status and remaining count
 */
async function checkRateLimit(userId, workflowId = null, limitType = 'executions') {
  const key = workflowId ? `${userId}:${workflowId}` : `${userId}:global`;
  const now = Date.now();

  try {
    // Get user plan from database
    const { data: user, error } = await supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Rate limit: Error fetching user plan:', error);
      // Fallback to free plan
      const limits = getPlanLimits('free');
      return checkLimitForKey(key, now, limits, limitType);
    }

    // Get plan limits from centralized config
    const planId = user?.plan || 'free';
    const validPlan = isValidPlan(planId) ? planId : 'free';
    const limits = getPlanLimits(validPlan);

    // Determine which limit to use
    const limitValue = limits[limitType] || limits.executions || 100;
    const windowMs = 60000; // 1 minute window

    return checkLimitForKey(key, now, { executions: limitValue, window: windowMs }, limitType);
  } catch (err) {
    console.error('Rate limit error:', err);
    // Allow on error (fail open)
    return { allowed: true, remaining: 999, error: err.message };
  }
}

/**
 * Internal function to check limit for a specific key
 */
function checkLimitForKey(key, now, limits, limitType = 'executions') {
  const limit = limits.executions || 100;
  const windowMs = limits.window || 60000;

  let record = rateLimitStore.get(key);

  if (!record) {
    record = { 
      count: 1, 
      resetTime: now + windowMs,
      limitType: limitType,
    };
    rateLimitStore.set(key, record);
    return { 
      allowed: true, 
      remaining: Math.max(0, limit - 1),
      resetTime: record.resetTime,
    };
  }

  // Reset if window expired
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return { 
      allowed: true, 
      remaining: Math.max(0, limit - 1),
      resetTime: record.resetTime,
    };
  }

  // Check if limit exceeded
  if (record.count >= limit) {
    return { 
      allowed: false, 
      remaining: 0,
      resetTime: record.resetTime,
      limit: limit,
      used: record.count,
    };
  }

  // Increment counter
  record.count++;
  return { 
    allowed: true, 
    remaining: Math.max(0, limit - record.count),
    resetTime: record.resetTime,
  };
}

/**
 * Get current rate limit status for a user
 * @param {string} userId - User ID
 * @param {string} workflowId - Optional workflow ID
 * @returns {Promise<Object>} Rate limit status
 */
async function getRateLimitStatus(userId, workflowId = null) {
  const key = workflowId ? `${userId}:${workflowId}` : `${userId}:global`;
  const record = rateLimitStore.get(key);
  
  if (!record) {
    return {
      current: 0,
      remaining: 100,
      resetTime: null,
      isLimited: false,
    };
  }

  const now = Date.now();
  const isExpired = now > record.resetTime;
  const { data: user } = await supabase
    .from('users')
    .select('plan')
    .eq('id', userId)
    .single();

  const planId = user?.plan || 'free';
  const validPlan = isValidPlan(planId) ? planId : 'free';
  const limits = getPlanLimits(validPlan);
  const maxLimit = limits.executions || 100;

  if (isExpired) {
    return {
      current: 0,
      remaining: maxLimit,
      resetTime: null,
      isLimited: false,
    };
  }

  return {
    current: record.count || 0,
    remaining: Math.max(0, maxLimit - (record.count || 0)),
    resetTime: record.resetTime,
    isLimited: (record.count || 0) >= maxLimit,
    maxLimit: maxLimit,
  };
}

/**
 * Reset rate limit for a user (admin use)
 * @param {string} userId - User ID
 * @param {string} workflowId - Optional workflow ID
 */
function resetRateLimit(userId, workflowId = null) {
  const key = workflowId ? `${userId}:${workflowId}` : `${userId}:global`;
  rateLimitStore.delete(key);
  return { success: true, message: 'Rate limit reset' };
}

/**
 * Express middleware for rate limiting
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function rateLimitMiddleware(req, res, next) {
  const userId = req.user?.id;
  
  if (!userId) {
    // Skip rate limiting for unauthenticated requests
    // (Public endpoints should use a different limiter)
    return next();
  }

  const workflowId = req.params.id || null;
  const limitType = req.query.limitType || 'executions';

  checkRateLimit(userId, workflowId, limitType)
    .then((result) => {
      // Set rate limit headers
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetTime || '');
      
      if (!result.allowed) {
        const resetDate = result.resetTime ? new Date(result.resetTime) : new Date(Date.now() + 60000);
        res.setHeader('Retry-After', Math.ceil((resetDate - Date.now()) / 1000));
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          remaining: 0,
          resetAt: resetDate.toISOString(),
          limit: result.limit,
          used: result.used,
        });
      }
      next();
    })
    .catch((err) => {
      console.error('Rate limit middleware error:', err);
      // Fail open: allow request if rate limit check fails
      next();
    });
}

/**
 * Express middleware for stricter rate limiting on auth endpoints
 */
function authRateLimitMiddleware(req, res, next) {
  const userId = req.user?.id || req.ip || 'anonymous';
  const key = `auth:${userId}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 10; // 10 attempts per 15 minutes

  let record = rateLimitStore.get(key);

  if (!record) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitStore.set(key, record);
    res.setHeader('X-RateLimit-Remaining', maxAttempts - 1);
    return next();
  }

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    res.setHeader('X-RateLimit-Remaining', maxAttempts - 1);
    return next();
  }

  if (record.count >= maxAttempts) {
    return res.status(429).json({
      error: 'Too many authentication attempts. Please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
  }

  record.count++;
  res.setHeader('X-RateLimit-Remaining', maxAttempts - record.count);
  next();
}

/**
 * Express middleware for stricter rate limiting on public chat endpoints
 */
function chatRateLimitMiddleware(req, res, next) {
  const key = req.body?.widget_key || req.ip || 'anonymous';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxMessages = 30; // 30 messages per minute

  let record = rateLimitStore.get(`chat:${key}`);

  if (!record) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitStore.set(`chat:${key}`, record);
    res.setHeader('X-Chat-RateLimit-Remaining', maxMessages - 1);
    return next();
  }

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    res.setHeader('X-Chat-RateLimit-Remaining', maxMessages - 1);
    return next();
  }

  if (record.count >= maxMessages) {
    return res.status(429).json({
      error: 'Too many messages. Please slow down.',
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
  }

  record.count++;
  res.setHeader('X-Chat-RateLimit-Remaining', maxMessages - record.count);
  next();
}

module.exports = {
  rateLimitMiddleware,
  authRateLimitMiddleware,
  chatRateLimitMiddleware,
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
};