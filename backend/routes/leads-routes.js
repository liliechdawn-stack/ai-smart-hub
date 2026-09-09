// ================================================
// LEADS MANAGEMENT ROUTES - PRODUCTION HARDENED
// Track and manage leads from all sources
// ================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../database-supabase');
const { authenticateToken } = require('../auth-middleware');

console.log('📋 LEADS MANAGEMENT ROUTES: Loading...');

// ================================================
// CONSTANTS
// ================================================

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const MAX_BULK_IDS = 100;
const MAX_SEARCH_LENGTH = 100;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MAX_PHONE_LENGTH = 30;
const MAX_COMPANY_LENGTH = 100;
const MAX_JOB_TITLE_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_NOTES_LENGTH = 1000;
const MAX_METADATA_SIZE = 1024 * 10; // 10KB
const MAX_METADATA_KEYS = 50;
const MAX_METADATA_DEPTH = 5;
const MAX_DATE_RANGE_DAYS = 365;

const VALID_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const VALID_SOURCES = ['widget', 'form', 'chat', 'referral', 'api', 'manual', 'automation', 'email', 'social'];
const VALID_SORT_FIELDS = ['created_at', 'updated_at', 'name', 'email', 'status', 'source', 'lead_score'];
const VALID_SORT_ORDERS = ['asc', 'desc'];
const VALID_BULK_ACTIONS = ['delete', 'update_status', 'export'];

// Dangerous metadata keys to reject
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'];

// ================================================
// STRUCTURED VALIDATION ERROR
// ================================================

class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.code = 'VALIDATION_ERROR';
    }
}

// ================================================
// VALIDATION HELPERS
// ================================================

function validateId(id) {
    if (!id || typeof id !== 'string') {
        throw new ValidationError('Invalid ID format', 'id');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new ValidationError('Invalid ID format', 'id');
    }
    return id;
}

function validateEmail(email) {
    if (!email) return null;
    if (typeof email !== 'string') {
        throw new ValidationError('Email must be a string', 'email');
    }
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length > MAX_EMAIL_LENGTH) {
        throw new ValidationError(`Email exceeds maximum length of ${MAX_EMAIL_LENGTH}`, 'email');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new ValidationError('Invalid email format', 'email');
    }
    return trimmed;
}

function validateString(value, fieldName, maxLength, required = false) {
    if (value === null || value === undefined) {
        if (required) throw new ValidationError(`${fieldName} is required`, fieldName);
        return null;
    }
    if (typeof value !== 'string') {
        throw new ValidationError(`${fieldName} must be a string`, fieldName);
    }
    const trimmed = value.trim();
    if (required && trimmed.length === 0) {
        throw new ValidationError(`${fieldName} cannot be empty`, fieldName);
    }
    if (trimmed.length > maxLength) {
        throw new ValidationError(`${fieldName} exceeds maximum length of ${maxLength}`, fieldName);
    }
    return trimmed;
}

function validateStatus(status) {
    if (!status) return null;
    if (typeof status !== 'string') {
        throw new ValidationError('Status must be a string', 'status');
    }
    const normalized = status.toLowerCase();
    if (!VALID_STATUSES.includes(normalized)) {
        throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 'status');
    }
    return normalized;
}

function validateSource(source) {
    if (!source) return null;
    if (typeof source !== 'string') {
        throw new ValidationError('Source must be a string', 'source');
    }
    const normalized = source.toLowerCase();
    if (!VALID_SOURCES.includes(normalized)) {
        throw new ValidationError(`Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`, 'source');
    }
    return normalized;
}

