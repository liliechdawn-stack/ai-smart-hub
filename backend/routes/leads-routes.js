// ================================================
// LEADS MANAGEMENT ROUTES - REAL PRODUCTION CODE
// Track and manage leads from all sources
// ================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../backend/supabase');
const { authenticateToken } = require('../backend/auth-middleware');

// ================================================
// GET ALL LEADS (with filters)
// ================================================
router.get('/leads', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { 
        status, 
        source, 
        from, 
        to, 
        search,
        limit = 50, 
        offset = 0,
        sort_by = 'created_at',
        sort_order = 'desc'
    } = req.query;

    try {
        let query = supabase
            .from('leads')
            .select(`
                *,
                automation:user_automations (
                    id,
                    name
                ),
                lead_scores (
                    score,
                    scored_at
                )
            `, { count: 'exact' })
            .eq('user_id', userId);

        // Apply filters
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        if (source && source !== 'all') {
            query = query.eq('source', source);
        }

        if (from) {
            query = query.gte('created_at', from);
        }

        if (to) {
            query = query.lte('created_at', to);
        }

        if (search) {
            query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        // Apply sorting
        query = query.order(sort_by, { ascending: sort_order === 'asc' });

        // Apply pagination
        query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        const { data: leads, error, count } = await query;

        if (error) throw error;

        // Get latest score for each lead
        const leadsWithScores = (leads || []).map(lead => {
            const latestScore = lead.lead_scores?.[0] || null;
            return {
                ...lead,
                lead_scores: undefined,
                score: latestScore?.score || 0,
                scored_at: latestScore?.scored_at || null
            };
        });

        res.json({
            success: true,
            leads: leadsWithScores,
            total: count || 0,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

// ================================================
// GET LEAD STATS
// ================================================
router.get('/leads/stats', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        // Get total leads
        const { count: total, error: totalError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (totalError) throw totalError;

        // Get leads by status
        const { data: statusCounts, error: statusError } = await supabase
            .from('leads')
            .select('status, count')
            .eq('user_id', userId)
            .group('status');

        if (statusError) throw statusError;

        // Get leads by source
        const { data: sourceCounts, error: sourceError } = await supabase
            .from('leads')
            .select('source, count')
            .eq('user_id', userId)
            .group('source');

        if (sourceError) throw sourceError;

        // Get leads this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count: thisMonth, error: monthError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', startOfMonth.toISOString());

        if (monthError) throw monthError;

        // Get conversion rate (leads that became customers)
        const { count: converted, error: convertedError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'converted');

        if (convertedError) throw convertedError;

        const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            stats: {
                total: total || 0,
                this_month: thisMonth || 0,
                converted: converted || 0,
                conversion_rate: conversionRate,
                by_status: statusCounts || [],
                by_source: sourceCounts || []
            }
        });

    } catch (error) {
        console.error('Error fetching lead stats:', error);
        res.status(500).json({ error: 'Failed to fetch lead stats' });
    }
});

// ================================================
// CREATE LEAD (from widget or manual)
// ================================================
router.post('/leads', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { 
        name, 
        email, 
        phone, 
        company,
        message,
        source,
        automation_id,
        metadata 
    } = req.body;

    try {
        const leadId = uuidv4();
        const now = new Date().toISOString();

        // Check if lead already exists (by email)
        if (email) {
            const { data: existing } = await supabase
                .from('leads')
                .select('id')
                .eq('user_id', userId)
                .eq('email', email)
                .maybeSingle();

            if (existing) {
                // Update existing lead
                const { data: updated, error } = await supabase
                    .from('leads')
                    .update({
                        name: name || existing.name,
                        phone: phone || existing.phone,
                        company: company || existing.company,
                        message: message || existing.message,
                        last_contact: now,
                        updated_at: now
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();

                if (error) throw error;

                return res.json({
                    success: true,
                    lead: updated,
                    message: 'Lead updated successfully'
                });
            }
        }

        // Create new lead
        const { data: lead, error } = await supabase
            .from('leads')
            .insert([{
                id: leadId,
                user_id: userId,
                automation_id: automation_id || null,
                name,
                email,
                phone,
                company,
                message,
                source: source || 'widget',
                status: 'new',
                metadata: metadata || {},
                created_at: now,
                updated_at: now
            }])
            .select()
            .single();

        if (error) throw error;

        // Auto-score the lead
        const score = calculateLeadScore(lead);
        
        await supabase
            .from('lead_scores')
            .insert([{
                id: uuidv4(),
                user_id: userId,
                lead_id: leadId,
                score: score,
                criteria: {
                    has_email: !!email,
                    has_phone: !!phone,
                    has_company: !!company,
                    has_message: !!message,
                    source: source
                },
                scored_at: now
            }]);

        // If automation_id provided, increment its lead count
        if (automation_id) {
            await supabase
                .from('user_automations')
                .update({
                    leads_generated: supabase.raw('leads_generated + 1')
                })
                .eq('id', automation_id)
                .eq('user_id', userId);
        }

        // Check if this is a hot lead (score > 80)
        if (score > 80) {
            // Create alert for hot lead
            await supabase
                .from('alerts')
                .insert([{
                    id: uuidv4(),
                    user_id: userId,
                    type: 'success',
                    severity: 'high',
                    title: '🔥 Hot Lead Detected!',
                    description: `${name} is a high-value lead with score ${score}`,
                    metadata: { lead_id: leadId },
                    created_at: now
                }]);

            // Send real-time notification
            if (global.io) {
                global.io.to(`user:${userId}`).emit('hot_lead', {
                    lead: lead,
                    score: score
                });
            }
        }

        // Log activity
        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'lead_created',
                details: `New lead from ${source}: ${name || email}`,
                type: 'lead',
                timestamp: now
            }]);

        res.json({
            success: true,
            lead: lead,
            score: score,
            message: 'Lead created successfully'
        });

    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({ error: 'Failed to create lead' });
    }
});

