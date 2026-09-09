// ============================================================
// backend/routes/widget-routes.js - Widget Routes
// ============================================================
// PRODUCTION HARDENED
// - Public config returns ONLY safe fields (no apollo_key)
// - Explicit field allowlist (no SELECT *)
// - No smart_hub: settings exposure
// - Input validation for widget keys
// - Safe error handling (no internal leaks)
// - Tenant isolation preserved
// - Rate limiting via server.js
// ============================================================

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const { supabase, getUserById, setWidgetKey, getBusinessIdentity } = require("../database-supabase.js");
const { auth } = require("../auth");

// ============================================================
// CONSTANTS
// ============================================================

const MAX_WIDGET_KEY_LENGTH = 100;
const MAX_BUSINESS_NAME_LENGTH = 100;
const MAX_WELCOME_MESSAGE_LENGTH = 500;
const MAX_BUSINESS_DESCRIPTION_LENGTH = 500;
const MAX_AI_INSTRUCTIONS_LENGTH = 5000;

// ============================================================
// PUBLIC WIDGET CONFIG - SAFE FIELDS ALLOWLIST
// ============================================================

/**
 * SAFE PUBLIC FIELDS - Only these are exposed to anonymous visitors
 * NEVER add api_key, secrets, credentials, or private settings here
 */
const PUBLIC_CONFIG_FIELDS = [
  // User fields
  'business_name',
  'widget_color',
  'welcome_message',
  // Public widget fields
  'booking_url',
  'booking_active',
  'vision_active',
  'sentiment_active',
  'followup_active',
  'apollo_active', // Only active status, NOT the key
  // Business identity
  'business_type',
  'business_description',
  // AI settings (public-safe)
  'ai_instructions', // Required for widget AI behavior
  'ai_temp',
];

// ============================================================
// VALIDATION HELPERS
// ============================================================

function validateWidgetKey(key) {
  if (!key || typeof key !== 'string') {
    throw Object.assign(new Error('Widget key is required'), { code: 'INVALID_WIDGET_KEY' });
  }
  if (key.length > MAX_WIDGET_KEY_LENGTH) {
    throw Object.assign(
      new Error(`Widget key exceeds maximum length of ${MAX_WIDGET_KEY_LENGTH}`),
      { code: 'INVALID_WIDGET_KEY' }
    );
  }
  // Allow alphanumeric, underscore, hyphen (UUID format)
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    throw Object.assign(new Error('Invalid widget key format'), { code: 'INVALID_WIDGET_KEY' });
  }
  return key.trim();
}

function sanitizeString(value, maxLength) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().substring(0, maxLength);
}

// ============================================================
// GET PUBLIC WIDGET CONFIG
// ============================================================

router.get("/public/widget-config/:key", async (req, res) => {
  try {
    // 1. Validate widget key
    const widgetKey = validateWidgetKey(req.params.key);

    // 2. Query only necessary user fields
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, business_name, widget_color, welcome_message, plan")
      .eq("widget_key", widgetKey)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "Widget not found" });
    }

    // 3. Query only public-safe settings fields
    const { data: settings, error: settingsError } = await supabase
      .from("smart_hub_settings")
      .select(
        "booking_url, booking_active, apollo_active, followup_active, " +
        "vision_active, sentiment_active, ai_instructions, ai_temp"
      )
      .eq("user_id", user.id)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error(`[WIDGET] Settings error for user ${user.id}:`, settingsError.message);
      return res.status(500).json({ error: "Unable to load widget configuration" });
    }

    const safeSettings = settings || {};

    // 4. Get business identity (public-safe fields only)
    const identity = await getBusinessIdentity(user.id).catch(() => ({}));

    // 5. Build PUBLIC-SAFE response - EXPLICIT ALLOWLIST
    const publicConfig = {
      // User fields (sanitized)
      business_name: sanitizeString(user.business_name || "AI Assistant", MAX_BUSINESS_NAME_LENGTH),
      widget_color: user.widget_color || "#d4af37",
      welcome_message: sanitizeString(user.welcome_message || "Hi! How can I help you today?", MAX_WELCOME_MESSAGE_LENGTH),

      // Business identity (sanitized)
      business_type: sanitizeString(identity.business_type || "", MAX_BUSINESS_NAME_LENGTH),
      business_description: sanitizeString(identity.business_description || "", MAX_BUSINESS_DESCRIPTION_LENGTH),

      // Public widget settings (sanitized)
      booking_url: safeSettings.booking_url || "",
      booking_active: safeSettings.booking_active || 0,
      apollo_active: safeSettings.apollo_active || 0,
      followup_active: safeSettings.followup_active || 0,
      vision_active: safeSettings.vision_active || 0,
      sentiment_active: safeSettings.sentiment_active || 0,

      // AI settings (required for widget behavior)
      ai_instructions: sanitizeString(safeSettings.ai_instructions || "", MAX_AI_INSTRUCTIONS_LENGTH),
      ai_temp: safeSettings.ai_temp || "0.7",
    };

    // 6. DO NOT return:
    // - apollo_key (NEVER expose API keys)
    // - smart_hub: settings (would expose all fields)
    // - plan (not needed for public widget)
    // - any private fields

    res.json(publicConfig);

  } catch (err) {
    // Safe logging - NEVER log full widget key
    const truncatedKey = req.params.key ? req.params.key.substring(0, 8) + '...' : 'unknown';
    console.error(`[WIDGET] Public config error [Key: ${truncatedKey}]:`, {
      message: err.message,
      code: err.code,
    });

    // Classify error
    if (err.code === 'INVALID_WIDGET_KEY') {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: "Unable to load widget configuration" });
  }
});

// ============================================================
// GET WIDGET KEY (Authenticated)
// ============================================================

router.get("/widget/key", auth, async (req, res) => {
  try {
    // req.user.id comes from auth middleware - NEVER from client
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return the key if it exists, otherwise indicate regeneration is needed
    // "generate-new-key" is kept for frontend compatibility
    res.json({ 
      key: user.widget_key || "generate-new-key" 
    });
  } catch (err) {
    console.error("[WIDGET] Key fetch error:", {
      message: err.message,
      code: err.code,
      userId: req.user?.id,
    });

    res.status(500).json({ error: "Unable to retrieve widget key" });
  }
});

// ============================================================
// REGENERATE WIDGET KEY (Authenticated)
// ============================================================

router.post("/widget/regenerate-key", auth, async (req, res) => {
  try {
    // Generate cryptographically strong key
    const newKey = uuidv4();

    // Update database - setWidgetKey handles the update
    await setWidgetKey(req.user.id, newKey);

    // Log key regeneration (safe - key is not logged in full)
    console.log(`[WIDGET] Key regenerated for user: ${req.user.id}`);

    res.json({
      key: newKey,
      message: "New key generated successfully"
    });
  } catch (err) {
    console.error("[WIDGET] Key regeneration error:", {
      message: err.message,
      code: err.code,
      userId: req.user?.id,
    });

    res.status(500).json({ error: "Failed to regenerate key" });
  }
});

module.exports = router;