function validateLimit(limit) {
    const parsed = parseInt(limit);
    if (isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
}

function validateOffset(offset) {
    const parsed = parseInt(offset);
    if (isNaN(parsed) || parsed < 0) return 0;
    return parsed;
}

function validateSortField(field) {
    if (!field) return 'created_at';
    if (typeof field !== 'string') {
        throw new ValidationError('Sort field must be a string', 'sort_by');
    }
    if (!VALID_SORT_FIELDS.includes(field)) {
        throw new ValidationError(`Invalid sort field. Must be one of: ${VALID_SORT_FIELDS.join(', ')}`, 'sort_by');
    }
    return field;
}

function validateSortOrder(order) {
    if (!order) return 'desc';
    if (typeof order !== 'string') {
        throw new ValidationError('Sort order must be a string', 'sort_order');
    }
    const normalized = order.toLowerCase();
    if (!VALID_SORT_ORDERS.includes(normalized)) {
        throw new ValidationError(`Invalid sort order. Must be one of: ${VALID_SORT_ORDERS.join(', ')}`, 'sort_order');
    }
    return normalized;
}

function validateSearch(search) {
    if (!search) return null;
    if (typeof search !== 'string') {
        throw new ValidationError('Search term must be a string', 'search');
    }
    if (search.length > MAX_SEARCH_LENGTH) {
        throw new ValidationError(`Search term exceeds maximum length of ${MAX_SEARCH_LENGTH}`, 'search');
    }
    // Remove potentially dangerous characters
    return search.trim().replace(/[%_]/g, '\\$&');
}

function validateDate(dateStr, fieldName) {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') {
        throw new ValidationError(`${fieldName} must be a string`, fieldName);
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        throw new ValidationError(`Invalid date format for ${fieldName}`, fieldName);
    }
    // Check if date is within reasonable range
    const now = new Date();
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 10);
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 10);
    if (date < minDate || date > maxDate) {
        throw new ValidationError(`${fieldName} is outside acceptable date range`, fieldName);
    }
    return dateStr;
}

function validateBulkIds(ids) {
    if (!Array.isArray(ids)) {
        throw new ValidationError('lead_ids must be an array', 'lead_ids');
    }
    if (ids.length === 0) {
        throw new ValidationError('No lead IDs provided', 'lead_ids');
    }
    if (ids.length > MAX_BULK_IDS) {
        throw new ValidationError(`Maximum ${MAX_BULK_IDS} IDs allowed per request`, 'lead_ids');
    }
    const uniqueIds = [...new Set(ids)];
    uniqueIds.forEach(id => validateId(id));
    return uniqueIds;
}

function validateMetadata(metadata) {
    if (!metadata) return {};
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new ValidationError('Metadata must be an object', 'metadata');
    }

    // Check size
    const jsonStr = JSON.stringify(metadata);
    if (jsonStr.length > MAX_METADATA_SIZE) {
        throw new ValidationError(`Metadata exceeds maximum size of ${MAX_METADATA_SIZE} bytes`, 'metadata');
    }

    // Check key count
    const keys = Object.keys(metadata);
    if (keys.length > MAX_METADATA_KEYS) {
        throw new ValidationError(`Metadata exceeds maximum of ${MAX_METADATA_KEYS} keys`, 'metadata');
    }

    // Check for dangerous keys and prototype pollution
    function safeWalk(obj, currentDepth, path) {
        if (currentDepth > MAX_METADATA_DEPTH) {
            throw new ValidationError(`Metadata exceeds maximum depth of ${MAX_METADATA_DEPTH}`, 'metadata');
        }
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                // Check for dangerous keys
                if (DANGEROUS_KEYS.includes(key)) {
                    throw new ValidationError(`Metadata contains unsafe key: ${key}`, 'metadata');
                }
                const value = obj[key];
                if (value && typeof value === 'object') {
                    safeWalk(value, currentDepth + 1, path + '.' + key);
                }
            }
        }
    }

    safeWalk(metadata, 0, '');
    return metadata;
}

// ================================================
// CSV SAFE ESCAPE
// ================================================

