// ============================================================
// backend/server.js - AI Smart Hub Main Server
// ============================================================
// REFACTORED - Second Stage
// Extracted business logic to dedicated route files:
// - Authentication → routes/auth-routes.js
// - Profile → routes/profile-routes.js
// - Dashboard → routes/dashboard-routes.js
// - Chat → routes/chat-routes.js
// - Widget → routes/widget-routes.js
// - Widget Chat → routes/widget-chat-routes.js
// - Subscription/Billing → routes/subscription-routes.js
// - Admin → routes/admin-routes.js
// - Support → routes/support-routes.js
// - Leads → routes/leads-routes.js
// - Smart Hub → smart-hub.js (existing)
// ============================================================

const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const http = require("http");
require("dotenv").config();

// ============================================================
// CONFIGURATION
// ============================================================
const config = require("./config");

// ============================================================
// DATABASE
// ============================================================
const dbModule = require("./database-supabase.js");
const {
  supabase,
  getUserByEmail,
  createUser,
  getUserById,
  setWidgetKey,
  incrementMessagesUsed,
  incrementLeadsUsed,
  saveChat,
  saveLead,
  verifyUser,
  addKnowledge,
  getKnowledgeByUser,
  updateWidgetSettings,
  getLeadByEmail,
  getBusinessIdentity,
  saveBusinessIdentity,
  getSmartSettings,
  logActivity,
  // ... all other exports preserved
} = dbModule;

// ============================================================
// AUTH
// ============================================================
const { auth, isAdminMiddleware, signup, login } = require("./auth");
const { authenticateToken } = require("./auth-middleware");

// ============================================================
// ENTERPRISE FEATURES
// ============================================================
const { addToQueue, getQueueStats, getQueueStatus } = require("./queue-service");
const { rateLimitMiddleware } = require("./rate-limiter");
const workflowVersioning = require("./workflow-versioning");
const debugExecutor = require("./debug-executor");
const errorHandler = require("./error-handler");

// ============================================================
// SERVICES
// ============================================================
const { sendEmail, sendEmailWithFallback } = require("./services/email-service");
const { extractTextFromFile } = require("./services/file-service");
const {
  platformHealth,
  updatePlatformHealth,
  logSystemEvent,
  getSystemLogs,
} = require("./services/health-service");
const {
  calculateAutomationROI,
  generateBusinessInsights,
  generateRecommendations,
  calculateTotalROI,
} = require("./services/business-intelligence-service");

// ============================================================
// EXTERNAL SERVICES
// ============================================================
const CloudflareGateway = require("../services/cloudflare-gateway");
const PlatformClients = require("../services/platform-clients");
const EncryptionService = require("../services/encryption");
const MetricsService = require("../services/metrics");

// ============================================================
// MODELS
// ============================================================
const AccountModel = require("../models/Account");
const ActivityModel = require("../models/Activity");
const GovernanceModel = require("../models/Governance");
const AlertModel = require("../models/Alert");

// ============================================================
// ROUTE IMPORTS (All routes extracted from server.js)
// ============================================================

// Authentication Routes
const authRoutes = require("./routes/auth-routes");

// Profile Routes
const profileRoutes = require("./routes/profile-routes");

// Dashboard Routes
const dashboardRoutes = require("./routes/dashboard-routes");

// Chat Routes
const chatRoutes = require("./routes/chat-routes");

// Widget Routes
const widgetRoutes = require("./routes/widget-routes");

// Widget Chat Routes
const widgetChatRoutes = require("./routes/widget-chat-routes");

// Subscription/Billing Routes
const subscriptionRoutes = require("./routes/subscription-routes");

// Admin Routes
const adminRoutes = require("./routes/admin-routes");

// Support Routes
const supportRoutes = require("./routes/support-routes");

// Leads Routes
const leadsRoutes = require("./routes/leads-routes");

// Business Intelligence Routes
const businessRoutes = require("./routes/business-routes");

// Broadcast Routes
const broadcastRoutes = require("./routes/broadcast-routes");

// Platform Routes
const platformRoutes = require("./routes/platform-routes");

// Smart Hub (existing)
let smartHubRoutes;
try {
  smartHubRoutes = require("./smart-hub");
  console.log("✓ smart-hub.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load smart-hub.js:", err.message);
  smartHubRoutes = (req, res) =>
    res.status(500).json({ error: "Smart Hub routes not available" });
}

// Customer Insights (existing)
let customerRouter;
try {
  customerRouter = require("./customer-insights");
  console.log("✓ customer-insights.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load customer-insights.js:", err.message);
  customerRouter = express.Router();
}

