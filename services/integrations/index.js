class IntegrationService {
    constructor() {
        this.apis = {};
    }

    async connect(platform, credentials, userId, accountName) {
        return { success: true, accountId: '123' };
    }

    async getCredentials(accountId) {
        return {};
    }
}

module.exports = new IntegrationService();

