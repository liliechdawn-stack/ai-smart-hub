class SlackIntegration {
    async connect(credentials) {
        return { success: true, accountInfo: { team: 'Test Team' } };
    }
}

module.exports = new SlackIntegration();
