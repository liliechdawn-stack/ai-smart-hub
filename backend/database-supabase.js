// backend/database-supabase.js
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase client initialized');

// ===============================
// HELPER FUNCTIONS
// ===============================

/**
 * Handle Supabase errors consistently
 */
function handleError(error, operation) {
  console.error(`❌ Database error in ${operation}:`, error);
  throw new Error(`Database operation failed: ${operation}`);
}

/**
 * Get single row or null
 */
function getSingle(result) {
  if (result.error) throw result.error;
  return result.data?.[0] || null;
}

/**
 * Get all rows
 */
function getAll(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

// ===============================
// USERS / BUSINESSES
// ===============================

async function createUser(email, password, business_id, business_name, vToken) {
  try {
    const cleanEmail = email.toLowerCase().trim();
    
    // Insert user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: cleanEmail,
        password,
        business_id,
        business_name,
        verification_token: vToken
      })
      .select()
      .single();

    if (userError) throw userError;

    // Initialize smart hub settings
    const { error: settingsError } = await supabase
      .from('smart_hub_settings')
      .insert({ user_id: user.id });

    if (settingsError) throw settingsError;

    // Initialize governance settings
    const { error: govError } = await supabase
      .from('governance_settings')
      .insert({ user_id: user.id });

    if (govError && !govError.message.includes('duplicate')) throw govError;

    return user.id;
  } catch (error) {
    handleError(error, 'createUser');
  }
}

async function verifyUser(token) {
  try {
    const { data, error } = await supabase
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
    handleError(error, 'verifyUser');
  }
}

async function getUserByEmail(email) {
  try {
    const cleanEmail = email.toLowerCase().trim();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserByEmail');
  }
}

async function getUserByBusinessId(business_id) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('business_id', business_id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserByBusinessId');
  }
}

async function getUserById(id) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserById');
  }
}

// ===============================
// SAAS CUSTOMIZATION
// ===============================

async function updateWidgetSettings(user_id, color, welcomeMsg, tone) {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        widget_color: color,
        welcome_message: welcomeMsg,
        ai_tone: tone
      })
      .eq('id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateWidgetSettings');
  }
}

async function updateSmartSettings(user_id, toolType, data) {
  try {
    // Ensure entry exists
    await supabase
      .from('smart_hub_settings')
      .upsert({ user_id }, { onConflict: 'user_id' });

    let updateData = {};

    switch(toolType) {
      case 'brain':
        updateData = {
          ai_instructions: data.instructions,
          ai_temp: data.temp,
          ai_lang: data.lang,
          brain_active: 1
        };
        break;
      case 'booking':
        updateData = {
          booking_url: data.url,
          booking_active: 1
        };
        break;
      case 'sentiment':
        updateData = {
          sentiment_enabled: data.enabled ? 1 : 0,
          alert_email: data.email,
          sentiment_active: 1
        };
        break;
      case 'handover':
        updateData = {
          handover_trigger: data.trigger,
          handover_active: 1
        };
        break;
      case 'webhook':
        updateData = {
          webhook_url: data.url,
          webhook_active: 1
        };
        break;
      case 'apollo':
        updateData = {
          apollo_active: data.active ? 1 : 0,
          apollo_key: data.apiKey || null,
          auto_sync: data.autoSync ? 1 : 0
        };
        break;
      case 'vision':
        updateData = {
          vision_active: data.active ? 1 : 0,
          vision_sensitivity: data.sensitivity || 'high',
          vision_area: data.area || 'all'
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
        throw new Error("Invalid toolType provided to updateSmartSettings");
    }

    const { error } = await supabase
      .from('smart_hub_settings')
      .update(updateData)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateSmartSettings');
  }
}

async function getSmartSettings(user_id) {
  try {
    // Get user booking_url and smart settings
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('booking_url')
      .eq('id', user_id)
      .single();

    if (userError && userError.code !== 'PGRST116') throw userError;

    const { data: settings, error: settingsError } = await supabase
      .from('smart_hub_settings')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle();

    if (settingsError) throw settingsError;

    return {
      ...(settings || {}),
      booking_url: user?.booking_url || settings?.booking_url || ''
    };
  } catch (error) {
    handleError(error, 'getSmartSettings');
  }
}

// ===============================
// BUSINESS IDENTITY FUNCTIONS
// ===============================

async function saveBusinessIdentity(user_id, business_type, business_description) {
  try {
    const { error } = await supabase
      .from('business_identity')
      .upsert({
        user_id,
        business_type,
        business_description
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'saveBusinessIdentity');
  }
}

async function getBusinessIdentity(user_id) {
  try {
    const { data, error } = await supabase
      .from('business_identity')
      .select('business_type, business_description, created_at, updated_at')
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) throw error;
    return data || { business_type: '', business_description: '' };
  } catch (error) {
    handleError(error, 'getBusinessIdentity');
  }
}

// ===============================
// TOOL STATE FUNCTIONS
// ===============================

async function saveToolState(user_id, toolType, isActive) {
  try {
    const { error } = await supabase
      .from('tool_states')
      .upsert({
        user_id,
        tool_type: toolType,
        is_active: isActive ? 1 : 0
      }, {
        onConflict: 'user_id, tool_type'
      });

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'saveToolState');
  }
}