// AI Automations (existing)
const automationRoutes = require("../api/automations-routes");

// Analytics and Settings (existing)
const analyticsRoutes = require("../api/analytics-routes");
const settingsRoutes = require("../api/settings-routes");

// AI Powerhouse (existing)
const aiPowerhouseRoutes = require("../api/ai-powerhouse-routes");

// Automation Templates (existing)
let automationTemplatesRoutes;
try {
  automationTemplatesRoutes = require("./routes/automation-templates-routes");
  console.log("✓ automation-templates-routes.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load automation-templates-routes.js:", err.message);
  automationTemplatesRoutes = (req, res) =>
    res.status(500).json({ error: "Templates routes not available" });
}

// User Automations (existing)
let userAutomationsRoutes;
try {
  userAutomationsRoutes = require("./routes/user-automations-routes");
  console.log("✓ user-automations-routes.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load user-automations-routes.js:", err.message);
  userAutomationsRoutes = (req, res) =>
    res.status(500).json({ error: "User automations routes not available" });
}

// Business Coach (existing)
let coachRoutes;
try {
  coachRoutes = require("./routes/coach");
  console.log("✓ coach.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load coach.js:", err.message);
  coachRoutes = (req, res) =>
    res.status(500).json({ error: "Business Coach routes not available" });
}

// Workflow Engine (existing)
let workflowRoutes;
try {
  workflowRoutes = require("./routes/workflow-routes");
  console.log("✓ workflow-routes.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load workflow-routes.js:", err.message);
  workflowRoutes = null;
}

let webhookHandler;
try {
  webhookHandler = require("./webhook-handler");
  console.log("✓ webhook-handler.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load webhook-handler.js:", err.message);
  webhookHandler = null;
}

let webhookListener;
try {
  const { webhookRouter } = require("./webhook-listener");
  webhookListener = webhookRouter;
  console.log("✓ webhook-listener.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load webhook-listener.js:", err.message);
  webhookListener = null;
}

let workflowScheduler;
try {
  workflowScheduler = require("./scheduler");
  console.log("✓ scheduler.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load scheduler.js:", err.message);
  workflowScheduler = null;
}

let workflowTemplatesRoutes;
try {
  workflowTemplatesRoutes = require("./workflow-templates");
  console.log("✓ workflow-templates.js loaded successfully");
} catch (err) {
  console.error("✗ Failed to load workflow-templates.js:", err.message);
  workflowTemplatesRoutes = null;
}

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================
const corsOptions = {
  origin: config.CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Workspace-Id"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(bodyParser.json({ limit: config.MAX_JSON_SIZE }));
app.use(bodyParser.urlencoded({ limit: config.MAX_JSON_SIZE, extended: true }));

// ============================================================
// WORKSPACE SCOPING MIDDLEWARE
// ============================================================
async function ensureWorkspaceAccess(req, res, next) {
  const userId = req.user?.id;
  const requestedWorkspaceId =
    req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!requestedWorkspaceId) {
    req.workspaceId = userId;
    return next();
  }

  try {
    const { data: workspaceMember, error } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", requestedWorkspaceId)
      .eq("user_id", userId)
      .single();

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", requestedWorkspaceId)
      .single();

    if (
      workspaceMember ||
      workspace?.owner_id === userId ||
      userId === config.ADMIN_USER_ID
    ) {
      req.workspaceId = requestedWorkspaceId;
      return next();
    }

    return res.status(403).json({ error: "Access denied to this workspace" });
  } catch (error) {
    return res.status(403).json({ error: "Workspace access denied" });
  }
}

// ============================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================
app.use((req, res, next) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const userId = req.user?.id || "anonymous";

    logSystemEvent(
      "API_REQUEST",
      `${req.method} ${req.path}`,
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: duration,
        userId: userId,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
      userId
    );
  });

  next();
});

// ============================================================
// SOCKET.IO
// ============================================================
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: config.SOCKET_CORS,
  transports: ["websocket", "polling"],
});
app.set("socketio", io);
global.io = io;

// Socket.io authentication
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await getUserById(decoded.id);
    if (!user) {
      return next(new Error("User not found"));
    }
    socket.userId = user.id;
    socket.userEmail = user.email;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

// Socket.io connection - FIXED: Removed arbitrary room join vulnerability
io.on("connection", (socket) => {
  console.log(`🔌 User connected: ${socket.userId}`);

  // Only join the authenticated user's room
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
    socket.join(`org:${socket.userId}`);
    console.log(`🔌 User joined their own room: user:${socket.userId}`);
  }

  // REMOVED: socket.on("join", ...) - This was a security vulnerability
  // Client can no longer request to join arbitrary user rooms

  socket.on("disconnect", () => {
    console.log(`🔌 User disconnected: ${socket.userId}`);
  });
});

