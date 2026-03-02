// Alert Model
// Database operations for real-time alerts and notifications

const db = require('../backend/database.js').db;
const { v4: uuidv4 } = require('uuid');

class AlertModel {
    constructor() {
        this.tableName = 'alerts';
    }

    // Create a new alert
    async create(userId, type, severity, title, description, metadata = {}) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            db.run(
                `INSERT INTO alerts (user_id, type, severity, title, description, metadata, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, type, severity, title, description, JSON.stringify(metadata), now],
                function(err) {
                    if (err) {
                        console.error('Error creating alert:', err);
                        reject(err);
                    } else {
                        resolve({
                            id: this.lastID,
                            user_id: userId,
                            type,
                            severity,
                            title,
                            description,
                            metadata,
                            resolved: 0,
                            created_at: now,
                            resolved_at: null
                        });
                    }
                }
            );
        });
    }

    // Get active alerts for a user
    async getActive(userId, limit = 20) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM alerts 
                 WHERE user_id = ? AND resolved = 0 
                 ORDER BY 
                    CASE severity 
                        WHEN 'critical' THEN 1 
                        WHEN 'warning' THEN 2 
                        WHEN 'info' THEN 3 
                        ELSE 4 
                    END ASC,
                    created_at DESC 
                 LIMIT ?`,
                [userId, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting active alerts:', err);
                        reject(err);
                    } else {
                        const alerts = (rows || []).map(row => {
                            try {
                                row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
                            } catch (e) {
                                row.metadata = {};
                            }
                            return row;
                        });
                        resolve(alerts);
                    }
                }
            );
        });
    }

    // Get all alerts for a user
    async getByUser(userId, limit = 50, offset = 0) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM alerts 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ? OFFSET ?`,
                [userId, limit, offset],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting alerts by user:', err);
                        reject(err);
                    } else {
                        const alerts = (rows || []).map(row => {
                            try {
                                row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
                            } catch (e) {
                                row.metadata = {};
                            }
                            return row;
                        });
                        
                        // Get total count
                        db.get(
                            `SELECT COUNT(*) as total FROM alerts WHERE user_id = ?`,
                            [userId],
                            (err, count) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({
                                        alerts,
                                        total: count?.total || 0,
                                        limit,
                                        offset
                                    });
                                }
                            }
                        );
                    }
                }
            );
        });
    }

    // Get alerts by type
    async getByType(userId, type, limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM alerts 
                 WHERE user_id = ? AND type = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`,
                [userId, type, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting alerts by type:', err);
                        reject(err);
                    } else {
                        const alerts = (rows || []).map(row => {
                            try {
                                row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
                            } catch (e) {
                                row.metadata = {};
                            }
                            return row;
                        });
                        resolve(alerts);
                    }
                }
            );
        });
    }

    // Get alerts by severity
    async getBySeverity(userId, severity, limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM alerts 
                 WHERE user_id = ? AND severity = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`,
                [userId, severity, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting alerts by severity:', err);
                        reject(err);
                    } else {
                        const alerts = (rows || []).map(row => {
                            try {
                                row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
                            } catch (e) {
                                row.metadata = {};
                            }
                            return row;
                        });
                        resolve(alerts);
                    }
                }
            );
        });
    }

    // Resolve an alert
    async resolve(alertId, userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE alerts SET resolved = 1, resolved_at = ? WHERE id = ? AND user_id = ?`,
                [new Date().toISOString(), alertId, userId],
                function(err) {
                    if (err) {
                        console.error('Error resolving alert:', err);
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
    }

    // Resolve all alerts of a type
    async resolveAllByType(userId, type) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE alerts SET resolved = 1, resolved_at = ? 
                 WHERE user_id = ? AND type = ? AND resolved = 0`,
                [new Date().toISOString(), userId, type],
                function(err) {
                    if (err) {
                        console.error('Error resolving alerts by type:', err);
                        reject(err);
                    } else {
                        resolve({
                            success: true,
                            resolved_count: this.changes
                        });
                    }
                }
            );
        });
    }

    // Delete an alert
    async delete(alertId, userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM alerts WHERE id = ? AND user_id = ?`,
                [alertId, userId],
                function(err) {
                    if (err) {
                        console.error('Error deleting alert:', err);
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
    }

    // Get alert statistics
    async getStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as total_alerts,
                    COUNT(CASE WHEN resolved = 0 THEN 1 END) as active_alerts,
                    COUNT(CASE WHEN resolved = 1 THEN 1 END) as resolved_alerts,
                    COUNT(CASE WHEN severity = 'critical' AND resolved = 0 THEN 1 END) as critical_active,
                    COUNT(CASE WHEN severity = 'warning' AND resolved = 0 THEN 1 END) as warning_active,
                    COUNT(CASE WHEN severity = 'info' AND resolved = 0 THEN 1 END) as info_active,
                    MIN(created_at) as oldest_alert,
                    MAX(created_at) as newest_alert
                 FROM alerts 
                 WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err) {
                        console.error('Error getting alert stats:', err);
                        reject(err);
                    } else {
                        resolve(row || {
                            total_alerts: 0,
                            active_alerts: 0,
                            resolved_alerts: 0,
                            critical_active: 0,
                            warning_active: 0,
                            info_active: 0,
                            oldest_alert: null,
                            newest_alert: null
                        });
                    }
                }
            );
        });
    }

    // Get alerts by time range
    async getByTimeRange(userId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM alerts 
                 WHERE user_id = ? 
                 AND created_at >= ? 
                 AND created_at <= ? 
                 ORDER BY created_at DESC`,
                [userId, startDate, endDate],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting alerts by time range:', err);
                        reject(err);
                    } else {
                        const alerts = (rows || []).map(row => {
                            try {
                                row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
                            } catch (e) {
                                row.metadata = {};
                            }
                            return row;
                        });
                        resolve(alerts);
                    }
                }
            );
        });
    }

    // Create system alerts based on thresholds
    async checkSystemAlerts(userId) {
        const alerts = [];
        
        // Check budget
        const Governance = require('./Governance');
        const budget = await Governance.getBudgetUsage(userId);
        
        if (budget.used_amount > budget.monthly_cap) {
            alerts.push({
                type: 'budget',
                severity: 'critical',
                title: 'Budget Exceeded',
                description: `Monthly budget of $${budget.monthly_cap} has been exceeded. Current usage: $${budget.used_amount}`
            });
        } else if (budget.used_amount > budget.monthly_cap * 0.9) {
            alerts.push({
                type: 'budget',
                severity: 'warning',
                title: 'Budget Warning',
                description: `You have used 90% of your monthly budget. Current usage: $${budget.used_amount}`
            });
        }

        // Check failed automations
        const AutomationRun = require('./AutomationRun');
        const failedRuns = await AutomationRun.getRecentFailed(userId, 1);
        
        if (failedRuns.length > 0) {
            alerts.push({
                type: 'automation',
                severity: 'warning',
                title: 'Failed Automations',
                description: `${failedRuns.length} automation${failedRuns.length > 1 ? 's have' : ' has'} failed in the last hour`
            });
        }

        // Check account sync status
        const Account = require('./Account');
        const accountsNeedingSync = await Account.getAccountsNeedingSync(userId, 24);
        
        if (accountsNeedingSync.length > 0) {
            alerts.push({
                type: 'integration',
                severity: 'info',
                title: 'Accounts Need Sync',
                description: `${accountsNeedingSync.length} connected account${accountsNeedingSync.length > 1 ? 's' : ''} haven't synced in 24 hours`
            });
        }

        return alerts;
    }

    // Create alerts from system check
    async createSystemAlerts(userId) {
        const systemAlerts = await this.checkSystemAlerts(userId);
        
        const created = [];
        for (const alert of systemAlerts) {
            // Check if similar alert already exists
            const existing = await this.findSimilar(userId, alert.type, alert.severity, alert.title);
            
            if (!existing) {
                const createdAlert = await this.create(
                    userId,
                    alert.type,
                    alert.severity,
                    alert.title,
                    alert.description
                );
                created.push(createdAlert);
            }
        }
        
        return created;
    }

    // Find similar unresolved alert
    async findSimilar(userId, type, severity, title) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM alerts 
                 WHERE user_id = ? AND type = ? AND severity = ? AND title = ? AND resolved = 0
                 ORDER BY created_at DESC LIMIT 1`,
                [userId, type, severity, title],
                (err, row) => {
                    if (err) {
                        console.error('Error finding similar alert:', err);
                        reject(err);
                    } else {
                        if (row) {
                            try {
                                row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
                            } catch (e) {
                                row.metadata = {};
                            }
                        }
                        resolve(row);
                    }
                }
            );
        });
    }

    // Get alert feed with real-time updates
    async getFeed(userId, page = 1, pageSize = 20) {
        const offset = (page - 1) * pageSize;
        
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM alerts 
                 WHERE user_id = ? 
                 ORDER BY 
                    CASE WHEN resolved = 0 THEN 0 ELSE 1 END,
                    CASE severity 
                        WHEN 'critical' THEN 1 
                        WHEN 'warning' THEN 2 
                        WHEN 'info' THEN 3 
                        ELSE 4 
                    END ASC,
                    created_at DESC 
                 LIMIT ? OFFSET ?`,
                [userId, pageSize, offset],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting alert feed:', err);
                        reject(err);
                    } else {
                        const alerts = (rows || []).map(row => {
                            try {
                                row.metadata = row.metadata ? JSON.parse(row.metadata) : {};
                            } catch (e) {
                                row.metadata = {};
                            }
                            return row;
                        });
                        
                        db.get(
                            `SELECT COUNT(*) as total FROM alerts WHERE user_id = ?`,
                            [userId],
                            (err, count) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({
                                        alerts,
                                        pagination: {
                                            page,
                                            pageSize,
                                            total: count?.total || 0,
                                            totalPages: Math.ceil((count?.total || 0) / pageSize),
                                            activeCount: alerts.filter(a => !a.resolved).length
                                        }
                                    });
                                }
                            }
                        );
                    }
                }
            );
        });
    }
}

module.exports = new AlertModel();