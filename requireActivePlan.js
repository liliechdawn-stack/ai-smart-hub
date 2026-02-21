const db = require("../database");

function requireActivePlan(req, res, next) {
  const userId = req.user.id;

  db.get(
    "SELECT subscription, trial_ends_at FROM users WHERE id = ?",
    [userId],
    (err, user) => {
      if (!user) return res.status(401).json({ error: "User not found" });

      if (user.subscription !== "free") return next();

      const now = new Date();
      const trialEnd = new Date(user.trial_ends_at);

      if (now > trialEnd) {
        return res.status(402).json({
          error: "Free trial expired",
          forceUpgrade: true,
        });
      }

      next();
    }
  );
}

module.exports = requireActivePlan;
