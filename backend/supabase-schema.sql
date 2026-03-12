-- ============================================
-- SUPABASE MIGRATION FOR AI SMART HUB
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (Businesses)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  business_id TEXT UNIQUE NOT NULL,
  business_name TEXT, 
  business_type TEXT DEFAULT 'retail',
  plan TEXT DEFAULT 'free',
  messages_used INTEGER DEFAULT 0,
  leads_used INTEGER DEFAULT 0,
  widget_key TEXT,
  is_verified INTEGER DEFAULT 0,
  verification_token TEXT,
  widget_color TEXT DEFAULT '#d4af37',
  welcome_message TEXT DEFAULT 'How can I help you today?',
  ai_tone TEXT DEFAULT 'professional',
  voice_enabled INTEGER DEFAULT 1,
  voice_pitch REAL DEFAULT 1.1,
  voice_rate REAL DEFAULT 0.9,
  about_business TEXT,
  booking_url TEXT,
  sentiment_alerts INTEGER DEFAULT 0,
  plan_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SMART HUB SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS smart_hub_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ai_instructions TEXT,
  ai_temp REAL DEFAULT 0.7,
  ai_lang TEXT DEFAULT 'auto',
  webhook_url TEXT,
  booking_url TEXT,
  handover_trigger TEXT DEFAULT 'human',
  sentiment_enabled INTEGER DEFAULT 0,
  alert_email TEXT,
  booking_active INTEGER DEFAULT 0,
  webhook_active INTEGER DEFAULT 0,
  brain_active INTEGER DEFAULT 1,
  sentiment_active INTEGER DEFAULT 0,
  handover_active INTEGER DEFAULT 0,
  apollo_active INTEGER DEFAULT 0,
  followup_active INTEGER DEFAULT 0,
  vision_active INTEGER DEFAULT 0,
  analytics_active INTEGER DEFAULT 0,
  apollo_key TEXT,
  auto_sync INTEGER DEFAULT 0,
  vision_sensitivity TEXT DEFAULT 'high',
  vision_area TEXT DEFAULT 'all'
);

-- ============================================
-- KNOWLEDGE BASE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_type TEXT, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- LEADS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CHATS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  client_name TEXT NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  sentiment TEXT DEFAULT 'neutral',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SUPPORT TICKETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AUTOMATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB,
  action_type TEXT NOT NULL,
  action_config JSONB,
  schedule TEXT,
  status TEXT DEFAULT 'active',
  trigger_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  avg_duration INTEGER DEFAULT 0,
  last_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

-- ============================================
-- AUTOMATION RUNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'running',
  result JSONB,
  duration INTEGER,
  error TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  estimated_hours INTEGER DEFAULT 0
);

-- ============================================
-- CONNECTED ACCOUNTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS connected_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  api_key_encrypted TEXT,
  account_info JSONB,
  gateway_url TEXT,
  connection_type TEXT DEFAULT 'direct',
  status TEXT DEFAULT 'active',
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(user_id, platform, account_name)
);

-- ============================================
-- PLATFORM METRICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS platform_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  metrics JSONB,
  collected_at TIMESTAMP
);

-- ============================================
-- VISION RESULTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vision_results (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT,
  analysis TEXT,
  objects_detected INTEGER DEFAULT 0,
  sentiment TEXT,
  confidence REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ACTIVITY LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  icon TEXT,
  type TEXT DEFAULT 'info',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PRICE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  competitor TEXT,
  price REAL,
  currency TEXT DEFAULT 'USD',
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INVENTORY ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  current_quantity INTEGER,
  threshold INTEGER,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- ============================================
-- LEAD SCORES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lead_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score INTEGER,
  criteria JSONB,
  scored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- GOVERNANCE SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS governance_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gpt4_policy TEXT DEFAULT 'Marketing Team Only',
  claude_policy TEXT DEFAULT 'All Teams',
  gemini_policy TEXT DEFAULT 'Executives Only',
  monthly_cap INTEGER DEFAULT 5000,
  used_amount INTEGER DEFAULT 0,
  per_user_limit INTEGER DEFAULT 200,
  cap_type TEXT DEFAULT 'soft',
  pii_redaction INTEGER DEFAULT 1,
  hipaa_mode INTEGER DEFAULT 0,
  gdpr INTEGER DEFAULT 1,
  salesforce_status TEXT DEFAULT 'connected',
  hubspot_status TEXT DEFAULT 'connected',
  shopify_status TEXT DEFAULT 'requires_auth',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

-- ============================================
-- ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT,
  severity TEXT,
  title TEXT,
  description TEXT,
  resolved INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- ============================================
-- USAGE LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT,
  model TEXT,
  cost REAL,
  tokens INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AGENT PERFORMANCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS agent_performance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  success_rate REAL,
  avg_latency INTEGER,
  total_runs INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MOBILE INSTANCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS mobile_instances (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP
);

-- ============================================
-- PROXY USAGE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS proxy_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  success_rate REAL,
  requests INTEGER,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- BROADCASTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- BUSINESS IDENTITY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS business_identity (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_type TEXT,
  business_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TOOL STATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tool_states (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tool_type)
);

-- ============================================
-- INCIDENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP,
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'resolved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- STATUS SUBSCRIBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS status_subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NOTIFICATION SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_notifications INTEGER DEFAULT 1,
  slack_webhook TEXT,
  discord_webhook TEXT,
  notify_on_success INTEGER DEFAULT 1,
  notify_on_failure INTEGER DEFAULT 1,
  notify_on_daily_summary INTEGER DEFAULT 1
);

-- ============================================
-- API KEYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  platform TEXT,
  api_key TEXT UNIQUE,
  last_used TIMESTAMP,
  created_at TIMESTAMP
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT,
  amount REAL,
  reference TEXT,
  status TEXT,
  created_at TIMESTAMP
);

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_user_id ON knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_user_id ON automation_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_id ON connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_lead_scores_user_id ON lead_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_lead_id ON lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- ============================================
-- INSERT SAMPLE INCIDENTS
-- ============================================
INSERT INTO incidents (date, title, description, status) 
SELECT 
  CURRENT_TIMESTAMP - INTERVAL '3 days', 
  'Scheduled Maintenance', 
  'Database optimization completed successfully. No downtime.', 
  'resolved'
WHERE NOT EXISTS (SELECT 1 FROM incidents WHERE title = 'Scheduled Maintenance');

INSERT INTO incidents (date, title, description, status) 
SELECT 
  CURRENT_TIMESTAMP - INTERVAL '8 days', 
  'AI Response Delay', 
  'Cloudflare API experienced brief latency. Resolved within 5 minutes.', 
  'resolved'
WHERE NOT EXISTS (SELECT 1 FROM incidents WHERE title = 'AI Response Delay');

INSERT INTO incidents (date, title, description, status) 
SELECT 
  CURRENT_TIMESTAMP - INTERVAL '15 days', 
  'Email Delivery Delay', 
  'Resend API had intermittent issues. All emails delivered.', 
  'resolved'
WHERE NOT EXISTS (SELECT 1 FROM incidents WHERE title = 'Email Delivery Delay');