async function getToolStates(user_id) {
  try {
    const { data, error } = await supabase
      .from('tool_states')
      .select('tool_type, is_active')
      .eq('user_id', user_id);

    if (error) throw error;
    
    const states = {};
    (data || []).forEach(row => {
      states[row.tool_type] = row.is_active === 1;
    });
    return states;
  } catch (error) {
    handleError(error, 'getToolStates');
  }
}

async function deleteToolState(user_id, toolType) {
  try {
    const { error } = await supabase
      .from('tool_states')
      .delete()
      .eq('user_id', user_id)
      .eq('tool_type', toolType);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteToolState');
  }
}

// ===============================
// SUPPORT & ABOUT FUNCTIONS
// ===============================

async function saveSupportTicket(user_id, subject, message) {
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id,
        subject,
        message
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'saveSupportTicket');
  }
}

async function updateBusinessAbout(user_id, aboutText) {
  try {
    const { error } = await supabase
      .from('users')
      .update({ about_business: aboutText })
      .eq('id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateBusinessAbout');
  }
}

// ===============================
// KNOWLEDGE BASE
// ===============================

async function addKnowledge(user_id, content, type = 'text') {
  try {
    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        user_id,
        content,
        source_type: type
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'addKnowledge');
  }
}

async function getKnowledgeByUser(user_id) {
  try {
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('id, content, source_type, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getKnowledgeByUser');
  }
}

async function deleteKnowledge(knowledge_id, user_id) {
  try {
    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('id', knowledge_id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteKnowledge');
  }
}

// ===============================
// WIDGET KEY
// ===============================

async function setWidgetKey(user_id, widget_key) {
  try {
    const { error } = await supabase
      .from('users')
      .update({ widget_key })
      .eq('id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'setWidgetKey');
  }
}

async function getWidgetKey(user_id) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('widget_key')
      .eq('id', user_id)
      .maybeSingle();

    if (error) throw error;
    return data ? data.widget_key : null;
  } catch (error) {
    handleError(error, 'getWidgetKey');
  }
}

// ===============================
// PLAN & USAGE
// ===============================

async function updatePlan(user_id, plan) {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        plan,
        messages_used: 0,
        leads_used: 0,
        plan_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updatePlan');
  }
}

async function incrementMessagesUsed(user_id) {
  try {
    const { error } = await supabase.rpc('increment_messages_used', {
      user_id_param: user_id
    });

    if (error) {
      // Fallback if RPC doesn't exist
      const { data: user } = await supabase
        .from('users')
        .select('messages_used')
        .eq('id', user_id)
        .single();

      await supabase
        .from('users')
        .update({ messages_used: (user.messages_used || 0) + 1 })
        .eq('id', user_id);
    }

    return true;
  } catch (error) {
    handleError(error, 'incrementMessagesUsed');
  }
}

