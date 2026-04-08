cat > backend/rate-limiter.js << 'EOF'
const { supabase } = require('./database-supabase');

// In-memory rate limiting (use Redis for production)
const rateLimitStore = new Map();

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > 3600000) {
      rateLimitStore.delete(key);
    }
  }
}, 3600000);

function getRateLimitKey(userId, workflowId = null) {
  return workflowId ? `${userId}:workflow:${workflowId}` : `${userId}:global`;
}

async function checkRateLimit(userId, workflowId = null, endpoint = 'workflow_execution') {
  const key = getRateLimitKey(userId, workflowId);
  const now = Date.now();
  
  // Get user's plan from database
  const { data: user } = await supabase
    .from('users')
    .select('plan')
    .eq('id', userId)
    .single();
  
  // Rate limits per plan (executions per minute)
  const limits = {
    free: { executions: 5, window: 60000 },      // 5 per minute
    basic: { executions: 30, window: 60000 },    // 30 per minute
    pro: { executions: 100, window: 60000 },     // 100 per minute
    agency: { executions: 500, window: 60000 },  // 500 per minute
    enterprise: { executions: 1000, window: 60000 }, // 1000 per minute
  };
  
  const plan = user?.plan || 'free';
  const limit = limits[plan] || limits.free;
  
  let record = rateLimitStore.get(key);
  
  if (!record) {
    record = {
      count: 1,
      resetTime: now + limit.window,
      windowStart: now,
    };
    rateLimitStore.set(key, record);
    return { allowed: true, remaining: limit.executions - 1, resetTime: record.resetTime };
  }
  
  if (now > record.resetTime) {
    // Reset window
    record.count = 1;
    record.resetTime = now + limit.window;
    record.windowStart = now;
    rateLimitStore.set(key, record);
    return { allowed: true, remaining: limit.executions - 1, resetTime: record.resetTime };
  }
  
  if (record.count >= limit.executions) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetTime: record.resetTime,
      limit: limit.executions,
      plan: plan,
    };
  }
  
  record.count++;
  rateLimitStore.set(key, record);
  return { 
    allowed: true, 
    remaining: limit.executions - record.count, 
    resetTime: record.resetTime,
    limit: limit.executions,
    plan: plan,
  };
}

// Express middleware for rate limiting
function rateLimitMiddleware(req, res, next) {
  const userId = req.user?.id;
  const workflowId = req.params.id;
  const endpoint = req.baseUrl;
  
  if (!userId) {
    return next();
  }
  
  checkRateLimit(userId, workflowId, endpoint).then((result) => {
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit || 100);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    
    if (!result.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `You have exceeded your ${result.plan} plan limit of ${result.limit} executions per minute`,
        resetAt: new Date(result.resetTime).toISOString(),
        plan: result.plan,
      });
    }
    
    next();
  }).catch((error) => {
    console.error('Rate limit error:', error);
    next();
  });
}

module.exports = { rateLimitMiddleware, checkRateLimit };
EOF