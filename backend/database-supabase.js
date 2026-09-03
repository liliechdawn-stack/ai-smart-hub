// backend/database-supabase.js
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// ===============================
// CONFIGURATION
// ===============================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.error('❌ ENCRYPTION_KEY must be set in .env (64 hex characters for AES-256)');
  process.exit(1);
}

// ===============================
// SUPABASE CLIENT FACTORIES
// ===============================

/**
 * Admin client with service_role key - USE ONLY FOR SYSTEM OPERATIONS
 * This bypasses RLS - use with extreme caution!
 */
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Admin Supabase client initialized (service_role)');

/**
 * Create a user-scoped Supabase client using JWT
 * This ensures RLS policies are enforced for the authenticated user
 */
function getUserSupabaseClient(userJwt) {
  if (!userJwt) {
    throw new Error('User JWT is required for authenticated client');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`
      }
    }
  });
}

/**
 * Create a Supabase client with a specific access token (for webhooks, etc.)
 */
function getClientWithToken(accessToken) {
  if (!accessToken) {
    throw new Error('Access token is required');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

// ===============================
// PAGINATION CONSTANTS
// ===============================

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

// ===============================
// CRYPTOGRAPHIC HELPERS
// ===============================

function encryptSensitiveData(text) {
  if (!text) return null;
  try {
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    
    const combined = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error.message);
    return null;
  }
}

function decryptSensitiveData(encryptedData) {
  if (!encryptedData) return null;
  try {
    const combined = Buffer.from(encryptedData, 'base64');
    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const encrypted = combined.subarray(32);
    
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
}

/**
 * Generate a secure API key with prefix
 */
function generateApiKey() {
  const rawKey = `ak_${crypto.randomBytes(24).toString('base64url')}`;
  return rawKey;
}

/**
 * Hash an API key for deterministic lookup
 */
function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// ===============================
// HELPER FUNCTIONS
// ===============================

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || '';
}

function sanitizeString(str) {
  return str?.trim() || '';
}

/**
 * Sanitize error context by removing sensitive data
 */
function sanitizeErrorContext(context) {
  if (!context) return {};
  
  const sensitiveKeys = ['password', 'token', 'apiKey', 'api_key', 'secret', 'key', 'auth', 'authorization', 'jwt'];
  const sanitized = {};
  
  for (const [key, value] of Object.entries(context)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeErrorContext(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Handle Supabase errors with sanitized logging
 */
function handleError(error, operation, context = {}) {
  const sanitizedContext = sanitizeErrorContext(context);
  const errorDetails = {
    operation,
    context: sanitizedContext,
    code: error.code || 'unknown',
    message: error.message || 'Unknown error',
    details: error.details || null,
    hint: error.hint || null
  };
  
  console.error(`❌ Database error in ${operation}:`, {
    ...errorDetails,
    stack: error.stack?.split('\n').slice(0, 3).join('\n')
  });
  
  const err = new Error(`Database operation failed: ${operation}`);
  err.originalError = error;
  err.code = error.code;
  err.details = errorDetails;
  throw err;
}

/**
 * Validate organization access (uses admin client for membership check)
 */
async function validateOrganizationAccess(userId, organizationId) {
  if (!organizationId) return true;
  
  const { data, error } = await adminSupabase
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  
  if (error) throw error;
  if (!data) throw new Error('User does not have access to this organization');
  
  return data.role;
}

/**
 * Get paginated results with metadata
 * Uses count estimate for large tables to prevent performance bottlenecks
 */
async function getPaginatedResults(query, page = 1, limit = DEFAULT_PAGE_LIMIT, useEstimatedCount = false) {
  const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
  const offset = (Math.max(page, 1) - 1) * safeLimit;
  
  let countQuery = query;
  
  // Use estimated count for large tables if requested
  if (useEstimatedCount) {
    // For large tables, we can skip exact count to improve performance
    // The frontend can use the 'hasMore' flag instead
    const { data, error } = await query
      .range(offset, offset + safeLimit - 1)
      .select('*');
    
    if (error) throw error;
    
    // Check if there are more records beyond this page
    let hasMore = false;
    if (data && data.length === safeLimit) {
      // Check if there's at least one more record
      const { data: nextData, error: nextError } = await query
        .range(offset + safeLimit, offset + safeLimit)
        .select('id')
        .limit(1);
      
      if (!nextError && nextData && nextData.length > 0) {
        hasMore = true;
      }
    }
    
    return {
      data: data || [],
      pagination: {
        page: Math.max(page, 1),
        limit: safeLimit,
        hasMore,
        total: null // Not provided for performance
      }
    };
  }
  
  // Standard exact count for smaller tables
  const { data, error, count } = await query
    .range(offset, offset + safeLimit - 1)
    .select('*', { count: 'exact' });
  
  if (error) throw error;
  
  return {
    data: data || [],
    pagination: {
      page: Math.max(page, 1),
      limit: safeLimit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / safeLimit)
    }
  };
}

// ===============================
// ORGANIZATION / TENANT FUNCTIONS
// ===============================

async function createOrganization(userId, name, slug, plan = 'free') {
  try {
    const orgId = uuidv4();
    const now = new Date().toISOString();
    
    const { data: org, error: orgError } = await adminSupabase
      .from('organizations')
      .insert({
        id: orgId,
        name: sanitizeString(name),
        slug: sanitizeString(slug),
        plan,
        created_by: userId,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();
    
    if (orgError) throw orgError;
    
    const { error: memberError } = await adminSupabase
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id: userId,
        role: 'owner',
        created_at: now
      });
    
    if (memberError) throw memberError;
    
    await initializeOrganizationSettings(orgId);
    
    return org;
  } catch (error) {
    handleError(error, 'createOrganization', { userId, name, slug });
  }
}

async function initializeOrganizationSettings(organizationId) {
  try {
    await adminSupabase
      .from('organization_settings')
      .insert({
        organization_id: organizationId,
        widget_color: '#d4af37',
        welcome_message: 'How can I help you today?',
        ai_tone: 'professional'
      });
    
    await adminSupabase
      .from('governance_settings')
      .insert({ organization_id: organizationId });
    
    await adminSupabase
      .from('notification_settings')
      .insert({ organization_id: organizationId });
  } catch (error) {
    console.error('Error initializing organization settings:', error.message);
  }
}

async function getOrganizationBySlug(slug) {
  try {
    const { data, error } = await adminSupabase
      .from('organizations')
      .select('*')
      .eq('slug', sanitizeString(slug))
      .maybeSingle();
    
    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getOrganizationBySlug', { slug });
  }
}

async function getOrganizationById(organizationId) {
  try {
    const { data, error } = await adminSupabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getOrganizationById', { organizationId });
  }
}

async function getUserOrganizations(userId) {
  try {
    const { data, error } = await adminSupabase
      .from('organization_members')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', userId);
    
    if (error) throw error;
    
    return (data || []).map(member => ({
      ...member.organizations,
      role: member.role
    }));
  } catch (error) {
    handleError(error, 'getUserOrganizations', { userId });
  }
}

async function addOrganizationMember(organizationId, userId, role = 'member') {
  try {
    const { data, error } = await adminSupabase
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        role: sanitizeString(role)
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'addOrganizationMember', { organizationId, userId, role });
  }
}

async function removeOrganizationMember(organizationId, userId) {
  try {
    const { data: owners } = await adminSupabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('role', 'owner');
    
    if (owners && owners.length === 1 && owners[0].user_id === userId) {
      throw new Error('Cannot remove the last owner of the organization');
    }
    
    const { error } = await adminSupabase
      .from('organization_members')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', userId);
    
    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'removeOrganizationMember', { organizationId, userId });
  }
}

async function updateOrganizationMemberRole(organizationId, userId, role) {
  try {
    const { error } = await adminSupabase
      .from('organization_members')
      .update({ role: sanitizeString(role) })
      .eq('organization_id', organizationId)
      .eq('user_id', userId);
    
    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateOrganizationMemberRole', { organizationId, userId, role });
  }
}

// ===============================
// USERS (with Organization Context)
// ===============================

/**
 * Creates a user using Supabase Auth with atomic transaction
 * Note: This should ideally be replaced with a Postgres trigger
 * that automatically creates the user profile on auth signup
 */
async function createUser(email, password, organizationId, businessName, vToken) {
  const cleanEmail = normalizeEmail(email);
  
  try {
    const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        organization_id: organizationId,
        business_name: businessName,
        verification_token: vToken
      }
    });

    if (authError) throw authError;

    const userId = authUser.user.id;

    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .insert({
        id: userId,
        email: cleanEmail,
        business_name: sanitizeString(businessName),
        verification_token: vToken,
        is_verified: 1,
        business_profile: {},
        plan: 'free',
        subscription_status: 'inactive'
      })
      .select()
      .single();

    if (userError) {
      await adminSupabase.auth.admin.deleteUser(userId);
      throw userError;
    }

    const { error: memberError } = await adminSupabase
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        role: 'member',
        created_at: new Date().toISOString()
      });

    if (memberError) {
      await adminSupabase.auth.admin.deleteUser(userId);
      await adminSupabase.from('users').delete().eq('id', userId);
      throw memberError;
    }

    return userId;
  } catch (error) {
    handleError(error, 'createUser', { email: cleanEmail, organizationId });
  }
}

async function verifyUser(token) {
  try {
    const { data, error } = await adminSupabase
      .from('users')
      .update({ 
        is_verified: 1, 
        verification_token: null 
      })
      .eq('verification_token', token)
      .select();

    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    handleError(error, 'verifyUser', { token });
  }
}

async function getUserByEmail(email) {
  try {
    const cleanEmail = normalizeEmail(email);
    const { data, error } = await adminSupabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserByEmail', { email });
  }
}

async function getUserByBusinessId(business_id) {
  try {
    const { data, error } = await adminSupabase
      .from('users')
      .select('*')
      .eq('business_id', business_id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserByBusinessId', { business_id });
  }
}

async function getUserById(userId) {
  try {
    const { data, error } = await adminSupabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserById', { userId });
  }
}

async function getOrganizationUsers(organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const result = await getPaginatedResults(
      adminSupabase
        .from('organization_members')
        .select('user_id, role, users(*)')
        .eq('organization_id', organizationId),
      page,
      limit
    );
    
    return {
      ...result,
      data: result.data.map(member => ({
        ...member.users,
        role: member.role
      }))
    };
  } catch (error) {
    handleError(error, 'getOrganizationUsers', { organizationId, page, limit });
  }
}

// ===============================
// BUSINESS PROFILE FUNCTIONS
// ===============================

async function getBusinessProfile(userId) {
  try {
    const { data, error } = await adminSupabase
      .from('users')
      .select('business_profile, business_name, plan')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    
    let profile = {};
    if (data?.business_profile) {
      profile = typeof data.business_profile === 'string' 
        ? JSON.parse(data.business_profile) 
        : data.business_profile;
    }
    
    return {
      ...profile,
      business_name: data?.business_name,
      plan: data?.plan
    };
  } catch (error) {
    handleError(error, 'getBusinessProfile', { userId });
  }
}

async function updateBusinessProfile(userId, profileData) {
  try {
    const { error } = await adminSupabase
      .from('users')
      .update({ 
        business_profile: profileData,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    handleError(error, 'updateBusinessProfile', { userId });
  }
}

// ===============================
// WEEKLY REPORTS FUNCTIONS
// ===============================

async function saveWeeklyReport(userJwt, organizationId, reportData) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('weekly_reports')
      .insert({
        organization_id: organizationId,
        report_type: reportData.report_type || 'business_summary',
        week_start: reportData.week_start || reportData.week,
        week_end: reportData.week_end || new Date(new Date(reportData.week_start || reportData.week).getTime() + 6 * 24 * 60 * 60 * 1000),
        data: reportData.data || reportData.report_data || {},
        summary: reportData.summary || '',
        insights: reportData.insights || {},
        recommendations: reportData.recommendations || {}
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'saveWeeklyReport', { organizationId });
  }
}

async function getWeeklyReports(userJwt, organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const result = await getPaginatedResults(
      supabase
        .from('weekly_reports')
        .select('*')
        .eq('organization_id', organizationId)
        .order('week_start', { ascending: false }),
      page,
      limit
    );
    
    return result;
  } catch (error) {
    handleError(error, 'getWeeklyReports', { organizationId, page, limit });
  }
}

async function getLatestWeeklyReport(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('organization_id', organizationId)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getLatestWeeklyReport', { organizationId });
  }
}

// ===============================
// HEALTH SCANS FUNCTIONS
// ===============================

async function saveHealthScan(userJwt, organizationId, scanData) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('health_scans')
      .insert({
        organization_id: organizationId,
        scan_type: scanData.scan_type || 'full_system',
        status: scanData.status || 'completed',
        result: scanData.result || scanData.findings || {},
        issues_found: scanData.issues_found || 0,
        issues_resolved: scanData.issues_resolved || 0,
        score: scanData.score || 100
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'saveHealthScan', { organizationId });
  }
}

async function getHealthScans(userJwt, organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const result = await getPaginatedResults(
      supabase
        .from('health_scans')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false }),
      page,
      limit
    );
    
    return result;
  } catch (error) {
    handleError(error, 'getHealthScans', { organizationId, page, limit });
  }
}

async function getLatestHealthScan(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('health_scans')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getLatestHealthScan', { organizationId });
  }
}

// ===============================
// AI RECOMMENDATIONS FUNCTIONS
// ===============================

async function saveAiRecommendation(userJwt, userId, organizationId, recommendation) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { data, error } = await supabase
      .from('ai_recommendations')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        automation_id: recommendation.automationId || recommendation.templateId,
        title: sanitizeString(recommendation.title),
        reason: sanitizeString(recommendation.reason),
        confidence_score: recommendation.confidence_score || 85,
        roi_hours_saved: recommendation.roi_hours_saved || 5,
        roi_revenue_impact: recommendation.roi_revenue_impact || 500,
        roi_leads_generated: recommendation.roi_leads_generated || 20,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'saveAiRecommendation', { userId, organizationId });
  }
}

async function getPendingRecommendations(userJwt, organizationId, limit = 10) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('ai_recommendations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getPendingRecommendations', { organizationId, limit });
  }
}

async function updateRecommendationStatus(userJwt, recId, userId, organizationId, status) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('ai_recommendations')
      .update({ 
        status: status,
        deployed_at: status === 'accepted' ? new Date().toISOString() : null
      })
      .eq('id', recId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    handleError(error, 'updateRecommendationStatus', { recId, userId, organizationId, status });
  }
}

// ===============================
// SAAS CUSTOMIZATION
// ===============================

async function updateWidgetSettings(userJwt, userId, organizationId, color, welcomeMsg, tone) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('organization_settings')
      .update({
        widget_color: color,
        welcome_message: sanitizeString(welcomeMsg),
        ai_tone: sanitizeString(tone)
      })
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateWidgetSettings', { userId, organizationId });
  }
}

async function updateSmartSettings(userJwt, userId, organizationId, toolType, data) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    // Ensure entry exists
    await supabase
      .from('smart_hub_settings')
      .upsert({ organization_id: organizationId }, { onConflict: 'organization_id' });

    let updateData = {};

    switch(toolType) {
      case 'brain':
        updateData = {
          ai_instructions: sanitizeString(data.instructions),
          ai_temp: data.temp,
          ai_lang: sanitizeString(data.lang),
          brain_active: 1
        };
        break;
      case 'booking':
        updateData = {
          booking_url: sanitizeString(data.url),
          booking_active: 1
        };
        break;
      case 'sentiment':
        updateData = {
          sentiment_enabled: data.enabled ? 1 : 0,
          alert_email: normalizeEmail(data.email),
          sentiment_active: 1
        };
        break;
      case 'handover':
        updateData = {
          handover_trigger: sanitizeString(data.trigger),
          handover_active: 1
        };
        break;
      case 'webhook':
        updateData = {
          webhook_url: sanitizeString(data.url),
          webhook_active: 1
        };
        break;
      case 'apollo':
        updateData = {
          apollo_active: data.active ? 1 : 0,
          apollo_key: data.apiKey ? encryptSensitiveData(data.apiKey) : null,
          auto_sync: data.autoSync ? 1 : 0
        };
        break;
      case 'vision':
        updateData = {
          vision_active: data.active ? 1 : 0,
          vision_sensitivity: sanitizeString(data.sensitivity || 'high'),
          vision_area: sanitizeString(data.area || 'all')
        };
        break;
      case 'followup':
        updateData = {
          followup_active: data.active ? 1 : 0
        };
        break;
      case 'analytics':
        updateData = {
          analytics_active: data.active ? 1 : 0
        };
        break;
      default:
        throw new Error(`Invalid toolType: ${toolType} provided to updateSmartSettings`);
    }

    const { error } = await supabase
      .from('smart_hub_settings')
      .update(updateData)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateSmartSettings', { userId, organizationId, toolType });
  }
}

async function getSmartSettings(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('booking_url')
      .eq('id', organizationId)
      .maybeSingle();

    if (orgError && orgError.code !== 'PGRST116') throw orgError;

    const { data: settings, error: settingsError } = await supabase
      .from('smart_hub_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settingsError) throw settingsError;

    // Decrypt Apollo key if present
    if (settings?.apollo_key) {
      settings.apollo_key = decryptSensitiveData(settings.apollo_key);
    }

    return {
      ...(settings || {}),
      booking_url: org?.booking_url || settings?.booking_url || ''
    };
  } catch (error) {
    handleError(error, 'getSmartSettings', { organizationId });
  }
}

// ===============================
// BUSINESS IDENTITY FUNCTIONS
// ===============================

async function saveBusinessIdentity(userJwt, userId, organizationId, business_type, business_description) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('business_identity')
      .upsert({
        organization_id: organizationId,
        business_type: sanitizeString(business_type),
        business_description: sanitizeString(business_description)
      }, {
        onConflict: 'organization_id'
      });

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'saveBusinessIdentity', { userId, organizationId });
  }
}

async function getBusinessIdentity(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('business_identity')
      .select('business_type, business_description, created_at, updated_at')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;
    return data || { business_type: '', business_description: '' };
  } catch (error) {
    handleError(error, 'getBusinessIdentity', { organizationId });
  }
}

// ===============================
// TOOL STATE FUNCTIONS
// ===============================

async function saveToolState(userJwt, userId, organizationId, toolType, isActive) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('tool_states')
      .upsert({
        organization_id: organizationId,
        tool_type: sanitizeString(toolType),
        is_active: isActive ? 1 : 0
      }, {
        onConflict: 'organization_id, tool_type'
      });

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'saveToolState', { userId, organizationId, toolType });
  }
}

async function getToolStates(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('tool_states')
      .select('tool_type, is_active')
      .eq('organization_id', organizationId);

    if (error) throw error;
    
    const states = {};
    (data || []).forEach(row => {
      states[row.tool_type] = row.is_active === 1;
    });
    return states;
  } catch (error) {
    handleError(error, 'getToolStates', { organizationId });
  }
}

async function deleteToolState(userJwt, userId, organizationId, toolType) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('tool_states')
      .delete()
      .eq('organization_id', organizationId)
      .eq('tool_type', sanitizeString(toolType));

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteToolState', { userId, organizationId, toolType });
  }
}

// ===============================
// SUPPORT & ABOUT FUNCTIONS
// ===============================

async function saveSupportTicket(userJwt, userId, organizationId, subject, message) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        subject: sanitizeString(subject),
        message: sanitizeString(message)
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'saveSupportTicket', { userId, organizationId });
  }
}

async function updateBusinessAbout(userJwt, userId, organizationId, aboutText) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('organization_settings')
      .update({ about_business: sanitizeString(aboutText) })
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateBusinessAbout', { userId, organizationId });
  }
}

// ===============================
// KNOWLEDGE BASE
// ===============================

async function addKnowledge(userJwt, userId, organizationId, content, type = 'text') {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        organization_id: organizationId,
        created_by: userId,
        content: sanitizeString(content),
        source_type: sanitizeString(type)
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'addKnowledge', { userId, organizationId });
  }
}

async function getKnowledgeByOrganization(userJwt, organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const result = await getPaginatedResults(
      supabase
        .from('knowledge_base')
        .select('id, content, source_type, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false }),
      page,
      limit
    );
    
    return result;
  } catch (error) {
    handleError(error, 'getKnowledgeByOrganization', { organizationId, page, limit });
  }
}

async function deleteKnowledge(userJwt, userId, organizationId, knowledgeId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('id', knowledgeId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteKnowledge', { userId, organizationId, knowledgeId });
  }
}

// ===============================
// WIDGET KEY
// ===============================

async function setWidgetKey(userJwt, organizationId, widgetKey) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error } = await supabase
      .from('organization_settings')
      .update({ widget_key: sanitizeString(widgetKey) })
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'setWidgetKey', { organizationId });
  }
}

async function getWidgetKey(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('organization_settings')
      .select('widget_key')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;
    return data ? data.widget_key : null;
  } catch (error) {
    handleError(error, 'getWidgetKey', { organizationId });
  }
}

// ===============================
// MONETIZATION & SUBSCRIPTION MANAGEMENT
// ===============================

async function getOrganizationSubscription(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('organizations')
      .select('plan, subscription_status, stripe_customer_id, stripe_subscription_id, plan_expires')
      .eq('id', organizationId)
      .maybeSingle();

    if (error) throw error;
    return data || { plan: 'free', subscription_status: 'inactive' };
  } catch (error) {
    handleError(error, 'getOrganizationSubscription', { organizationId });
  }
}

async function updateSubscriptionStatus(userJwt, organizationId, subscriptionData) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const updates = {
      plan: sanitizeString(subscriptionData.plan),
      subscription_status: sanitizeString(subscriptionData.status || 'active'),
      updated_at: new Date().toISOString()
    };
    
    if (subscriptionData.stripe_customer_id) {
      updates.stripe_customer_id = subscriptionData.stripe_customer_id;
    }
    if (subscriptionData.stripe_subscription_id) {
      updates.stripe_subscription_id = subscriptionData.stripe_subscription_id;
    }
    if (subscriptionData.plan_expires) {
      updates.plan_expires = subscriptionData.plan_expires;
    }
    
    const { error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', organizationId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    handleError(error, 'updateSubscriptionStatus', { organizationId });
  }
}

async function checkPlanLimits(userJwt, organizationId, metric) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('organizations')
      .select('plan, messages_used, leads_used')
      .eq('id', organizationId)
      .maybeSingle();

    if (error) throw error;
    
    const planLimits = {
      free: { messages: 100, leads: 50 },
      basic: { messages: 500, leads: 200 },
      pro: { messages: 3000, leads: 1000 },
      agency: { messages: 10000, leads: 5000 }
    };
    
    const plan = data?.plan || 'free';
    const limits = planLimits[plan] || planLimits.free;
    
    let currentUsage = 0;
    let limit = 0;
    
    if (metric === 'messages') {
      currentUsage = data?.messages_used || 0;
      limit = limits.messages;
    } else if (metric === 'leads') {
      currentUsage = data?.leads_used || 0;
      limit = limits.leads;
    } else {
      throw new Error(`Unknown metric: ${metric}`);
    }
    
    return {
      plan,
      current: currentUsage,
      limit,
      isExceeded: currentUsage >= limit,
      remaining: Math.max(0, limit - currentUsage)
    };
  } catch (error) {
    handleError(error, 'checkPlanLimits', { organizationId, metric });
  }
}

/**
 * Atomic increment for messages_used - PURE RPC ONLY, NO FALLBACK
 * Race condition safe - relies on PostgreSQL atomic update
 */
async function incrementMessagesUsed(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error: rpcError } = await supabase.rpc('increment_messages_used', {
      org_id_param: organizationId
    });
    
    if (rpcError) {
      // No fallback - RPC must exist. Log error and re-throw.
      console.error('❌ increment_messages_used RPC failed:', rpcError);
      throw new Error('Atomic increment operation failed - RPC not available');
    }
    
    return true;
  } catch (error) {
    handleError(error, 'incrementMessagesUsed', { organizationId });
  }
}

/**
 * Atomic increment for leads_used - PURE RPC ONLY, NO FALLBACK
 * Race condition safe - relies on PostgreSQL atomic update
 */
async function incrementLeadsUsed(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error: rpcError } = await supabase.rpc('increment_leads_used', {
      org_id_param: organizationId
    });
    
    if (rpcError) {
      console.error('❌ increment_leads_used RPC failed:', rpcError);
      throw new Error('Atomic increment operation failed - RPC not available');
    }
    
    return true;
  } catch (error) {
    handleError(error, 'incrementLeadsUsed', { organizationId });
  }
}

// ===============================
// LEADS (Organization-scoped)
// ===============================

async function saveLead(userJwt, userId, organizationId, name, email, phone, company = '', job_title = '', message = "") {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { data, error } = await supabase
      .from('leads')
      .insert({
        organization_id: organizationId,
        created_by: userId,
        name: sanitizeString(name),
        email: normalizeEmail(email),
        phone: sanitizeString(phone),
        company: sanitizeString(company),
        job_title: sanitizeString(job_title),
        message: sanitizeString(message)
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'saveLead', { userId, organizationId, email });
  }
}

async function getLeadsByOrganization(userJwt, organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT, filters = {}) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    let query = supabase
      .from('leads')
      .select('*')
      .eq('organization_id', organizationId);
    
    if (filters.status) {
      query = query.eq('status', sanitizeString(filters.status));
    }
    if (filters.email) {
      query = query.eq('email', normalizeEmail(filters.email));
    }
    if (filters.name) {
      query = query.ilike('name', `%${sanitizeString(filters.name)}%`);
    }
    
    query = query.order('created_at', { ascending: false });
    
    const result = await getPaginatedResults(query, page, limit);
    return result;
  } catch (error) {
    handleError(error, 'getLeadsByOrganization', { organizationId, page, limit });
  }
}

async function getLeadById(userJwt, leadId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getLeadById', { leadId, organizationId });
  }
}

async function updateLeadStatus(userJwt, leadId, organizationId, status, notes = null) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const updateData = { 
      status: sanitizeString(status), 
      updated_at: new Date().toISOString() 
    };
    if (notes) updateData.notes = sanitizeString(notes);
    
    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateLeadStatus', { leadId, organizationId, status });
  }
}

async function deleteLead(userJwt, leadId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteLead', { leadId, organizationId });
  }
}

// ===============================
// CHATS (Organization-scoped)
// ===============================

async function saveChat(userJwt, userId, organizationId, sessionId, clientName, message, response, sentiment = 'neutral') {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const id = uuidv4();
    const { error } = await supabase
      .from('chats')
      .insert({
        id,
        organization_id: organizationId,
        user_id: userId,
        session_id: sanitizeString(sessionId),
        client_name: sanitizeString(clientName),
        message: sanitizeString(message),
        response: sanitizeString(response),
        sentiment: sanitizeString(sentiment)
      });

    if (error) throw error;
    return id;
  } catch (error) {
    handleError(error, 'saveChat', { userId, organizationId, sessionId });
  }
}

async function getChatsByOrganization(userJwt, organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT, filters = {}) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    let query = supabase
      .from('chats')
      .select('*')
      .eq('organization_id', organizationId);
    
    if (filters.client_name) {
      query = query.ilike('client_name', `%${sanitizeString(filters.client_name)}%`);
    }
    if (filters.session_id) {
      query = query.eq('session_id', sanitizeString(filters.session_id));
    }
    
    query = query.order('created_at', { ascending: false });
    
    const result = await getPaginatedResults(query, page, limit);
    return result;
  } catch (error) {
    handleError(error, 'getChatsByOrganization', { organizationId, page, limit });
  }
}

async function getChatsBySession(userJwt, sessionId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('session_id', sanitizeString(sessionId))
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getChatsBySession', { sessionId, organizationId });
  }
}

// ===============================
// AUTOMATIONS (Organization-scoped)
// ===============================

async function createAutomation(userJwt, userId, organizationId, name, triggerType, actionType, description = '', triggerConfig = {}, actionConfig = {}) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const id = 'auto_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('automations')
      .insert({
        id,
        organization_id: organizationId,
        created_by: userId,
        name: sanitizeString(name),
        description: sanitizeString(description),
        trigger_type: sanitizeString(triggerType),
        trigger_config: triggerConfig,
        action_type: sanitizeString(actionType),
        action_config: actionConfig,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'createAutomation', { userId, organizationId, name });
  }
}

async function getAutomationsByOrganization(userJwt, organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT, filters = {}) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    let query = supabase
      .from('automations')
      .select('*')
      .eq('organization_id', organizationId);
    
    if (filters.status) {
      query = query.eq('status', sanitizeString(filters.status));
    }
    if (filters.trigger_type) {
      query = query.eq('trigger_type', sanitizeString(filters.trigger_type));
    }
    
    query = query.order('created_at', { ascending: false });
    
    const result = await getPaginatedResults(query, page, limit);
    return result;
  } catch (error) {
    handleError(error, 'getAutomationsByOrganization', { organizationId, page, limit });
  }
}

async function getAutomationById(userJwt, automationId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getAutomationById', { automationId, organizationId });
  }
}

async function updateAutomation(userJwt, automationId, organizationId, updates) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const updateData = { 
      ...updates, 
      updated_at: new Date().toISOString() 
    };
    
    if (updateData.name) updateData.name = sanitizeString(updateData.name);
    if (updateData.description) updateData.description = sanitizeString(updateData.description);
    if (updateData.trigger_type) updateData.trigger_type = sanitizeString(updateData.trigger_type);
    if (updateData.action_type) updateData.action_type = sanitizeString(updateData.action_type);

    const { error } = await supabase
      .from('automations')
      .update(updateData)
      .eq('id', automationId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateAutomation', { automationId, organizationId });
  }
}

async function deleteAutomation(userJwt, automationId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', automationId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteAutomation', { automationId, organizationId });
  }
}

/**
 * Atomic increment for automation triggers - PURE RPC ONLY
 */
async function incrementAutomationTriggers(userJwt, automationId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error } = await supabase.rpc('increment_automation_triggers', {
      automation_id_param: automationId,
      organization_id_param: organizationId
    });

    if (error) {
      console.error('❌ increment_automation_triggers RPC failed:', error);
      throw new Error('Atomic increment operation failed - RPC not available');
    }

    return true;
  } catch (error) {
    handleError(error, 'incrementAutomationTriggers', { automationId, organizationId });
  }
}

// ===============================
// AUTOMATION RUNS
// ===============================

async function createAutomationRun(userJwt, id, automationId, userId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('automation_runs')
      .insert({
        id,
        automation_id: automationId,
        organization_id: organizationId,
        user_id: userId,
        started_at: now
      });

    if (error) throw error;
    return id;
  } catch (error) {
    handleError(error, 'createAutomationRun', { id, automationId, userId, organizationId });
  }
}

async function completeAutomationRun(userJwt, id, status, result, duration, error = null) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('automation_runs')
      .update({
        status: sanitizeString(status),
        result,
        duration,
        error: error ? sanitizeString(error) : null,
        completed_at: now
      })
      .eq('id', id);

    if (updateError) throw updateError;
    return true;
  } catch (error) {
    handleError(error, 'completeAutomationRun', { id, status });
  }
}

async function getAutomationRuns(userJwt, automationId, organizationId, limit = 50) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('automation_id', automationId)
      .eq('organization_id', organizationId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getAutomationRuns', { automationId, organizationId, limit });
  }
}

// ===============================
// AUTOMATION TEMPLATES
// ===============================

async function getAutomationTemplates(userJwt, category = null, industry = null, featured = false, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    let query = supabase
      .from('automation_templates')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('usage_count', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', sanitizeString(category));
    }
    
    if (industry && industry !== 'all') {
      query = query.contains('industry', [sanitizeString(industry)]);
    }
    
    if (featured) {
      query = query.eq('is_featured', true);
    }

    const result = await getPaginatedResults(query, page, limit);
    return result;
  } catch (error) {
    handleError(error, 'getAutomationTemplates', { category, industry, featured, page, limit });
  }
}

async function getAutomationTemplateBySlug(userJwt, slug) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('automation_templates')
      .select('*')
      .eq('slug', sanitizeString(slug))
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getAutomationTemplateBySlug', { slug });
  }
}

async function incrementTemplateUsage(userJwt, templateId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error } = await supabase.rpc('increment_template_usage', {
      template_id_param: templateId
    });

    if (error) {
      console.error('❌ increment_template_usage RPC failed:', error);
      throw new Error('Atomic increment operation failed - RPC not available');
    }

    return true;
  } catch (error) {
    handleError(error, 'incrementTemplateUsage', { templateId });
  }
}

// ===============================
// USER AUTOMATIONS (Advanced)
// ===============================

async function createUserAutomation(userJwt, userId, organizationId, templateId, name, description, triggerType, triggerConfig, actions, status = 'draft') {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const id = uuidv4();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('user_automations')
      .insert({
        id,
        organization_id: organizationId,
        created_by: userId,
        template_id: templateId,
        name: sanitizeString(name),
        description: sanitizeString(description),
        status: sanitizeString(status),
        trigger_type: sanitizeString(triggerType),
        trigger_config: triggerConfig,
        actions: actions,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'createUserAutomation', { userId, organizationId, name });
  }
}

async function getUserAutomations(userJwt, organizationId, status = null, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    let query = supabase
      .from('user_automations')
      .select('*, template:automation_templates(name, icon, color, category)')
      .eq('organization_id', organizationId);

    if (status && status !== 'all') {
      query = query.eq('status', sanitizeString(status));
    }

    query = query.order('created_at', { ascending: false });
    
    const result = await getPaginatedResults(query, page, limit);
    return result;
  } catch (error) {
    handleError(error, 'getUserAutomations', { organizationId, status, page, limit });
  }
}

async function getUserAutomationById(userJwt, automationId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('user_automations')
      .select('*, template:automation_templates(*)')
      .eq('id', automationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserAutomationById', { automationId, organizationId });
  }
}

async function updateUserAutomation(userJwt, automationId, organizationId, updates) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.name) sanitizedUpdates.name = sanitizeString(sanitizedUpdates.name);
    if (sanitizedUpdates.description) sanitizedUpdates.description = sanitizeString(sanitizedUpdates.description);
    if (sanitizedUpdates.status) sanitizedUpdates.status = sanitizeString(sanitizedUpdates.status);
    if (sanitizedUpdates.trigger_type) sanitizedUpdates.trigger_type = sanitizeString(sanitizedUpdates.trigger_type);
    
    sanitizedUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('user_automations')
      .update(sanitizedUpdates)
      .eq('id', automationId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateUserAutomation', { automationId, organizationId });
  }
}

async function deleteUserAutomation(userJwt, automationId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    await supabase
      .from('automation_runs')
      .delete()
      .eq('automation_id', automationId);

    const { error } = await supabase
      .from('user_automations')
      .delete()
      .eq('id', automationId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteUserAutomation', { automationId, organizationId });
  }
}

// ===============================
// LEAD SOURCES
// ===============================

async function createLeadSource(userJwt, userId, organizationId, name, type, automation_id = null, config = {}) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const id = uuidv4();
    const { data, error } = await supabase
      .from('lead_sources')
      .insert({
        id,
        organization_id: organizationId,
        created_by: userId,
        automation_id,
        name: sanitizeString(name),
        type: sanitizeString(type),
        config
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'createLeadSource', { userId, organizationId, name });
  }
}

async function getLeadSources(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('lead_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getLeadSources', { organizationId });
  }
}

async function updateLeadSourceStats(userJwt, sourceId, organizationId, leadsGenerated) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error } = await supabase.rpc('increment_lead_source_count', {
      source_id_param: sourceId,
      increment_value: leadsGenerated
    });

    if (error) {
      console.error('❌ increment_lead_source_count RPC failed:', error);
      throw new Error('Atomic increment operation failed - RPC not available');
    }

    return true;
  } catch (error) {
    handleError(error, 'updateLeadSourceStats', { sourceId, organizationId, leadsGenerated });
  }
}

// ===============================
// CONNECTED ACCOUNTS
// ===============================

async function saveConnectedAccount(userJwt, userId, organizationId, platform, account_name, api_key_encrypted, account_info = {}, gateway_url = null, connection_type = 'direct') {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('platform', sanitizeString(platform))
      .eq('account_name', sanitizeString(account_name))
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('connected_accounts')
        .update({
          api_key_encrypted,
          account_info,
          gateway_url: sanitizeString(gateway_url),
          connection_type: sanitizeString(connection_type),
          status: 'active',
          last_sync: now,
          updated_at: now
        })
        .eq('id', existing.id);

      if (error) throw error;
      return existing.id;
    } else {
      const { data, error } = await supabase
        .from('connected_accounts')
        .insert({
          organization_id: organizationId,
          created_by: userId,
          platform: sanitizeString(platform),
          account_name: sanitizeString(account_name),
          api_key_encrypted,
          account_info,
          gateway_url: sanitizeString(gateway_url),
          connection_type: sanitizeString(connection_type),
          last_sync: now,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    }
  } catch (error) {
    handleError(error, 'saveConnectedAccount', { userId, organizationId, platform });
  }
}

async function getConnectedAccounts(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('connected_accounts')
      .select('id, platform, account_name, account_info, status, last_sync, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return (data || []).map(row => ({
      ...row,
      account_info: row.account_info || null
    }));
  } catch (error) {
    handleError(error, 'getConnectedAccounts', { organizationId });
  }
}

async function deleteConnectedAccount(userJwt, userId, organizationId, id) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('connected_accounts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteConnectedAccount', { userId, organizationId, id });
  }
}

async function updateAccountLastSync(userJwt, userId, organizationId, id) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('connected_accounts')
      .update({
        last_sync: now,
        updated_at: now
      })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateAccountLastSync', { userId, organizationId, id });
  }
}

// ===============================
// ACTIVITY LOG
// ===============================

async function logActivity(userJwt, userId, organizationId, action, details, type = 'info', icon = null) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const icons = {
      'info': 'fa-info-circle',
      'success': 'fa-check-circle',
      'warning': 'fa-exclamation-triangle',
      'error': 'fa-times-circle',
      'automation': 'fa-robot',
      'account': 'fa-plug',
      'lead': 'fa-user',
      'vision': 'fa-eye',
      'security': 'fa-shield-alt',
      'mobile': 'fa-cloud',
      'pricing': 'fa-tags',
      'inventory': 'fa-boxes',
      'governance': 'fa-shield-alt'
    };
    
    const finalIcon = icon || icons[type] || 'fa-info-circle';

    const { error } = await supabase
      .from('activity_log')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        action: sanitizeString(action),
        details: sanitizeString(details),
        type: sanitizeString(type),
        icon: finalIcon,
        timestamp: new Date().toISOString()
      });

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'logActivity', { userId, organizationId, action });
  }
}

async function getRecentActivity(userJwt, organizationId, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const result = await getPaginatedResults(
      supabase
        .from('activity_log')
        .select('*')
        .eq('organization_id', organizationId)
        .order('timestamp', { ascending: false }),
      page,
      limit
    );
    
    return result;
  } catch (error) {
    handleError(error, 'getRecentActivity', { organizationId, page, limit });
  }
}

// ===============================
// GOVERNANCE SETTINGS
// ===============================

async function getGovernanceSettings(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    let { data, error } = await supabase
      .from('governance_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: newData, error: insertError } = await supabase
        .from('governance_settings')
        .insert({ organization_id: organizationId })
        .select()
        .single();

      if (insertError) throw insertError;
      data = newData;
    }

    return data || {};
  } catch (error) {
    handleError(error, 'getGovernanceSettings', { organizationId });
  }
}

async function updateGovernanceSettings(userJwt, organizationId, settings) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    await supabase
      .from('governance_settings')
      .upsert({ organization_id: organizationId }, { onConflict: 'organization_id' });

    const updateData = { ...settings, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('governance_settings')
      .update(updateData)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateGovernanceSettings', { organizationId });
  }
}

// ===============================
// ALERTS
// ===============================

async function createAlert(userJwt, userId, organizationId, type, severity, title, description) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        type: sanitizeString(type),
        severity: sanitizeString(severity),
        title: sanitizeString(title),
        description: sanitizeString(description),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'createAlert', { userId, organizationId, type });
  }
}

async function getActiveAlerts(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('resolved', 0)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getActiveAlerts', { organizationId });
  }
}

async function resolveAlert(userJwt, userId, organizationId, alertId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('alerts')
      .update({
        resolved: 1,
        resolved_at: new Date().toISOString()
      })
      .eq('id', alertId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'resolveAlert', { userId, organizationId, alertId });
  }
}

// ===============================
// USAGE LOGS
// ===============================

async function logUsage(userJwt, userId, organizationId, provider, model, cost, tokens) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { error } = await supabase
      .from('usage_logs')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        provider: sanitizeString(provider),
        model: sanitizeString(model),
        cost,
        tokens,
        timestamp: new Date().toISOString()
      });

    if (error) throw error;

    const { error: rpcError } = await supabase.rpc('increment_used_amount', {
      organization_id_param: organizationId,
      cost_param: cost
    });

    if (rpcError) {
      console.error('❌ increment_used_amount RPC failed:', rpcError);
      throw new Error('Atomic increment operation failed - RPC not available');
    }

    return true;
  } catch (error) {
    handleError(error, 'logUsage', { userId, organizationId, provider });
  }
}

async function getUsageStats(userJwt, organizationId, days = 30) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('usage_logs')
      .select('provider, cost, tokens, created_at')
      .eq('organization_id', organizationId)
      .gte('timestamp', cutoffDate.toISOString());

    if (error) throw error;

    const stats = {};
    (data || []).forEach(log => {
      if (!stats[log.provider]) {
        stats[log.provider] = {
          provider: log.provider,
          total_cost: 0,
          total_tokens: 0,
          calls: 0
        };
      }
      stats[log.provider].total_cost += log.cost || 0;
      stats[log.provider].total_tokens += log.tokens || 0;
      stats[log.provider].calls += 1;
    });

    return Object.values(stats);
  } catch (error) {
    handleError(error, 'getUsageStats', { organizationId, days });
  }
}

// ===============================
// MOBILE INSTANCES
// ===============================

async function spawnMobileInstance(userJwt, userId, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const id = 'inst_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('mobile_instances')
      .insert({
        id,
        organization_id: organizationId,
        user_id: userId,
        created_at: now,
        last_active: now
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'spawnMobileInstance', { userId, organizationId });
  }
}

async function getMobileInstances(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('mobile_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getMobileInstances', { organizationId });
  }
}

async function terminateMobileInstance(userJwt, userId, organizationId, id) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('mobile_instances')
      .update({ status: 'terminated' })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'terminateMobileInstance', { userId, organizationId, id });
  }
}

// ===============================
// BROADCASTS
// ===============================

async function saveBroadcast(userJwt, userId, organizationId, id, subject, recipients, sent_count, failed_count, status = 'sent') {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('broadcasts')
      .insert({
        id,
        organization_id: organizationId,
        user_id: userId,
        subject: sanitizeString(subject),
        recipients,
        sent_count,
        failed_count,
        status: sanitizeString(status),
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    return id;
  } catch (error) {
    handleError(error, 'saveBroadcast', { userId, organizationId, id });
  }
}

async function getBroadcastsByUser(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getBroadcastsByUser', { organizationId });
  }
}

async function getBroadcastStats(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('broadcasts')
      .select('recipients, sent_count, failed_count')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const stats = {
      total_broadcasts: data?.length || 0,
      total_recipients: 0,
      total_sent: 0,
      total_failed: 0
    };

    (data || []).forEach(b => {
      stats.total_recipients += b.recipients || 0;
      stats.total_sent += b.sent_count || 0;
      stats.total_failed += b.failed_count || 0;
    });

    return stats;
  } catch (error) {
    handleError(error, 'getBroadcastStats', { organizationId });
  }
}

// ===============================
// INCIDENTS
// ===============================

async function getIncidents(limit = 5) {
  try {
    const { data, error } = await adminSupabase
      .from('incidents')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getIncidents', { limit });
  }
}

async function addIncident(date, title, description, status = 'resolved') {
  try {
    const { data, error } = await adminSupabase
      .from('incidents')
      .insert({
        date,
        title: sanitizeString(title),
        description: sanitizeString(description),
        status: sanitizeString(status)
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'addIncident', { title });
  }
}

// ===============================
// STATUS SUBSCRIBERS
// ===============================

async function addSubscriber(email) {
  try {
    const { error } = await adminSupabase
      .from('status_subscribers')
      .upsert(
        { email: normalizeEmail(email) },
        { onConflict: 'email', ignore: true }
      );

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'addSubscriber', { email });
  }
}

async function getSubscribers() {
  try {
    const { data, error } = await adminSupabase
      .from('status_subscribers')
      .select('email')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getSubscribers');
  }
}

async function removeSubscriber(email) {
  try {
    const { error } = await adminSupabase
      .from('status_subscribers')
      .delete()
      .eq('email', normalizeEmail(email));

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'removeSubscriber', { email });
  }
}

// ===============================
// GENERATED MEDIA
// ===============================

async function saveGeneratedMedia(userJwt, userId, organizationId, media_type, file_url, metadata = {}) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const id = uuidv4();
    const { data, error } = await supabase
      .from('generated_media')
      .insert({
        id,
        organization_id: organizationId,
        created_by: userId,
        media_type: sanitizeString(media_type),
        file_url: sanitizeString(file_url),
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'saveGeneratedMedia', { userId, organizationId, media_type });
  }
}

async function getGeneratedMedia(userJwt, organizationId, media_type = null, page = 1, limit = DEFAULT_PAGE_LIMIT) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    let query = supabase
      .from('generated_media')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (media_type && media_type !== 'all') {
      query = query.eq('media_type', sanitizeString(media_type));
    }

    const result = await getPaginatedResults(query, page, limit, true);
    return result;
  } catch (error) {
    handleError(error, 'getGeneratedMedia', { organizationId, media_type, page, limit });
  }
}

async function deleteGeneratedMedia(userJwt, userId, organizationId, mediaId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    await validateOrganizationAccess(userId, organizationId);
    
    const { error } = await supabase
      .from('generated_media')
      .delete()
      .eq('id', mediaId)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteGeneratedMedia', { userId, organizationId, mediaId });
  }
}

async function getMediaStats(userJwt, organizationId) {
  try {
    const supabase = getUserSupabaseClient(userJwt);
    
    const { data, error } = await supabase
      .from('generated_media')
      .select('media_type')
      .eq('organization_id', organizationId);

    if (error) throw error;
    
    const stats = {
      total: data?.length || 0,
      images: data?.filter(m => m.media_type === 'image').length || 0,
      videos: data?.filter(m => m.media_type === 'video').length || 0,
      scripts: data?.filter(m => m.media_type === 'script').length || 0,
      audio: data?.filter(m => m.media_type === 'audio').length || 0
    };
    
    return stats;
  } catch (error) {
    handleError(error, 'getMediaStats', { organizationId });
  }
}

// ===============================
// ADMIN INITIALIZATION (System only)
// ===============================

async function createAdminIfNotExists(email, hashedPassword) {
  try {
    const cleanEmail = normalizeEmail(email);
    
    const existing = await getUserByEmail(cleanEmail);
    if (existing) return existing;

    const orgId = uuidv4();
    
    const { data: org, error: orgError } = await adminSupabase
      .from('organizations')
      .insert({
        id: orgId,
        name: "Admin Organization",
        slug: "admin-org",
        plan: 'agency',
        created_by: '00000000-0000-0000-0000-000000000000',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orgError) throw orgError;
    
    const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
      email: cleanEmail,
      password: hashedPassword,
      email_confirm: true,
      user_metadata: {
        organization_id: orgId,
        business_name: "Admin Business",
        is_admin: true
      }
    });

    if (authError) throw authError;

    const userId = authUser.user.id;

    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .insert({
        id: userId,
        email: cleanEmail,
        business_name: "Admin Business",
        plan: 'agency',
        is_verified: 1,
        plan_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        business_profile: {},
        subscription_status: 'active'
      })
      .select()
      .single();

    if (userError) {
      await adminSupabase.auth.admin.deleteUser(userId);
      throw userError;
    }

    await adminSupabase
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id: userId,
        role: 'owner',
        created_at: new Date().toISOString()
      });

    await initializeOrganizationSettings(orgId);

    return { id: userId, email: cleanEmail, organizationId: orgId };
  } catch (error) {
    handleError(error, 'createAdminIfNotExists', { email });
  }
}

// ===============================
// EXPORTS
// ===============================

module.exports = {
  // Core
  adminSupabase,
  getUserSupabaseClient,
  getClientWithToken,
  
  // Pagination constants
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  
  // Organization / Tenant
  createOrganization,
  getOrganizationBySlug,
  getOrganizationById,
  getUserOrganizations,
  addOrganizationMember,
  removeOrganizationMember,
  updateOrganizationMemberRole,
  getOrganizationUsers,
  validateOrganizationAccess,
  
  // Users
  createUser,
  verifyUser,
  getUserByEmail,
  getUserByBusinessId,
  getUserById,
  
  // Business Profile
  getBusinessProfile,
  updateBusinessProfile,
  
  // Weekly Reports
  saveWeeklyReport,
  getWeeklyReports,
  getLatestWeeklyReport,
  
  // Health Scans
  saveHealthScan,
  getHealthScans,
  getLatestHealthScan,
  
  // AI Recommendations
  saveAiRecommendation,
  getPendingRecommendations,
  updateRecommendationStatus,
  
  // Settings
  updateWidgetSettings,
  updateSmartSettings,
  getSmartSettings,
  
  // Business Identity
  saveBusinessIdentity,
  getBusinessIdentity,
  
  // Tool States
  saveToolState,
  getToolStates,
  deleteToolState,
  
  // Support
  saveSupportTicket,
  updateBusinessAbout,
  
  // Knowledge Base
  addKnowledge,
  getKnowledgeByOrganization,
  deleteKnowledge,
  
  // Widget
  setWidgetKey,
  getWidgetKey,
  
  // Monetization
  getOrganizationSubscription,
  updateSubscriptionStatus,
  checkPlanLimits,
  
  // Plan & Usage (Pure RPC - Race Condition Safe)
  incrementMessagesUsed,
  incrementLeadsUsed,
  
  // Leads
  saveLead,
  getLeadsByOrganization,
  getLeadById,
  updateLeadStatus,
  deleteLead,
  
  // Chats
  saveChat,
  getChatsByOrganization,
  getChatsBySession,
  
  // Automations
  createAutomation,
  getAutomationsByOrganization,
  getAutomationById,
  updateAutomation,
  deleteAutomation,
  incrementAutomationTriggers,
  
  // Automation Runs
  createAutomationRun,
  completeAutomationRun,
  getAutomationRuns,
  
  // Automation Templates
  getAutomationTemplates,
  getAutomationTemplateBySlug,
  incrementTemplateUsage,
  
  // User Automations
  createUserAutomation,
  getUserAutomations,
  getUserAutomationById,
  updateUserAutomation,
  deleteUserAutomation,
  
  // Lead Sources
  createLeadSource,
  getLeadSources,
  updateLeadSourceStats,
  
  // Connected Accounts
  saveConnectedAccount,
  getConnectedAccounts,
  deleteConnectedAccount,
  updateAccountLastSync,
  
  // Activity Log
  logActivity,
  getRecentActivity,
  
  // Governance
  getGovernanceSettings,
  updateGovernanceSettings,
  
  // Alerts
  createAlert,
  getActiveAlerts,
  resolveAlert,
  
  // Usage Logs
  logUsage,
  getUsageStats,
  
  // Mobile Instances
  spawnMobileInstance,
  getMobileInstances,
  terminateMobileInstance,
  
  // Broadcasts
  saveBroadcast,
  getBroadcastsByUser,
  getBroadcastStats,
  
  // Incidents
  getIncidents,
  addIncident,
  
  // Status Subscribers
  addSubscriber,
  getSubscribers,
  removeSubscriber,
  
  // Generated Media
  saveGeneratedMedia,
  getGeneratedMedia,
  deleteGeneratedMedia,
  getMediaStats,
  
  // Admin
  createAdminIfNotExists
};