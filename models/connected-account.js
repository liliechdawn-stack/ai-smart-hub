class ConnectedAccount {
    static async create(userId, platform, accountName, credentials) {
        return 'acc_' + Date.now();
    }
}

module.exports = ConnectedAccount;
