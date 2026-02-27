const { v4: uuidv4 } = require('uuid');

class AutomationModel {
    static async create(userId, data) {
        return 'auto_' + Date.now();
    }
}

module.exports = AutomationModel;