function escapeCsvValue(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Prevent CSV/Excel formula injection
    if (str.match(/^[=+\-@]/)) {
        return `'${str}`;
    }
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// ================================================
// HELPER FUNCTION - Calculate lead score
// ================================================
function calculateLeadScore(lead, triggerData = {}) {
    let score = 50;

    if (lead.email) {
        const domain = lead.email.split('@')[1];
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
            score += 15;
        } else if (domain) {
            score += 5;
        }
    }

    if (lead.phone) score += 10;
    if (lead.company) score += 10;
    
    if (lead.message) {
        score += 10;
        const message = lead.message.toLowerCase();
        if (message.includes('urgent') || message.includes('asap') || message.includes('immediately')) {
            score += 15;
        }
        if (message.includes('pricing') || message.includes('cost') || message.includes('price')) {
            score += 10;
        }
        if (message.includes('demo') || message.includes('meeting') || message.includes('call')) {
            score += 15;
        }
        if (message.includes('buy') || message.includes('purchase') || message.includes('order')) {
            score += 20;
        }
    }

    const sourceScores = {
        'widget': 5, 'form': 10, 'chat': 15, 'referral': 20,
        'api': 10, 'manual': 5, 'automation': 8, 'email': 8, 'social': 6
    };
    score += sourceScores[lead.source] || 0;

    if (triggerData.message) {
        const message = triggerData.message.toLowerCase();
        if (message.includes('urgent')) score += 10;
        if (message.includes('budget')) score += 10;
        if (message.includes('timeline')) score += 5;
    }

    return Math.min(100, score);
}

// ================================================
// ERROR HANDLER - STRUCTURED
// ================================================

function handleError(error, res, context = {}) {
    // Log internally with safe context
    console.error('Error in leads operation:', {
        message: error.message,
        code: error.code,
        field: error.field,
        name: error.name,
        ...context
    });

    // Validation errors - structured
    if (error instanceof ValidationError || error.name === 'ValidationError') {
        return res.status(400).json({
            error: error.message,
            code: 'VALIDATION_ERROR',
            field: error.field || null
        });
    }

    // Supabase not found
    if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Resource not found' });
    }

    // Supabase duplicate key
    if (error.code === '23505') {
        return res.status(409).json({ error: 'Duplicate record exists' });
    }

    // Default internal error - safe message
    return res.status(500).json({ error: 'An unexpected error occurred' });
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
        limit = DEFAULT_LIMIT, 
        offset = 0,
        sort_by = 'created_at',
        sort_order = 'desc'
    } = req.query;

    try {
        const validatedLimit = validateLimit(limit);
        const validatedOffset = validateOffset(offset);
        const validatedStatus = status && status !== 'all' ? validateStatus(status) : null;
        const validatedSource = source && source !== 'all' ? validateSource(source) : null;
        const validatedSortField = validateSortField(sort_by);
        const validatedSortOrder = validateSortOrder(sort_order);
        const validatedSearch = validateSearch(search);
        
        // Validate date ranges
        const validatedFrom = validateDate(from, 'from');
        const validatedTo = validateDate(to, 'to');

        let query = supabase
            .from('leads')
            .select(`
                id, user_id, automation_id, name, email, phone, company, 
                job_title, message, source, status, metadata, 
                created_at, updated_at, last_contact, notes,
                automation:user_automations (id, name),
                lead_scores (score, scored_at)
            `, { count: 'exact' })
            .eq('user_id', userId);

        if (validatedStatus) query = query.eq('status', validatedStatus);
        if (validatedSource) query = query.eq('source', validatedSource);
        if (validatedFrom) query = query.gte('created_at', validatedFrom);
        if (validatedTo) query = query.lte('created_at', validatedTo);
        if (validatedSearch) {
            query = query.or(`name.ilike.%${validatedSearch}%,email.ilike.%${validatedSearch}%,phone.ilike.%${validatedSearch}%`);
        }

        query = query.order(validatedSortField, { ascending: validatedSortOrder === 'asc' });
        query = query.range(validatedOffset, validatedOffset + validatedLimit - 1);

        const { data: leads, error, count } = await query;

        if (error) throw error;

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

        res.json({
            success: true,
            leads: leadsWithScores,
            total: count || 0,
            limit: validatedLimit,
            offset: validatedOffset
        });

    } catch (error) {
        handleError(error, res, { route: 'GET /leads', userId });
    }
});

