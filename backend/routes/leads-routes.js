// ================================================
// LEADS MANAGEMENT ROUTES - REAL PRODUCTION CODE
// Track and manage leads from all sources
// ================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../database-supabase');  // FIXED: Destructure supabase
const { authenticateToken } = require('../auth-middleware');

console.log('📋 LEADS MANAGEMENT ROUTES: Loading...');

// ================================================
// HELPER FUNCTION - Calculate lead score
// ================================================
function calculateLeadScore(lead, triggerData = {}) {
    let score = 50; // Base score

    // Email quality scoring
    if (lead.email) {
        const domain = lead.email.split('@')[1];
        // Business email gets higher score
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
            score += 15;
            console.log(`   +15: Business email domain (${domain})`);
        } else if (domain) {
            score += 5;
            console.log(`   +5: Personal email domain`);
        }
    }

    // Phone number scoring
    if (lead.phone) {
        score += 10;
        console.log(`   +10: Phone number provided`);
    }

    // Company scoring
    if (lead.company) {
        score += 10;
        console.log(`   +10: Company provided`);
    }
    
    // Message content scoring
    if (lead.message) {
        score += 10;
        const message = lead.message.toLowerCase();
        
        if (message.includes('urgent') || message.includes('asap') || message.includes('immediately')) {
            score += 15;
            console.log(`   +15: Urgent request detected`);
        }
        if (message.includes('pricing') || message.includes('cost') || message.includes('price')) {
            score += 10;
            console.log(`   +10: Pricing inquiry`);
        }
        if (message.includes('demo') || message.includes('meeting') || message.includes('call')) {
            score += 15;
            console.log(`   +15: Demo/meeting request`);
        }
        if (message.includes('buy') || message.includes('purchase') || message.includes('order')) {
            score += 20;
            console.log(`   +20: Purchase intent detected`);
        }
    }

    // Source-based scoring
    const sourceScores = {
        'widget': 5,
        'form': 10,
        'chat': 15,
        'referral': 20,
        'api': 10,
        'manual': 5,
        'automation': 8,
        'email': 8,
        'social': 6
    };
    const sourceScore = sourceScores[lead.source] || 0;
    score += sourceScore;
    if (sourceScore > 0) {
        console.log(`   +${sourceScore}: Source: ${lead.source}`);
    }

    // Trigger data bonus
    if (triggerData.message) {
        const message = triggerData.message.toLowerCase();
        if (message.includes('urgent')) score += 10;
        if (message.includes('budget')) score += 10;
        if (message.includes('timeline')) score += 5;
    }

    const finalScore = Math.min(100, score);
    console.log(`   Total score: ${finalScore}/100`);
    
    return finalScore;
}

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

    console.log(`📊 GET /leads - User: ${userId}, Filters: status=${status}, source=${source}`);

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
            const scores = lead.lead_scores || [];
            const latestScore = scores.sort((a, b) => 
                new Date(b.scored_at) - new Date(a.scored_at)
            )[0];
            return {
                ...lead,
                lead_scores: undefined,
                score: latestScore?.score || 0,
                scored_at: latestScore?.scored_at || null
            };
        });

        console.log(`✅ Found ${leadsWithScores.length} leads (total: ${count || 0})`);

        res.json({
            success: true,
            leads: leadsWithScores,
            total: count || 0,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ error: 'Failed to fetch leads', details: error.message });
    }
});