// ============================================================
// STATIC FILES
// ============================================================
app.use("/widget.js", express.static(path.join(__dirname, "widget.js")));
app.use(express.static(path.join(__dirname, "../public")));

// ============================================================
// ROUTE MOUNTS (All routes now imported from dedicated files)
// ============================================================

// Authentication
app.use("/api/auth", authRoutes);
console.log("✓ Auth routes mounted at /api/auth");

// Profile
app.use("/api/admin/users", profileRoutes);
console.log("✓ Profile routes mounted at /api/admin/users");

// Dashboard
app.use("/api/dashboard", dashboardRoutes);
console.log("✓ Dashboard routes mounted at /api/dashboard");

// Chat
app.use("/api/chat", chatRoutes);
console.log("✓ Chat routes mounted at /api/chat");

// Widget (config + key)
app.use("/api", widgetRoutes);
console.log("✓ Widget routes mounted at /api/widget and /api/public/widget-config");

// Widget Chat (dashboard + public)
app.use("/api", widgetChatRoutes);
console.log("✓ Widget chat routes mounted at /api/widget/chat and /api/public/chat");

// Subscription/Billing
app.use("/api/subscription", subscriptionRoutes);
console.log("✓ Subscription routes mounted at /api/subscription");

// Admin
app.use("/api/admin", adminRoutes);
console.log("✓ Admin routes mounted at /api/admin");

// Support
app.use("/api/support", supportRoutes);
console.log("✓ Support routes mounted at /api/support");

// Leads
app.use("/api", leadsRoutes);
console.log("✓ Leads routes mounted at /api/leads and /api/public/leads");

// Business Intelligence
app.use("/api/business", authenticateToken, businessRoutes);
console.log("✓ Business Intelligence routes mounted at /api/business");

// Broadcast
app.use("/api/broadcast", authenticateToken, broadcastRoutes);
console.log("✓ Broadcast routes mounted at /api/broadcast");

// Platform
app.use("/api/platform", platformRoutes);
console.log("✓ Platform routes mounted at /api/platform");

// Smart Hub
app.use("/api/smart-hub", smartHubRoutes);
console.log("✓ Smart Hub routes mounted at /api/smart-hub");

// Customer Insights
app.use("/api/customer-insights", customerRouter);
console.log("✓ Customer Insights routes mounted at /api/customer-insights");

// Customer Insights Debug
app.get("/api/customer-insights/debug", (req, res) => {
  res.json({
    status: "alive",
    message: "Customer Insights prefix is reachable",
    time: new Date().toISOString(),
  });
});

// AI Automations
app.use("/api/ai-automations", require("./ai-automations"));
console.log("✓ AI Automations routes mounted at /api/ai-automations");

// Automation Powerhouse
app.use("/api/automations", automationRoutes);
console.log("✓ Automation Powerhouse routes mounted at /api/automations");

// Analytics and Settings
app.use("/api/analytics", analyticsRoutes);
console.log("✓ Analytics routes mounted at /api/analytics");
app.use("/api/settings", settingsRoutes);
console.log("✓ Settings routes mounted at /api/settings");

// AI Powerhouse
const AI_POWERHOUSE_ENABLED =
  config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_AI_API_TOKEN;
console.log(
  `🔋 AI Powerhouse: ${AI_POWERHOUSE_ENABLED ? "✅ Enabled" : "⛔ Disabled"}`
);
app.use("/api/powerhouse", authenticateToken, aiPowerhouseRoutes);
console.log("✓ AI Powerhouse routes mounted at /api/powerhouse");

// Automation Templates
app.use("/api/automation", automationTemplatesRoutes);
console.log("✓ Automation Templates routes mounted at /api/automation");

// User Automations
app.use("/api", userAutomationsRoutes);
console.log("✓ User Automations routes mounted at /api/automations");

// AI Business Coach
app.use("/api/coach", authenticateToken, coachRoutes);
console.log("✓ AI Business Coach routes mounted at /api/coach");

// Workflow Engine
if (workflowRoutes) {
  app.use("/api/workflows/:id/execute", rateLimitMiddleware);
  app.use("/api/workflows/execute", rateLimitMiddleware);
  app.use("/api", workflowRoutes);
  console.log("✓ Workflow routes mounted at /api/workflows with rate limiting");
}

