// ============================================================
// backend/services/chat-service.js - AI Chat Service
// ============================================================
// PRODUCTION HARDENED with ATOMIC QUOTA CONSUMPTION
// - Database-level atomic message quota enforcement
// - No race conditions on usage tracking
// - AI calls only after quota successfully consumed
// ============================================================

const { v4: uuidv4 } = require("uuid");
const config = require("../config");
const {
  supabase,
  getUserById,
  getKnowledgeByUser,
  getBusinessIdentity,
  saveChat,
  incrementMessagesUsed,
  logActivity,
  consumeMessageQuota, // NEW: Atomic quota function
} = require("../database-supabase.js");
const { extractTextFromFile } = require("./file-service.js");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ============================================================
// IMPORT PLAN HELPERS - Single Source of Truth (from config)
// ============================================================
const { getPlanLimits, isLimitReached, getRemainingAllowance } = require("../config");

// ============================================================
// CONSTANTS
// ============================================================

const MAX_MESSAGE_LENGTH = 10000;
const MAX_CLIENT_NAME_LENGTH = 100;
const MAX_SESSION_ID_LENGTH = 100;
const MAX_WIDGET_KEY_LENGTH = 100;
const MAX_HISTORY_ITEMS = 50;
const MAX_HISTORY_ITEM_LENGTH = 5000;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_IMAGE_SIZE_MB = 10;
const MAX_FILE_SIZE_MB = 20;
const CLOUDFLARE_TIMEOUT_MS = 30000;
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/csv'
];

// ============================================================
// VALIDATION HELPERS
// ============================================================

function validateWidgetKey(widgetKey) {
  if (!widgetKey || typeof widgetKey !== 'string') {
    throw new Error("Valid widget key is required");
  }
  if (widgetKey.length > MAX_WIDGET_KEY_LENGTH) {
    throw new Error(`Widget key exceeds maximum length of ${MAX_WIDGET_KEY_LENGTH}`);
  }
  // Allow alphanumeric, underscore, hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(widgetKey)) {
    throw new Error("Invalid widget key format");
  }
  return widgetKey.trim();
}

function validateSessionId(sessionId) {
  if (!sessionId) return null;
  if (typeof sessionId !== 'string') {
    throw new Error("Invalid session ID format");
  }
  if (sessionId.length > MAX_SESSION_ID_LENGTH) {
    throw new Error(`Session ID exceeds maximum length of ${MAX_SESSION_ID_LENGTH}`);
  }
  // Allow alphanumeric, underscore, hyphen, colon
  if (!/^[a-zA-Z0-9_\-:]+$/.test(sessionId)) {
    throw new Error("Invalid session ID format");
  }
  return sessionId.trim();
}

function validateMessage(message) {
  if (!message) return null;
  if (typeof message !== 'string') {
    throw new Error("Invalid message format");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}`);
  }
  return message.trim();
}

function validateClientName(name) {
  if (!name) return null;
  if (typeof name !== 'string') {
    throw new Error("Invalid client name format");
  }
  if (name.length > MAX_CLIENT_NAME_LENGTH) {
    throw new Error(`Client name exceeds maximum length of ${MAX_CLIENT_NAME_LENGTH}`);
  }
  return name.trim().substring(0, 100);
}

function validateConversationHistory(history) {
  if (!history || !Array.isArray(history)) return [];
  
  const sanitized = [];
  for (let i = 0; i < Math.min(history.length, MAX_HISTORY_ITEMS); i++) {
    const item = history[i];
    if (!item || typeof item !== 'object') continue;
    
    const role = typeof item.role === 'string' ? item.role.toLowerCase() : '';
    // Only allow 'user' and 'assistant' roles - NEVER 'system'
    if (role !== 'user' && role !== 'assistant') continue;
    
    const text = typeof item.text === 'string' ? item.text : '';
    if (text.length > MAX_HISTORY_ITEM_LENGTH) continue;
    
    sanitized.push({
      role: role,
      text: text.trim().substring(0, MAX_HISTORY_ITEM_LENGTH)
    });
  }
  
  return sanitized;
}

function validateImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') {
    throw new Error("Invalid image data");
  }
  
  // Check for data URL format
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image format - must be a data URL");
  }
  
  const mimeType = match[1];
  const base64Data = match[2];
  
  // Validate MIME type
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedImageTypes.includes(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }
  
  // Check size (approximate from base64 length)
  const sizeInBytes = Buffer.from(base64Data, 'base64').length;
  const sizeInMB = sizeInBytes / (1024 * 1024);
  if (sizeInMB > MAX_IMAGE_SIZE_MB) {
    throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_SIZE_MB}MB`);
  }
  
  return { mimeType, base64Data, sizeInBytes };
}