async function incrementLeadsUsed(user_id) {
  try {
    const { error } = await supabase.rpc('increment_leads_used', {
      user_id_param: user_id
    });

    if (error) {
      // Fallback if RPC doesn't exist
      const { data: user } = await supabase
        .from('users')
        .select('leads_used')
        .eq('id', user_id)
        .single();

      await supabase
        .from('users')
        .update({ leads_used: (user.leads_used || 0) + 1 })
        .eq('id', user_id);
    }

    return true;
  } catch (error) {
    handleError(error, 'incrementLeadsUsed');
  }
}

// ===============================
// LEADS
// ===============================

async function saveLead(user_id, name, email, phone, company = '', job_title = '', message = "") {
  try {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        user_id,
        name,
        email,
        phone,
        company,
        job_title,
        message
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'saveLead');
  }
}

async function getLeadsByUser(user_id) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getLeadsByUser');
  }
}

async function getLeadByEmail(user_id, email) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', user_id)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getLeadByEmail');
  }
}

async function updateLeadStatus(lead_id, user_id, status, notes = null) {
  try {
    const updateData = { status, updated_at: new Date().toISOString() };
    if (notes) updateData.notes = notes;
    
    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', lead_id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateLeadStatus');
  }
}

async function getLeadScore(lead_id, user_id) {
  try {
    const { data, error } = await supabase
      .from('lead_scores')
      .select('score, scored_at')
      .eq('lead_id', lead_id)
      .eq('user_id', user_id)
      .order('scored_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getLeadScore');
  }
}

async function saveLeadScore(lead_id, user_id, score, criteria = {}) {
  try {
    const { error } = await supabase
      .from('lead_scores')
      .insert({
        lead_id,
        user_id,
        score,
        criteria,
        scored_at: new Date().toISOString()
      });

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'saveLeadScore');
  }
}

// ===============================
// CHATS
// ===============================

async function saveChat(id, user_id, session_id, client_name, message, response, sentiment = 'neutral') {
  try {
    const { error } = await supabase
      .from('chats')
      .insert({
        id,
        user_id,
        session_id,
        client_name,
        message,
        response,
        sentiment
      });

    if (error) throw error;
    return id;
  } catch (error) {
    handleError(error, 'saveChat');
  }
}

async function getChatsByUser(user_id) {
  try {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getChatsByUser');
  }
}

async function getChatsBySession(session_id, user_id) {
  try {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('session_id', session_id)
      .eq('user_id', user_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getChatsBySession');
  }
}

// ===============================
// NOTIFICATION SETTINGS
// ===============================

async function getNotificationSettings(userId) {
  try {
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    
    return data || {
      user_id: userId,
      email_notifications: 1,
      slack_webhook: null,
      discord_webhook: null,
      notify_on_success: 1,
      notify_on_failure: 1,
      notify_on_daily_summary: 1
    };
  } catch (error) {
    handleError(error, 'getNotificationSettings');
  }
}

async function saveNotificationSettings(userId, settings) {
  try {
    const { error } = await supabase
      .from('notification_settings')
      .upsert({
        user_id: userId,
        email_notifications: settings.email_notifications ? 1 : 0,
        slack_webhook: settings.slack_webhook || null,
        discord_webhook: settings.discord_webhook || null,
        notify_on_success: settings.notify_on_success ? 1 : 0,
        notify_on_failure: settings.notify_on_failure ? 1 : 0,
        notify_on_daily_summary: settings.notify_on_daily_summary ? 1 : 0
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    handleError(error, 'saveNotificationSettings');
  }
}

// ===============================
// API KEYS
// ===============================

async function createApiKey(userId, name, platform) {
  try {
    const id = uuidv4();
    const apiKey = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        id,
        user_id: userId,
        name,
        platform,
        api_key: apiKey,
        created_at: now
      })
      .select()
      .single();

    if (error) throw error;
    
    return {
      id: data.id,
      api_key: data.api_key,
      name: data.name,
      platform: data.platform,
      created_at: data.created_at
    };
  } catch (error) {
    handleError(error, 'createApiKey');
  }
}

async function getApiKeys(userId) {
  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, platform, api_key, last_used, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getApiKeys');
  }
}

