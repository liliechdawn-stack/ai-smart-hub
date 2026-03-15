// backend/fix-admin-api.js
// Add these routes to your server.js

/**
 * ADMIN API FIXES
 * Add these routes to your server.js file
 */

// ================================================
// ADMIN USERS ENDPOINT
// ================================================
app.get('/api/admin/users', authenticateToken, async (req, res) => {
    try {
        // Verify admin email
        if (req.user.email !== 'ericchung992@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const db = req.app.locals.db;
        
        // Get all users with their usage stats
        const users = await db.all(`
            SELECT 
                u.id,
                u.email,
                u.business_name,
                u.name,
                u.plan,
                u.is_verified,
                u.created_at,
                u.messages_limit,
                u.leads_limit,
                COALESCE((
                    SELECT COUNT(*) FROM messages WHERE business_id = u.id
                ), 0) as messages_used,
                COALESCE((
                    SELECT COUNT(*) FROM leads WHERE business_id = u.id
                ), 0) as leads_used,
                COALESCE((
                    SELECT COUNT(*) FROM chats WHERE business_id = u.id
                ), 0) as chats_count
            FROM users u
            ORDER BY u.created_at DESC
        `);

        res.json(users);
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

// ================================================
// ADMIN ACTIVITIES ENDPOINT
// ================================================
app.get('/api/admin/activities', authenticateToken, async (req, res) => {
    try {
        if (req.user.email !== 'ericchung992@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const db = req.app.locals.db;
        
        const activities = await db.all(`
            SELECT 
                m.*,
                u.business_name,
                u.email as user_email
            FROM messages m
            JOIN users u ON m.business_id = u.id
            ORDER BY m.created_at DESC
            LIMIT 100
        `);

        res.json(activities);
    } catch (error) {
        console.error('Admin activities error:', error);
        res.status(500).json({ error: 'Failed to load activities' });
    }
});

// ================================================
// ADMIN UPDATE USER
// ================================================
app.put('/api/admin/users/:userId', authenticateToken, async (req, res) => {
    try {
        if (req.user.email !== 'ericchung992@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { userId } = req.params;
        const { plan, is_verified, messages_used, leads_used } = req.body;
        
        const db = req.app.locals.db;
        
        await db.run(`
            UPDATE users 
            SET plan = ?, is_verified = ?, messages_used = ?, leads_used = ?
            WHERE id = ?
        `, [plan, is_verified, messages_used, leads_used, userId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Admin update error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ================================================
// ADMIN DELETE USER
// ================================================
app.delete('/api/admin/users/:userId', authenticateToken, async (req, res) => {
    try {
        if (req.user.email !== 'ericchung992@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { userId } = req.params;
        const db = req.app.locals.db;
        
        // Delete user's data first (foreign key constraints)
        await db.run('DELETE FROM messages WHERE business_id = ?', [userId]);
        await db.run('DELETE FROM leads WHERE business_id = ?', [userId]);
        await db.run('DELETE FROM chats WHERE business_id = ?', [userId]);
        await db.run('DELETE FROM knowledge WHERE business_id = ?', [userId]);
        
        // Delete user
        await db.run('DELETE FROM users WHERE id = ?', [userId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Admin delete error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});