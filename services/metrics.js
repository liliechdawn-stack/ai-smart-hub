// Metrics Service
// Real-time metrics calculation and analytics

const db = require('../backend/database.js').db;

class MetricsService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minute cache
    }

    // Clear expired cache
    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.cache.delete(key);
            }
        }
    }

    // Get cached or compute
    async getCachedOrCompute(key, computeFn) {
        this.clearExpiredCache();
        
        if (this.cache.has(key)) {
            return this.cache.get(key).data;
        }

        const data = await computeFn();
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });

        return data;
    }

    // ==================== USER METRICS ====================

    async getUserMetrics(userId, days = 30) {
        const key = `user_${userId}_${days}`;
        
        return this.getCachedOrCompute(key, async () => {
            return new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        (SELECT COUNT(*) FROM automations WHERE user_id = ?) as total_automations,
                        (SELECT COUNT(*) FROM automations WHERE user_id = ? AND status = 'active') as active_automations,
                        (SELECT COUNT(*) FROM leads WHERE user_id = ?) as total_leads,
                        (SELECT COUNT(*) FROM leads WHERE user_id = ? AND date(created_at) > date('now', ? || ' days')) as leads_last_30_days,
                        (SELECT COUNT(*) FROM chats WHERE user_id = ?) as total_chats,
                        (SELECT COUNT(*) FROM chats WHERE user_id = ? AND date(created_at) = date('now')) as chats_today,
                        (SELECT COUNT(*) FROM connected_accounts WHERE user_id = ?) as connected_platforms,
                        (SELECT SUM(sent_count) FROM broadcasts WHERE user_id = ?) as total_emails_sent,
                        (SELECT COUNT(*) FROM vision_results WHERE user_id = ?) as total_vision_calls,
                        (SELECT messages_used FROM users WHERE id = ?) as messages_used,
                        (SELECT leads_used FROM users WHERE id = ?) as leads_used,
                        (SELECT plan FROM users WHERE id = ?) as current_plan
                `, [
                    userId, userId, userId, userId, days,
                    userId, userId, userId, userId, userId,
                    userId, userId, userId
                ], (err, row) => {
                    if (err) reject(err);
                    else resolve(row || {});
                });
            });
        });
    }

    // ==================== AUTOMATION METRICS ====================

    async getAutomationMetrics(userId, automationId = null) {
        const key = automationId ? `auto_${automationId}` : `automations_${userId}`;
        
        return this.getCachedOrCompute(key, async () => {
            return new Promise((resolve, reject) => {
                let query = `
                    SELECT 
                        COUNT(*) as total_runs,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_runs,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
                        AVG(duration) as avg_duration,
                        MIN(duration) as min_duration,
                        MAX(duration) as max_duration,
                        SUM(estimated_hours) as total_hours_saved
                    FROM automation_runs
                    WHERE 1=1
                `;
                
                const params = [];
                
                if (automationId) {
                    query += ` AND automation_id = ?`;
                    params.push(automationId);
                } else {
                    query += ` AND user_id = ?`;
                    params.push(userId);
                }
                
                query += ` AND started_at > date('now', '-30 days')`;

                db.get(query, params, (err, stats) => {
                    if (err) reject(err);
                    
                    // Get runs by day
                    db.all(`
                        SELECT 
                            date(started_at) as date,
                            COUNT(*) as runs,
                            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
                        FROM automation_runs
                        WHERE ${automationId ? 'automation_id = ?' : 'user_id = ?'}
                        AND started_at > date('now', '-7 days')
                        GROUP BY date(started_at)
                        ORDER BY date ASC
                    `, params, (err, dailyRuns) => {
                        if (err) reject(err);
                        
                        resolve({
                            summary: stats || {
                                total_runs: 0,
                                successful_runs: 0,
                                failed_runs: 0,
                                avg_duration: 0,
                                min_duration: 0,
                                max_duration: 0,
                                total_hours_saved: 0
                            },
                            daily: dailyRuns || [],
                            success_rate: stats?.total_runs ? 
                                Math.round((stats.successful_runs / stats.total_runs) * 100) : 0
                        });
                    });
                });
            });
        });
    }

    // ==================== LEAD METRICS ====================

    async getLeadMetrics(userId, days = 30) {
        const key = `leads_${userId}_${days}`;
        
        return this.getCachedOrCompute(key, async () => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        date(created_at) as date,
                        COUNT(*) as count
                    FROM leads
                    WHERE user_id = ? AND created_at > date('now', ? || ' days')
                    GROUP BY date(created_at)
                    ORDER BY date ASC
                `, [userId, days], (err, dailyLeads) => {
                    if (err) reject(err);
                    
                    db.get(`
                        SELECT 
                            COUNT(*) as total,
                            COUNT(DISTINCT company) as unique_companies,
                            COUNT(CASE WHEN job_title IS NOT NULL AND job_title != '' THEN 1 END) as with_job_titles
                        FROM leads
                        WHERE user_id = ?
                    `, [userId], (err, totals) => {
                        if (err) reject(err);
                        
                        // Get lead scores
                        db.all(`
                            SELECT 
                                AVG(score) as avg_score,
                                COUNT(*) as total_scored
                            FROM lead_scores
                            WHERE user_id = ? AND scored_at > date('now', ? || ' days')
                        `, [userId, days], (err, scores) => {
                            if (err) reject(err);
                            
                            resolve({
                                daily: dailyLeads || [],
                                totals: totals || { total: 0, unique_companies: 0, with_job_titles: 0 },
                                scoring: {
                                    average_score: scores[0]?.avg_score || 0,
                                    total_scored: scores[0]?.total_scored || 0
                                },
                                growth_rate: this.calculateGrowthRate(dailyLeads || [])
                            });
                        });
                    });
                });
            });
        });
    }

    // ==================== USAGE COST METRICS ====================

    async getCostMetrics(userId, days = 30) {
        const key = `cost_${userId}_${days}`;
        
        return this.getCachedOrCompute(key, async () => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        provider,
                        SUM(cost) as total_cost,
                        SUM(tokens) as total_tokens,
                        COUNT(*) as calls
                    FROM usage_logs
                    WHERE user_id = ? AND timestamp > date('now', ? || ' days')
                    GROUP BY provider
                `, [userId, days], (err, byProvider) => {
                    if (err) reject(err);
                    
                    db.get(`
                        SELECT 
                            SUM(cost) as total_cost,
                            SUM(tokens) as total_tokens,
                            COUNT(*) as total_calls
                        FROM usage_logs
                        WHERE user_id = ? AND timestamp > date('now', ? || ' days')
                    `, [userId, days], (err, totals) => {
                        if (err) reject(err);
                        
                        // Daily breakdown
                        db.all(`
                            SELECT 
                                date(timestamp) as date,
                                SUM(cost) as cost
                            FROM usage_logs
                            WHERE user_id = ? AND timestamp > date('now', '
                                                        FROM usage_logs
                            WHERE user_id = ? AND timestamp > date('now', '-30 days')
                            GROUP BY date(timestamp)
                            ORDER BY date ASC
                        `, [userId], (err, daily) => {
                            if (err) reject(err);
                            
                            resolve({
                                by_provider: byProvider || [],
                                totals: totals || { total_cost: 0, total_tokens: 0, total_calls: 0 },
                                daily: daily || [],
                                projected_monthly: (totals?.total_cost || 0) * (30 / Math.min(days, 30))
                            });
                        });
                    });
                });
            });
        });
    }

    // ==================== PLATFORM METRICS ====================

    async getPlatformMetrics(userId) {
        const key = `platforms_${userId}`;
        
        return this.getCachedOrCompute(key, async () => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        platform,
                        COUNT(*) as account_count,
                        MAX(last_sync) as last_sync,
                        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
                    FROM connected_accounts
                    WHERE user_id = ?
                    GROUP BY platform
                `, [userId], (err, platforms) => {
                    if (err) reject(err);
                    
                    db.get(`
                        SELECT 
                            COUNT(*) as total_accounts,
                            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_accounts,
                            COUNT(CASE WHEN last_sync > datetime('now', '-1 day') THEN 1 END) as synced_today
                        FROM connected_accounts
                        WHERE user_id = ?
                    `, [userId], (err, totals) => {
                        if (err) reject(err);
                        
                        resolve({
                            platforms: platforms || [],
                            totals: totals || { total_accounts: 0, active_accounts: 0, synced_today: 0 }
                        });
                    });
                });
            });
        });
    }

    // ==================== ACTIVITY METRICS ====================

    async getActivityMetrics(userId, days = 7) {
        const key = `activity_${userId}_${days}`;
        
        return this.getCachedOrCompute(key, async () => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        type,
                        COUNT(*) as count,
                        date(timestamp) as date
                    FROM activity_log
                    WHERE user_id = ? AND timestamp > date('now', ? || ' days')
                    GROUP BY type, date(timestamp)
                    ORDER BY date DESC
                `, [userId, days], (err, byType) => {
                    if (err) reject(err);
                    
                    db.get(`
                        SELECT 
                            COUNT(*) as total_activities,
                            COUNT(DISTINCT date(timestamp)) as active_days
                        FROM activity_log
                        WHERE user_id = ? AND timestamp > date('now', ? || ' days')
                    `, [userId, days], (err, totals) => {
                        if (err) reject(err);
                        
                        // Group by type for summary
                        const typeSummary = {};
                        (byType || []).forEach(item => {
                            if (!typeSummary[item.type]) {
                                typeSummary[item.type] = 0;
                            }
                            typeSummary[item.type] += item.count;
                        });
                        
                        resolve({
                            by_type: typeSummary,
                            daily: byType || [],
                            totals: totals || { total_activities: 0, active_days: 0 },
                            average_per_day: totals?.total_activities ? 
                                Math.round(totals.total_activities / days) : 0
                        });
                    });
                });
            });
        });
    }

    // ==================== PERFORMANCE METRICS ====================

    async getPerformanceMetrics(userId) {
        const key = `performance_${userId}`;
        
        return this.getCachedOrCompute(key, async () => {
            return new Promise((resolve, reject) => {
                // Agent performance
                db.all(`
                    SELECT 
                        name,
                        success_rate,
                        avg_latency,
                        total_runs,
                        updated_at
                    FROM agent_performance
                    WHERE user_id = ?
                    ORDER BY total_runs DESC
                    LIMIT 10
                `, [userId], (err, agents) => {
                    if (err) reject(err);
                    
                    // System health
                    db.get(`
                        SELECT 
                            AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100 as overall_success_rate,
                            AVG(duration) as avg_response_time,
                            COUNT(*) as total_requests_24h
                        FROM automation_runs
                        WHERE user_id = ? AND started_at > datetime('now', '-1 day')
                    `, [userId], (err, system) => {
                        if (err) reject(err);
                        
                        resolve({
                            agents: agents || [],
                            system: system || {
                                overall_success_rate: 0,
                                avg_response_time: 0,
                                total_requests_24h: 0
                            }
                        });
                    });
                });
            });
        });
    }

    // ==================== DASHBOARD SUMMARY ====================

    async getDashboardSummary(userId) {
        try {
            const [user, automations, leads, costs, activity, platforms] = await Promise.all([
                this.getUserMetrics(userId, 30),
                this.getAutomationMetrics(userId),
                this.getLeadMetrics(userId, 30),
                this.getCostMetrics(userId, 30),
                this.getActivityMetrics(userId, 7),
                this.getPlatformMetrics(userId)
            ]);

            return {
                user: user || {},
                automations: automations || { summary: {}, daily: [], success_rate: 0 },
                leads: leads || { totals: {}, daily: [], scoring: {} },
                costs: costs || { totals: {}, by_provider: [], daily: [] },
                activity: activity || { totals: {}, by_type: {}, daily: [] },
                platforms: platforms || { totals: {}, platforms: [] },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting dashboard summary:', error);
            throw error;
        }
    }

    // ==================== HELPER FUNCTIONS ====================

    calculateGrowthRate(dailyData) {
        if (!dailyData || dailyData.length < 2) return 0;
        
        const firstWeek = dailyData.slice(0, 7).reduce((sum, d) => sum + d.count, 0);
        const lastWeek = dailyData.slice(-7).reduce((sum, d) => sum + d.count, 0);
        
        if (firstWeek === 0) return 100;
        
        return Math.round(((lastWeek - firstWeek) / firstWeek) * 100);
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return `${minutes}m ${seconds}s`;
    }

    // Clear cache for a user
    clearUserCache(userId) {
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (key.includes(userId)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    // Clear all cache
    clearAllCache() {
        this.cache.clear();
    }
}

module.exports = MetricsService;