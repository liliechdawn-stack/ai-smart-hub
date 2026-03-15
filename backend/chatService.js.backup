const { db, query, getOne } = require("./db");

const LIMITS = {
  free: { messages: 100, leads: 10 },
  pro: { messages: 5000, leads: 500 },
  agency: { messages: 999999, leads: 999999 }
};

// Check if user has remaining credits
async function canUserProceed(user_id, type = 'messages') {
  const user = await getOne("SELECT plan, messages_used, leads_used FROM users WHERE id = ?", [user_id]);
  if (!user) return false;
  const planLimit = LIMITS[user.plan] || LIMITS.free;
  const current = type === 'messages' ? user.messages_used : user.leads_used;
  const limit = type === 'messages' ? planLimit.messages : planLimit.leads;
  return current < limit;
}

// Save message and increment usage
async function saveAiResponse(user_id, session_id, client_name, message, response) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`INSERT INTO chats (user_id, session_id, client_name, message, response) VALUES (?, ?, ?, ?, ?)`,
        [user_id, session_id, client_name, message, response]);
      db.run(`UPDATE users SET messages_used = messages_used + 1 WHERE id = ?`, [user_id], (err) => {
        err ? reject(err) : resolve(true);
      });
    });
  });
}

async function getGroupedHistory(user_id) {
  return await query(`
    SELECT session_id, client_name, MAX(created_at) as last_msg, COUNT(*) as count 
    FROM chats WHERE user_id = ? 
    GROUP BY session_id ORDER BY last_msg DESC`, [user_id]);
}

module.exports = { canUserProceed, saveAiResponse, getGroupedHistory };