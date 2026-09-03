// ================================================
// SUPABASE.JS - MULTI-TENANT SAAS CONFIGURATION
// ================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('❌ [SUPABASE] CRITICAL: SUPABASE_URL environment variable is missing.');
}

// 1. Service Role Client (Bypasses RLS - Backend Admin Tasks Only)
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' }
    })
  : null;

// 2. Anonymous/Public Client (Enforces RLS)
const supabasePublic = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' }
    })
  : null;

if (!supabaseAdmin && process.env.NODE_ENV === 'production') {
  console.error('⚠️ [SUPABASE] Warning: SUPABASE_SERVICE_ROLE_KEY missing. Admin bypass operations will fail.');
}

// Helper to acquire user record scoped safely
async function getUserById(userId) {
  if (!supabaseAdmin) throw new Error('Database client uninitialized');
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, business_name, plan, is_verified, widget_color, messages_used, leads_used, widget_key, created_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error(`[Supabase Error] getUserById (${userId}):`, error.message);
      return null;
    }

    return {
      ...data,
      name: data.business_name || data.email || 'Workspace User'
    };
  } catch (error) {
    console.error(`[System Error] getUserById:`, error.message);
    throw error;
  }
}

async function getUserByEmail(email) {
  if (!supabaseAdmin) throw new Error('Database client uninitialized');
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, business_name, plan, is_verified, password')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    console.error(`[System Error] getUserByEmail:`, error.message);
    throw error;
  }
}

// Export default admin client for legacy compatibility, alongside explicit exports
module.exports = supabaseAdmin || supabasePublic;
module.exports.supabaseAdmin = supabaseAdmin;
module.exports.supabasePublic = supabasePublic;
module.exports.getUserById = getUserById;
module.exports.getUserByEmail = getUserByEmail;