async function deleteApiKey(keyId, userId) {
  try {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    handleError(error, 'deleteApiKey');
  }
}

async function updateApiKeyLastUsed(keyId) {
  try {
    const { error } = await supabase
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('id', keyId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    handleError(error, 'updateApiKeyLastUsed');
  }
}

async function validateApiKey(apiKey) {
  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'validateApiKey');
  }
}

// ===============================
// ADMIN INITIALIZATION
// ===============================

async function createAdminIfNotExists(email, hashedPassword) {
  try {
    const cleanEmail = email.toLowerCase().trim();
    
    // Check if admin exists
    const existing = await getUserByEmail(cleanEmail);
    if (existing) return existing;

    const business_id = "admin_business";
    
    // Create admin user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: cleanEmail,
        password: hashedPassword,
        business_id,
        business_name: "Admin Business",
        plan: 'agency',
        is_verified: 1,
        plan_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (userError) throw userError;

    // Initialize smart hub settings
    await supabase
      .from('smart_hub_settings')
      .insert({ user_id: user.id });

    // Initialize governance settings
    await supabase
      .from('governance_settings')
      .insert({ user_id: user.id });

    return { id: user.id, email: cleanEmail };
  } catch (error) {
    handleError(error, 'createAdminIfNotExists');
  }
}

// ===============================
// AI AUTOMATIONS
// ===============================

async function createAutomation(user_id, name, trigger_type, action_type, description = '', trigger_config = {}, action_config = {}) {
  try {
    const id = 'auto_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('automations')
      .insert({
        id,
        user_id,
        name,
        description,
        trigger_type,
        trigger_config,
        action_type,
        action_config,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'createAutomation');
  }
}

async function getAutomationsByUser(user_id) {
  try {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getAutomationsByUser');
  }
}

async function getAutomationById(id, user_id) {
  try {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getAutomationById');
  }
}

async function updateAutomation(id, user_id, updates) {
  try {
    const updateData = { ...updates, updated_at: new Date().toISOString() };
    
    // Handle JSON fields
    if (updateData.trigger_config && typeof updateData.trigger_config === 'object') {
      updateData.trigger_config = updateData.trigger_config;
    }
    if (updateData.action_config && typeof updateData.action_config === 'object') {
      updateData.action_config = updateData.action_config;
    }

    const { error } = await supabase
      .from('automations')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateAutomation');
  }
}

async function deleteAutomation(id, user_id) {
  try {
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteAutomation');
  }
}

async function incrementAutomationTriggers(id, user_id) {
  try {
    const { data: auto } = await supabase
      .from('automations')
      .select('trigger_count')
      .eq('id', id)
      .eq('user_id', user_id)
      .single();

    await supabase
      .from('automations')
      .update({
        trigger_count: (auto?.trigger_count || 0) + 1,
        last_run: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user_id);

    return true;
  } catch (error) {
    handleError(error, 'incrementAutomationTriggers');
  }
}

// ===============================
// AUTOMATION RUNS
// ===============================

async function createAutomationRun(id, automation_id, user_id) {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('automation_runs')
      .insert({
        id,
        automation_id,
        user_id,
        started_at: now
      });

    if (error) throw error;
    return id;
  } catch (error) {
    handleError(error, 'createAutomationRun');
  }
}

async function completeAutomationRun(id, status, result, duration, error = null) {
  try {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('automation_runs')
      .update({
        status,
        result,
        duration,
        error,
        completed_at: now
      })
      .eq('id', id);

    if (updateError) throw updateError;
    return true;
  } catch (error) {
    handleError(error, 'completeAutomationRun');
  }
}

async function getAutomationRuns(automation_id, user_id, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('automation_id', automation_id)
      .eq('user_id', user_id)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getAutomationRuns');
  }
}

// ===============================
// AUTOMATION TEMPLATES (NEW)
// ===============================

