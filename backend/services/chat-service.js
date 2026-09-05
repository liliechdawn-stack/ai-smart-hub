// ============================================================
// backend/services/chat-service.js - AI Chat Service
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
} = require("../database-supabase.js");
const { extractTextFromFile } = require("./file-service.js");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ============================================================
// IMPORT PLAN HELPERS - Single Source of Truth (from config)
// ============================================================
const { getPlanLimits, isLimitReached, getRemainingAllowance } = require("../config");

// ============================================================
// AI CHAT SERVICE
// ============================================================

/**
 * Build system prompt for AI chat
 */
async function buildSystemPrompt(userId, hasIntroduced, businessName, aiName) {
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

  const basePrompt =
    smartSettings?.ai_instructions ||
    `You are the AI assistant for ${user.business_name || "this business"}. 
     ${businessContext}
     You are helpful, professional, and knowledgeable about the business. 
     Always represent yourself as the business assistant, never as a generic AI.
     Current date: ${new Date().toLocaleDateString()}`;

  const introductionRule = hasIntroduced
    ? "IMPORTANT: Do NOT introduce yourself again. Continue the conversation naturally based on the history."
    : `Introduce yourself as ${aiName || "the AI assistant"} for ${businessName || user.business_name || "our business"} ONLY in the first message.`;

  return `${basePrompt}\n\nBusiness Context:\n${context || "No additional context provided."}

CRITICAL INSTRUCTIONS:
- Always identify yourself as ${user.business_name || "our"} AI assistant, NEVER as "a language model" or "AI"
- Be concise and professional (2-3 sentences for simple questions, up to 5 for complex ones)
- NEVER repeat yourself or use the same phrasing twice
- If you don't know something specific, say "Let me connect you with our team"
- Keep responses natural and conversational like a real business assistant
- Today's date: ${new Date().toLocaleDateString()}

${introductionRule}`;
}

/**
 * Call Cloudflare AI with messages
 */
async function callCloudflareAI(messages) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.CLOUDFLARE_AI_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    }
  );

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.errors?.[0]?.message || "Cloudflare AI failed");
  }

  const data = await response.json();
  return data.result?.response || "I couldn't generate a response.";
}

/**
 * Process dashboard chat
 */
async function processDashboardChat(userId, message, clientName, sessionId) {
  const activeSession = sessionId || "sess_" + Date.now();

  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Use centralized plan limits from config
  const limits = getPlanLimits(user.plan || "free");
  const messageLimit = limits.messages || 50;

  if (user.messages_used >= messageLimit) {
    throw new Error("Message limit reached for your plan");
  }

  const systemPrompt = await buildSystemPrompt(userId, true, null, null);

  const reply = await callCloudflareAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ]);

  await saveChat(
    uuidv4(),
    userId,
    activeSession,
    clientName || "Guest",
    message,
    reply
  );
  await incrementMessagesUsed(userId);

  await logActivity(userId, "chat_message", "Sent message via dashboard chat", "chat");

  return { reply, session_id: activeSession };
}

