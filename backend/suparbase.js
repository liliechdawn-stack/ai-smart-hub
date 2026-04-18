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
// SIMPLE EXPORT - JUST THE CLIENT
// ================================================

module.exports = supabase;