// ================================================
// GET LEAD STATS
// ================================================
router.get('/leads/stats', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const { count: total, error: totalError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (totalError) throw totalError;

        const statusCounts = [];
        for (const status of VALID_STATUSES) {
            const { count, error } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('status', status);
            if (!error && count > 0) {
                statusCounts.push({ status, count });
            }
        }

        const sourceCounts = [];
        for (const source of VALID_SOURCES) {
            const { count, error } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('source', source);
            if (!error && count > 0) {
                sourceCounts.push({ source, count });
            }
        }

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count: thisMonth, error: monthError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', startOfMonth.toISOString());

        if (monthError) throw monthError;

        const { count: converted, error: convertedError } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'converted');

        if (convertedError) throw convertedError;

        const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : 0;

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
        handleError(error, res, { route: 'GET /leads/stats', userId });
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

    try {
        const validatedName = validateString(name, 'Name', MAX_NAME_LENGTH);
        const validatedEmail = validateEmail(email);
        const validatedPhone = validateString(phone, 'Phone', MAX_PHONE_LENGTH);
        const validatedCompany = validateString(company, 'Company', MAX_COMPANY_LENGTH);
        const validatedJobTitle = validateString(job_title, 'Job title', MAX_JOB_TITLE_LENGTH);
        const validatedMessage = validateString(message, 'Message', MAX_MESSAGE_LENGTH);
        const validatedSource = validateSource(source) || 'manual';
        const validatedMetadata = validateMetadata(metadata);

        if (!validatedName && !validatedEmail) {
            throw new ValidationError('Name or email is required');
        }

        let validatedAutomationId = null;
        if (automation_id) {
            validatedAutomationId = validateId(automation_id);
            const { data: automation, error: autoError } = await supabase
                .from('user_automations')
                .select('id')
                .eq('id', validatedAutomationId)
                .eq('user_id', userId)
                .single();
            if (autoError || !automation) {
                throw new ValidationError('Invalid automation ID', 'automation_id');
            }
        }

        const leadId = uuidv4();
        const now = new Date().toISOString();

        // Check for duplicate lead
        if (validatedEmail) {
            const { data: existing } = await supabase
                .from('leads')
                .select('id, name, email, phone, company')
                .eq('user_id', userId)
                .eq('email', validatedEmail)
                .maybeSingle();

            if (existing) {
                const { data: updated, error } = await supabase
                    .from('leads')
                    .update({
                        name: validatedName || existing.name,
                        phone: validatedPhone || existing.phone,
                        company: validatedCompany || existing.company,
                        job_title: validatedJobTitle || existing.job_title,
                        message: validatedMessage || existing.message,
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
            automation_id: validatedAutomationId,
            name: validatedName,
            email: validatedEmail,
            phone: validatedPhone,
            company: validatedCompany,
            job_title: validatedJobTitle,
            message: validatedMessage,
            source: validatedSource,
            status: 'new',
            metadata: validatedMetadata,
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
        const score = calculateLeadScore(lead, { message: validatedMessage });
        
        await supabase
            .from('lead_scores')
            .insert([{
                id: uuidv4(),
                user_id: userId,
                lead_id: leadId,
                score: score,
                criteria: {
                    has_email: !!validatedEmail,
                    has_phone: !!validatedPhone,
                    has_company: !!validatedCompany,
                    has_job_title: !!validatedJobTitle,
                    has_message: !!validatedMessage,
                    source: validatedSource
                },
                scored_at: now
            }]);

        // FIXED: Use proper increment with raw only if supported
        if (validatedAutomationId) {
            // Use a safer approach - get current value and update
            const { data: current } = await supabase
                .from('user_automations')
                .select('leads_generated')
                .eq('id', validatedAutomationId)
                .eq('user_id', userId)
                .single();
            
            if (current) {
                await supabase
                    .from('user_automations')
                    .update({
                        leads_generated: (current.leads_generated || 0) + 1
                    })
                    .eq('id', validatedAutomationId)
                    .eq('user_id', userId);
            }
        }

        if (score > 80) {
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

            if (global.io) {
                global.io.to(`user:${userId}`).emit('hot_lead', {
                    lead: lead,
                    score: score
                });
            }
        }

        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'lead_created',
                details: `New lead from ${validatedSource}: ${lead.name || lead.email}`,
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
        handleError(error, res, { route: 'POST /leads', userId });
    }
});

// ================================================
// UPDATE LEAD STATUS
// ================================================
router.put('/leads/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const { status, notes } = req.body;

    try {
        const validatedId = validateId(id);
        const validatedStatus = validateStatus(status);
        if (!validatedStatus) {
            throw new ValidationError('Status is required', 'status');
        }

        const validatedNotes = validateString(notes, 'Notes', MAX_NOTES_LENGTH);

        const { data: lead, error: fetchError } = await supabase
            .from('leads')
            .select('*')
            .eq('id', validatedId)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lead not found' });
            }
            throw fetchError;
        }

        const updateData = {
            status: validatedStatus,
            last_contact: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (validatedNotes) {
            const existingNotes = lead.notes || [];
            updateData.notes = [...existingNotes, {
                text: validatedNotes,
                timestamp: new Date().toISOString(),
                user: userId
            }];
        }

        const { data, error } = await supabase
            .from('leads')
            .update(updateData)
            .eq('id', validatedId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'lead_status_updated',
                details: `Lead ${data.name || data.email} marked as ${validatedStatus}`,
                type: 'lead',
                timestamp: new Date().toISOString()
            }]);

        if (global.io) {
            global.io.to(`user:${userId}`).emit('lead_updated', {
                lead_id: id,
                status: validatedStatus,
                lead: data
            });
        }

        res.json({
            success: true,
            lead: data,
            message: `Lead marked as ${validatedStatus}`
        });

    } catch (error) {
        handleError(error, res, { route: 'PUT /leads/:id/status', userId });
    }
});