// ================================================
// UPDATE LEAD STATUS
// ================================================
router.put('/leads/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const { status, notes } = req.body;

    const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const { data: lead, error: fetchError } = await supabase
            .from('leads')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const { data, error } = await supabase
            .from('leads')
            .update({
                status: status,
                last_contact: new Date().toISOString(),
                notes: notes ? [...(lead.notes || []), {
                    text: notes,
                    timestamp: new Date().toISOString(),
                    user: userId
                }] : lead.notes,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        // Log activity
        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'lead_status_updated',
                details: `Lead ${data.name || data.email} marked as ${status}`,
                type: 'lead',
                timestamp: new Date().toISOString()
            }]);

        res.json({
            success: true,
            lead: data,
            message: `Lead marked as ${status}`
        });

    } catch (error) {
        console.error('Error updating lead status:', error);
        res.status(500).json({ error: 'Failed to update lead status' });
    }
});

// ================================================
// BULK LEAD OPERATIONS
// ================================================
router.post('/leads/bulk', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { action, lead_ids, data } = req.body;

    try {
        let result;

        switch (action) {
            case 'delete':
                const { error: deleteError } = await supabase
                    .from('leads')
                    .delete()
                    .eq('user_id', userId)
                    .in('id', lead_ids);

                if (deleteError) throw deleteError;
                result = { message: `Deleted ${lead_ids.length} leads` };
                break;

            case 'update_status':
                const { error: updateError } = await supabase
                    .from('leads')
                    .update({
                        status: data.status,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', userId)
                    .in('id', lead_ids);

                if (updateError) throw updateError;
                result = { message: `Updated ${lead_ids.length} leads to ${data.status}` };
                break;

            case 'export':
                const { data: leads, error: exportError } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('user_id', userId)
                    .in('id', lead_ids);

                if (exportError) throw exportError;
                result = { leads: leads };
                break;

            default:
                return res.status(400).json({ error: 'Invalid bulk action' });
        }

        // Log bulk activity
        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'bulk_lead_operation',
                details: `${action} performed on ${lead_ids.length} leads`,
                type: 'lead',
                timestamp: new Date().toISOString()
            }]);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error in bulk operation:', error);
        res.status(500).json({ error: 'Failed to perform bulk operation' });
    }
});

// Helper function to calculate lead score
function calculateLeadScore(lead) {
    let score = 50; // Base score

    if (lead.email) {
        // Check if business email (not gmail/yahoo)
        const domain = lead.email.split('@')[1];
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com'].includes(domain)) {
            score += 15;
        }
    }

    if (lead.phone) score += 10;
    if (lead.company) score += 10;
    
    if (lead.message) {
        score += 10;
        const message = lead.message.toLowerCase();
        if (message.includes('urgent') || message.includes('asap')) score += 10;
        if (message.includes('pricing') || message.includes('cost')) score += 5;
        if (message.includes('demo') || message.includes('meeting')) score += 10;
    }

    // Source-based scoring
    const sourceScores = {
        'widget': 5,
        'form': 10,
        'chat': 15,
        'referral': 20,
        'manual': 5
    };
    score += sourceScores[lead.source] || 0;

    return Math.min(100, score);
}

module.exports = router;