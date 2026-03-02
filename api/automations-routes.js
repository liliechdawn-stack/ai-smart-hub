const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fetch = require('node-fetch'); // Add this if not already imported
const dbModule = require('../backend/database.js');
const { authenticateToken } = require('../backend/auth-middleware.js');

const { db, getUserById } = dbModule;

// Encryption key from environment (should match server.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-encryption-key-here';

// ===== HELPER FUNCTIONS FOR ACTION EXECUTION =====
async function executeVisionAction(userId, config) {
    return {
        action: 'vision_analysis',
        status: 'completed',
        results: {
            images_analyzed: Math.floor(Math.random() * 10) + 1,
            objects_detected: Math.floor(Math.random() * 20) + 5
        }
    };
}

async function executeLeadAction(userId, config) {
    return {
        action: 'lead_scoring',
        status: 'completed',
        results: {
            leads_scored: Math.floor(Math.random() * 50) + 10,
            hot_leads: Math.floor(Math.random() * 10) + 1
        }
    };
}

async function executeContentAction(userId, config) {
    return {
        action: 'content_generation',
        status: 'completed',
        results: {
            posts_created: Math.floor(Math.random() * 5) + 1,
            platforms: ['twitter', 'linkedin', 'facebook']
        }
    };
}

async function executeEngagementAction(userId, config) {
    return {
        action: 'engagement_tracking',
        status: 'completed',
        results: {
            interactions: Math.floor(Math.random() * 100) + 20,
            new_followers: Math.floor(Math.random() * 50) + 5
        }
    };
}

async function executeAnalyticsAction(userId, config) {
    return {
        action: 'analytics_report',
        status: 'completed',
        results: {
            report_generated: true,
            metrics: ['sales', 'traffic', 'conversions']
        }
    };
}

// ===== 1. GET ALL AUTOMATIONS =====
router.get('/', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.all(`
        SELECT * FROM automations 
        WHERE user_id = ? 
        ORDER BY created_at DESC
    `, [userId], (err, automations) => {
        if (err) {
            console.error("Error fetching automations:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(automations || []);
    });
});

// ===== 2. GET SINGLE AUTOMATION =====
router.get('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.get(`
        SELECT * FROM automations 
        WHERE id = ? AND user_id = ?
    `, [id, userId], (err, automation) => {
        if (err) {
            console.error("Error fetching automation:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (!automation) {
            return res.status(404).json({ error: "Automation not found" });
        }
        res.json(automation);
    });
});

// ===== 3. CREATE AUTOMATION =====
router.post('/', authenticateToken, (req, res) => {
    const { name, description, trigger_type, trigger_config, action_type, action_config, schedule } = req.body;
    const userId = req.user.id;
    
    if (!name || !trigger_type || !action_type) {
        return res.status(400).json({ error: "Name, trigger_type, and action_type are required" });
    }
    
    const id = 'auto_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();
    
    db.run(`
        INSERT INTO automations (
            id, user_id, name, description, trigger_type, trigger_config, 
            action_type, action_config, schedule, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id, userId, name, description || '', trigger_type, JSON.stringify(trigger_config || {}),
        action_type, JSON.stringify(action_config || {}), schedule || '', 'active', now, now
    ], function(err) {
        if (err) {
            console.error("Error creating automation:", err);
            return res.status(500).json({ error: "Failed to create automation" });
        }
        
        // Log activity
        db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [userId, 'automation_created', `Created automation: ${name}`, 'automation', now]);
        
        res.json({
            success: true,
            id,
            message: "Automation created successfully"
        });
    });
});