// ================================================
// GET SINGLE LEAD
// ================================================
router.get('/leads/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const validatedId = validateId(id);

        const { data: lead, error } = await supabase
            .from('leads')
            .select(`
                id, user_id, automation_id, name, email, phone, company,
                job_title, message, source, status, metadata,
                created_at, updated_at, last_contact, notes,
                automation:user_automations (id, name),
                lead_scores (score, scored_at, criteria)
            `)
            .eq('id', validatedId)
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lead not found' });
            }
            throw error;
        }

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
        handleError(error, res, { route: 'GET /leads/:id', userId });
    }
});

// ================================================
// DELETE LEAD
// ================================================
router.delete('/leads/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const validatedId = validateId(id);

        const { data: lead, error: fetchError } = await supabase
            .from('leads')
            .select('name, email')
            .eq('id', validatedId)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lead not found' });
            }
            throw fetchError;
        }

        await supabase
            .from('lead_scores')
            .delete()
            .eq('lead_id', validatedId)
            .eq('user_id', userId);

        const { error } = await supabase
            .from('leads')
            .delete()
            .eq('id', validatedId)
            .eq('user_id', userId);

        if (error) throw error;

        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'lead_deleted',
                details: `Deleted lead: ${lead.name || lead.email}`,
                type: 'lead',
                timestamp: new Date().toISOString()
            }]);

        res.json({
            success: true,
            message: 'Lead deleted successfully'
        });

    } catch (error) {
        handleError(error, res, { route: 'DELETE /leads/:id', userId });
    }
});