/**
 * Process public widget chat with image and file support
 */
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
    business_name,
    ai_name,
  } = requestData;

  const activeSession = session_id || "pub_" + Date.now();

  // Validate
  if (!message && !image_data && !file_data) {
    throw new Error("Missing message or file");
  }

  if (!widget_key) {
    throw new Error("Widget key required");
  }

  // Find user by widget key
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("widget_key", widget_key)
    .single();

  if (error || !user) {
    throw new Error("Invalid Widget Key");
  }

  // Use centralized plan limits from config
  const limits = getPlanLimits(user.plan || "free");
  const messageLimit = limits.messages || 50;

  if (user.messages_used >= messageLimit) {
    throw new Error("Message limit reached for your plan");
  }

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

  let reply = "";
  let fileContent = "";

  const buildSystemPrompt = () => {
    const basePrompt =
      smartSettings?.ai_instructions ||
      `You are the AI assistant for ${user.business_name || "our business"}.`;

    const businessContext = identity.business_type
      ? `Business Type: ${identity.business_type}. ${identity.business_description || ""}`
      : "";

    const introductionRule = has_introduced
      ? "IMPORTANT: Do NOT introduce yourself again. Continue the conversation naturally based on the history."
      : `Introduce yourself as ${ai_name || "the AI assistant"} for ${user.business_name || "our business"} ONLY in the first message.`;

    const visitorContext = is_visitor
      ? `You are chatting with a website visitor named ${client_name || "Guest"}.`
      : `You are assisting the business owner.`;

    const bookingContext =
      smartSettings?.booking_url && smartSettings?.booking_active
        ? `When visitors want to book, schedule, or make appointments, provide this booking link: ${smartSettings.booking_url}`
        : "";

    const historyContext =
      conversation_history && conversation_history.length > 0
        ? `\nPrevious conversation:\n${conversation_history.map((msg) => `${msg.role}: ${msg.text}`).join("\n")}`
        : "";

    return `${basePrompt}
${businessContext}
${visitorContext}
${bookingContext}
${introductionRule}
Business Context:
${context || "No additional context provided."}

CRITICAL INSTRUCTIONS:
- Always identify yourself as ${user.business_name || "our"} AI assistant, NEVER as "a language model" or "AI"
- Be concise and professional (2-3 sentences for simple questions, up to 5 for complex ones)
- NEVER repeat yourself or use the same phrasing twice
- If you don't know something specific, say "Let me connect you with our team"
- Keep responses natural and conversational like a real business assistant
- Today's date: ${new Date().toLocaleDateString()}
${historyContext}`;
  };

  // Handle image
  if (image_data) {
    console.log("[WIDGET] Processing image with Cloudflare Vision");

    const base64Data = image_data.split(",")[1];
    const mimeType = image_data.match(/:(.*?);/)[1];

    const userPrompt = message || "Please describe what you see in this image in detail.";
    const systemContext = buildSystemPrompt();

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.CLOUDFLARE_AI_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemContext },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: `data:${mimeType};base64,${base64Data}`,
                },
                { type: "text", text: userPrompt },
              ],
            },
          ],
        }),
      }
    );

    if (!cfRes.ok) {
      const errData = await cfRes.json();
      console.error("Vision API error:", errData);
      reply = `I had trouble analyzing this image. Please try again.`;
    } else {
      const cfData = await cfRes.json();
      reply = cfData.result?.response || "I couldn't analyze this image.";
      await logActivity(user.id, "vision_analysis", "Analyzed image via widget", "vision");
    }
  }
  // Handle file
  else if (file_data) {
    console.log("[WIDGET] Processing file:", file_name);

    const mimeType = file_data.split(";")[0].split(":")[1];

    try {
      fileContent = await extractTextFromFile(file_data, file_name, mimeType);

      const systemContext = buildSystemPrompt();

      reply = await callCloudflareAI([
        { role: "system", content: systemContext },
        {
          role: "user",
          content: `Here is the content of the file "${file_name}":\n\n${fileContent}\n\nUser question: ${message || "Please summarize this document."}`,
        },
      ]);
    } catch (fileErr) {
      console.error("File extraction error:", fileErr);
      reply = `Sorry, I couldn't process this file.`;
    }
  }
  // Handle text
  else {
    console.log("[WIDGET] Processing text message");

    const systemContext = buildSystemPrompt();

    const bookingKeywords = /book|appointment|schedule|meeting|reserve|consultation|demo/i;
    const hasBookingIntent = bookingKeywords.test(message);

    reply = await callCloudflareAI([
      { role: "system", content: systemContext },
      { role: "user", content: message },
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

  // Clean up introduction if already introduced
  if (has_introduced && message_count > 1) {
    reply = reply
      .replace(/^(Hi|Hello|Hey|Greetings)[!,\s]+(I'?m|I am|this is)\s+[^,.]*[,.\s]+/i, "")
      .replace(/^(I'?m|I am|this is)\s+[^,.]*[,.\s]+(the )?AI assistant\s+(for|of|at)\s+[^,.]*[,.\s]+/i, "")
      .replace(/^Welcome\s+to\s+[^,.]*[,.\s]+(I'?m|I am)\s+[^,.]*[,.\s]+/i, "")
      .replace(/^Nice\s+to\s+meet\s+you[!,\s]+i'?m?\s+[^,.]*[,.\s]+/i, "")
      .trim();
  }

  await saveChat(
    uuidv4(),
    user.id,
    activeSession,
    client_name || "Web Visitor",
    message || "[File/Image Sent]",
    reply
  );
  await incrementMessagesUsed(user.id);

  return {
    success: true,
    reply,
    session_id: activeSession,
    sentiment: "neutral",
  };
}

module.exports = {
  buildSystemPrompt,
  callCloudflareAI,
  processDashboardChat,
  processWidgetChat,
  // PLAN_LIMITS removed - use config.getPlanLimits() instead
};