async function getAutomationTemplates(category = null, industry = null, featured = false) {
  try {
    let query = supabase
      .from('automation_templates')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('usage_count', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    if (industry && industry !== 'all') {
      query = query.contains('industry', [industry]);
    }
    
    if (featured) {
      query = query.eq('is_featured', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getAutomationTemplates');
  }
}

async function getAutomationTemplateBySlug(slug) {
  try {
    const { data, error } = await supabase
      .from('automation_templates')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getAutomationTemplateBySlug');
  }
}

async function incrementTemplateUsage(templateId) {
  try {
    const { error } = await supabase
      .from('automation_templates')
      .update({ usage_count: supabase.raw('usage_count + 1') })
      .eq('id', templateId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'incrementTemplateUsage');
  }
}

// ===============================
// USER AUTOMATIONS (NEW - Advanced)
// ===============================

async function createUserAutomation(user_id, template_id, name, description, trigger_type, trigger_config, actions, status = 'draft') {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('user_automations')
      .insert({
        id,
        user_id,
        template_id,
        name,
        description,
        status,
        trigger_type,
        trigger_config,
        actions,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'createUserAutomation');
  }
}

async function getUserAutomations(user_id, status = null) {
  try {
    let query = supabase
      .from('user_automations')
      .select('*, template:automation_templates(name, icon, color, category)')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getUserAutomations');
  }
}

async function getUserAutomationById(id, user_id) {
  try {
    const { data, error } = await supabase
      .from('user_automations')
      .select('*, template:automation_templates(*)')
      .eq('id', id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'getUserAutomationById');
  }
}

async function updateUserAutomation(id, user_id, updates) {
  try {
    const { error } = await supabase
      .from('user_automations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateUserAutomation');
  }
}

async function deleteUserAutomation(id, user_id) {
  try {
    // Delete runs first
    await supabase
      .from('automation_runs')
      .delete()
      .eq('automation_id', id);

    // Delete automation
    const { error } = await supabase
      .from('user_automations')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteUserAutomation');
  }
}

// ===============================
// LEAD SOURCES (NEW)
// ===============================

async function createLeadSource(user_id, name, type, automation_id = null, config = {}) {
  try {
    const id = uuidv4();
    const { data, error } = await supabase
      .from('lead_sources')
      .insert({
        id,
        user_id,
        automation_id,
        name,
        type,
        config
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'createLeadSource');
  }
}

async function getLeadSources(user_id) {
  try {
    const { data, error } = await supabase
      .from('lead_sources')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getLeadSources');
  }
}

async function updateLeadSourceStats(source_id, leads_generated) {
  try {
    const { error } = await supabase
      .from('lead_sources')
      .update({
        leads_count: supabase.raw('leads_count + ' + leads_generated)
      })
      .eq('id', source_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateLeadSourceStats');
  }
}

// ===============================
// CONNECTED ACCOUNTS
// ===============================

async function saveConnectedAccount(user_id, platform, account_name, api_key_encrypted, account_info = {}, gateway_url = null, connection_type = 'direct') {
  try {
    const now = new Date().toISOString();

    // Check if exists
    const { data: existing } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('user_id', user_id)
      .eq('platform', platform)
      .eq('account_name', account_name)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('connected_accounts')
        .update({
          api_key_encrypted,
          account_info,
          gateway_url,
          connection_type,
          status: 'active',
          last_sync: now,
          updated_at: now
        })
        .eq('id', existing.id);

      if (error) throw error;
      return existing.id;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('connected_accounts')
        .insert({
          user_id,
          platform,
          account_name,
          api_key_encrypted,
          account_info,
          gateway_url,
          connection_type,
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
    handleError(error, 'saveConnectedAccount');
  }
}

async function getConnectedAccounts(user_id) {
  try {
    const { data, error } = await supabase
      .from('connected_accounts')
      .select('id, platform, account_name, account_info, status, last_sync, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return (data || []).map(row => ({
      ...row,
      account_info: row.account_info || null
    }));
  } catch (error) {
    handleError(error, 'getConnectedAccounts');
  }
}

async function deleteConnectedAccount(id, user_id) {
  try {
    const { error } = await supabase
      .from('connected_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteConnectedAccount');
  }
}

async function updateAccountLastSync(id, user_id) {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('connected_accounts')
      .update({
        last_sync: now,
        updated_at: now
      })
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateAccountLastSync');
  }
}

// ===============================
// ACTIVITY LOG
// ===============================

async function logActivity(user_id, action, details, type = 'info', icon = null) {
  try {
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
        user_id,
        action,
        details,
        type,
        icon: finalIcon,
        timestamp: new Date().toISOString()
      });

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'logActivity');
  }
}

async function getRecentActivity(user_id, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', user_id)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getRecentActivity');
  }
}

