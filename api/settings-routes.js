// api/settings-routes.js
const dbModule = require('../backend/database');
const { db } = dbModule;
const express = require('express');
const router = express.Router();
const { auth } = require('../backend/auth');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// ================= GET USER SETTINGS =================
router.get('/profile', auth, (req, res) => {
    const userId = req.user.id;
    
    db.get(`
        SELECT 
            id, email, business_name, name, plan, 
            plan_expires, is_verified, widget_color, 
            welcome_message, messages_used, leads_used,
            created_at
        FROM users 
        WHERE id = ?
    `, [userId], (err, user) => {
        if (err) {
            console.error('Settings error:', err);
            return res.status(500).json({ error: 'Failed to fetch settings' });
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get connected accounts count
        db.get(`SELECT COUNT(*) as account_count FROM connected_accounts WHERE user_id = ?`, [userId], (err, accounts) => {
            res.json({
                ...user,
                account_count: accounts?.account_count || 0,
                plan_expires: user.plan_expires || null
            });
        });
    });
});

// ================= UPDATE PROFILE =================
router.put('/profile', auth, async (req, res) => {
    const userId = req.user.id;
    const { business_name, name, widget_color, welcome_message } = req.body;
    
    const updates = [];
    const params = [];
    
    if (business_name !== undefined) {
        updates.push('business_name = ?');
        params.push(business_name);
    }
    if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
    }
    if (widget_color !== undefined) {
        updates.push('widget_color = ?');
        params.push(widget_color);
    }
    if (welcome_message !== undefined) {
        updates.push('welcome_message = ?');
        params.push(welcome_message);
    }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(userId);
    
    db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        params,
        function(err) {
            if (err) {
                console.error('Profile update error:', err);
                return res.status(500).json({ error: 'Failed to update profile' });
            }
            
            res.json({ 
                success: true, 
                message: 'Profile updated successfully',
                changes: this.changes
            });
        }
    );
});

// ================= CHANGE PASSWORD =================
router.post('/change-password', auth, async (req, res) => {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current and new password required' });
    }
    
    if (new_password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    db.get(`SELECT password FROM users WHERE id = ?`, [userId], async (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Verify current password
        const valid = await bcrypt.compare(current_password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        // Hash new password
        const hashed = await bcrypt.hash(new_password, 10);
        
        db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, userId], function(err) {
            if (err) {
                console.error('Password update error:', err);
                return res.status(500).json({ error: 'Failed to update password' });
            }
            
            res.json({ success: true, message: 'Password updated successfully' });
        });
    });
});

// ================= NOTIFICATION SETTINGS =================
router.get('/notifications', auth, (req, res) => {
    const userId = req.user.id;
    
    db.get(`
        SELECT 
            email_notifications, slack_webhook, discord_webhook,
            notify_on_success, notify_on_failure, notify_on_daily_summary
        FROM notification_settings 
        WHERE user_id = ?
    `, [userId], (err, settings) => {
        if (err) {
            console.error('Notification settings error:', err);
            return res.status(500).json({ error: 'Failed to fetch notification settings' });
        }
        
        // Return defaults if no settings exist
        res.json(settings || {
            email_notifications: true,
            slack_webhook: null,
            discord_webhook: null,
            notify_on_success: true,
            notify_on_failure: true,
            notify_on_daily_summary: true
        });
    });
});

router.put('/notifications', auth, (req, res) => {
    const userId = req.user.id;
    const { 
        email_notifications, slack_webhook, discord_webhook,
        notify_on_success, notify_on_failure, notify_on_daily_summary 
    } = req.body;
    
    // Ensure notification_settings table exists
    db.run(`
        CREATE TABLE IF NOT EXISTS notification_settings (
            user_id INTEGER PRIMARY KEY,
            email_notifications INTEGER DEFAULT 1,
            slack_webhook TEXT,
            discord_webhook TEXT,
            notify_on_success INTEGER DEFAULT 1,
            notify_on_failure INTEGER DEFAULT 1,
            notify_on_daily_summary INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Table creation error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Insert or replace settings
        db.run(`
            INSERT OR REPLACE INTO notification_settings 
            (user_id, email_notifications, slack_webhook, discord_webhook, 
             notify_on_success, notify_on_failure, notify_on_daily_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            email_notifications !== undefined ? (email_notifications ? 1 : 0) : 1,
            slack_webhook || null,
            discord_webhook || null,
            notify_on_success !== undefined ? (notify_on_success ? 1 : 0) : 1,
            notify_on_failure !== undefined ? (notify_on_failure ? 1 : 0) : 1,
            notify_on_daily_summary !== undefined ? (notify_on_daily_summary ? 1 : 0) : 1
        ], function(err) {
            if (err) {
                console.error('Notification update error:', err);
                return res.status(500).json({ error: 'Failed to update notification settings' });
            }
            
            res.json({ success: true, message: 'Notification settings updated' });
        });
    });
});

// ================= API KEY MANAGEMENT =================
router.get('/api-keys', auth, (req, res) => {
    const userId = req.user.id;
    
    db.all(`
        SELECT id, name, platform, created_at, last_used
        FROM api_keys
        WHERE user_id = ?
        ORDER BY created_at DESC
    `, [userId], (err, keys) => {
        if (err) {
            console.error('API keys error:', err);
            return res.status(500).json({ error: 'Failed to fetch API keys' });
        }
        
        res.json(keys || []);
    });
});

router.post('/api-keys', auth, (req, res) => {
    const userId = req.user.id;
    const { name, platform } = req.body;
    
    if (!name || !platform) {
        return res.status(400).json({ error: 'Name and platform required' });
    }
    
    const keyId = uuidv4();
    const apiKey = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    db.run(`
        INSERT INTO api_keys (id, user_id, name, platform, api_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [keyId, userId, name, platform, apiKey, new Date().toISOString()], function(err) {
        if (err) {
            console.error('API key creation error:', err);
            return res.status(500).json({ error: 'Failed to create API key' });
        }
        
        res.json({
            success: true,
            id: keyId,
            name,
            platform,
            api_key: apiKey,
            message: 'API key created successfully'
        });
    });
});

router.delete('/api-keys/:id', auth, (req, res) => {
    const userId = req.user.id;
    const keyId = req.params.id;
    
    db.run(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`, [keyId, userId], function(err) {
        if (err) {
            console.error('API key deletion error:', err);
            return res.status(500).json({ error: 'Failed to delete API key' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'API key not found' });
        }
        
        res.json({ success: true, message: 'API key deleted' });
    });
});

// ================= BILLING INFORMATION =================
router.get('/billing', auth, (req, res) => {
    const userId = req.user.id;
    
    db.get(`
        SELECT 
            plan, plan_expires,
            messages_used, messages_limit,
            leads_used, leads_limit
        FROM users WHERE id = ?
    `, [userId], (err, user) => {
        if (err) {
            console.error('Billing error:', err);
            return res.status(500).json({ error: 'Failed to fetch billing info' });
        }
        
        // Get payment history
        db.all(`
            SELECT * FROM payments 
            WHERE user_id = ? 
            ORDER BY created_at DESC LIMIT 10
        `, [userId], (err, payments) => {
            res.json({
                current_plan: user?.plan || 'free',
                plan_expires: user?.plan_expires,
                usage: {
                    messages: user?.messages_used || 0,
                    messages_limit: user?.messages_limit || 50,
                    leads: user?.leads_used || 0,
                    leads_limit: user?.leads_limit || 10
                },
                payment_history: payments || []
            });
        });
    });
});

module.exports = router;
