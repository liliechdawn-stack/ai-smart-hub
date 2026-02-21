const express = require("express");
const router = express.Router();
const { auth, isAdminMiddleware } = require("../auth");
const db = require("../database");

/* ================= ADMIN DASHBOARD ================= */
router.get("/stats", auth, isAdminMiddleware, (req, res) => {
  db.get(
    `SELECT 
      (SELECT COUNT(*) FROM users) as totalUsers,
      (SELECT COUNT(*) FROM users WHERE subscription != 'free') as paidUsers`,
    [],
    (err, stats) => {
      if (err) return res.status(500).json({ error: "Server error" });
      res.json(stats);
    }
  );
});

/* ================= GET ALL USERS ================= */
router.get("/users", auth, isAdminMiddleware, (req, res) => {
  db.all(
    `SELECT id, email, business_name, subscription, created_at FROM users`,
    [],
    (err, users) => {
      if (err) return res.status(500).json({ error: "Server error" });
      res.json(users);
    }
  );
});

/* ================= CHANGE USER PLAN ================= */
router.post("/users/plan", auth, isAdminMiddleware, (req, res) => {
  const { userId, plan } = req.body;

  if (!["free", "basic", "pro", "agency"].includes(plan)) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  db.run(
    "UPDATE users SET subscription = ? WHERE id = ?",
    [plan, userId],
    function (err) {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ success: true });
    }
  );
});

module.exports = router;
