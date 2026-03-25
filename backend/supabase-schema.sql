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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  business_profile JSONB DEFAULT '{}',
  auto_deploy_settings JSONB DEFAULT '{
    "auto_recommend": true,
    "auto_deploy_new": false,
    "notify_on_recommendation": true,
    "deployed_automations": []
  }'
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
  automation_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  message TEXT,
  status TEXT DEFAULT 'new',
  source TEXT DEFAULT 'widget',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  last_contact TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
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
-- NEW TABLES FOR AI POWERHOUSE 2.0
-- ============================================

-- 1. AUTOMATION TEMPLATES (Pre-built workflows)
CREATE TABLE IF NOT EXISTS automation_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'lead_generation', 
    'content_creation', 
    'customer_support', 
    'ecommerce', 
    'reporting',
    'social_media'
  )),
  industry TEXT[] DEFAULT '{}',
  complexity TEXT CHECK (complexity IN ('simple', 'medium', 'advanced')),
  time_saved TEXT,
  roi_impact TEXT,
  icon TEXT,
  color TEXT,
  trigger_schema JSONB NOT NULL DEFAULT '{}',
  action_schema JSONB NOT NULL DEFAULT '{}',
  default_config JSONB DEFAULT '{}',
  is_featured BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. USER AUTOMATIONS (Advanced automations created by users)
CREATE TABLE IF NOT EXISTS user_automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES automation_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'error', 'archived')),
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  connected_accounts JSONB[] DEFAULT '{}',
  ai_config JSONB DEFAULT '{}',
  run_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  next_run_at TIMESTAMP WITH TIME ZONE,
  leads_generated INTEGER DEFAULT 0,
  roi_hours_saved INTEGER DEFAULT 0,
  roi_revenue_impact INTEGER DEFAULT 0,
  roi_leads_generated INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. LEAD SOURCES (Track where leads come from)
CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  automation_id UUID REFERENCES user_automations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('widget', 'form', 'chat', 'email', 'social', 'api')),
  config JSONB DEFAULT '{}',
  leads_count INTEGER DEFAULT 0,
  conversion_rate DECIMAL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. GENERATED MEDIA (Images, scripts, videos)
CREATE TABLE IF NOT EXISTS generated_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  automation_id UUID REFERENCES user_automations(id) ON DELETE SET NULL,
  media_type TEXT CHECK (media_type IN ('image', 'video', 'script', 'audio')),
  file_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- AI BUSINESS INTELLIGENCE TABLES
-- ============================================

-- 5. AI RECOMMENDATIONS TABLE (with ROI fields)
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  automation_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  reason TEXT,
  confidence_score INTEGER DEFAULT 0,
  roi_hours_saved INTEGER DEFAULT 0,
  roi_revenue_impact INTEGER DEFAULT 0,
  roi_leads_generated INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ
);

-- 6. BUSINESS INSIGHTS TABLE (with ROI)
CREATE TABLE IF NOT EXISTS business_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  insight_type TEXT,
  insight_data JSONB,
  priority INTEGER DEFAULT 0,
  roi_hours_saved INTEGER DEFAULT 0,
  roi_revenue_impact INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ROI STATS TABLE (for dashboard tracking)
CREATE TABLE IF NOT EXISTS roi_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  hours_saved INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  revenue_impact INTEGER DEFAULT 0,
  tasks_automated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ============================================
-- CREATE ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
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

-- NEW INDEXES
CREATE INDEX IF NOT EXISTS idx_user_automations_user_id ON user_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_automations_status ON user_automations(status);
CREATE INDEX IF NOT EXISTS idx_lead_sources_user_id ON lead_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_media_user_id ON generated_media(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_templates_category ON automation_templates(category);
CREATE INDEX IF NOT EXISTS idx_automation_templates_featured ON automation_templates(is_featured);

-- AI BUSINESS INTELLIGENCE INDEXES
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_user_id ON ai_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_status ON ai_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_business_insights_user_id ON business_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_business_insights_insight_type ON business_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_roi_stats_user_id ON roi_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_roi_stats_date ON roi_stats(date);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_stats ENABLE ROW LEVEL SECURITY;

-- Templates are readable by all authenticated users
CREATE POLICY "Templates are viewable by all authenticated users" 
  ON automation_templates FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only see their own automations
CREATE POLICY "Users can view their own automations" 
  ON user_automations FOR SELECT USING (auth.uid()::integer = user_id);

CREATE POLICY "Users can insert their own automations" 
  ON user_automations FOR INSERT WITH CHECK (auth.uid()::integer = user_id);

CREATE POLICY "Users can update their own automations" 
  ON user_automations FOR UPDATE USING (auth.uid()::integer = user_id);

CREATE POLICY "Users can delete their own automations" 
  ON user_automations FOR DELETE USING (auth.uid()::integer = user_id);

-- Users can only see their own lead sources
CREATE POLICY "Users can view their own lead sources" 
  ON lead_sources FOR SELECT USING (auth.uid()::integer = user_id);

-- Users can only see their own generated media
CREATE POLICY "Users can view their own generated media" 
  ON generated_media FOR SELECT USING (auth.uid()::integer = user_id);

-- AI Recommendations policies
CREATE POLICY "Users can view their own recommendations" 
  ON ai_recommendations FOR SELECT USING (auth.uid()::integer = user_id);

CREATE POLICY "Users can insert their own recommendations" 
  ON ai_recommendations FOR INSERT WITH CHECK (auth.uid()::integer = user_id);

-- Business Insights policies
CREATE POLICY "Users can view their own insights" 
  ON business_insights FOR SELECT USING (auth.uid()::integer = user_id);

-- ROI Stats policies
CREATE POLICY "Users can view their own ROI stats" 
  ON roi_stats FOR SELECT USING (auth.uid()::integer = user_id);

CREATE POLICY "Users can insert their own ROI stats" 
  ON roi_stats FOR INSERT WITH CHECK (auth.uid()::integer = user_id);

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