function validateFileData(fileData, fileName) {
  if (!fileData || typeof fileData !== 'string') {
    throw new Error("Invalid file data");
  }
  
  if (!fileName || typeof fileName !== 'string') {
    throw new Error("File name is required");
  }
  
  if (fileName.length > MAX_FILE_NAME_LENGTH) {
    throw new Error(`File name exceeds maximum length of ${MAX_FILE_NAME_LENGTH}`);
  }
  
  // Check for data URL format
  const match = fileData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid file format - must be a data URL");
  }
  
  const mimeType = match[1];
  const base64Data = match[2];
  
  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  
  // Check size (approximate from base64 length)
  const sizeInBytes = Buffer.from(base64Data, 'base64').length;
  const sizeInMB = sizeInBytes / (1024 * 1024);
  if (sizeInMB > MAX_FILE_SIZE_MB) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE_MB}MB`);
  }
  
  return { mimeType, base64Data, sizeInBytes };
}

// ============================================================
// SYSTEM PROMPT BUILDER - CONSOLIDATED
// ============================================================

async function buildSystemPromptForChat(userId, options = {}) {
  const {
    hasIntroduced = false,
    businessName = null,
    aiName = null,
    isVisitor = false,
    clientName = null,
    conversationHistory = [],
    bookingUrl = null,
    bookingActive = false,
  } = options;

  const user = await getUserById(userId);
  if (!user) return "";

  const knowledge = await getKnowledgeByUser(userId);
  const context = knowledge.map((k) => k.content).join("\n");

  const { data: smartSettings } = await supabase
    .from("smart_hub_settings")
    .select("ai_instructions, ai_temp")
    .eq("user_id", userId)
    .single();

  const identity = await getBusinessIdentity(userId);

  const businessContext = identity.business_type
    ? `Business Type: ${identity.business_type}\nBusiness Description: ${identity.business_description || "Not provided"}\n`
    : "";

  // AUTHORITATIVE: Server-derived business name, NOT client-controlled
  const authoritativeBusinessName = user.business_name || "this business";
  const authoritativeAiName = user.ai_name || "the AI assistant";

  const basePrompt =
    smartSettings?.ai_instructions ||
    `You are the AI assistant for ${authoritativeBusinessName}. 
     ${businessContext}
     You are helpful, professional, and knowledgeable about the business. 
     Always represent yourself as the business assistant, never as a generic AI.
     Current date: ${new Date().toLocaleDateString()}`;

  // Server-controlled introduction rule
  const introductionRule = hasIntroduced
    ? "IMPORTANT: Do NOT introduce yourself again. Continue the conversation naturally based on the history."
    : `Introduce yourself as ${authoritativeAiName} for ${authoritativeBusinessName} ONLY in the first message.`;

  const visitorContext = isVisitor
    ? `You are chatting with a website visitor named ${clientName || "Guest"}.`
    : `You are assisting the business owner.`;

  const bookingContext = bookingUrl && bookingActive
    ? `When visitors want to book, schedule, or make appointments, provide this booking link: ${bookingUrl}`
    : "";

  // Sanitize conversation history - ONLY user and assistant messages
  const safeHistory = validateConversationHistory(conversationHistory);
  const historyContext = safeHistory.length > 0
    ? `\nPrevious conversation:\n${safeHistory.map((msg) => `${msg.role}: ${msg.text}`).join("\n")}`
    : "";

  return `${basePrompt}
