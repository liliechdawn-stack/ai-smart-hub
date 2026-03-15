// api/analytics-routes.js
const dbModule = require('../backend/database');
const { db } = dbModule;
const express = require('express');
const router = express.Router();
const { auth } = require('../backend/auth');

// ================= DASHBOARD ANALYTICS =================
router.get('/dashboard', auth, (req, res) => {
    const userId = req.user.id;
    
    // Get comprehensive analytics for the dashboard
    const queries = {
        automationStats: `SELECT 
            COUNT(*) as total_automations,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_automations,
            SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused_automations,
            SUM(trigger_count) as total_triggers,
            SUM(success_count) as total_success,
            AVG(success_count * 100.0 / NULLIF(trigger_count, 0)) as avg_success_rate
        FROM automations WHERE user_id = ?`,
        
        recentRuns: `SELECT ar.*, a.name as automation_name 
            FROM automation_runs ar
            JOIN automations a ON ar.automation_id = a.id
            WHERE ar.user_id = ?
            ORDER BY ar.completed_at DESC LIMIT 10`,
        
        dailyPerformance: `SELECT 
            date(completed_at) as date,
            COUNT(*) as runs,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
            AVG(duration) as avg_duration
        FROM automation_runs
        WHERE user_id = ? AND completed_at >= datetime('now', '-30 days')
        GROUP BY date(completed_at)
        ORDER BY date ASC`,
        
        topAutomations: `SELECT 
            id, name, trigger_count, success_count,
            (success_count * 100.0 / NULLIF(trigger_count, 0)) as success_rate
        FROM automations
        WHERE user_id = ?
        ORDER BY trigger_count DESC LIMIT 5`,
        
        platformStats: `SELECT 
            platform,
            COUNT(*) as account_count,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_accounts
        FROM connected_accounts
        WHERE user_id = ?
        GROUP BY platform`
    };
    
    // Execute all queries in parallel
    Promise.all([
        new Promise((resolve) => db.get(queries.automationStats, [userId], (_, row) => resolve(row || {}))),
        new Promise((resolve) => db.all(queries.recentRuns, [userId], (_, rows) => resolve(rows || []))),
        new Promise((resolve) => db.all(queries.dailyPerformance, [userId], (_, rows) => resolve(rows || []))),
        new Promise((resolve) => db.all(queries.topAutomations, [userId], (_, rows) => resolve(rows || []))),
        new Promise((resolve) => db.all(queries.platformStats, [userId], (_, rows) => resolve(rows || [])))
    ]).then(([stats, recentRuns, performance, topAutomations, platformStats]) => {
        res.json({
            success: true,
            stats,
            recentRuns,
            performance,
            topAutomations,
            platformStats
        });
    }).catch(err => {
        console.error('Analytics error:', err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    });
});

// ================= PERFORMANCE METRICS =================
router.get('/performance', auth, (req, res) => {
    const userId = req.user.id;
    const { days = 7 } = req.query;
    
    db.all(`
        SELECT 
            date(completed_at) as date,
            COUNT(*) as total_runs,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
            AVG(duration) as avg_duration_ms,
            SUM(duration) as total_duration_ms
        FROM automation_runs
        WHERE user_id = ? AND completed_at >= datetime('now', '-' || ? || ' days')
        GROUP BY date(completed_at)
        ORDER BY date ASC
    `, [userId, days], (err, rows) => {
        if (err) {
            console.error('Performance error:', err);
            return res.status(500).json({ error: 'Failed to fetch performance data' });
        }
        res.json(rows || []);
    });
});

// ================= AUTOMATION SUCCESS RATES =================
router.get('/success-rates', auth, (req, res) => {
    const userId = req.user.id;
    
    db.all(`
        SELECT 
            a.id,
            a.name,
            a.trigger_count,
            a.success_count,
            ROUND(a.success_count * 100.0 / NULLIF(a.trigger_count, 0), 2) as success_rate,
            a.last_run,
            a.status
        FROM automations a
        WHERE a.user_id = ?
        ORDER BY success_rate DESC
    `, [userId], (err, rows) => {
        if (err) {
            console.error('Success rates error:', err);
            return res.status(500).json({ error: 'Failed to fetch success rates' });
        }
        res.json(rows || []);
    });
});

// ================= TIME-SERIES DATA FOR CHARTS =================
router.get('/timeseries', auth, (req, res) => {
    const userId = req.user.id;
    const { metric = 'runs', interval = 'day' } = req.query;
    
    let timeFormat = '';
    let groupBy = '';
    
    switch(interval) {
        case 'hour':
            timeFormat = '%H:00';
            groupBy = 'strftime("%H", completed_at)';
            break;
        case 'day':
            timeFormat = '%Y-%m-%d';
            groupBy = 'date(completed_at)';
            break;
        case 'week':
            timeFormat = '%Y-%W';
            groupBy = 'strftime("%Y-%W", completed_at)';
            break;
        case 'month':
            timeFormat = '%Y-%m';
            groupBy = 'strftime("%Y-%m", completed_at)';
            break;
    }
    
    let valueField = 'COUNT(*)';
    if (metric === 'duration') valueField = 'AVG(duration)';
    if (metric === 'success') valueField = 'SUM(CASE WHEN status = "success" THEN 1 ELSE 0 END)';
    
    db.all(`
        SELECT 
            ${groupBy} as time_period,
            ${valueField} as value
        FROM automation_runs
        WHERE user_id = ? AND completed_at >= datetime('now', '-30 days')
        GROUP BY ${groupBy}
        ORDER BY time_period ASC
    `, [userId], (err, rows) => {
        if (err) {
            console.error('Timeseries error:', err);
            return res.status(500).json({ error: 'Failed to fetch timeseries data' });
        }
        res.json(rows || []);
    });
});

// ================= COST ANALYTICS =================
router.get('/costs', auth, (req, res) => {
    const userId = req.user.id;
    
    db.get(`
        SELECT 
            COUNT(*) as total_api_calls,
            SUM(duration) as total_compute_ms,
            COUNT(DISTINCT automation_id) as automations_used
        FROM automation_runs
        WHERE user_id = ? AND completed_at >= datetime('now', '-30 days')
    `, [userId], (err, usage) => {
        if (err) {
            console.error('Cost analytics error:', err);
            return res.status(500).json({ error: 'Failed to fetch cost data' });
        }
        
        // Estimate costs (you can adjust these rates)
        const estimatedCost = {
            api_calls: (usage?.total_api_calls || 0) * 0.0001, // $0.0001 per call
            compute: (usage?.total_compute_ms || 0) / 1000 * 0.00002, // $0.00002 per second
            total: 0
        };
        estimatedCost.total = estimatedCost.api_calls + estimatedCost.compute;
        
        res.json({
            usage: usage || { total_api_calls: 0, total_compute_ms: 0, automations_used: 0 },
            estimatedCost,
            currency: 'USD'
        });
    });
});

module.exports = router;