// ===============================
// GOVERNANCE SETTINGS
// ===============================

async function getGovernanceSettings(user_id) {
  try {
    let { data, error } = await supabase
      .from('governance_settings')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // Create default settings
      const { data: newData, error: insertError } = await supabase
        .from('governance_settings')
        .insert({ user_id })
        .select()
        .single();

      if (insertError) throw insertError;
      data = newData;
    }

    return data || {};
  } catch (error) {
    handleError(error, 'getGovernanceSettings');
  }
}

async function updateGovernanceSettings(user_id, settings) {
  try {
    // Ensure record exists
    await supabase
      .from('governance_settings')
      .upsert({ user_id }, { onConflict: 'user_id' });

    const updateData = { ...settings, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('governance_settings')
      .update(updateData)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'updateGovernanceSettings');
  }
}

// ===============================
// ALERTS
// ===============================

async function createAlert(user_id, type, severity, title, description) {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        user_id,
        type,
        severity,
        title,
        description,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'createAlert');
  }
}

async function getActiveAlerts(user_id) {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', user_id)
      .eq('resolved', 0)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getActiveAlerts');
  }
}

async function resolveAlert(alert_id, user_id) {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({
        resolved: 1,
        resolved_at: new Date().toISOString()
      })
      .eq('id', alert_id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'resolveAlert');
  }
}

// ===============================
// USAGE LOGS
// ===============================

async function logUsage(user_id, provider, model, cost, tokens) {
  try {
    const { error } = await supabase
      .from('usage_logs')
      .insert({
        user_id,
        provider,
        model,
        cost,
        tokens,
        timestamp: new Date().toISOString()
      });

    if (error) throw error;

    // Update governance used_amount
    await supabase.rpc('increment_used_amount', {
      user_id_param: user_id,
      cost_param: cost
    });

    return true;
  } catch (error) {
    handleError(error, 'logUsage');
  }
}

async function getUsageStats(user_id, days = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('usage_logs')
      .select('provider, cost, tokens, created_at')
      .eq('user_id', user_id)
      .gte('timestamp', cutoffDate.toISOString());

    if (error) throw error;

    // Aggregate by provider
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
    handleError(error, 'getUsageStats');
  }
}

// ===============================
// MOBILE INSTANCES
// ===============================

async function spawnMobileInstance(user_id) {
  try {
    const id = 'inst_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('mobile_instances')
      .insert({
        id,
        user_id,
        created_at: now,
        last_active: now
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'spawnMobileInstance');
  }
}

async function getMobileInstances(user_id) {
  try {
    const { data, error } = await supabase
      .from('mobile_instances')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getMobileInstances');
  }
}

async function terminateMobileInstance(id, user_id) {
  try {
    const { error } = await supabase
      .from('mobile_instances')
      .update({ status: 'terminated' })
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'terminateMobileInstance');
  }
}

// ===============================
// BROADCASTS
// ===============================

async function saveBroadcast(id, user_id, subject, recipients, sent_count, failed_count, status = 'sent') {
  try {
    const { error } = await supabase
      .from('broadcasts')
      .insert({
        id,
        user_id,
        subject,
        recipients,
        sent_count,
        failed_count,
        status,
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    return id;
  } catch (error) {
    handleError(error, 'saveBroadcast');
  }
}

async function getBroadcastsByUser(user_id) {
  try {
    const { data, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getBroadcastsByUser');
  }
}

async function getBroadcastStats(user_id) {
  try {
    const { data, error } = await supabase
      .from('broadcasts')
      .select('recipients, sent_count, failed_count')
      .eq('user_id', user_id);

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
    handleError(error, 'getBroadcastStats');
  }
}

// ===============================
// INCIDENTS
// ===============================

async function getIncidents(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleError(error, 'getIncidents');
  }
}

async function addIncident(date, title, description, status = 'resolved') {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        date,
        title,
        description,
        status
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    handleError(error, 'addIncident');
  }
}

// ===============================
// STATUS SUBSCRIBERS
// ===============================

async function addSubscriber(email) {
  try {
    const { error } = await supabase
      .from('status_subscribers')
      .upsert(
        { email: email.toLowerCase().trim() },
        { onConflict: 'email', ignore: true }
      );

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'addSubscriber');
  }
}