// ================================================
// GET LEAD STATS
// ================================================
router.get('/leads/stats', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    console.log(`📊 GET /leads/stats - User: ${userId}`);

    try {
        // Get total leads
        const { count: total, error: totalError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (totalError) throw totalError;

        // Get leads by status using individual queries (since group by may not work)
        const statuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
        const statusCounts = [];
        
        for (const status of statuses) {
            const { count, error } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('status', status);
            
            if (!error && count > 0) {
                statusCounts.push({ status, count });
            }
        }

        // Get leads by source
        const sources = ['widget', 'form', 'chat', 'email', 'social', 'api', 'manual', 'automation', 'referral'];
        const sourceCounts = [];
        
        for (const source of sources) {
            const { count, error } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('source', source);
            
            if (!error && count > 0) {
                sourceCounts.push({ source, count });
            }
        }

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

        // Get leads by day for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const { data: dailyLeads, error: dailyError } = await supabase
            .from('leads')
            .select('created_at')
            .eq('user_id', userId)
            .gte('created_at', sevenDaysAgo.toISOString());

        const dailyStats = {};
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            dailyStats[dateKey] = 0;
        }

        (dailyLeads || []).forEach(lead => {
            const dateKey = lead.created_at.split('T')[0];
            if (dailyStats[dateKey] !== undefined) {
                dailyStats[dateKey]++;
            }
        });

        console.log(`✅ Stats: ${total} total leads, ${thisMonth} this month, ${conversionRate}% conversion`);

        res.json({
            success: true,
            stats: {
                total: total || 0,
                this_month: thisMonth || 0,
                converted: converted || 0,
                conversion_rate: parseFloat(conversionRate),
                by_status: statusCounts,
                by_source: sourceCounts,
                daily: dailyStats
            }
        });

    } catch (error) {
        console.error('Error fetching lead stats:', error);
        res.status(500).json({ error: 'Failed to fetch lead stats', details: error.message });
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
        job_title,
        message,
        source,
        automation_id,
        metadata 
    } = req.body;

    console.log(`📝 CREATE LEAD - User: ${userId}, Name: ${name}, Email: ${email}`);

    if (!name && !email) {
        return res.status(400).json({ error: 'Name or email is required' });
    }

    try {
        const leadId = uuidv4();
        const now = new Date().toISOString();

        // Check if lead already exists (by email)
        if (email) {
            const { data: existing } = await supabase
                .from('leads')
                .select('id, name, email, phone, company')
                .eq('user_id', userId)
                .eq('email', email.toLowerCase().trim())
                .maybeSingle();

            if (existing) {
                console.log(`📝 Lead already exists: ${email}, updating...`);
                
                // Update existing lead
                const { data: updated, error } = await supabase
                    .from('leads')
                    .update({
                        name: name || existing.name,
                        phone: phone || existing.phone,
                        company: company || existing.company,
                        job_title: job_title || existing.job_title,
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
                    existing: true,
                    message: 'Lead updated successfully'
                });
            }
        }

        // Create new lead
        const leadData = {
            id: leadId,
            user_id: userId,
            automation_id: automation_id || null,
            name: name || null,
            email: email ? email.toLowerCase().trim() : null,
            phone: phone || null,
            company: company || null,
            job_title: job_title || null,
            message: message || null,
            source: source || 'manual',
            status: 'new',
            metadata: metadata || {},
            created_at: now,
            updated_at: now
        };

        const { data: lead, error } = await supabase
            .from('leads')
            .insert([leadData])
            .select()
            .single();

        if (error) throw error;

        // Auto-score the lead
        const score = calculateLeadScore(lead, { message });
        
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
                    has_job_title: !!job_title,
                    has_message: !!message,
                    source: source || 'manual'
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
                    description: `${lead.name || lead.email} is a high-value lead with score ${score}`,
                    metadata: { lead_id: leadId },
                    created_at: now
                }]);

            // Send real-time notification
            if (global.io) {
                global.io.to(`user:${userId}`).emit('hot_lead', {
                    lead: lead,
                    score: score
                });
                console.log(`🔥 HOT LEAD ALERT sent to user ${userId}`);
            }
        }

        // Log activity
        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'lead_created',
                details: `New lead from ${source || 'manual'}: ${lead.name || lead.email}`,
                type: 'lead',
                timestamp: now
            }]);

        console.log(`✅ Lead created: ${lead.name || lead.email} (Score: ${score})`);

        res.json({
            success: true,
            lead: lead,
            score: score,
            message: 'Lead created successfully'
        });

    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({ error: 'Failed to create lead', details: error.message });
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
        return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    console.log(`📝 UPDATE LEAD STATUS - User: ${userId}, Lead: ${id}, Status: ${status}`);

    try {
        const { data: lead, error: fetchError } = await supabase
            .from('leads')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lead not found' });
            }
            throw fetchError;
        }

        // Prepare update data
        const updateData = {
            status: status,
            last_contact: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Add notes if provided
        if (notes) {
            const existingNotes = lead.notes || [];
            updateData.notes = [...existingNotes, {
                text: notes,
                timestamp: new Date().toISOString(),
                user: userId
            }];
        }

        const { data, error } = await supabase
            .from('leads')
            .update(updateData)
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

        // Broadcast update
        if (global.io) {
            global.io.to(`user:${userId}`).emit('lead_updated', {
                lead_id: id,
                status: status,
                lead: data
            });
        }

        console.log(`✅ Lead ${id} status updated to ${status}`);

        res.json({
            success: true,
            lead: data,
            message: `Lead marked as ${status}`
        });

    } catch (error) {
        console.error('Error updating lead status:', error);
        res.status(500).json({ error: 'Failed to update lead status', details: error.message });
    }
});

