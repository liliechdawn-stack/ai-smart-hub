// api/analytics-routes.js
const express = require('express');
const router = express.Router();
const { auth } = require('../backend/auth');

// Import shared Supabase client
const supabase = require('../backend/supabase');

console.log('✅ ANALYTICS ROUTES: Using shared Supabase client');

// Helper function to execute multiple promises in parallel
const promiseAll = async (promises) => {
    return Promise.all(promises.map(p => p.catch(e => {
        console.error('Promise error:', e);
        return null;
    })));
};

// ================= DASHBOARD ANALYTICS =================
router.get('/dashboard', auth, async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        // Execute all queries in parallel
        const [statsResult, recentRunsResult, performanceResult, topAutomationsResult, platformStatsResult] = await promiseAll([
            // Automation Stats
            (async () => {
                const { data, error } = await supabase
                    .from('automations')
                    .select('status, trigger_count, success_count')
                    .eq('user_id', userId);
                
                if (error) throw error;
                
                const stats = {
                    total_automations: data?.length || 0,
                    active_automations: data?.filter(a => a.status === 'active').length || 0,
                    paused_automations: data?.filter(a => a.status === 'paused').length || 0,
                    total_triggers: data?.reduce((sum, a) => sum + (a.trigger_count || 0), 0) || 0,
                    total_success: data?.reduce((sum, a) => sum + (a.success_count || 0), 0) || 0,
                    avg_success_rate: 0
                };
                
                if (stats.total_triggers > 0) {
                    stats.avg_success_rate = (stats.total_success / stats.total_triggers) * 100;
                }
                
                return stats;
            })(),
            
            // Recent Runs
            (async () => {
                const { data, error } = await supabase
                    .from('automation_runs')
                    .select(`
                        *,
                        automations!inner (
                            name
                        )
                    `)
                    .eq('user_id', userId)
                    .order('completed_at', { ascending: false })
                    .limit(10);
                
                if (error) throw error;
                
                return (data || []).map(run => ({
                    ...run,
                    automation_name: run.automations?.name
                }));
            })(),
            
            // Daily Performance (last 30 days)
            (async () => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                const { data, error } = await supabase
                    .from('automation_runs')
                    .select('completed_at, status, duration')
                    .eq('user_id', userId)
                    .gte('completed_at', thirtyDaysAgo.toISOString());
                
                if (error) throw error;
                
                // Group by date manually since Supabase doesn't have SQLite's date functions
                const dailyData = {};
                (data || []).forEach(run => {
                    if (!run.completed_at) return;
                    
                    const date = run.completed_at.split('T')[0];
                    if (!dailyData[date]) {
                        dailyData[date] = {
                            date,
                            runs: 0,
                            successes: 0,
                            total_duration: 0
                        };
                    }
                    
                    dailyData[date].runs++;
                    if (run.status === 'success' || run.status === 'completed') {
                        dailyData[date].successes++;
                    }
                    if (run.duration) {
                        dailyData[date].total_duration += run.duration;
                    }
                });
                
                return Object.values(dailyData).map(day => ({
                    ...day,
                    avg_duration: day.runs > 0 ? day.total_duration / day.runs : 0
                })).sort((a, b) => a.date.localeCompare(b.date));
            })(),
            
            // Top Automations
            (async () => {
                const { data, error } = await supabase
                    .from('automations')
                    .select('id, name, trigger_count, success_count')
                    .eq('user_id', userId)
                    .order('trigger_count', { ascending: false })
                    .limit(5);
                
                if (error) throw error;
                
                return (data || []).map(auto => ({
                    ...auto,
                    success_rate: auto.trigger_count > 0 
                        ? (auto.success_count / auto.trigger_count) * 100 
                        : 0
                }));
            })(),
            
            // Platform Stats
            (async () => {
                const { data, error } = await supabase
                    .from('connected_accounts')
                    .select('platform, status')
                    .eq('user_id', userId);
                
                if (error) throw error;
                
                const platformStats = {};
                (data || []).forEach(account => {
                    if (!platformStats[account.platform]) {
                        platformStats[account.platform] = {
                            platform: account.platform,
                            account_count: 0,
                            active_accounts: 0
                        };
                    }
                    
                    platformStats[account.platform].account_count++;
                    if (account.status === 'active') {
                        platformStats[account.platform].active_accounts++;
                    }
                });
                
                return Object.values(platformStats);
            })()
        ]);
        
        res.json({
            success: true,
            stats: statsResult || {},
            recentRuns: recentRunsResult || [],
            performance: performanceResult || [],
            topAutomations: topAutomationsResult || [],
            platformStats: platformStatsResult || []
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ================= PERFORMANCE METRICS =================
router.get('/performance', auth, async (req, res) => {
    const userId = req.user.id;
    const { days = 7 } = req.query;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));
        
        const { data, error } = await supabase
            .from('automation_runs')
            .select('completed_at, status, duration')
            .eq('user_id', userId)
            .gte('completed_at', daysAgo.toISOString());
        
        if (error) throw error;
        
        // Group by date
        const dailyData = {};
        (data || []).forEach(run => {
            if (!run.completed_at) return;
            
            const date = run.completed_at.split('T')[0];
            if (!dailyData[date]) {
                dailyData[date] = {
                    date,
                    total_runs: 0,
                    successful_runs: 0,
                    failed_runs: 0,
                    total_duration_ms: 0,
                    runs_with_duration: 0
                };
            }
            
            dailyData[date].total_runs++;
            if (run.status === 'success' || run.status === 'completed') {
                dailyData[date].successful_runs++;
            } else if (run.status === 'failed') {
                dailyData[date].failed_runs++;
            }
            
            if (run.duration) {
                dailyData[date].total_duration_ms += run.duration;
                dailyData[date].runs_with_duration++;
            }
        });
        
        const result = Object.values(dailyData).map(day => ({
            ...day,
            avg_duration_ms: day.runs_with_duration > 0 
                ? day.total_duration_ms / day.runs_with_duration 
                : 0
        })).sort((a, b) => a.date.localeCompare(b.date));
        
        res.json(result);
    } catch (error) {
        console.error('Performance error:', error);
        return res.status(500).json({ error: 'Failed to fetch performance data' });
    }
});

