// Cloudflare AI Gateway Service
// Real integration with Cloudflare AI Gateway API
// https://developers.cloudflare.com/ai-gateway/

const fetch = require('node-fetch');

class CloudflareGateway {
    constructor(accountId, gatewayName, apiToken) {
        this.accountId = accountId;
        this.gatewayName = gatewayName;
        this.apiToken = apiToken;
        this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}`;
    }

    // Test connection to Cloudflare Gateway
    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Cloudflare Gateway connection failed: ${error}`);
            }

            const data = await response.json();
            return {
                success: true,
                models: data.result || [],
                message: 'Successfully connected to Cloudflare Gateway'
            };
        } catch (error) {
            console.error('Cloudflare Gateway connection error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // List available models
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to list models: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                success: true,
                models: data.result || []
            };
        } catch (error) {
            console.error('Error listing models:', error);
            return {
                success: false,
                error: error.message,
                models: []
            };
        }
    }

    // Run AI model through gateway
    async runModel(model, messages, options = {}) {
        try {
            const startTime = Date.now();
            
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.maxTokens || 1000,
                    stream: options.stream || false
                })
            });

            const duration = Date.now() - startTime;

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Model execution failed: ${error}`);
            }

            const data = await response.json();
            
            return {
                success: true,
                response: data.choices?.[0]?.message?.content || data.result?.response,
                usage: data.usage || {
                    prompt_tokens: data.result?.usage?.prompt_tokens || 0,
                    completion_tokens: data.result?.usage?.completion_tokens || 0,
                    total_tokens: data.result?.usage?.total_tokens || 0
                },
                model: model,
                duration: duration,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error running model:', error);
            return {
                success: false,
                error: error.message,
                model: model
            };
        }
    }

    // Get usage statistics
    async getUsage(startDate, endDate) {
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const response = await fetch(`${this.baseUrl}/usage?${params.toString()}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get usage: ${response.statusText}`);
            }

            const data = await response.json();
            
            return {
                success: true,
                usage: data.result || {
                    total_requests: 0,
                    total_tokens: 0,
                    total_cost: 0,
                    by_model: []
                }
            };
        } catch (error) {
            console.error('Error getting usage:', error);
            return {
                success: false,
                error: error.message,
                usage: {
                    total_requests: 0,
                    total_tokens: 0,
                    total_cost: 0,
                    by_model: []
                }
            };
        }
    }

    // Create a new gateway configuration
    async createGatewayConfig(name, description, settings = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/configs`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    description: description,
                    settings: {
                        rate_limiting: settings.rateLimiting || { enabled: false },
                        caching: settings.caching || { enabled: true, ttl: 3600 },
                        logging: settings.logging || { enabled: true, level: 'info' },
                        ...settings
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create gateway config: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                success: true,
                config: data.result,
                message: 'Gateway configuration created successfully'
            };
        } catch (error) {
            console.error('Error creating gateway config:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get gateway configuration
    async getGatewayConfig(configId) {
        try {
            const response = await fetch(`${this.baseUrl}/configs/${configId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get gateway config: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                success: true,
                config: data.result
            };
        } catch (error) {
            console.error('Error getting gateway config:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update gateway configuration
    async updateGatewayConfig(configId, updates) {
        try {
            const response = await fetch(`${this.baseUrl}/configs/${configId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                throw new Error(`Failed to update gateway config: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                success: true,
                config: data.result,
                message: 'Gateway configuration updated successfully'
            };
        } catch (error) {
            console.error('Error updating gateway config:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Delete gateway configuration
    async deleteGatewayConfig(configId) {
        try {
            const response = await fetch(`${this.baseUrl}/configs/${configId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to delete gateway config: ${response.statusText}`);
            }

            return {
                success: true,
                message: 'Gateway configuration deleted successfully'
            };
        } catch (error) {
            console.error('Error deleting gateway config:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get real-time metrics
    async getMetrics(timeframe = '1h') {
        try {
            const response = await fetch(`${this.baseUrl}/metrics?timeframe=${timeframe}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get metrics: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                success: true,
                metrics: data.result || {
                    requests_per_second: 0,
                    latency_p95: 0,
                    error_rate: 0,
                    tokens_per_second: 0
                }
            };
        } catch (error) {
            console.error('Error getting metrics:', error);
            return {
                success: false,
                error: error.message,
                metrics: {
                    requests_per_second: 0,
                    latency_p95: 0,
                    error_rate: 0,
                    tokens_per_second: 0
                }
            };
        }
    }
}

module.exports = CloudflareGateway;