// ================================================
// BULK LEAD OPERATIONS
// ================================================
router.post('/leads/bulk', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { action, lead_ids, data } = req.body;

    try {
        if (!action || !VALID_BULK_ACTIONS.includes(action)) {
            throw new ValidationError(`Invalid bulk action. Must be one of: ${VALID_BULK_ACTIONS.join(', ')}`, 'action');
        }

        const validatedIds = validateBulkIds(lead_ids);

        const { data: validLeads, error: verifyError } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', userId)
            .in('id', validatedIds);

        if (verifyError) throw verifyError;

        const validLeadIds = (validLeads || []).map(l => l.id);
        if (validLeadIds.length === 0) {
            return res.status(404).json({ error: 'No valid leads found' });
        }

        let result;

        switch (action) {
            case 'delete':
                await supabase
                    .from('lead_scores')
                    .delete()
                    .eq('user_id', userId)
                    .in('lead_id', validLeadIds);

                const { error: deleteError } = await supabase
                    .from('leads')
                    .delete()
                    .eq('user_id', userId)
                    .in('id', validLeadIds);

                if (deleteError) throw deleteError;
                result = { message: `Deleted ${validLeadIds.length} leads` };
                break;

            case 'update_status':
                if (!data?.status) {
                    throw new ValidationError('Status required for update_status action', 'status');
                }
                const validatedStatus = validateStatus(data.status);
                if (!validatedStatus) {
                    throw new ValidationError('Invalid status', 'status');
                }

                const { error: updateError } = await supabase
                    .from('leads')
                    .update({
                        status: validatedStatus,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', userId)
                    .in('id', validLeadIds);

                if (updateError) throw updateError;
                result = { message: `Updated ${validLeadIds.length} leads to ${validatedStatus}` };
                break;

            case 'export':
                const { data: leads, error: exportError } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('user_id', userId)
                    .in('id', validLeadIds);

                if (exportError) throw exportError;
                result = { leads: leads };
                break;

            default:
                throw new ValidationError('Invalid bulk action', 'action');
        }

        await supabase
            .from('activity_log')
            .insert([{
                user_id: userId,
                action: 'bulk_lead_operation',
                details: `${action} performed on ${validLeadIds.length} leads`,
                type: 'lead',
                timestamp: new Date().toISOString()
            }]);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        handleError(error, res, { route: 'POST /leads/bulk', userId });
    }
});

// ================================================
// EXPORT LEADS (CSV) - WITH INJECTION PROTECTION
// ================================================
router.get('/leads/export/csv', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { status, source, from, to } = req.query;

    try {
        const validatedStatus = status && status !== 'all' ? validateStatus(status) : null;
        const validatedSource = source && source !== 'all' ? validateSource(source) : null;
        const validatedFrom = validateDate(from, 'from');
        const validatedTo = validateDate(to, 'to');

        let query = supabase
            .from('leads')
            .select('id, name, email, phone, company, job_title, source, status, message, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (validatedStatus) query = query.eq('status', validatedStatus);
        if (validatedSource) query = query.eq('source', validatedSource);
        if (validatedFrom) query = query.gte('created_at', validatedFrom);
        if (validatedTo) query = query.lte('created_at', validatedTo);

        const { data: leads, error } = await query.limit(10000);

        if (error) throw error;

        const headers = ['ID', 'Name', 'Email', 'Phone', 'Company', 'Job Title', 'Source', 'Status', 'Message', 'Created At'];
        const csvRows = [headers.join(',')];

        for (const lead of leads || []) {
            const row = [
                lead.id,
                escapeCsvValue(lead.name || ''),
                escapeCsvValue(lead.email || ''),
                escapeCsvValue(lead.phone || ''),
                escapeCsvValue(lead.company || ''),
                escapeCsvValue(lead.job_title || ''),
                escapeCsvValue(lead.source || ''),
                escapeCsvValue(lead.status || ''),
                escapeCsvValue((lead.message || '').substring(0, 1000)),
                escapeCsvValue(lead.created_at)
            ];
            csvRows.push(row.join(','));
        }

        const csvContent = csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=leads_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvContent);

    } catch (error) {
        handleError(error, res, { route: 'GET /leads/export/csv', userId });
    }
});

console.log('✅ LEADS MANAGEMENT ROUTES: All routes registered (Production Hardened)');
console.log('   - GET /leads');
console.log('   - GET /leads/stats');
console.log('   - GET /leads/:id');
console.log('   - POST /leads');
console.log('   - PUT /leads/:id/status');
console.log('   - DELETE /leads/:id');
console.log('   - POST /leads/bulk');
console.log('   - GET /leads/export/csv');

module.exports = router;