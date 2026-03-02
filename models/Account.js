// Account Model
// Database operations for connected accounts

const { v4: uuidv4 } = require('uuid');
const db = require('../backend/database.js').db;

class AccountModel {
    constructor() {
        this.tableName = 'connected_accounts';
    }

    // Create a new connected account
    async create(userId, platform, accountName, encryptedApiKey, accountInfo = {}, gatewayUrl = null, connectionType = 'direct') {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            db.run(
                `INSERT INTO connected_accounts 
                (user_id, platform, account_name, api_key_encrypted, account_info, gateway_url, connection_type, last_sync, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, platform, accountName, encryptedApiKey, JSON.stringify(accountInfo), gatewayUrl, connectionType, now, now, now],
                function(err) {
                    if (err) {
                        console.error('Error creating connected account:', err);
                        reject(err);
                    } else {
                        resolve({
                            id: this.lastID,
                            user_id: userId,
                            platform,
                            account_name: accountName,
                            account_info: accountInfo,
                            gateway_url: gatewayUrl,
                            connection_type: connectionType,
                            status: 'active',
                            last_sync: now,
                            created_at: now,
                            updated_at: now
                        });
                    }
                }
            );
        });
    }

    // Get account by ID
    async getById(id, userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM connected_accounts WHERE id = ? AND user_id = ?`,
                [id, userId],
                (err, row) => {
                    if (err) {
                        console.error('Error getting account by ID:', err);
                        reject(err);
                    } else if (row) {
                        try {
                            row.account_info = row.account_info ? JSON.parse(row.account_info) : null;
                        } catch (e) {
                            row.account_info = null;
                        }
                        resolve(row);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    // Get all accounts for a user
    async getByUser(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM connected_accounts WHERE user_id = ? ORDER BY created_at DESC`,
                [userId],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting accounts by user:', err);
                        reject(err);
                    } else {
                        const accounts = (rows || []).map(row => {
                            try {
                                row.account_info = row.account_info ? JSON.parse(row.account_info) : null;
                            } catch (e) {
                                row.account_info = null;
                            }
                            return row;
                        });
                        resolve(accounts);
                    }
                }
            );
        });
    }

    // Get accounts by platform
    async getByPlatform(userId, platform) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM connected_accounts WHERE user_id = ? AND platform = ? ORDER BY created_at DESC`,
                [userId, platform],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting accounts by platform:', err);
                        reject(err);
                    } else {
                        const accounts = (rows || []).map(row => {
                            try {
                                row.account_info = row.account_info ? JSON.parse(row.account_info) : null;
                            } catch (e) {
                                row.account_info = null;
                            }
                            return row;
                        });
                        resolve(accounts);
                    }
                }
            );
        });
    }

    // Update account
    async update(id, userId, updates) {
        return new Promise((resolve, reject) => {
            // Build dynamic update query
            const fields = [];
            const params = [];
            
            const allowedFields = ['account_name', 'api_key_encrypted', 'account_info', 'gateway_url', 'connection_type', 'status', 'last_sync'];
            
            allowedFields.forEach(field => {
                if (updates[field] !== undefined) {
                    fields.push(`${field} = ?`);
                    if (field === 'account_info' && typeof updates[field] === 'object') {
                        params.push(JSON.stringify(updates[field]));
                    } else {
                        params.push(updates[field]);
                    }
                }
            });
            
            if (fields.length === 0) {
                return resolve({ success: true, changes: 0 });
            }
            
            fields.push('updated_at = ?');
            params.push(new Date().toISOString());
            params.push(id, userId);
            
            db.run(
                `UPDATE connected_accounts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
                params,
                function(err) {
                    if (err) {
                        console.error('Error updating account:', err);
                        reject(err);
                    } else {
                        resolve({
                            success: true,
                            changes: this.changes
                        });
                    }
                }
            );
        });
    }

    // Update last sync time
    async updateLastSync(id, userId) {
        return this.update(id, userId, { last_sync: new Date().toISOString() });
    }

    // Delete account
    async delete(id, userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM connected_accounts WHERE id = ? AND user_id = ?`,
                [id, userId],
                function(err) {
                    if (err) {
                        console.error('Error deleting account:', err);
                        reject(err);
                    } else {
                        resolve({
                            success: true,
                            changes: this.changes
                        });
                    }
                }
            );
        });
    }

    // Check if account exists
    async exists(userId, platform, accountName) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT id FROM connected_accounts WHERE user_id = ? AND platform = ? AND account_name = ?`,
                [userId, platform, accountName],
                (err, row) => {
                    if (err) {
                        console.error('Error checking account existence:', err);
                        reject(err);
                    } else {
                        resolve(!!row);
                    }
                }
            );
        });
    }

    // Get account by platform and name
    async getByPlatformAndName(userId, platform, accountName) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM connected_accounts WHERE user_id = ? AND platform = ? AND account_name = ?`,
                [userId, platform, accountName],
                (err, row) => {
                    if (err) {
                        console.error('Error getting account by platform and name:', err);
                        reject(err);
                    } else if (row) {
                        try {
                            row.account_info = row.account_info ? JSON.parse(row.account_info) : null;
                        } catch (e) {
                            row.account_info = null;
                        }
                        resolve(row);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    // Get accounts that need sync
    async getAccountsNeedingSync(userId, hoursSinceLastSync = 24) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM connected_accounts 
                WHERE user_id = ? AND status = 'active' 
                AND (last_sync IS NULL OR last_sync < datetime('now', ? || ' hours'))
                ORDER BY last_sync ASC`,
                [userId, '-' + hoursSinceLastSync],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting accounts needing sync:', err);
                        reject(err);
                    } else {
                        const accounts = (rows || []).map(row => {
                            try {
                                row.account_info = row.account_info ? JSON.parse(row.account_info) : null;
                            } catch (e) {
                                row.account_info = null;
                            }
                            return row;
                        });
                        resolve(accounts);
                    }
                }
            );
        });
    }

    // Get account statistics
    async getStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as total_accounts,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_accounts,
                    COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_accounts,
                    COUNT(DISTINCT platform) as unique_platforms,
                    COUNT(CASE WHEN last_sync > datetime('now', '-1 day') THEN 1 END) as synced_today,
                    COUNT(CASE WHEN connection_type = 'gateway' THEN 1 END) as gateway_connections
                FROM connected_accounts 
                WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err) {
                        console.error('Error getting account stats:', err);
                        reject(err);
                    } else {
                        resolve(row || {
                            total_accounts: 0,
                            active_accounts: 0,
                            inactive_accounts: 0,
                            unique_platforms: 0,
                            synced_today: 0,
                            gateway_connections: 0
                        });
                    }
                }
            );
        });
    }
}

module.exports = new AccountModel();