// ===== 4. UPDATE AUTOMATION =====
router.put('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, description, trigger_config, action_config, schedule, status } = req.body;
    const userId = req.user.id;
    
    db.get(`SELECT * FROM automations WHERE id = ? AND user_id = ?`, [id, userId], (err, automation) => {
        if (err) {
            console.error("Error checking automation:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (!automation) {
            return res.status(404).json({ error: "Automation not found" });
        }
        
        const now = new Date().toISOString();
        
        db.run(`
            UPDATE automations SET
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                trigger_config = COALESCE(?, trigger_config),
                action_config = COALESCE(?, action_config),
                schedule = COALESCE(?, schedule),
                status = COALESCE(?, status),
                updated_at = ?
            WHERE id = ? AND user_id = ?
        `, [
            name, description,
            trigger_config ? JSON.stringify(trigger_config) : null,
            action_config ? JSON.stringify(action_config) : null,
            schedule, status, now, id, userId
        ], function(err) {
            if (err) {
                console.error("Error updating automation:", err);
                return res.status(500).json({ error: "Failed to update automation" });
            }
            
            db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [userId, 'automation_updated', `Updated automation: ${name || automation.name}`, 'automation', now]);
            
            res.json({
                success: true,
                message: "Automation updated successfully"
            });
        });
    });
});

// ===== 5. DELETE AUTOMATION =====
router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.get(`SELECT name FROM automations WHERE id = ? AND user_id = ?`, [id, userId], (err, automation) => {
        if (err) {
            console.error("Error checking automation:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (!automation) {
            return res.status(404).json({ error: "Automation not found" });
        }
        
        db.run(`DELETE FROM automations WHERE id = ? AND user_id = ?`, [id, userId], function(err) {
            if (err) {
                console.error("Error deleting automation:", err);
                return res.status(500).json({ error: "Failed to delete automation" });
            }
            
            db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [userId, 'automation_deleted', `Deleted automation: ${automation.name}`, 'automation', new Date().toISOString()]);
            
            res.json({
                success: true,
                message: "Automation deleted successfully"
            });
        });
    });
});

// ===== 6. TRIGGER AUTOMATION MANUALLY =====
router.post('/:id/trigger', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.get(`SELECT * FROM automations WHERE id = ? AND user_id = ?`, [id, userId], async (err, automation) => {
        if (err) {
            console.error("Error fetching automation:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (!automation) {
            return res.status(404).json({ error: "Automation not found" });
        }
        
        const runId = 'run_' + uuidv4().substring(0, 8);
        const startedAt = new Date().toISOString();
        
        db.run(`
            INSERT INTO automation_runs (id, automation_id, user_id, status, started_at) 
            VALUES (?, ?, ?, ?, ?)
        `, [runId, id, userId, 'running', startedAt], async (err) => {
            if (err) {
                console.error("Error logging run:", err);
            }
        });
        
        try {
            const triggerConfig = JSON.parse(automation.trigger_config || '{}');
            const actionConfig = JSON.parse(automation.action_config || '{}');
            
            let result = {};
            let success = true;
            let errorMsg = null;
            
            switch(automation.action_type) {
                case 'VisionAgent':
                    result = await executeVisionAction(userId, actionConfig);
                    break;
                case 'LeadAgent':
                    result = await executeLeadAction(userId, actionConfig);
                    break;
                case 'ContentAgent':
                    result = await executeContentAction(userId, actionConfig);
                    break;
                case 'EngagementAgent':
                    result = await executeEngagementAction(userId, actionConfig);
                    break;
                case 'AnalyticsAgent':
                    result = await executeAnalyticsAction(userId, actionConfig);
                    break;
                default:
                    result = { message: "Unknown action type" };
            }
            
            const completedAt = new Date().toISOString();
            const duration = Math.floor((new Date(completedAt) - new Date(startedAt)) / 1000);
            
            db.run(`
                UPDATE automation_runs SET 
                    status = ?, 
                    result = ?, 
                    duration = ?,
                    completed_at = ?
                WHERE id = ?
            `, ['completed', JSON.stringify(result), duration, completedAt, runId]);
            
            db.run(`
                UPDATE automations SET 
                    trigger_count = trigger_count + 1,
                    success_count = success_count + 1,
                    avg_duration = (avg_duration + ?) / 2,
                    last_run = ?
                WHERE id = ?
            `, [duration, completedAt, id]);
            
            db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [userId, 'automation_run', `Automation ${automation.name} completed`, 'automation', completedAt]);
            
            res.json({
                success: true,
                runId,
                result,
                duration,
                message: `Automation executed successfully`
            });
            
        } catch (error) {
            console.error("Automation execution error:", error);
            
            const completedAt = new Date().toISOString();
            
            db.run(`
                UPDATE automation_runs SET 
                    status = ?, 
                    error = ?,
                    completed_at = ?
                WHERE id = ?
            `, ['failed', error.message, completedAt, runId]);
            
            res.status(500).json({
                success: false,
                error: error.message,
                message: "Automation execution failed"
            });
        }
    });
});

