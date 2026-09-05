// ============================================================
// backend/services/health-service.js - Health Monitoring Service
// ============================================================

const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../database-supabase.js");
const { getQueueStats, getQueueStatus } = require("../queue-service");

// In-memory log storage (with Supabase persistence)
const systemLogs = [];
const MAX_LOGS = 10000;

// Platform health state
let platformHealth = {
  status: "healthy",
  lastCheck: new Date().toISOString(),
  components: {
    database: { status: "healthy", latency: 0, lastCheck: null },
    queue: { status: "healthy", depth: 0, activeJobs: 0, maxConcurrent: 5 },
    ai: { status: "healthy", lastRequest: null, avgLatency: 0 },
    webhook: { status: "healthy", lastEvent: null, eventsProcessed: 0 },
  },
  metrics: {
    activeExecutions: 0,
    totalExecutionsToday: 0,
    avgExecutionTime: 0,
    errorRate: 0,
  },
};

/**
 * Log a system event
 * @param {string} eventType - Type of event
 * @param {string} message - Log message
 * @param {object} details - Additional details
 * @param {string} userId - User ID (optional)
 * @returns {Promise<object>} Log entry
 */
async function logSystemEvent(eventType, message, details = {}, userId = null) {
  const logEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    event_type: eventType,
    message: message,
    details: details,
    user_id: userId,
  };

  systemLogs.unshift(logEntry);
  if (systemLogs.length > MAX_LOGS) systemLogs.pop();

  try {
    await supabase.from("system_logs").insert({
      id: logEntry.id,
      event_type: eventType,
      message: message,
      details: details,
      user_id: userId,
      created_at: logEntry.timestamp,
    });
  } catch (err) {
    console.error("Failed to persist system log:", err.message);
  }

  console.log(`📋 [SYS-LOG] ${eventType}: ${message}`);
  return logEntry;
}

/**
 * Get system logs with filters
 * @param {object} options - Filter options
 * @param {number} options.limit - Max results
 * @param {string} options.eventType - Filter by event type
 * @param {string} options.startDate - Start date filter
 * @param {string} options.endDate - End date filter
 * @returns {Promise<Array>} Log entries
 */
async function getSystemLogs(options = {}) {
  const { limit = 100, eventType, startDate, endDate } = options;

  try {
    let query = supabase
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching system logs:", error);
    return [];
  }
}

/**
 * Update platform health status
 * @returns {Promise<void>}
 */
async function updatePlatformHealth() {
  const startTime = Date.now();

  try {
    // Check database health
    const dbStart = Date.now();
    const { data: dbCheck, error: dbError } = await supabase
      .from("workflows")
      .select("count", { count: "exact", head: true });
    platformHealth.components.database = {
      status: dbError ? "unhealthy" : "healthy",
      latency: Date.now() - dbStart,
      lastCheck: new Date().toISOString(),
      error: dbError?.message,
    };

    // Check queue health
    const queueStats = await getQueueStats();
    const queueStatus = await getQueueStatus();
    platformHealth.components.queue = {
      status: (queueStats.pending || 0) > 100 ? "degraded" : "healthy",
      depth: queueStats.pending || 0,
      activeJobs: queueStats.activeJobs || 0,
      maxConcurrent: queueStats.maxConcurrent || 5,
      pausedJobs: queueStats.pausedJobs || 0,
      lastCheck: new Date().toISOString(),
    };

    // Get execution metrics from last 24 hours
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const { data: executions } = await supabase
      .from("workflow_executions")
      .select("status, execution_time_ms")
      .gte("started_at", yesterday);

    const totalExecutions = executions?.length || 0;
    const failedExecutions = executions?.filter((e) => e.status === "failed").length || 0;
    const avgExecutionTime =
      executions?.reduce((sum, e) => sum + (e.execution_time_ms || 0), 0) / (totalExecutions || 1);

    platformHealth.metrics = {
      activeExecutions: 0,
      totalExecutionsToday: totalExecutions,
      avgExecutionTime: Math.round(avgExecutionTime),
      errorRate: totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0,
    };

    // Overall health status
    const isHealthy =
      platformHealth.components.database.status === "healthy" &&
      platformHealth.components.queue.status !== "unhealthy";

    platformHealth.status = isHealthy ? "healthy" : "degraded";
    platformHealth.lastCheck = new Date().toISOString();

    if (platformHealth.status !== "healthy") {
      await logSystemEvent("HEALTH_DEGRADED", `Platform health degraded`, platformHealth);
    }
  } catch (error) {
    console.error("Health check failed:", error);
    platformHealth.status = "unhealthy";
    platformHealth.components.database.status = "unhealthy";
    await logSystemEvent("HEALTH_CHECK_FAILED", error.message, { error: error.message });
  }
}

module.exports = {
  systemLogs,
  MAX_LOGS,
  platformHealth,
  logSystemEvent,
  getSystemLogs,
  updatePlatformHealth,
};