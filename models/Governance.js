// Governance Model
// Database operations for governance settings, policies, and compliance

const db = require('../backend/database.js').db;

class GovernanceModel {
    constructor() {
        this.tableName = 'governance_settings';
    }

    // Get governance settings for a user
    async getSettings(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM governance_settings WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err) {
                        console.error('Error getting governance settings:', err);
                        reject(err);
                    } else if (row) {
                        resolve(row);
                    } else {
                        // Create default settings if none exist
                        this.createDefaultSettings(userId)
                            .then(() => this.getSettings(userId))
                            .then(resolve)
                            .catch(reject);
                    }
                }
            );
        });
    }

    // Create default governance settings
    async createDefaultSettings(userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO governance_settings (user_id) VALUES (?)`,
                [userId],
                function(err) {
                    if (err) {
                        console.error('Error creating default governance settings:', err);
                        reject(err);
                    } else {
                        resolve({
                            user_id: userId,
                            gpt4_policy: 'Marketing Team Only',
                            claude_policy: 'All Teams',
                            gemini_policy: 'Executives Only',
                            monthly_cap: 5000,
                            used_amount: 0,
                            per_user_limit: 200,
                            cap_type: 'soft',
                            pii_redaction: 1,
                            hipaa_mode: 0,
                            gdpr: 1,
                            salesforce_status: 'connected',
                            hubspot_status: 'connected',
                            shopify_status: 'requires_auth'
                        });
                    }
                }
            );
        });
    }

    // Update governance settings
    async updateSettings(userId, settings) {
        return new Promise((resolve, reject) => {
            // First ensure record exists
            db.run(`INSERT OR IGNORE INTO governance_settings (user_id) VALUES (?)`, [userId], function(err) {
                if (err) {
                    console.error('Error ensuring governance settings exist:', err);
                    return reject(err);
                }

                // Build dynamic update query
                const updates = [];
                const params = [];

                const allowedFields = [
                    'gpt4_policy', 'claude_policy', 'gemini_policy',
                    'monthly_cap', 'used_amount', 'per_user_limit', 'cap_type',
                    'pii_redaction', 'hipaa_mode', 'gdpr',
                    'salesforce_status', 'hubspot_status', 'shopify_status'
                ];

                allowedFields.forEach(field => {
                    if (settings[field] !== undefined) {
                        updates.push(`${field} = ?`);
                        params.push(settings[field]);
                    }
                });

                if (updates.length === 0) {
                    return resolve({ success: true, changes: 0 });
                }

                updates.push('updated_at = ?');
                params.push(new Date().toISOString());
                params.push(userId);

                db.run(
                    `UPDATE governance_settings SET ${updates.join(', ')} WHERE user_id = ?`,
                    params,
                    function(err) {
                        if (err) {
                            console.error('Error updating governance settings:', err);
                            reject(err);
                        } else {
                            resolve({
                                success: true,
                                changes: this.changes
                            });
                        }
                    }
                );
            });
        });
    }

    // Update model access policy
    async updateModelPolicy(userId, model, policy) {
        const modelFieldMap = {
            'gpt4': 'gpt4_policy',
            'claude': 'claude_policy',
            'gemini': 'gemini_policy'
        };

        const field = modelFieldMap[model];
        if (!field) {
            throw new Error(`Invalid model: ${model}`);
        }

        return this.updateSettings(userId, { [field]: policy });
    }

    // Get model access policies
    async getModelPolicies(userId) {
        const settings = await this.getSettings(userId);
        return {
            gpt4: settings.gpt4_policy,
            claude: settings.claude_policy,
            gemini: settings.gemini_policy
        };
    }

    // Check if model access is allowed for team
    async isModelAllowed(userId, model, team) {
        const settings = await this.getSettings(userId);
        
        const policyMap = {
            'gpt4': settings.gpt4_policy,
            'claude': settings.claude_policy,
            'gemini': settings.gemini_policy
        };

        const policy = policyMap[model];
        
        if (policy === 'All Teams') return true;
        if (policy === team) return true;
        if (policy === 'Restricted') return false;
        
        // Parse policy like "Marketing Team Only"
        const teamOnly = policy.replace(' Only', '');
        return team === teamOnly;
    }

    // Update budget controls
    async updateBudgetControls(userId, budgetData) {
        return this.updateSettings(userId, {
            monthly_cap: budgetData.monthlyCap,
            per_user_limit: budgetData.perUserLimit,
            cap_type: budgetData.capType
        });
    }

    // Get budget usage
    async getBudgetUsage(userId) {
        const settings = await this.getSettings(userId);
        
        return {
            monthly_cap: settings.monthly_cap,
            used_amount: settings.used_amount,
            remaining: settings.monthly_cap - settings.used_amount,
            usage_percentage: (settings.used_amount / settings.monthly_cap) * 100,
            per_user_limit: settings.per_user_limit,
            cap_type: settings.cap_type
        };
    }

    // Add to usage amount
    async addUsage(userId, amount) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE governance_settings SET used_amount = used_amount + ? WHERE user_id = ?`,
                [amount, userId],
                function(err) {
                    if (err) {
                        console.error('Error adding usage:', err);
                        reject(err);
                    } else {
                        // Check if over budget
                        this.getBudgetUsage(userId)
                            .then(budget => {
                                if (budget.used_amount > budget.monthly_cap) {
                                    // Trigger alert
                                    const Alert = require('./Alert');
                                    Alert.create(
                                        userId,
                                        'budget',
                                        'warning',
                                        'Budget Exceeded',
                                        `Monthly budget of $${budget.monthly_cap} has been exceeded. Current usage: $${budget.used_amount}`
                                    ).catch(console.error);
                                }
                                resolve({ success: true });
                            })
                            .catch(reject);
                    }
                }
            );
        });
    }

    // Update compliance settings
    async updateComplianceSettings(userId, complianceData) {
        return this.updateSettings(userId, {
            pii_redaction: complianceData.piiRedaction ? 1 : 0,
            hipaa_mode: complianceData.hipaaMode ? 1 : 0,
            gdpr: complianceData.gdpr ? 1 : 0
        });
    }

    // Get compliance status
    async getComplianceStatus(userId) {
        const settings = await this.getSettings(userId);
        
        return {
            pii_redaction: settings.pii_redaction === 1,
            hipaa_mode: settings.hipaa_mode === 1,
            gdpr: settings.gdpr === 1,
            is_compliant: settings.hipaa_mode === 0 && settings.gdpr === 1,
            requires_action: settings.hipaa_mode === 1 && settings.pii_redaction === 0
        };
    }

    // Update tool access status
    async updateToolStatus(userId, tool, status) {
        const toolFieldMap = {
            'salesforce': 'salesforce_status',
            'hubspot': 'hubspot_status',
            'shopify': 'shopify_status'
        };

        const field = toolFieldMap[tool];
        if (!field) {
            throw new Error(`Invalid tool: ${tool}`);
        }

        return this.updateSettings(userId, { [field]: status });
    }

    // Get tool access statuses
    async getToolStatuses(userId) {
        const settings = await this.getSettings(userId);
        
        return {
            salesforce: settings.salesforce_status,
            hubspot: settings.hubspot_status,
            shopify: settings.shopify_status
        };
    }

    // Check if within budget
    async isWithinBudget(userId, amount) {
        const budget = await this.getBudgetUsage(userId);
        
        if (budget.cap_type === 'hard' && (budget.used_amount + amount) > budget.monthly_cap) {
            return false;
        }
        
        return true;
    }

    // Get governance audit log
    async getAuditLog(userId, limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM activity_log 
                 WHERE user_id = ? AND type = 'governance' 
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [userId, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting governance audit log:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Reset monthly usage (should be called via cron)
    async resetMonthlyUsage() {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE governance_settings SET used_amount = 0`,
                [],
                function(err) {
                    if (err) {
                        console.error('Error resetting monthly usage:', err);
                        reject(err);
                    } else {
                        resolve({
                            success: true,
                            reset_count: this.changes
                        });
                    }
                }
            );
        });
    }

    // Get governance summary
    async getSummary(userId) {
        const [settings, budget, compliance, tools] = await Promise.all([
            this.getSettings(userId),
            this.getBudgetUsage(userId),
            this.getComplianceStatus(userId),
            this.getToolStatuses(userId)
        ]);

        return {
            policies: {
                gpt4: settings.gpt4_policy,
                claude: settings.claude_policy,
                gemini: settings.gemini_policy
            },
            budget,
            compliance,
            tools,
            last_updated: settings.updated_at
        };
    }
}

module.exports = new GovernanceModel();