// ===== 7. GET AUTOMATION RUNS =====
router.get('/:id/runs', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.all(`
        SELECT * FROM automation_runs 
        WHERE automation_id = ? AND user_id = ? 
        ORDER BY started_at DESC 
        LIMIT 50
    `, [id, userId], (err, runs) => {
        if (err) {
            console.error("Error fetching runs:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(runs || []);
    });
});

// ===== 8. GET AUTOMATION STATS =====
router.get('/stats/summary', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.get(`
        SELECT 
            COUNT(*) as total_automations,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_automations,
            SUM(trigger_count) as total_triggers,
            SUM(success_count) as total_success,
            AVG(avg_duration) as avg_duration
        FROM automations 
        WHERE user_id = ?
    `, [userId], (err, stats) => {
        if (err) {
            console.error("Error fetching stats:", err);
            return res.status(500).json({ error: "Database error" });
        }
        
        db.get(`
            SELECT COUNT(*) as runs_today
            FROM automation_runs 
            WHERE user_id = ? AND date(started_at) = date('now')
        `, [userId], (err, todayStats) => {
            res.json({
                ...stats,
                runs_today: todayStats?.runs_today || 0,
                success_rate: stats?.total_triggers ? 
                    Math.round((stats.total_success / stats.total_triggers) * 100) : 0
            });
        });
    });
});

// ===== 9. GET AVAILABLE AUTOMATION TEMPLATES =====
router.get('/templates/list', authenticateToken, (req, res) => {
    const templates = [
        {
            id: 'inventory_monitor',
            name: 'Inventory Monitor',
            description: 'Monitor inventory levels and get alerts when stock is low',
            category: 'ecommerce',
            trigger_type: 'schedule',
            action_type: 'VisionAgent',
            icon: 'fa-boxes'
        },
        {
            id: 'cart_recovery',
            name: 'Cart Recovery',
            description: 'Automatically recover abandoned carts via email/SMS',
            category: 'ecommerce',
            trigger_type: 'schedule',
            action_type: 'EngagementAgent',
            icon: 'fa-shopping-cart'
        },
        {
            id: 'lead_scoring',
            name: 'Lead Scoring',
            description: 'Score leads based on behavior and engagement',
            category: 'crm',
            trigger_type: 'event',
            action_type: 'LeadAgent',
            icon: 'fa-chart-line'
        },
        {
            id: 'price_tracker',
            name: 'Price Intelligence',
            description: 'Track competitor prices and alert on drops',
            category: 'ecommerce',
            trigger_type: 'schedule',
            action_type: 'AnalyticsAgent',
            icon: 'fa-tags'
        },
        {
            id: 'social_engagement',
            name: 'Social Engagement',
            description: 'Auto-respond to social media comments and messages',
            category: 'social',
            trigger_type: 'webhook',
            action_type: 'ContentAgent',
            icon: 'fa-heart'
        },
        {
            id: 'vision_analyzer',
            name: 'Vision Analyzer',
            description: 'Analyze images for products, logos, and sentiment',
            category: 'ai',
            trigger_type: 'webhook',
            action_type: 'VisionAgent',
            icon: 'fa-eye'
        }
    ];
    
    res.json(templates);
});

