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
// CREATE CLIENT
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
    console.warn('⚠️ [SUPABASE] Missing credentials - running with in-memory storage');
    // Create a simple in-memory storage for development
    supabase = createInMemoryClient();
  }
} catch (error) {
  console.error('❌ [SUPABASE] Failed to create client:', error.message);
  supabase = createInMemoryClient();
}

// Create in-memory client for when database is not available
function createInMemoryClient() {
  console.log('📦 [SUPABASE] Using in-memory storage');
  
  const storage = {
    users: [],
    workflows: [],
    executions: [],
    gallery: [],
    leads: [],
    automations: [],
    connected_apps: [],
    social_posts: [],
    email_logs: [],
    webhook_registrations: []
  };
  
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 6);
  
  return {
    from: (table) => ({
      select: (columns) => ({
        eq: (field, value) => ({
          single: async () => {
            const items = storage[table]?.filter(item => item[field] === value) || [];
            return { data: items[0] || null, error: null };
          },
          maybeSingle: async () => {
            const items = storage[table]?.filter(item => item[field] === value) || [];
            return { data: items[0] || null, error: null };
          },
          order: (col, { ascending }) => ({
            limit: (limit) => ({
              range: (from, to) => ({
                data: (storage[table] || [])
                  .sort((a, b) => ascending ? a[col] - b[col] : b[col] - a[col])
                  .slice(from, to + 1),
                error: null
              })
            })
          }),
          then: (callback) => callback({ data: storage[table] || [], error: null })
        }),
        insert: (data) => ({
          select: () => ({
            single: async () => {
              const newItem = { 
                ...data, 
                id: data.id || generateId(), 
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              if (!storage[table]) storage[table] = [];
              storage[table].push(newItem);
              return { data: newItem, error: null };
            }
          }),
          then: (callback) => {
            const newItem = { 
              ...data, 
              id: data.id || generateId(), 
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            if (!storage[table]) storage[table] = [];
            storage[table].push(newItem);
            callback({ data: newItem, error: null });
          }
        }),
        update: (data) => ({
          eq: (field, value) => ({
            select: () => ({
              single: async () => {
                const index = storage[table]?.findIndex(item => item[field] === value);
                if (index !== -1 && index !== undefined) {
                  storage[table][index] = { ...storage[table][index], ...data, updated_at: new Date().toISOString() };
                  return { data: storage[table][index], error: null };
                }
                return { data: null, error: new Error('Not found') };
              }
            }),
            then: (callback) => {
              const index = storage[table]?.findIndex(item => item[field] === value);
              if (index !== -1 && index !== undefined) {
                storage[table][index] = { ...storage[table][index], ...data, updated_at: new Date().toISOString() };
                callback({ data: storage[table][index], error: null });
              } else {
                callback({ data: null, error: new Error('Not found') });
              }
            }
          })
        }),
        delete: () => ({
          eq: (field, value) => ({
            then: (callback) => {
              const initialLength = storage[table]?.length || 0;
              storage[table] = (storage[table] || []).filter(item => item[field] !== value);
              callback({ data: { count: initialLength - (storage[table]?.length || 0) }, error: null });
            }
          })
        })
      })
    }),
    auth: {
      getUser: async () => ({ data: { user: { id: 'mock_user_id', email: 'mock@example.com' } }, error: null })
    }
  };
}

module.exports = supabase;