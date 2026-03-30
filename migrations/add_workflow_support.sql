-- Add workflow columns to user_automations table
ALTER TABLE user_automations 
ADD COLUMN IF NOT EXISTS workflow_nodes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS workflow_edges JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS workflow_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(50) DEFAULT 'sequential';

-- Create workflow_executions table for detailed tracking
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES user_automations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    workflow_version INTEGER,
    trigger_data JSONB,
    node_results JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    error_message TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_executions_automation ON workflow_executions(automation_id);
CREATE INDEX idx_workflow_executions_user ON workflow_executions(user_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);