// ================================================
// GET SINGLE LEAD
// ================================================
router.get('/leads/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`📊 GET /leads/${id} - User: ${userId}`);

    try {
        const { data: lead, error } = await supabase
            .from('leads')
            .select(`
                *,
                automation:user_automations (
                    id,
                    name
                ),
                lead_scores (
                    score,
                    scored_at,
                    criteria
                )
            `)
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lead not found' });
            }
            throw error;
        }

        // Get scores in order
        const scores = lead.lead_scores || [];
        scores.sort((a, b) => new Date(b.scored_at) - new Date(a.scored_at));

        res.json({
            success: true,
            lead: {
                ...lead,
                lead_scores: scores,
                current_score: scores[0]?.score || 0
            }
        });

    } catch (error) {
        console.error('Error fetching lead:', error);
        res.status(500).json({ error: 'Failed to fetch lead', details: error.message });
    }
});

// ================================================
// DELETE LEAD
// ================================================
router.delete('/leads/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ DELETE /leads/${id} - User: ${userId}`);

    try {
        // Get lead info for logging
        const { data: lead, error: fetchError } = await supabase
            .from('leads')
            .select('name, email')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lead not found' });
            }
            throw fetchError;
        }

        // Delete lead scores first (foreign key)
        await supabase
            .from('lead_scores')
            .delete()
            .eq('lead_id', id);

        // Delete lead
        const { error } = await supabase
            .from('leads')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;

        // Log activity
        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'lead_deleted',
                details: `Deleted lead: ${lead.name || lead.email}`,
                type: 'lead',
                timestamp: new Date().toISOString()
            }]);

        console.log(`✅ Lead ${id} deleted successfully`);

        res.json({
            success: true,
            message: 'Lead deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting lead:', error);
        res.status(500).json({ error: 'Failed to delete lead', details: error.message });
    }
});

// ================================================
// BULK LEAD OPERATIONS
// ================================================
router.post('/leads/bulk', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { action, lead_ids, data } = req.body;

    console.log(`📦 BULK LEAD OPERATION - User: ${userId}, Action: ${action}, Count: ${lead_ids?.length || 0}`);

    if (!lead_ids || !lead_ids.length) {
        return res.status(400).json({ error: 'No lead IDs provided' });
    }

    try {
        let result;

        switch (action) {
            case 'delete':
                // Delete lead scores first
                await supabase
                    .from('lead_scores')
                    .delete()
                    .in('lead_id', lead_ids);

                const { error: deleteError } = await supabase
                    .from('leads')
                    .delete()
                    .eq('user_id', userId)
                    .in('id', lead_ids);

                if (deleteError) throw deleteError;
                result = { message: `Deleted ${lead_ids.length} leads` };
                break;

            case 'update_status':
                if (!data?.status) {
                    return res.status(400).json({ error: 'Status required for update_status action' });
                }
                
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
                return res.status(400).json({ error: 'Invalid bulk action. Use: delete, update_status, or export' });
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

        console.log(`✅ Bulk operation ${action} completed on ${lead_ids.length} leads`);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error in bulk operation:', error);
        res.status(500).json({ error: 'Failed to perform bulk operation', details: error.message });
    }
});

// ================================================
// EXPORT LEADS (CSV)
// ================================================
router.get('/leads/export/csv', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { status, source, from, to } = req.query;

    console.log(`📊 EXPORT LEADS CSV - User: ${userId}`);

    try {
        let query = supabase
            .from('leads')
            .select('*')
            .eq('user_id', userId);

        if (status && status !== 'all') query = query.eq('status', status);
        if (source && source !== 'all') query = query.eq('source', source);
        if (from) query = query.gte('created_at', from);
        if (to) query = query.lte('created_at', to);

        const { data: leads, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Generate CSV
        const headers = ['ID', 'Name', 'Email', 'Phone', 'Company', 'Job Title', 'Source', 'Status', 'Message', 'Created At'];
        const csvRows = [headers];

        for (const lead of leads || []) {
            csvRows.push([
                lead.id,
                lead.name || '',
                lead.email || '',
                lead.phone || '',
                lead.company || '',
                lead.job_title || '',
                lead.source || '',
                lead.status || '',
                (lead.message || '').replace(/,/g, ';'),
                lead.created_at
            ]);
        }

        const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=leads_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvContent);

        console.log(`✅ Exported ${leads?.length || 0} leads to CSV`);

    } catch (error) {
        console.error('Error exporting leads:', error);
        res.status(500).json({ error: 'Failed to export leads', details: error.message });
    }
});

console.log('✅ LEADS MANAGEMENT ROUTES: All routes registered');
console.log('   - GET /leads');
console.log('   - GET /leads/stats');
console.log('   - GET /leads/:id');
console.log('   - POST /leads');
console.log('   - PUT /leads/:id/status');
console.log('   - DELETE /leads/:id');
console.log('   - POST /leads/bulk');
console.log('   - GET /leads/export/csv');

module.exports = router;