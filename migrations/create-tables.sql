-- Automations table
CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    description TEXT,
    trigger_type TEXT,
    trigger_config TEXT,
    action_type TEXT,
    action_config TEXT,
    schedule TEXT,
    status TEXT DEFAULT 'active',
    trigger_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    avg_duration INTEGER DEFAULT 0,
    last_run DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Connected accounts
CREATE TABLE IF NOT EXISTS connected_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    platform TEXT,
    account_name TEXT,
    api_key_encrypted TEXT,
    account_info TEXT,
    status TEXT DEFAULT 'active',
    last_sync DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    details TEXT,
    icon TEXT,
    type TEXT DEFAULT 'info',
    timestamp DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
