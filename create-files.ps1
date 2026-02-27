# create-files.ps1 - Simple name, no special characters
Write-Host "Creating automation files..." -ForegroundColor Green

# Create directories
New-Item -ItemType Directory -Force -Path "services\integrations" | Out-Null
New-Item -ItemType Directory -Force -Path "models" | Out-Null
New-Item -ItemType Directory -Force -Path "migrations" | Out-Null
New-Item -ItemType Directory -Force -Path "api" | Out-Null

Write-Host "Directories created" -ForegroundColor Green

# Create automation engine
@"
const cron = require('node-cron');
class AutomationEngine {
    constructor() {
        this.jobs = new Map();
    }
    async executeAutomation(id, userId) {
        console.log(`Executing automation ${id} for user ${userId}`);
        return { success: true };
    }
}
module.exports = new AutomationEngine();
"@ | Out-File -FilePath "services\automation-engine.js" -Encoding utf8

Write-Host "Created services\automation-engine.js" -ForegroundColor Green

# Create integrations index
@"
class IntegrationService {
    constructor() {
        this.apis = {};
    }
    async connect(platform, credentials, userId, accountName) {
        return { success: true, accountId: '123' };
    }
}
module.exports = new IntegrationService();
"@ | Out-File -FilePath "services\integrations\index.js" -Encoding utf8

Write-Host "Created services\integrations\index.js" -ForegroundColor Green

# Create Shopify integration
@"
class ShopifyIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { name: 'Test Shop' } };
    }
}
module.exports = new ShopifyIntegration();
"@ | Out-File -FilePath "services\integrations\shopify.js" -Encoding utf8

Write-Host "Created services\integrations\shopify.js" -ForegroundColor Green

# Create Stripe integration
@"
class StripeIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { email: 'test@example.com' } };
    }
}
module.exports = new StripeIntegration();
"@ | Out-File -FilePath "services\integrations\stripe.js" -Encoding utf8

Write-Host "Created services\integrations\stripe.js" -ForegroundColor Green

# Create Mailchimp integration
@"
class MailchimpIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { name: 'Test Account' } };
    }
}
module.exports = new MailchimpIntegration();
"@ | Out-File -FilePath "services\integrations\mailchimp.js" -Encoding utf8

Write-Host "Created services\integrations\mailchimp.js" -ForegroundColor Green

# Create Slack integration
@"
class SlackIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { team: 'Test Team' } };
    }
}
module.exports = new SlackIntegration();
"@ | Out-File -FilePath "services\integrations\slack.js" -Encoding utf8

Write-Host "Created services\integrations\slack.js" -ForegroundColor Green

# Create automation model
@"
const { v4: uuidv4 } = require('uuid');
class AutomationModel {
    static async create(userId, data) {
        return 'auto_' + Date.now();
    }
}
module.exports = AutomationModel;
"@ | Out-File -FilePath "models\automation.js" -Encoding utf8

Write-Host "Created models\automation.js" -ForegroundColor Green

# Create connected account model
@"
const crypto = require('crypto');
class ConnectedAccount {
    static async create(userId, platform, accountName, credentials) {
        return 'acc_' + Date.now();
    }
}
module.exports = ConnectedAccount;
"@ | Out-File -FilePath "models\connected-account.js" -Encoding utf8

Write-Host "Created models\connected-account.js" -ForegroundColor Green

# Create migrations SQL
@"
CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    description TEXT,
    trigger_type TEXT,
    trigger_config TEXT,
    action_type TEXT,
    action_config TEXT,
    schedule TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME
);
"@ | Out-File -FilePath "migrations\create-tables.sql" -Encoding utf8

Write-Host "Created migrations\create-tables.sql" -ForegroundColor Green

# Create API routes
@"
const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.json([]));
module.exports = router;
"@ | Out-File -FilePath "api\automations-routes.js" -Encoding utf8

Write-Host "Created api\automations-routes.js" -ForegroundColor Green

# Create install instructions
@"
npm install node-cron axios shopify-api-node stripe @mailchimp/mailchimp_marketing @slack/web-api
"@ | Out-File -FilePath "install.txt" -Encoding utf8

Write-Host "Created install.txt" -ForegroundColor Green

Write-Host ""
Write-Host "ALL FILES CREATED!" -ForegroundColor Green
Write-Host "Next: Run npm install node-cron axios shopify-api-node stripe @mailchimp/mailchimp_marketing @slack/web-api" -ForegroundColor Yellow