if (webhookHandler) {
  app.use("/", webhookHandler);
  console.log("✓ Webhook handler mounted at /webhook/*");
}

if (webhookListener) {
  app.use("/", webhookListener);
  console.log("✓ Webhook listener mounted");
}

if (workflowTemplatesRoutes) {
  app.use("/", workflowTemplatesRoutes);
  console.log("✓ Workflow templates routes mounted at /api/workflow-templates");
}

// ============================================================
// KNOWLEDGE BASE
// ============================================================
app.post(
  "/api/knowledge/add",
  auth,
  async (req, res) => {
    // checkVerified middleware logic moved inline
    try {
      const user = await getUserById(req.user.id);
      if (!user || (user.is_verified !== 1 && user.email.toLowerCase().trim() !== config.ADMIN_EMAIL)) {
        return res.status(403).json({ error: "Please verify your email to access this feature." });
      }
      
      const { content } = req.body;
      await addKnowledge(req.user.id, content);
      res.json({ success: true, message: "Knowledge added" });
    } catch (err) {
      console.error("Knowledge add error:", err);
      res.status(500).json({ error: "Failed to save knowledge" });
    }
  }
);
console.log("✓ Knowledge routes mounted at /api/knowledge");

// ============================================================
// CONTACT FORM
// ============================================================
app.post("/api/contact/send", bodyParser.json(), async (req, res) => {
  const { name, email, subject, message, priority, copyMe } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">📩 New Contact Form Submission</h1>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Priority:</strong> ${priority}</p>
          <p><strong>Message:</strong></p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 15px 0;">
            ${message.replace(/\n/g, "<br>")}
          </div>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 0.9rem;">Sent from AI Smart Hub Contact Form</p>
        </div>
      </body>
      </html>
    `;

    if (config.RESEND_API_KEY) {
      const { Resend } = require("resend");
      const resend = new Resend(config.RESEND_API_KEY);

      await resend.emails.send({
        from: "AI Smart Hub <noreply@aismarthub.website>",
        to: ["aismarthub68@gmail.com"],
        subject: `[Contact Form] ${subject} - ${name}`,
        html: emailHtml,
      });

      if (copyMe) {
        await resend.emails.send({
          from: "AI Smart Hub <noreply@aismarthub.website>",
          to: [email],
          subject: `Copy: ${subject}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px;">
                <h1 style="color: white; margin: 0;">📧 Thank You for Contacting AI Smart Hub</h1>
              </div>
              <div style="background: white; padding: 30px; margin-top: 20px; border-radius: 10px; border: 1px solid #e0e0e0;">
                <p>We've received your message and will respond within 24 hours.</p>
                <p><strong>Your message:</strong></p>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                  ${message.replace(/\n/g, "<br>")}
                </div>
                <p style="margin-top: 20px; color: #666;">Best regards,<br>AI Smart Hub Team</p>
              </div>
            </body>
            </html>
          `,
        });
      }

      console.log(`📧 Contact form message sent from: ${email}`);
    }

    res.json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});
console.log("✓ Contact routes mounted at /api/contact");

// ============================================================
// GUIDANCE CONTENT
// ============================================================
app.get("/api/content/guidance", (req, res) => {
  res.json({
    title: "How to Use Your AI Assistant",
    steps: [
      "Step 1: Go to Knowledge Base and add information about your business.",
      "Step 2: Copy your Widget Script from the Dashboard.",
      "Step 3: Paste the script tag into the <head> or <body> of your website.",
      "Step 4: Customize your widget color and welcome message in settings.",
    ],
  });
});

app.get("/api/content/legal", (req, res) => {
  res.json({
    terms: "By using our AI SaaS, you agree to provide accurate information and not use the AI for illegal purposes...",
    privacy: "We value your privacy. We store chat logs to improve your AI's responses and do not sell your lead data...",
  });
});
console.log("✓ Content routes mounted at /api/content");

// ============================================================
// TEST AND HEALTH ENDPOINTS
// ============================================================
app.get("/api/test", (req, res) => {
  res.json({
    status: "ok",
    message: "API is working",
    timestamp: new Date().toISOString(),
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.post("/api/webhook-test", (req, res) => {
  console.log("📨 Webhook test received:", req.body);
  res.json({ received: true, data: req.body, timestamp: new Date().toISOString() });
});

// ============================================================
// ENTERPRISE FEATURE ENDPOINTS (Consolidated)
// ============================================================

// Queue Stats
app.get("/api/queue/stats", authenticateToken, async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting queue stats:", error);
    res.status(500).json({ error: error.message });
  }
});

// Workflow Versioning
app.get(
  "/api/workflows/:id/versions",
  authenticateToken,
  ensureWorkspaceAccess,
  async (req, res) => {
    try {
      const versions = await workflowVersioning.getVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      console.error("Error getting versions:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/workflows/:id/versions/save",
  authenticateToken,
  ensureWorkspaceAccess,
  async (req, res) => {
    try {
      const { name, nodes, edges, change_note } = req.body;
      const version = await workflowVersioning.saveVersion(
        req.params.id,
        req.user.id,
        name,
        nodes,
        edges,
        change_note
      );
      res.json(version);
    } catch (error) {
      console.error("Error saving version:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/workflows/:id/rollback/:version",
  authenticateToken,
  ensureWorkspaceAccess,
  async (req, res) => {
    try {
      const workflow = await workflowVersioning.rollbackToVersion(
        req.params.id,
        parseInt(req.params.version)
      );
      res.json(workflow);
    } catch (error) {
      console.error("Error rolling back:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/workflows/:id/compare/:version1/:version2",
  authenticateToken,
  ensureWorkspaceAccess,
  async (req, res) => {
    try {
      const comparison = await workflowVersioning.compareVersions(
        req.params.id,
        parseInt(req.params.version1),
        parseInt(req.params.version2)
      );
      res.json(comparison);
    } catch (error) {
      console.error("Error comparing versions:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Debug Mode
app.post(
  "/api/workflows/:id/debug",
  authenticateToken,
  ensureWorkspaceAccess,
  async (req, res) => {
    try {
      const { trigger_data } = req.body;
      const sessionId = await debugExecutor.startDebugSession(
        req.params.id,
        req.user.id,
        trigger_data
      );
      res.json({ session_id: sessionId });
    } catch (error) {
      console.error("Error starting debug session:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.post("/api/debug/:sessionId/step", authenticateToken, async (req, res) => {
  try {
    const { action } = req.body;
    const result = await debugExecutor.step(req.params.sessionId, action);
    res.json(result);
  } catch (error) {
    console.error("Error stepping through debug:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/debug/:sessionId/breakpoint", authenticateToken, async (req, res) => {
  try {
    const { node_id, action } = req.body;
    if (action === "add") {
      debugExecutor.setBreakpoint(req.params.sessionId, node_id);
    } else {
      debugExecutor.removeBreakpoint(req.params.sessionId, node_id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error managing breakpoint:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/debug/:sessionId", authenticateToken, async (req, res) => {
  try {
    const session = debugExecutor.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Debug session not found" });
    }
    res.json(session);
  } catch (error) {
    console.error("Error getting debug session:", error);
    res.status(500).json({ error: error.message });
  }
});

// Error Handler
app.post(
  "/api/workflows/:id/error-handler",
  authenticateToken,
  ensureWorkspaceAccess,
  async (req, res) => {
    try {
      const { error_workflow_id, error_types } = req.body;
      await errorHandler.registerErrorHandler(req.params.id, error_workflow_id, error_types);
      res.json({ success: true });
    } catch (error) {
      console.error("Error registering error handler:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/workflows/:id/error-handler",
  authenticateToken,
  ensureWorkspaceAccess,
  async (req, res) => {
    try {
      const { data: handler } = await supabase
        .from("error_handlers")
        .select("*")
        .eq("workflow_id", req.params.id)
        .single();

      res.json(handler || null);
    } catch (error) {
      console.error("Error getting error handler:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================
// INITIALIZE BACKGROUND SERVICES
// ============================================================

if (workflowScheduler && workflowScheduler.initialize) {
  setTimeout(async () => {
    await workflowScheduler.initialize();
    console.log("✓ Workflow scheduler initialized");
  }, 5000);
  console.log("⏳ Workflow scheduler will start in 5 seconds");
}

setTimeout(async () => {
  await errorHandler.loadErrorHandlers();
  console.log("✓ Error handlers loaded");
}, 6000);

// ============================================================
// START SERVER
// ============================================================

server.listen(config.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${config.PORT}`);
  console.log(`📡 API endpoints available at /api/*`);
  console.log(`🔧 Workflow API: /api/workflows/*`);
  console.log(`💪 Platform Health: /api/platform/health`);
  console.log(`💰 Subscription: /api/subscription/*`);
  console.log(`🛡️ Auth: /api/auth/*`);
  console.log(`📊 Dashboard: /api/dashboard/*`);
  console.log(`🤖 AI Chat: /api/widget/chat and /api/public/chat`);
  console.log(`📧 Broadcast: /api/broadcast/*`);
  console.log(`🏢 Business Intelligence: /api/business/*`);
});