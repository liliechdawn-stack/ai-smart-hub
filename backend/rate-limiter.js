// ================================================
// SIMPLE RATE LIMITER - No Redis Required
// ================================================

const { supabase } = require('./database-supabase');

const rateLimitStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > 60000) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

async function checkRateLimit(userId, workflowId = null) {
  const key = workflowId ? `${userId}:${workflowId}` : `${userId}:global`;
  const now = Date.now();
  
  const { data: user } = await supabase
    .from('users')
    .select('plan')
    .eq('id', userId)
    .single();
  
  const limits = {
    free: { executions: 5, window: 60000 },
    basic: { executions: 30, window: 60000 },
    pro: { executions: 100, window: 60000 },
    agency: { executions: 500, window: 60000 },
    enterprise: { executions: 1000, window: 60000 },
  };
  
  const plan = user?.plan || 'free';
  const limit = limits[plan] || limits.free;
  
  let record = rateLimitStore.get(key);
  
  if (!record) {
    record = { count: 1, resetTime: now + limit.window };
    rateLimitStore.set(key, record);
    return { allowed: true, remaining: limit.executions - 1 };
  }
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + limit.window;
    return { allowed: true, remaining: limit.executions - 1 };
  }
  
  if (record.count >= limit.executions) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: limit.executions - record.count };
}

function rateLimitMiddleware(req, res, next) {
  const userId = req.user?.id;
  if (!userId) return next();
  
  checkRateLimit(userId, req.params.id).then((result) => {
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    if (!result.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    next();
  }).catch(() => next());
}

module.exports = { rateLimitMiddleware, checkRateLimit };