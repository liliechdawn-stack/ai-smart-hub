class ShopifyIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { name: 'Test Shop' } };
    }
}

module.exports = new ShopifyIntegration();
