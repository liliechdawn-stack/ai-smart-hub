// Activity Model
// Database operations for activity logging

const db = require('../backend/database.js').db;

class ActivityModel {
    constructor() {
        this.tableName = 'activity_log';
    }

    // Log an activity
    async log(userId, action, details, type = 'info', icon = null) {
        return new Promise((resolve, reject) => {
            const icons = {
                'info': 'fa-info-circle',
                'success': 'fa-check-circle',
                'warning': 'fa-exclamation-triangle',
                'error': 'fa-times-circle',
                'automation': 'fa-robot',
                'account': 'fa-plug',
                'lead': 'fa-user',
                'vision': 'fa-eye',
                'security': 'fa-shield-alt',
                'mobile': 'fa-cloud',
                'pricing': 'fa-tags',
                'inventory': 'fa-boxes',
                'governance': 'fa-shield-alt',
                'email': 'fa-envelope',
                'broadcast': 'fa-bullhorn',
                'integration': 'fa-puzzle-piece',
                'agent': 'fa-brain'
            };
            
            const finalIcon = icon || icons[type] || 'fa-info-circle';
            
            db.run(
                `INSERT INTO activity_log (user_id, action, details, type, icon, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, action, details, type, finalIcon, new Date().toISOString()],
                function(err) {
                    if (err) {
                        console.error('Error logging activity:', err);
                        reject(err);
                    } else {
                        resolve({
                            id: this.lastID,
                            user_id: userId,
                            action,
                            details,
                            type,
                            icon: finalIcon,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            );
        });
    }

    // Get recent activities
    async getRecent(userId, limit = 20) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM activity_log 
                 WHERE user_id = ? 
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [userId, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting recent activities:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Get activities by type
    async getByType(userId, type, limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM activity_log 
                 WHERE user_id = ? AND type = ? 
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [userId, type, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting activities by type:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Get activities within date range
    async getByDateRange(userId, startDate, endDate, limit = 100) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM activity_log 
                 WHERE user_id = ? 
                 AND timestamp >= ? 
                 AND timestamp <= ? 
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [userId, startDate, endDate, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting activities by date range:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Get activity summary by type
    async getSummaryByType(userId, days = 7) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    type,
                    COUNT(*) as count,
                    MAX(timestamp) as last_occurrence
                 FROM activity_log 
                 WHERE user_id = ? 
                 AND timestamp > datetime('now', ? || ' days')
                 GROUP BY type
                 ORDER BY count DESC`,
                [userId, '-' + days],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting activity summary:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Get daily activity counts
    async getDailyCounts(userId, days = 30) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    date(timestamp) as date,
                    COUNT(*) as count
                 FROM activity_log 
                 WHERE user_id = ? 
                 AND timestamp > datetime('now', ? || ' days')
                 GROUP BY date(timestamp)
                 ORDER BY date ASC`,
                [userId, '-' + days],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting daily counts:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Get most active hours
    async getActiveHours(userId, days = 7) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    strftime('%H', timestamp) as hour,
                    COUNT(*) as count
                 FROM activity_log 
                 WHERE user_id = ? 
                 AND timestamp > datetime('now', ? || ' days')
                 GROUP BY hour
                 ORDER BY hour ASC`,
                [userId, '-' + days],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting active hours:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Search activities
    async search(userId, searchTerm, limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM activity_log 
                 WHERE user_id = ? 
                 AND (action LIKE ? OR details LIKE ?)
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [userId, `%${searchTerm}%`, `%${searchTerm}%`, limit],
                (err, rows) => {
                    if (err) {
                        console.error('Error searching activities:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Delete old activities (for cleanup)
    async deleteOlderThan(days) {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM activity_log 
                 WHERE timestamp < datetime('now', ? || ' days')`,
                ['-' + days],
                function(err) {
                    if (err) {
                        console.error('Error deleting old activities:', err);
                        reject(err);
                    } else {
                        resolve({
                            success: true,
                            deleted: this.changes
                        });
                    }
                }
            );
        });
    }

    // Get activity statistics
    async getStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as total_activities,
                    COUNT(DISTINCT date(timestamp)) as active_days,
                    MIN(timestamp) as first_activity,
                    MAX(timestamp) as last_activity,
                    COUNT(CASE WHEN date(timestamp) = date('now') THEN 1 END) as today_count
                 FROM activity_log 
                 WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err) {
                        console.error('Error getting activity stats:', err);
                        reject(err);
                    } else {
                        resolve(row || {
                            total_activities: 0,
                            active_days: 0,
                            first_activity: null,
                            last_activity: null,
                            today_count: 0
                        });
                    }
                }
            );
        });
    }

    // Get real-time activity feed (with pagination)
    async getFeed(userId, page = 1, pageSize = 20) {
        const offset = (page - 1) * pageSize;
        
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM activity_log 
                 WHERE user_id = ? 
                 ORDER BY timestamp DESC 
                 LIMIT ? OFFSET ?`,
                [userId, pageSize, offset],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting activity feed:', err);
                        reject(err);
                    } else {
                        // Get total count for pagination
                        db.get(
                            `SELECT COUNT(*) as total FROM activity_log WHERE user_id = ?`,
                            [userId],
                            (err, count) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({
                                        activities: rows || [],
                                        pagination: {
                                            page,
                                            pageSize,
                                            total: count?.total || 0,
                                            totalPages: Math.ceil((count?.total || 0) / pageSize)
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

module.exports = new ActivityModel();