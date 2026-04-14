// ================================================
// CREATE MOCK CLIENT (for development without DB)
// ================================================

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
    webhook_registrations: [],
    weekly_reports: [],
    health_scans: []
  };
  
  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);
  
  return {
    from: (table) => ({
      select: (columns) => ({
        eq: (field, value) => ({
          single: async () => {
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
          maybeSingle: async () => {
            const items = inMemoryStore[table]?.filter(item => item[field] === value) || [];
            return { data: items[0] || null, error: null };
          },
          then: (callback) => callback({ data: items, error: null })
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
        maybeSingle: async () => {
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
}

// ================================================
// INITIALIZE CLIENT
// ================================================

async function initialize() {
  log('Initializing Supabase module...');
  
  try {
    const client = await createSupabaseClientWithRetry();
    
    if (client) {
      supabase = client;
      isConnected = true;
      startHealthCheck();
    } else if (process.env.NODE_ENV !== 'production') {
      log('Creating mock client for development', 'warn');
      supabase = createMockClient();
      isConnected = true;
    } else {
      throw new Error('Failed to initialize Supabase client in production');
    }
    
    return supabase;
    
  } catch (error) {
    log(`Initialization failed: ${error.message}`, 'error');
    throw error;
  }
}

// ================================================
// GRACEFUL SHUTDOWN
// ================================================

async function shutdown() {
  log('Shutting down Supabase module...');
  stopHealthCheck();
  
  if (supabase && supabase.auth) {
    try {
      log('Cleanup completed', 'success');
    } catch (error) {
      log(`Cleanup error: ${error.message}`, 'error');
    }
  }
  
  supabase = null;
  isConnected = false;
  log('Shutdown complete', 'info');
}

// ================================================
// INITIALIZE IMMEDIATELY
// ================================================

// Initialize immediately but don't block
initialize().catch(error => {
  log(`Failed to initialize Supabase: ${error.message}`, 'error');
});

// ================================================
// EXPORTS - FIXED VERSION
// ================================================

// Export the client as the main export
module.exports = supabase;

// Add utility functions as properties on the exported object
// But since supabase might be null initially, we need to handle that
if (module.exports) {
  module.exports.getConnectionStatus = getConnectionStatus;
  module.exports.checkHealth = checkHealth;
  module.exports.executeWithRetry = executeWithRetry;
  module.exports.shutdown = shutdown;
  module.exports.initialize = initialize;
}