// ============================================================
// backend/routes/platform-routes.js - Platform Routes
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../auth-middleware");
const { isAdminMiddleware } = require("../auth");
const {
  platformHealth,
  updatePlatformHealth,
  getSystemLogs,
  logSystemEvent,
} = require("../services/health-service");
const { getQueueStats, getQueueStatus } = require("../queue-service");
const { getUsageStats } = require("../database-supabase.js");

// Platform health
router.get("/health", async (req, res) => {
  await updatePlatformHealth();
  res.json({
    ...platformHealth,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    timestamp: new Date().toISOString(),
  });
});

// Queue status
router.get("/queue", authenticateToken, async (req, res) => {
  try {
    const queueStats = await getQueueStats();
    const queueStatus = await getQueueStatus();
    res.json({
      ...queueStats,
      ...queueStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting queue status:", error);
    res.status(500).json({ error: error.message });
  }
});

// System logs (Admin only)
router.get("/logs", authenticateToken, isAdminMiddleware, async (req, res) => {
  const { limit = 100, eventType, startDate, endDate } = req.query;

  try {
    const logs = await getSystemLogs({ limit, eventType, startDate, endDate });
    res.json(logs);
  } catch (error) {
    console.error("Error fetching system logs:", error);
    res.status(500).json({ error: error.message });
  }
});

// System metrics
router.get("/metrics", authenticateToken, async (req, res) => {
  try {
    const { data: usageStats } = await getUsageStats(req.user.id);
    const queueStats = await getQueueStats();
    const health = platformHealth;

    res.json({
      usage: usageStats,
      queue: queueStats,
      health: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;