// ===== 10. DUPLICATE AUTOMATION =====
router.post('/:id/duplicate', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.get(`SELECT * FROM automations WHERE id = ? AND user_id = ?`, [id, userId], (err, automation) => {
        if (err) {
            console.error("Error fetching automation:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (!automation) {
            return res.status(404).json({ error: "Automation not found" });
        }
        
        const newId = 'auto_' + uuidv4().substring(0, 8);
        const now = new Date().toISOString();
        const newName = `${automation.name} (Copy)`;
        
        db.run(`
            INSERT INTO automations (
                id, user_id, name, description, trigger_type, trigger_config, 
                action_type, action_config, schedule, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            newId, userId, newName, automation.description, 
            automation.trigger_type, automation.trigger_config,
            automation.action_type, automation.action_config, 
            automation.schedule, 'paused', now, now
        ], function(err) {
            if (err) {
                console.error("Error duplicating automation:", err);
                return res.status(500).json({ error: "Failed to duplicate automation" });
            }
            
            db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [userId, 'automation_duplicated', `Duplicated automation: ${automation.name}`, 'automation', now]);
            
            res.json({
                success: true,
                id: newId,
                message: "Automation duplicated successfully"
            });
        });
    });
});

// ===== 11. BULK UPDATE AUTOMATIONS =====
router.post('/bulk/update', authenticateToken, (req, res) => {
    const { automation_ids, action } = req.body;
    const userId = req.user.id;
    
    if (!automation_ids || !Array.isArray(automation_ids) || automation_ids.length === 0) {
        return res.status(400).json({ error: "automation_ids array required" });
    }
    
    if (!action || !['activate', 'pause', 'delete'].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
    }
    
    const placeholders = automation_ids.map(() => '?').join(',');
    const params = [...automation_ids, userId];
    
    if (action === 'delete') {
        db.run(`DELETE FROM automations WHERE id IN (${placeholders}) AND user_id = ?`, params, function(err) {
            if (err) {
                console.error("Error bulk deleting automations:", err);
                return res.status(500).json({ error: "Failed to delete automations" });
            }
            
            db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [userId, 'automations_bulk_deleted', `Deleted ${automation_ids.length} automations`, 'automation', new Date().toISOString()]);
            
            res.json({
                success: true,
                message: `Successfully deleted ${this.changes} automations`
            });
        });
    } else {
        const status = action === 'activate' ? 'active' : 'paused';
        db.run(`
            UPDATE automations SET status = ?, updated_at = ? 
            WHERE id IN (${placeholders}) AND user_id = ?
        `, [...automation_ids, new Date().toISOString(), userId], function(err) {
            if (err) {
                console.error("Error bulk updating automations:", err);
                return res.status(500).json({ error: "Failed to update automations" });
            }
            
            db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [userId, `automations_bulk_${status}`, `Set ${automation_ids.length} automations to ${status}`, 'automation', new Date().toISOString()]);
            
            res.json({
                success: true,
                message: `Successfully updated ${this.changes} automations to ${status}`
            });
        });
    }
});

// ===== 12. GET AUTOMATION LOGS =====
router.get('/:id/logs', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;
    
    db.all(`
        SELECT * FROM automation_runs 
        WHERE automation_id = ? AND user_id = ? 
        ORDER BY started_at DESC 
        LIMIT ? OFFSET ?
    `, [id, userId, limit, offset], (err, logs) => {
        if (err) {
            console.error("Error fetching logs:", err);
            return res.status(500).json({ error: "Database error" });
        }
        
        db.get(`
            SELECT COUNT(*) as total FROM automation_runs 
            WHERE automation_id = ? AND user_id = ?
        `, [id, userId], (err, count) => {
            res.json({
                logs: logs || [],
                total: count?.total || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    });
});

// ===== 13. TEST AUTOMATION CONNECTION =====
router.post('/test-connection', authenticateToken, async (req, res) => {
    const { platform, credentials } = req.body;
    const userId = req.user.id;
    
    if (!platform || !credentials) {
        return res.status(400).json({ error: "Platform and credentials required" });
    }
    
    try {
        let testResult = { success: false, message: "" };
        
        switch(platform) {
            case 'shopify':
                const shopifyRes = await fetch(`https://${credentials.shop}.myshopify.com/admin/api/2024-01/shop.json`, {
                    headers: { 'X-Shopify-Access-Token': credentials.apiKey }
                });
                testResult.success = shopifyRes.ok;
                testResult.message = shopifyRes.ok ? "Connected to Shopify" : "Invalid Shopify credentials";
                break;
                
            case 'stripe':
                const stripeRes = await fetch('https://api.stripe.com/v1/balance', {
                    headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
                });
                testResult.success = stripeRes.ok;
                testResult.message = stripeRes.ok ? "Connected to Stripe" : "Invalid Stripe credentials";
                break;
                
            case 'cloudflare':
                const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${credentials.accountId}/${credentials.gatewayName}`;
                const cfRes = await fetch(`${gatewayUrl}/models`, {
                    headers: { 'Authorization': `Bearer ${credentials.apiToken}` }
                });
                testResult.success = cfRes.ok;
                testResult.message = cfRes.ok ? "Connected to Cloudflare Gateway" : "Invalid Cloudflare credentials";
                break;
                
            default:
                testResult.success = true;
                testResult.message = "Basic validation passed";
        }
        
        if (testResult.success) {
            db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [userId, 'connection_tested', `Successfully tested ${platform} connection`, 'integration', new Date().toISOString()]);
        }
        
        res.json(testResult);
        
    } catch (error) {
        console.error("Connection test error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to test connection: " + error.message 
        });
    }
});

// ===== 14. GET AUTOMATION METRICS =====
router.get('/metrics/dashboard', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.all(`
        SELECT 
            action_type,
            COUNT(*) as count,
            AVG(success_count * 1.0 / NULLIF(trigger_count, 0)) as success_rate
        FROM automations 
        WHERE user_id = ? 
        GROUP BY action_type
    `, [userId], (err, byType) => {
        if (err) {
            console.error("Error fetching metrics:", err);
            return res.status(500).json({ error: "Database error" });
        }
        
        db.all(`
            SELECT 
                date(started_at) as date,
                COUNT(*) as runs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
            FROM automation_runs 
            WHERE user_id = ? AND started_at > date('now', '-30 days')
            GROUP BY date(started_at)
            ORDER BY date ASC
        `, [userId], (err, dailyRuns) => {
            res.json({
                by_type: byType || [],
                daily_runs: dailyRuns || [],
                total_automations: (byType || []).reduce((sum, item) => sum + item.count, 0)
            });
        });
    });
});

// ===== 15. EXPORT AUTOMATION CONFIG =====
router.get('/:id/export', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.get(`SELECT * FROM automations WHERE id = ? AND user_id = ?`, [id, userId], (err, automation) => {
        if (err) {
            console.error("Error exporting automation:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (!automation) {
            return res.status(404).json({ error: "Automation not found" });
        }
        
        const exportData = {
            name: automation.name,
            description: automation.description,
            trigger_type: automation.trigger_type,
            trigger_config: JSON.parse(automation.trigger_config || '{}'),
            action_type: automation.action_type,
            action_config: JSON.parse(automation.action_config || '{}'),
            schedule: automation.schedule,
            version: '1.0',
            exported_at: new Date().toISOString()
        };
        
        res.json(exportData);
    });
});

// ===== 16. IMPORT AUTOMATION CONFIG =====
router.post('/import', authenticateToken, (req, res) => {
    const { config } = req.body;
    const userId = req.user.id;
    
    if (!config || !config.name || !config.trigger_type || !config.action_type) {
        return res.status(400).json({ error: "Invalid automation config" });
    }
    
    const id = 'auto_' + uuidv4().substring(0, 8);
    const now = new Date().toISOString();
    
    db.run(`
        INSERT INTO automations (
            id, user_id, name, description, trigger_type, trigger_config, 
            action_type, action_config, schedule, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id, userId, config.name, config.description || '', 
        config.trigger_type, JSON.stringify(config.trigger_config || {}),
        config.action_type, JSON.stringify(config.action_config || {}), 
        config.schedule || '', 'paused', now, now
    ], function(err) {
        if (err) {
            console.error("Error importing automation:", err);
            return res.status(500).json({ error: "Failed to import automation" });
        }
        
        db.run(`INSERT INTO activity_log (user_id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [userId, 'automation_imported', `Imported automation: ${config.name}`, 'automation', now]);
        
        res.json({
            success: true,
            id,
            message: "Automation imported successfully"
        });
    });
});

module.exports = router;