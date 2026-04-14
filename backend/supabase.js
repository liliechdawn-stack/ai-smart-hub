// ================================================
// SUPABASE.JS - Enterprise Database Configuration
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
// INITIALIZE CLIENT (SIMPLE VERSION - NO COMPLEX EXPORTS)
// ================================================

let supabaseClient = null;
let isConnected = false;

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = `[SUPABASE] ${timestamp}`;
  if (level === 'error') console.error(`${prefix} ❌ ${message}`);
  else if (level === 'warn') console.warn(`${prefix} ⚠️ ${message}`);
  else console.log(`${prefix} 📦 ${message}`);
}

// Initialize the client
async function initSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    log('Missing Supabase credentials', 'error');
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Supabase credentials are required in production');
    }
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-application-name': 'workflow-studio',
          'x-client-info': 'workflow-studio-backend'
        }
      }
    });
    
    // Test connection
    const { error } = await supabaseClient
      .from('users')
      .select('count', { count: 'exact', head: true })
      .limit(1);
    
    if (error) throw error;
    
    isConnected = true;
    log('Supabase client initialized successfully', 'success');
    return supabaseClient;
    
  } catch (error) {
    log(`Connection failed: ${error.message}`, 'error');
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return null;
  }
}

// Create a mock client for development
function createMockClient() {
  log('Creating mock Supabase client for development', 'warn');
  
  const inMemoryStore = {
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
  
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);
  
  const mockClient = {
    from: (table) => ({
      select: () => ({
        eq: (field, value) => ({
          single: async () => {
            const items = inMemoryStore[table]?.filter(item => item[field] === value) || [];
            return { data: items[0] || null, error: null };
          },
          maybeSingle: async () => {
            const items = inMemoryStore[table]?.filter(item => item[field] === value) || [];
            return { data: items[0] || null, error: null };
          },
          order: (col, { ascending }) => ({
            limit: (limit) => ({
              range: (from, to) => ({
                data: (inMemoryStore[table] || [])
                  .sort((a, b) => ascending ? a[col] - b[col] : b[col] - a[col])
                  .slice(from, to + 1),
                error: null
              })
            })
          }),
          then: (callback) => callback({ data: inMemoryStore[table] || [], error: null })
        }),
        in: (field, values) => ({
          then: (callback) => callback({ 
            data: (inMemoryStore[table] || []).filter(item => values.includes(item[field])), 
            error: null 
          })
        }),
        order: (col, { ascending }) => ({
          then: (callback) => callback({ 
            data: (inMemoryStore[table] || []).sort((a, b) => ascending ? a[col] - b[col] : b[col] - a[col]), 
            error: null 
          })
        }),
        limit: (limit) => ({
          then: (callback) => callback({ data: (inMemoryStore[table] || []).slice(0, limit), error: null })
        }),
        single: async () => {
          const items = inMemoryStore[table] || [];
          return { data: items[0] || null, error: null };
        },
        then: (callback) => callback({ data: inMemoryStore[table] || [], error: null }),
        range: (from, to) => ({
          then: (callback) => callback({ 
            data: (inMemoryStore[table] || []).slice(from, to + 1), 
            error: null 
          })
        })
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
            if (!inMemoryStore[table]) inMemoryStore[table] = [];
            inMemoryStore[table].push(newItem);
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
          if (!inMemoryStore[table]) inMemoryStore[table] = [];
          inMemoryStore[table].push(newItem);
          callback({ data: newItem, error: null });
        }
      }),
      update: (data) => ({
        eq: (field, value) => ({
          select: () => ({
            single: async () => {
              const index = inMemoryStore[table]?.findIndex(item => item[field] === value);
              if (index !== -1 && index !== undefined) {
                inMemoryStore[table][index] = { 
                  ...inMemoryStore[table][index], 
                  ...data, 
                  updated_at: new Date().toISOString() 
                };
                return { data: inMemoryStore[table][index], error: null };
              }
              return { data: null, error: new Error('Not found') };
            }
          }),
          then: (callback) => {
            const index = inMemoryStore[table]?.findIndex(item => item[field] === value);
            if (index !== -1 && index !== undefined) {
              inMemoryStore[table][index] = { 
                ...inMemoryStore[table][index], 
                ...data, 
                updated_at: new Date().toISOString() 
              };
              callback({ data: inMemoryStore[table][index], error: null });
            } else {
              callback({ data: null, error: new Error('Not found') });
            }
          }
        })
      }),
      delete: () => ({
        eq: (field, value) => ({
          then: (callback) => {
            const initialLength = inMemoryStore[table]?.length || 0;
            inMemoryStore[table] = (inMemoryStore[table] || []).filter(item => item[field] !== value);
            callback({ data: { count: initialLength - (inMemoryStore[table]?.length || 0) }, error: null });
          }
        })
      })
    }),
    rpc: (fn, params) => ({
      then: (callback) => callback({ data: [], error: null })
    }),
    auth: {
      signUp: async ({ email, password }) => ({ 
        data: { user: { id: generateId(), email }, session: null }, 
        error: null 
      }),
      signInWithPassword: async ({ email, password }) => ({ 
        data: { user: { id: generateId(), email }, session: { access_token: 'mock_token_' + generateId() } }, 
        error: null 
      }),
      getUser: async () => ({ 
        data: { user: { id: 'mock_user_id', email: 'mock@example.com' } }, 
        error: null 
      }),
      getSession: async () => ({ 
        data: { session: { access_token: 'mock_token' } }, 
        error: null 
      }),
      signOut: async () => ({ error: null })
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, file) => ({ data: { path }, error: null }),
        download: async (path) => ({ data: Buffer.from('mock file content'), error: null }),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://mock-storage.com/${path}` } })
      })
    }
  };
  
  return mockClient;
}

// Initialize the client
let supabase = null;

// Start initialization
(async () => {
  try {
    const client = await initSupabase();
    if (client) {
      supabase = client;
    } else if (process.env.NODE_ENV !== 'production') {
      supabase = createMockClient();
    }
  } catch (error) {
    console.error('Failed to initialize Supabase:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      supabase = createMockClient();
    }
  }
})();

// ================================================
// SIMPLE EXPORTS - FIXED
// ================================================

// Export the client directly (may be null initially, but that's OK)
module.exports = supabase;

// Also export a promise that resolves when client is ready
module.exports.ready = new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (supabase !== null) {
      clearInterval(checkInterval);
      resolve(supabase);
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => {
    clearInterval(checkInterval);
    if (supabase === null && process.env.NODE_ENV !== 'production') {
      supabase = createMockClient();
      resolve(supabase);
    }
  }, 10000);
});

// Export utility functions
module.exports.getConnectionStatus = () => ({
  isConnected: supabase !== null,
  hasClient: supabase !== null,
  environment: process.env.NODE_ENV || 'development'
});