const { createClient } = require('@supabase/supabase-js');

let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Shared Supabase initialization:', { 
  urlExists: !!supabaseUrl, 
  keyExists: !!supabaseKey,
  nodeEnv: process.env.NODE_ENV
});

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Available env vars:', 
    Object.keys(process.env).filter(key => 
      key.includes('SUPABASE') || key.includes('DB') || key.includes('DATABASE')
    )
  );
  
  // In production, we want to crash if credentials are missing
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Supabase credentials are required in production');
  }
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Shared Supabase client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize shared Supabase client:', error.message);
    throw error;
  }
}

module.exports = supabase;