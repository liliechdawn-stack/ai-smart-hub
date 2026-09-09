// ============================================================
// backend/routes/widget-chat-routes.js - Widget Chat Routes
// ============================================================
// PRODUCTION HARDENED
// - Proper error classification (no string matching)
// - Input validation at route level
// - No internal errors leaked to clients
// - Tenant isolation preserved
// - Rate limiting integration (relies on server.js)
// - Body parsing aligned with server.js (no duplicate parser)
// - Request ID integration
// - Safe logging
// ============================================================

const express = require("express");
const router = express.Router();

const { auth, checkVerified } = require("../auth");
const { processDashboardChat, processWidgetChat } = require("../services/chat-service");

// ============================================================
// CONSTANTS
// ============================================================

const MAX_MESSAGE_LENGTH = 10000;
const MAX_CLIENT_NAME_LENGTH = 100;
const MAX_SESSION_ID_LENGTH = 100;
const MAX_WIDGET_KEY_LENGTH = 100;

// ============================================================
// ERROR CLASSIFICATION
// ============================================================

/**
 * Structured error codes from chat-service.js
 * These should match what the service layer throws
 */
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_WIDGET_KEY: 'INVALID_WIDGET_KEY',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SESSION_OWNERSHIP_ERROR: 'SESSION_OWNERSHIP_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
};

/**
 * Classify errors for consistent HTTP status and safe messages
 * Prevents fragile string matching and internal error leakage
 */
function classifyError(err) {
  // Structured error codes (preferred)
  switch (err.code) {
    case ERROR_CODES.VALIDATION_ERROR:
      return { status: 400, message: 'Invalid request data' };
    
    case ERROR_CODES.INVALID_WIDGET_KEY:
      return { status: 400, message: 'Invalid widget key' };
    
    case ERROR_CODES.QUOTA_EXCEEDED:
      return { status: 403, message: 'Message limit reached for your plan' };
    
    case ERROR_CODES.USER_NOT_FOUND:
      return { status: 404, message: 'User not found' };
    
    case ERROR_CODES.SESSION_OWNERSHIP_ERROR:
      return { status: 403, message: 'Session access denied' };
    
    case ERROR_CODES.RATE_LIMIT_EXCEEDED:
      return { status: 429, message: 'Too many requests. Please try again later.' };
    
    case ERROR_CODES.AI_TIMEOUT:
      return { status: 504, message: 'AI service timed out. Please try again.' };
    
    case ERROR_CODES.AI_PROVIDER_ERROR:
      return { status: 503, message: 'AI service temporarily unavailable. Please try again.' };
  }

  // Fallback for error names (when code is not set)
  if (err.name === 'ValidationError' || err.name === 'SchemaValidationError') {
    return { status: 400, message: 'Invalid request data' };
  }

  // Fallback for string matching (only as last resort)
  const message = err.message || '';
  if (message.includes('widget key') || message.includes('Widget Key')) {
    return { status: 400, message: 'Invalid widget key' };
  }
  if (message.includes('limit reached') || message.includes('quota')) {
    return { status: 403, message: 'Message limit reached for your plan' };
  }
  if (message.includes('rate limit')) {
    return { status: 429, message: 'Too many requests. Please try again later.' };
  }
  if (message.includes('timeout')) {
    return { status: 504, message: 'Service timed out. Please try again.' };
  }

  // Default: Internal server error - safe message, no internals
  return { status: 500, message: 'An unexpected error occurred' };
}

// ============================================================
// INPUT VALIDATION HELPERS
// ============================================================

