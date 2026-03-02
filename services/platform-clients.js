// Platform API Clients Service
// Real integrations with Shopify, Stripe, Salesforce, etc.

const fetch = require('node-fetch');
const crypto = require('crypto');

class PlatformClients {
    constructor(encryptionKey) {
        this.encryptionKey = encryptionKey;
    }

    // Decrypt stored credentials
    decryptCredentials(encryptedData) {
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt credentials');
        }
    }

    // Encrypt credentials for storage
    encryptCredentials(credentials) {
        try {
            const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
            let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return encrypted;
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Failed to encrypt credentials');
        }
    }

    // ==================== SHOPIFY CLIENT ====================
    async shopifyRequest(shopDomain, accessToken, endpoint, method = 'GET', data = null) {
        const url = `https://${shopDomain}.myshopify.com/admin/api/2024-01/${endpoint}.json`;
        
        const options = {
            method,
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.errors || `Shopify API error: ${response.status}`);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };
        } catch (error) {
            console.error('Shopify request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getShopifyShopInfo(shopDomain, accessToken) {
        return this.shopifyRequest(shopDomain, accessToken, 'shop');
    }

    async getShopifyProducts(shopDomain, accessToken, limit = 50) {
        return this.shopifyRequest(shopDomain, accessToken, `products?limit=${limit}`);
    }

    async getShopifyOrders(shopDomain, accessToken, limit = 50, status = 'any') {
        return this.shopifyRequest(shopDomain, accessToken, `orders?limit=${limit}&status=${status}`);
    }

    async getShopifyInventory(shopDomain, accessToken, inventoryItemIds) {
        const ids = inventoryItemIds.join(',');
        return this.shopifyRequest(shopDomain, accessToken, `inventory_items?ids=${ids}`);
    }

    async getShopifyAbandonedCheckouts(shopDomain, accessToken, limit = 50) {
        return this.shopifyRequest(shopDomain, accessToken, `checkouts?limit=${limit}&status=open`);
    }

    async createShopifyWebhook(shopDomain, accessToken, topic, address) {
        return this.shopifyRequest(shopDomain, accessToken, 'webhooks', 'POST', {
            webhook: {
                topic,
                address,
                format: 'json'
            }
        });
    }

    // ==================== STRIPE CLIENT ====================
    async stripeRequest(apiKey, endpoint, method = 'GET', data = null) {
        const url = `https://api.stripe.com/v1/${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            const formData = new URLSearchParams();
            Object.keys(data).forEach(key => {
                if (data[key] !== undefined && data[key] !== null) {
                    formData.append(key, data[key]);
                }
            });
            options.body = formData;
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.error?.message || `Stripe API error: ${response.status}`);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };
        } catch (error) {
            console.error('Stripe request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getStripeBalance(apiKey) {
        return this.stripeRequest(apiKey, 'balance');
    }

    async getStripeCustomers(apiKey, limit = 100) {
        return this.stripeRequest(apiKey, `customers?limit=${limit}`);
    }

    async getStripeInvoices(apiKey, limit = 100) {
        return this.stripeRequest(apiKey, `invoices?limit=${limit}`);
    }

    async getStripeSubscriptions(apiKey, limit = 100) {
        return this.stripeRequest(apiKey, `subscriptions?limit=${limit}`);
    }

    async getStripeCharges(apiKey, limit = 100) {
        return this.stripeRequest(apiKey, `charges?limit=${limit}`);
    }

    async createStripePaymentIntent(apiKey, amount, currency, metadata = {}) {
        return this.stripeRequest(apiKey, 'payment_intents', 'POST', {
            amount,
            currency,
            metadata: JSON.stringify(metadata)
        });
    }

    // ==================== SALESFORCE CLIENT ====================
    async getSalesforceToken(clientId, clientSecret, username, password, securityToken) {
        const url = 'https://login.salesforce.com/services/oauth2/token';
        
        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('client_id', clientId);
        formData.append('client_secret', clientSecret);
        formData.append('username', username);
        formData.append('password', password + securityToken);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error_description || 'Salesforce auth failed');
            }

            return {
                success: true,
                accessToken: data.access_token,
                instanceUrl: data.instance_url,
                tokenType: data.token_type,
                expiresIn: data.expires_in
            };
        } catch (error) {
            console.error('Salesforce auth error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async salesforceRequest(instanceUrl, accessToken, endpoint, method = 'GET', data = null) {
        const url = `${instanceUrl}/services/data/v58.0/${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData[0]?.message || `Salesforce API error: ${response.status}`);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };
        } catch (error) {
            console.error('Salesforce request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getSalesforceLeads(instanceUrl, accessToken, limit = 100) {
        return this.salesforceRequest(instanceUrl, accessToken, `query/?q=SELECT+Id,Name,Company,Email,Status+FROM+Lead+LIMIT+${limit}`);
    }

    async getSalesforceOpportunities(instanceUrl, accessToken, limit = 100) {
        return this.salesforceRequest(instanceUrl, accessToken, `query/?q=SELECT+Id,Name,Amount,StageName,CloseDate+FROM+Opportunity+LIMIT+${limit}`);
    }

    async getSalesforceAccounts(instanceUrl, accessToken, limit = 100) {
        return this.salesforceRequest(instanceUrl, accessToken, `query/?q=SELECT+Id,Name,Type,Industry+FROM+Account+LIMIT+${limit}`);
    }

    // ==================== HUBSPOT CLIENT ====================
    async hubspotRequest(apiKey, endpoint, method = 'GET', data = null) {
        const url = `https://api.hubapi.com/${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.message || `HubSpot API error: ${response.status}`);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };
        } catch (error) {
            console.error('HubSpot request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getHubspotContacts(apiKey, limit = 100) {
        return this.hubspotRequest(apiKey, `crm/v3/objects/contacts?limit=${limit}`);
    }

    async getHubspotDeals(apiKey, limit = 100) {
        return this.hubspotRequest(apiKey, `crm/v3/objects/deals?limit=${limit}`);
    }

    async getHubspotCompanies(apiKey, limit = 100) {
        return this.hubspotRequest(apiKey, `crm/v3/objects/companies?limit=${limit}`);
    }

    // ==================== MAILCHIMP CLIENT ====================
    async mailchimpRequest(apiKey, server, endpoint, method = 'GET', data = null) {
        const url = `https://${server}.api.mailchimp.com/3.0/${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Authorization': `apikey ${apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.detail || `Mailchimp API error: ${response.status}`);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };
        } catch (error) {
            console.error('Mailchimp request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getMailchimpLists(apiKey, server) {
        return this.mailchimpRequest(apiKey, server, 'lists');
    }

    async getMailchimpCampaigns(apiKey, server) {
        return this.mailchimpRequest(apiKey, server, 'campaigns');
    }

    // ==================== SLACK CLIENT ====================
    async slackRequest(token, endpoint, method = 'GET', data = null) {
        const url = `https://slack.com/api/${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        if (data && method === 'POST') {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!responseData.ok) {
                throw new Error(responseData.error || `Slack API error: ${response.status}`);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };
        } catch (error) {
            console.error('Slack request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async sendSlackMessage(token, channel, text) {
        return this.slackRequest(token, 'chat.postMessage', 'POST', { channel, text });
    }

    // ==================== WHATSAPP BUSINESS API ====================
    async whatsappRequest(accessToken, phoneNumberId, endpoint, method = 'GET', data = null) {
        const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (data && method === 'POST') {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.error?.message || `WhatsApp API error: ${response.status}`);
            }

            return {
                success: true,
                data: responseData,
                status: response.status
            };
        } catch (error) {
            console.error('WhatsApp request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async sendWhatsAppMessage(accessToken, phoneNumberId, to, text) {
        return this.whatsappRequest(accessToken, phoneNumberId, 'messages', 'POST', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: { body: text }
        });
    }

    // ==================== UNIVERSAL METRICS FETCHER ====================
    async fetchPlatformMetrics(platform, credentials, accountInfo) {
        switch(platform) {
            case 'shopify':
                const shopify = await this.getShopifyShopInfo(accountInfo.shopDomain, credentials);
                const orders = await this.getShopifyOrders(accountInfo.shopDomain, credentials, 10);
                const products = await this.getShopifyProducts(accountInfo.shopDomain, credentials);
                
                return {
                    shop_name: shopify.success ? shopify.data.shop.name : null,
                    email: shopify.success ? shopify.data.shop.email : null,
                    orders_count: orders.success ? orders.data.orders.length : 0,
                    products_count: products.success ? products.data.products.length : 0,
                    currency: shopify.success ? shopify.data.shop.currency : 'USD'
                };

            case 'stripe':
                const balance = await this.getStripeBalance(credentials);
                const customers = await this.getStripeCustomers(credentials, 10);
                const charges = await this.getStripeCharges(credentials, 10);
                
                return {
                    available_balance: balance.success ? balance.data.available[0]?.amount / 100 : 0,
                    pending_balance: balance.success ? balance.data.pending[0]?.amount / 100 : 0,
                    currency: balance.success ? balance.data.available[0]?.currency : 'usd',
                    customers_count: customers.success ? customers.data.data.length : 0,
                    recent_charges: charges.success ? charges.data.data.length : 0
                };

            case 'salesforce':
                const leads = await this.getSalesforceLeads(accountInfo.instanceUrl, credentials);
                const opportunities = await this.getSalesforceOpportunities(accountInfo.instanceUrl, credentials);
                
                return {
                    leads_count: leads.success ? leads.data.totalSize : 0,
                    opportunities_count: opportunities.success ? opportunities.data.totalSize : 0
                };

            case 'hubspot':
                const contacts = await this.getHubspotContacts(credentials, 10);
                const deals = await this.getHubspotDeals(credentials, 10);
                
                return {
                    contacts_count: contacts.success ? contacts.data.results.length : 0,
                    deals_count: deals.success ? deals.data.results.length : 0
                };

            default:
                return {
                    message: 'Basic metrics only',
                    synced_at: new Date().toISOString()
                };
        }
    }
}

module.exports = PlatformClients;