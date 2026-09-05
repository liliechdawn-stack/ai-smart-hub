// ================================================
// SUPABASE.JS - SIMPLE RELIABLE CONFIGURATION
// ================================================

const { createClient } = require('@supabase/supabase-js');

// ================================================
// CONFIGURATION
// ================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                   process.env.SUPABASE_ANON_KEY || 
                   process.env.SUPABASE_KEY ||
                   process.env.VITE_SUPABASE_ANON_KEY;

// ================================================
// CREATE CLIENT (SIMPLE - NO CIRCULAR EXPORTS)
// ================================================

let supabase = null;

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      }
    });
    console.log('✅ [SUPABASE] Client initialized successfully');
  } else {
    console.warn('⚠️ [SUPABASE] Missing credentials - running without database');
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ [SUPABASE] CRITICAL: Database credentials missing in production!');
    }
  }
} catch (error) {
  console.error('❌ [SUPABASE] Failed to create client:', error.message);
}

// ================================================
// HELPER FUNCTIONS WITH ERROR HANDLING
// ================================================

async function getUserById(userId) {
  try {
    if (!supabase) return null;
    
    // Try to get user with fallback column names
    const { data, error } = await supabase
      .from('users')
      .select('id, email, business_name, plan, is_verified, widget_color, messages_used, leads_used, widget_key, business_profile, created_at, updated_at')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching user:', error.message);
      return null;
    }
    
    // Add a name field for compatibility (use business_name or email)
    if (data && !data.name) {
      data.name = data.business_name || data.email || 'User';
    }
    
    return data;
  } catch (error) {
    console.error('getUserById error:', error.message);
    return null;
  }
}

async function getUserByEmail(email) {
  try {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('users')
      .select('id, email, business_name, plan, is_verified, password')
      .eq('email', email)
      .single();
    
    if (error) return null;
    return data;
  } catch (error) {
    console.error('getUserByEmail error:', error.message);
    return null;
  }
}

// ================================================
// SIMPLE EXPORT - JUST THE CLIENT
// ================================================

module.exports = supabase;

// Export helper functions
module.exports.getUserById = getUserById;
module.exports.getUserByEmail = getUserByEmail;