// ================= AUTOMATION SUCCESS RATES =================
router.get('/success-rates', auth, async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const { data, error } = await supabase
            .from('automations')
            .select('id, name, trigger_count, success_count, last_run, status')
            .eq('user_id', userId)
            .order('trigger_count', { ascending: false });
        
        if (error) throw error;
        
        const result = (data || []).map(auto => ({
            ...auto,
            success_rate: auto.trigger_count > 0 
                ? parseFloat(((auto.success_count / auto.trigger_count) * 100).toFixed(2))
                : 0
        }));
        
        res.json(result);
    } catch (error) {
        console.error('Success rates error:', error);
        return res.status(500).json({ error: 'Failed to fetch success rates' });
    }
});

// ================= TIME-SERIES DATA FOR CHARTS =================
router.get('/timeseries', auth, async (req, res) => {
    const userId = req.user.id;
    const { metric = 'runs', interval = 'day' } = req.query;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data, error } = await supabase
            .from('automation_runs')
            .select('completed_at, status, duration')
            .eq('user_id', userId)
            .gte('completed_at', thirtyDaysAgo.toISOString());
        
        if (error) throw error;
        
        // Group by time period based on interval
        const groupedData = {};
        
        (data || []).forEach(run => {
            if (!run.completed_at) return;
            
            const date = new Date(run.completed_at);
            let timePeriod;
            
            switch(interval) {
                case 'hour':
                    timePeriod = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    break;
                case 'week': {
                    const firstDay = new Date(date.setDate(date.getDate() - date.getDay()));
                    timePeriod = `${firstDay.getFullYear()}-W${Math.ceil((firstDay.getDate() + new Date(firstDay.getFullYear(), firstDay.getMonth(), 1).getDay()) / 7)}`;
                    break;
                }
                case 'month':
                    timePeriod = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
                case 'day':
                default:
                    timePeriod = run.completed_at.split('T')[0];
                    break;
            }
            
            if (!groupedData[timePeriod]) {
                groupedData[timePeriod] = {
                    time_period: timePeriod,
                    count: 0,
                    total_duration: 0,
                    successes: 0
                };
            }
            
            groupedData[timePeriod].count++;
            if (run.status === 'success' || run.status === 'completed') {
                groupedData[timePeriod].successes++;
            }
            if (run.duration) {
                groupedData[timePeriod].total_duration += run.duration;
            }
        });
        
        // Calculate value based on requested metric
        const result = Object.values(groupedData).map(item => {
            let value;
            switch(metric) {
                case 'duration':
                    value = item.count > 0 ? item.total_duration / item.count : 0;
                    break;
                case 'success':
                    value = item.successes;
                    break;
                case 'runs':
                default:
                    value = item.count;
                    break;
            }
            
            return {
                time_period: item.time_period,
                value
            };
        }).sort((a, b) => a.time_period.localeCompare(b.time_period));
        
        res.json(result);
    } catch (error) {
        console.error('Timeseries error:', error);
        return res.status(500).json({ error: 'Failed to fetch timeseries data' });
    }
});

// ================= COST ANALYTICS =================
router.get('/costs', auth, async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: runs, error: runsError } = await supabase
            .from('automation_runs')
            .select('duration, automation_id')
            .eq('user_id', userId)
            .gte('completed_at', thirtyDaysAgo.toISOString());
        
        if (runsError) throw runsError;
        
        // Get unique automation IDs
        const uniqueAutomations = new Set();
        let totalDuration = 0;
        let totalRuns = 0;
        
        (runs || []).forEach(run => {
            if (run.automation_id) {
                uniqueAutomations.add(run.automation_id);
            }
            if (run.duration) {
                totalDuration += run.duration;
            }
            totalRuns++;
        });
        
        const usage = {
            total_api_calls: totalRuns,
            total_compute_ms: totalDuration,
            automations_used: uniqueAutomations.size
        };
        
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
    } catch (error) {
        console.error('Cost analytics error:', error);
        return res.status(500).json({ error: 'Failed to fetch cost data' });
    }
});

module.exports = router;