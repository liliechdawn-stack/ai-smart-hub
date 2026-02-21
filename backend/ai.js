/**
 * ai.js - Cloudflare Workers AI integration (fully migrated from OpenAI)
 * Keeps the same generateAIResponse interface for compatibility
 */

async function generateAIResponse(message, businessContext = "") {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.CLOUDFLARE_AI_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `
You are a professional AI assistant for a business.
Be helpful, polite, concise, and sales-oriented.
Business context: ${businessContext}
              `
            },
            {
              role: "user",
              content: message
            }
          ],
          temperature: 0.6
        })
      }
    );

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.errors?.[0]?.message || "Cloudflare AI request failed");
    }

    const data = await response.json();
    return data.result?.response?.trim() || "Sorry, I couldn't generate a response.";

  } catch (error) {
    console.error("Cloudflare AI error:", error.message);
    return "Sorry, there was an issue processing your request. Please try again.";
  }
}

module.exports = { generateAIResponse };