async function getSubscribers() {
  try {
    const { data, error } = await supabase
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
    const { error } = await supabase
      .from('status_subscribers')
      .delete()
      .eq('email', email.toLowerCase().trim());

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'removeSubscriber');
  }
}

// ===============================
// GENERATED MEDIA (NEW)
// ===============================

async function saveGeneratedMedia(user_id, media_type, file_url, metadata = {}) {
  try {
    const id = uuidv4();
    const { data, error } = await supabase
      .from('generated_media')
      .insert({
        id,
        user_id,
        media_type,
        file_url,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'saveGeneratedMedia');
  }
}

async function getGeneratedMedia(user_id, media_type = null, limit = 50, offset = 0) {
  try {
    let query = supabase
      .from('generated_media')
      .select('*', { count: 'exact' })
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (media_type && media_type !== 'all') {
      query = query.eq('media_type', media_type);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { media: data || [], total: count || 0 };
  } catch (error) {
    handleError(error, 'getGeneratedMedia');
  }
}

async function deleteGeneratedMedia(media_id, user_id) {
  try {
    const { error } = await supabase
      .from('generated_media')
      .delete()
      .eq('id', media_id)
      .eq('user_id', user_id);

    if (error) throw error;
    return true;
  } catch (error) {
    handleError(error, 'deleteGeneratedMedia');
  }
}

async function getMediaStats(user_id) {
  try {
    const { data, error } = await supabase
      .from('generated_media')
      .select('media_type')
      .eq('user_id', user_id);

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
    handleError(error, 'getMediaStats');
  }
}

// ===============================
// EXPORTS
// ===============================

module.exports = {
  // Core database functions
  supabase,
  
  // Users
  createUser,
  verifyUser,
  getUserByEmail,
  getUserByBusinessId,
  getUserById,
  
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
  getKnowledgeByUser,
  deleteKnowledge,
  
  // Widget
  setWidgetKey,
  getWidgetKey,
  
  // Plan & Usage
  updatePlan,
  incrementMessagesUsed,
  incrementLeadsUsed,
  
  // Leads
  saveLead,
  getLeadsByUser,
  getLeadByEmail,
  updateLeadStatus,
  getLeadScore,
  saveLeadScore,
  
  // Chats
  saveChat,
  getChatsByUser,
  getChatsBySession,
  
  // Notification Settings
  getNotificationSettings,
  saveNotificationSettings,
  
  // API Keys
  createApiKey,
  getApiKeys,
  deleteApiKey,
  updateApiKeyLastUsed,
  validateApiKey,
  
  // Admin
  createAdminIfNotExists,
  
  // Automations (Basic)
  createAutomation,
  getAutomationsByUser,
  getAutomationById,
  updateAutomation,
  deleteAutomation,
  incrementAutomationTriggers,
  
  // Automation Runs
  createAutomationRun,
  completeAutomationRun,
  getAutomationRuns,
  
  // Automation Templates (NEW)
  getAutomationTemplates,
  getAutomationTemplateBySlug,
  incrementTemplateUsage,
  
  // User Automations (NEW - Advanced)
  createUserAutomation,
  getUserAutomations,
  getUserAutomationById,
  updateUserAutomation,
  deleteUserAutomation,
  
  // Lead Sources (NEW)
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
  
  // Generated Media (NEW)
  saveGeneratedMedia,
  getGeneratedMedia,
  deleteGeneratedMedia,
  getMediaStats
};