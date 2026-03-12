// api/settings-routes.js
const express = require('express');
const router = express.Router();
const { auth } = require('../backend/auth');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Import shared Supabase client
const supabase = require('../backend/supabase');

console.log('✅ SETTINGS ROUTES: Using shared Supabase client');

// ================= GET USER SETTINGS =================
router.get('/profile', auth, async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const { data: user, error } = await supabase
            .from('users')
            .select(`
                id, 
                email, 
                business_name, 
                plan, 
                plan_expires, 
                is_verified, 
                widget_color, 
                welcome_message, 
                messages_used, 
                leads_used,
                created_at
            `)
            .eq('id', userId)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'User not found' });
            }
            throw error;
        }
        
        // Get connected accounts count
        const { count, error: countError } = await supabase
            .from('connected_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        
        if (countError) throw countError;
        
        // Add name field from business_name for compatibility
        const userData = {
            ...user,
            name: user.business_name || 'User',
            account_count: count || 0,
            plan_expires: user.plan_expires || null
        };
        
        res.json(userData);
    } catch (error) {
        console.error('Settings error:', error);
        return res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ================= UPDATE PROFILE =================
router.put('/profile', auth, async (req, res) => {
    const userId = req.user.id;
    const { business_name, name, widget_color, welcome_message } = req.body;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const updates = {};
        
        if (business_name !== undefined) {
            updates.business_name = business_name;
        }
        // Note: 'name' column might not exist, so we'll use business_name for display name
        if (widget_color !== undefined) {
            updates.widget_color = widget_color;
        }
        if (welcome_message !== undefined) {
            updates.welcome_message = welcome_message;
        }
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        const { error, count } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            message: 'Profile updated successfully',
            changes: count
        });
    } catch (error) {
        console.error('Profile update error:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ================= CHANGE PASSWORD =================
router.post('/change-password', auth, async (req, res) => {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current and new password required' });
        }
        
        if (new_password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('password')
            .eq('id', userId)
            .single();
        
        if (fetchError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Verify current password
        const valid = await bcrypt.compare(current_password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        // Hash new password
        const hashed = await bcrypt.hash(new_password, 10);
        
        const { error: updateError } = await supabase
            .from('users')
            .update({ password: hashed })
            .eq('id', userId);
        
        if (updateError) throw updateError;
        
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password update error:', error);
        return res.status(500).json({ error: 'Failed to update password' });
    }
});

// ================= NOTIFICATION SETTINGS =================
router.get('/notifications', auth, async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const { data: settings, error } = await supabase
            .from('notification_settings')
            .select(`
                email_notifications, 
                slack_webhook, 
                discord_webhook,
                notify_on_success, 
                notify_on_failure, 
                notify_on_daily_summary
            `)
            .eq('user_id', userId)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        // Return defaults if no settings exist
        res.json(settings || {
            email_notifications: true,
            slack_webhook: null,
            discord_webhook: null,
            notify_on_success: true,
            notify_on_failure: true,
            notify_on_daily_summary: true
        });
    } catch (error) {
        console.error('Notification settings error:', error);
        // Return defaults on error
        return res.json({
            email_notifications: true,
            slack_webhook: null,
            discord_webhook: null,
            notify_on_success: true,
            notify_on_failure: true,
            notify_on_daily_summary: true
        });
    }
});

router.put('/notifications', auth, async (req, res) => {
    const userId = req.user.id;
    const { 
        email_notifications, 
        slack_webhook, 
        discord_webhook,
        notify_on_success, 
        notify_on_failure, 
        notify_on_daily_summary 
    } = req.body;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        // Check if settings exist
        const { data: existing } = await supabase
            .from('notification_settings')
            .select('user_id')
            .eq('user_id', userId)
            .maybeSingle();
        
        const settings = {
            user_id: userId,
            email_notifications: email_notifications !== undefined ? email_notifications : true,
            slack_webhook: slack_webhook || null,
            discord_webhook: discord_webhook || null,
            notify_on_success: notify_on_success !== undefined ? notify_on_success : true,
            notify_on_failure: notify_on_failure !== undefined ? notify_on_failure : true,
            notify_on_daily_summary: notify_on_daily_summary !== undefined ? notify_on_daily_summary : true
        };
        
        let error;
        
        if (existing) {
            // Update existing
            ({ error } = await supabase
                .from('notification_settings')
                .update(settings)
                .eq('user_id', userId));
        } else {
            // Insert new
            ({ error } = await supabase
                .from('notification_settings')
                .insert([settings]));
        }
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Notification settings updated' });
    } catch (error) {
        console.error('Notification update error:', error);
        return res.status(500).json({ error: 'Failed to update notification settings' });
    }
});

// ================= API KEY MANAGEMENT =================
router.get('/api-keys', auth, async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const { data: keys, error } = await supabase
            .from('api_keys')
            .select('id, name, platform, created_at, last_used')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json(keys || []);
    } catch (error) {
        console.error('API keys error:', error);
        // Return empty array on error
        return res.json([]);
    }
});

router.post('/api-keys', auth, async (req, res) => {
    const userId = req.user.id;
    const { name, platform } = req.body;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        if (!name || !platform) {
            return res.status(400).json({ error: 'Name and platform required' });
        }
        
        const keyId = uuidv4();
        const apiKey = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
        
        const { error } = await supabase
            .from('api_keys')
            .insert([{
                id: keyId,
                user_id: userId,
                name,
                platform,
                api_key: apiKey,
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        res.json({
            success: true,
            id: keyId,
            name,
            platform,
            api_key: apiKey,
            message: 'API key created successfully'
        });
    } catch (error) {
        console.error('API key creation error:', error);
        return res.status(500).json({ error: 'Failed to create API key' });
    }
});

router.delete('/api-keys/:id', auth, async (req, res) => {
    const userId = req.user.id;
    const keyId = req.params.id;
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const { error, count } = await supabase
            .from('api_keys')
            .delete()
            .eq('id', keyId)
            .eq('user_id', userId);
        
        if (error) throw error;
        
        if (count === 0) {
            return res.status(404).json({ error: 'API key not found' });
        }
        
        res.json({ success: true, message: 'API key deleted' });
    } catch (error) {
        console.error('API key deletion error:', error);
        return res.status(500).json({ error: 'Failed to delete API key' });
    }
});

// ================= BILLING INFORMATION =================
router.get('/billing', auth, async (req, res) => {
    const userId = req.user.id;
    
    // Set default limits based on plan
    const getLimits = (plan) => {
        const limits = {
            free: { messages: 50, leads: 10 },
            basic: { messages: 500, leads: 500 },
            pro: { messages: 3000, leads: 3000 },
            agency: { messages: 10000, leads: 10000 }
        };
        return limits[plan] || limits.free;
    };
    
    try {
        // Check if supabase is available
        if (!supabase) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('plan, plan_expires, messages_used, leads_used')
            .eq('id', userId)
            .single();
        
        if (userError) {
            if (userError.code === 'PGRST116') {
                return res.status(404).json({ error: 'User not found' });
            }
            throw userError;
        }
        
        const plan = user?.plan || 'free';
        const limits = getLimits(plan);
        
        // Get payment history
        const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (paymentsError) throw paymentsError;
        
        res.json({
            current_plan: plan,
            plan_expires: user?.plan_expires,
            usage: {
                messages: user?.messages_used || 0,
                messages_limit: limits.messages,
                leads: user?.leads_used || 0,
                leads_limit: limits.leads
            },
            payment_history: payments || []
        });
    } catch (error) {
        console.error('Billing error:', error);
        return res.status(500).json({ error: 'Failed to fetch billing info' });
    }
});

module.exports = router;