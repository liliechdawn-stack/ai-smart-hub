class StripeIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { email: 'test@example.com' } };
    }
}

module.exports = new StripeIntegration();
