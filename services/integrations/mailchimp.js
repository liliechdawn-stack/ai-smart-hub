class MailchimpIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { name: 'Test Account' } };
    }
}

module.exports = new MailchimpIntegration();