function validateMessage(message) {
  if (!message) return null;
  if (typeof message !== 'string') {
    throw Object.assign(new Error('Message must be a string'), { code: ERROR_CODES.VALIDATION_ERROR });
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    throw Object.assign(new Error('Message cannot be empty'), { code: ERROR_CODES.VALIDATION_ERROR });
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw Object.assign(
      new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}`),
      { code: ERROR_CODES.VALIDATION_ERROR }
    );
  }
  return trimmed;
}

function validateClientName(name) {
  if (!name) return null;
  if (typeof name !== 'string') {
    throw Object.assign(new Error('Client name must be a string'), { code: ERROR_CODES.VALIDATION_ERROR });
  }
  return name.trim().substring(0, MAX_CLIENT_NAME_LENGTH);
}

function validateSessionId(sessionId) {
  if (!sessionId) return null;
  if (typeof sessionId !== 'string') {
    throw Object.assign(new Error('Session ID must be a string'), { code: ERROR_CODES.VALIDATION_ERROR });
  }
  if (sessionId.length > MAX_SESSION_ID_LENGTH) {
    throw Object.assign(
      new Error(`Session ID exceeds maximum length of ${MAX_SESSION_ID_LENGTH}`),
      { code: ERROR_CODES.VALIDATION_ERROR }
    );
  }
  // Allow alphanumeric, underscore, hyphen, colon
  if (!/^[a-zA-Z0-9_\-:]+$/.test(sessionId)) {
    throw Object.assign(new Error('Invalid session ID format'), { code: ERROR_CODES.VALIDATION_ERROR });
  }
  return sessionId.trim();
}

function validateWidgetKey(widgetKey) {
  if (!widgetKey) return null;
  if (typeof widgetKey !== 'string') {
    throw Object.assign(new Error('Widget key must be a string'), { code: ERROR_CODES.VALIDATION_ERROR });
  }
  if (widgetKey.length > MAX_WIDGET_KEY_LENGTH) {
    throw Object.assign(
      new Error(`Widget key exceeds maximum length of ${MAX_WIDGET_KEY_LENGTH}`),
      { code: ERROR_CODES.VALIDATION_ERROR }
    );
  }
  // Allow alphanumeric, underscore, hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(widgetKey)) {
    throw Object.assign(new Error('Invalid widget key format'), { code: ERROR_CODES.VALIDATION_ERROR });
  }
  return widgetKey.trim();
}

// ============================================================
// DASHBOARD AI CHAT
// ============================================================

router.post("/widget/chat", auth, checkVerified, async (req, res) => {
  const { message, client_name, session_id } = req.body;

  try {
    // Validate inputs at route level
    const validatedMessage = validateMessage(message);
    const validatedClientName = validateClientName(client_name);
    const validatedSessionId = validateSessionId(session_id);

    // req.user.id comes from auth middleware - NEVER from client
    const result = await processDashboardChat(
      req.user.id,
      validatedMessage,
      validatedClientName,
      validatedSessionId
    );

    // Preserve existing response shape
    res.json(result);
  } catch (err) {
    // Log internally with request context - safe logging only
    console.error(`❌ Dashboard Chat Error [User: ${req.user?.id || 'unknown'}]:`, {
      message: err.message,
      code: err.code,
      path: req.path,
      requestId: req.id,
    });

    // Classify error and return safe response
    const { status, message } = classifyError(err);
    const response = { error: message };
    
    // Include request ID only if available and helpful
    if (req.id) {
      response.requestId = req.id;
    }
    
    res.status(status).json(response);
  }
});

// ============================================================
// PUBLIC WIDGET CHAT
// ============================================================

router.post("/public/chat", async (req, res) => {
  // Validate request body exists
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    // Lightweight validation at route level
    // widget_key is validated by the service, but we check presence here
    const widgetKey = req.body.widget_key;
    if (!widgetKey) {
      return res.status(400).json({ error: 'Widget key is required' });
    }
    
    // Basic format validation before passing to service
    if (typeof widgetKey !== 'string' || widgetKey.length > MAX_WIDGET_KEY_LENGTH) {
      return res.status(400).json({ error: 'Invalid widget key format' });
    }

    // Optional message validation - service will validate further
    if (req.body.message && typeof req.body.message === 'string') {
      const trimmed = req.body.message.trim();
      if (trimmed.length === 0) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }
      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` });
      }
    }

    // Pass raw request body to service - service resolves tenant from widget_key
    // Client can NEVER override tenant identity via user_id, workspace_id, etc.
    const result = await processWidgetChat(req.body);

    // Preserve existing response shape
    res.json(result);
  } catch (err) {
    // Log internally with safe context - NEVER log full widget keys
    const widgetKey = req.body?.widget_key || 'unknown';
    const truncatedKey = widgetKey !== 'unknown' && typeof widgetKey === 'string' 
      ? widgetKey.substring(0, 8) + '...' 
      : 'unknown';
    
    console.error(`❌ Public Chat Error [Widget: ${truncatedKey}]:`, {
      message: err.message,
      code: err.code,
      path: req.path,
      requestId: req.id,
    });

    // Classify error and return safe response
    const { status, message } = classifyError(err);
    const response = { error: message };
    
    // Include request ID only if available and helpful
    if (req.id) {
      response.requestId = req.id;
    }
    
    res.status(status).json(response);
  }
});

module.exports = router;