${businessContext}
${visitorContext}
${bookingContext}
${introductionRule}
Business Context:
${context || "No additional context provided."}

CRITICAL INSTRUCTIONS:
- Always identify yourself as ${authoritativeBusinessName} AI assistant, NEVER as "a language model" or "AI"
- Be concise and professional (2-3 sentences for simple questions, up to 5 for complex ones)
- NEVER repeat yourself or use the same phrasing twice
- If you don't know something specific, say "Let me connect you with our team"
- Keep responses natural and conversational like a real business assistant
- Today's date: ${new Date().toLocaleDateString()}
${historyContext}`;
}

// ============================================================
// CLOUDFLARE AI WITH TIMEOUT
// ============================================================

async function callCloudflareAI(messages, timeoutMs = CLOUDFLARE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.CLOUDFLARE_AI_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.errors?.[0]?.message || `Cloudflare AI returned ${response.status}`);
    }

    const data = await response.json();
    return data.result?.response || "I couldn't generate a response.";
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("AI request timed out. Please try again.");
    }
    throw error;
  }
}

// ============================================================
// CLOUDFLARE VISION WITH TIMEOUT
// ============================================================

async function callCloudflareVision(messages, timeoutMs = CLOUDFLARE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.CLOUDFLARE_AI_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.errors?.[0]?.message || `Cloudflare Vision returned ${response.status}`);
    }

    const data = await response.json();
    return data.result?.response || "I couldn't analyze this image.";
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("Image analysis timed out. Please try again.");
    }
    throw error;
  }
}

// ============================================================
// ATOMIC QUOTA CONSUMPTION HELPER
// ============================================================

/**
 * Atomically consume one message from the user's quota
 * Returns success/failure with current usage
 * This is the ONLY function that should modify messages_used
 */
async function atomicConsumeQuota(userId, planLimit) {
  try {
    // Call the atomic database function
    const result = await consumeMessageQuota(userId, planLimit);
    
    if (result.success === false) {
      return {
        success: false,
        error: result.error,
        code: result.code,
        currentUsage: result.current_usage,
        limit: result.limit,
      };
    }
    
    return {
      success: true,
      currentUsage: result.current_usage,
      limit: result.limit,
      remaining: result.remaining,
    };
  } catch (error) {
    console.error("Atomic quota consumption failed:", error);
    // Fail closed: if the database operation fails, do NOT allow the request
    return {
      success: false,
      error: "Quota check failed. Please try again.",
      code: "QUOTA_CHECK_ERROR",
    };
  }
}

// ============================================================
// PROCESS DASHBOARD CHAT - WITH ATOMIC QUOTA
// ============================================================

async function processDashboardChat(userId, message, clientName, sessionId) {
  // Validate inputs
  const validatedMessage = validateMessage(message);
  if (!validatedMessage) {
    throw new Error("Message is required");
  }

  const activeSession = sessionId ? validateSessionId(sessionId) : "sess_" + Date.now();
  const validatedClientName = validateClientName(clientName);

  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Resolve plan limit from centralized config
  const limits = getPlanLimits(user.plan || "free");
  const planLimit = limits.messages || 50;

  // ============================================================
  // ATOMIC QUOTA CONSUMPTION - BEFORE AI CALL
  // ============================================================
  const quotaResult = await atomicConsumeQuota(userId, planLimit);
  
  if (!quotaResult.success) {
    // Quota exceeded or error - do NOT call AI
    if (quotaResult.code === "QUOTA_EXCEEDED") {
      throw new Error("Message limit reached for your plan");
    }
    throw new Error(quotaResult.error || "Quota check failed");
  }

  // ============================================================
  // QUOTA SUCCESS - NOW CALL AI (expensive)
  // ============================================================
  try {
    const systemPrompt = await buildSystemPromptForChat(userId, {
      hasIntroduced: true,
    });

    const reply = await callCloudflareAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: validatedMessage },
    ]);

    // Save chat (quota already consumed)
    await saveChat(
      uuidv4(),
      userId,
      activeSession,
      validatedClientName || "Guest",
      validatedMessage,
      reply
    );

    await logActivity(userId, "chat_message", "Sent message via dashboard chat", "chat");

    return { 
      reply, 
      session_id: activeSession,
      quota_remaining: quotaResult.remaining,
      quota_used: quotaResult.currentUsage,
    };
  } catch (error) {
    // AI failed - but quota was already consumed
    // Log the error and re-throw
    console.error("AI call failed after quota consumed:", error.message);
    // Note: We do NOT refund the quota here because the user received a response
    // The quota is consumed regardless of AI success
    throw error;
  }
}

// ============================================================
// PROCESS PUBLIC WIDGET CHAT - WITH ATOMIC QUOTA
// ============================================================

async function processWidgetChat(requestData) {
  const {
    message,
    image_data,
    file_data,
    file_name,
    widget_key,
    client_name,
    session_id,
    is_visitor,
    conversation_history,
    has_introduced,
    message_count,
    business_name,  // CLIENT-CONTROLLED - NOT AUTHORITATIVE
    ai_name,        // CLIENT-CONTROLLED - NOT AUTHORITATIVE
  } = requestData;

  // ============================================================
  // 1. VALIDATE INPUTS
  // ============================================================

  const validatedWidgetKey = validateWidgetKey(widget_key);
  const validatedMessage = validateMessage(message);
  const activeSession = session_id ? validateSessionId(session_id) : "pub_" + Date.now();
  const validatedClientName = validateClientName(client_name);
  const safeHistory = validateConversationHistory(conversation_history);
  const safeMessageCount = typeof message_count === 'number' ? Math.min(message_count, 9999) : 0;

  if (!validatedMessage && !image_data && !file_data) {
    throw new Error("Missing message or file");
  }

  // ============================================================
  // 2. RESOLVE TENANT OWNER FROM WIDGET_KEY (AUTHORITATIVE)
  // ============================================================

  const { data: user, error } = await supabase
    .from("users")
    .select("id, business_name, plan, messages_used, widget_key, ai_name")
    .eq("widget_key", validatedWidgetKey)
    .single();

  if (error || !user) {
    throw new Error("Invalid Widget Key");
  }

  if (user.widget_key !== validatedWidgetKey) {
    throw new Error("Widget key validation failed");
  }

  // ============================================================
  // 3. RESOLVE PLAN LIMIT AND ATOMICALLY CONSUME QUOTA
  // ============================================================

  const limits = getPlanLimits(user.plan || "free");
  const planLimit = limits.messages || 50;

  // ATOMIC QUOTA CONSUMPTION - BEFORE ANY EXPENSIVE OPERATION
  const quotaResult = await atomicConsumeQuota(user.id, planLimit);
  
  if (!quotaResult.success) {
    if (quotaResult.code === "QUOTA_EXCEEDED") {
      throw new Error("Message limit reached for your plan");
    }
    throw new Error(quotaResult.error || "Quota check failed");
  }

  // ============================================================
  // 4. VALIDATE AND PROCESS IMAGE/FILE
  // ============================================================

  let validatedImage = null;
  let validatedFile = null;

  if (image_data) {
    validatedImage = validateImageData(image_data);
  }

  if (file_data) {
    validatedFile = validateFileData(file_data, file_name);
  }

  // ============================================================
  // 5. LOAD TENANT DATA (AUTHORITATIVE - NEVER FROM CLIENT)
  // ============================================================

  const knowledge = await getKnowledgeByUser(user.id);
  const context = knowledge.map((k) => k.content).join("\n");

  const { data: smartSettings } = await supabase
    .from("smart_hub_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const identity = await getBusinessIdentity(user.id).catch(() => ({
    business_type: "",
    business_description: "",
  }));

  // ============================================================
  // 6. BUILD SYSTEM PROMPT (AUTHORITATIVE DATA ONLY)
  // ============================================================

  const systemPrompt = await buildSystemPromptForChat(user.id, {
    hasIntroduced: has_introduced || false,
    businessName: user.business_name,
    aiName: user.ai_name,
    isVisitor: is_visitor || true,
    clientName: validatedClientName,
    conversationHistory: safeHistory,
    bookingUrl: smartSettings?.booking_url,
    bookingActive: smartSettings?.booking_active || false,
  });

  // ============================================================
  // 7. PROCESS AI REQUEST (QUOTA ALREADY CONSUMED)
  // ============================================================

  let reply = "";

  if (validatedImage) {
    console.log("[WIDGET] Processing image with Cloudflare Vision");

    const userPrompt = validatedMessage || "Please describe what you see in this image in detail.";

    try {
      reply = await callCloudflareVision([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: `data:${validatedImage.mimeType};base64,${validatedImage.base64Data}`,
            },
            { type: "text", text: userPrompt },
          ],
        },
      ]);
      await logActivity(user.id, "vision_analysis", "Analyzed image via widget", "vision");
    } catch (visionError) {
      console.error("Vision API error:", visionError.message);
      reply = `I had trouble analyzing this image. ${visionError.message || "Please try again."}`;
    }
  } else if (validatedFile) {
    console.log("[WIDGET] Processing file:", file_name);

    try {
      const fileContent = await extractTextFromFile(
        file_data,
        file_name,
        validatedFile.mimeType
      );

      reply = await callCloudflareAI([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the content of the file "${file_name}":\n\n${fileContent}\n\nUser question: ${validatedMessage || "Please summarize this document."}`,
        },
      ]);
    } catch (fileErr) {
      console.error("File extraction error:", fileErr.message);
      reply = `Sorry, I couldn't process this file. ${fileErr.message || "Please try again."}`;
    }
  } else {
    console.log("[WIDGET] Processing text message");

    const bookingKeywords = /book|appointment|schedule|meeting|reserve|consultation|demo/i;
    const hasBookingIntent = bookingKeywords.test(validatedMessage || "");

    reply = await callCloudflareAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: validatedMessage },
    ]);

    if (
      hasBookingIntent &&
      smartSettings?.booking_url &&
      smartSettings?.booking_active &&
      !reply.includes(smartSettings.booking_url)
    ) {
      reply += `\n\n📅 You can book here: ${smartSettings.booking_url}`;
    }
  }

  // ============================================================
  // 8. CLEAN UP INTRODUCTION IF ALREADY INTRODUCED
  // ============================================================

  if (has_introduced && safeMessageCount > 1) {
    reply = reply
      .replace(/^(Hi|Hello|Hey|Greetings)[!,\s]+(I'?m|I am|this is)\s+[^,.]*[,.\s]+/i, "")
      .replace(/^(I'?m|I am|this is)\s+[^,.]*[,.\s]+(the )?AI assistant\s+(for|of|at)\s+[^,.]*[,.\s]+/i, "")
      .replace(/^Welcome\s+to\s+[^,.]*[,.\s]+(I'?m|I am)\s+[^,.]*[,.\s]+/i, "")
      .replace(/^Nice\s+to\s+meet\s+you[!,\s]+i'?m?\s+[^,.]*[,.\s]+/i, "")
      .trim();
  }

  // ============================================================
  // 9. SAVE CHAT WITH CORRECT TENANT OWNER
  // ============================================================

  await saveChat(
    uuidv4(),
    user.id, // ALWAYS server-derived user ID
    activeSession,
    validatedClientName || "Web Visitor",
    validatedMessage || "[File/Image Sent]",
    reply
  );

  // Note: quota was already consumed atomically - no need to increment again

  await logActivity(
    user.id,
    "widget_chat",
    `Widget chat message from ${validatedClientName || "Visitor"}`,
    "chat"
  );

  return {
    success: true,
    reply,
    session_id: activeSession,
    sentiment: "neutral",
    quota_remaining: quotaResult.remaining,
    quota_used: quotaResult.currentUsage,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  buildSystemPrompt: buildSystemPromptForChat,
  callCloudflareAI,
  processDashboardChat,
  processWidgetChat,
};