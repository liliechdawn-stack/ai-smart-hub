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



/**
 * ai.js - Cloudflare Workers AI integration (fully migrated from OpenAI)
 * Keeps the same generateAIResponse interface for compatibility
 * 
 * ADDED: Image Generation, Video Script Generation, Content Generation, Lead Scoring, Hashtags
 * Your original code is COMPLETELY UNCHANGED below
 */

const { v4: uuidv4 } = require('uuid');

// ================================================
// YOUR ORIGINAL CODE - COMPLETELY INTACT
// ================================================

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

// ================================================
// NEW ADDITIONS (YOUR ORIGINAL CODE ABOVE IS UNCHANGED)
// ================================================

// Cloudflare AI Configuration
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_AI_API_TOKEN;
const CLOUDFLARE_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run`;

// Available Cloudflare AI Models
const MODELS = {
    TEXT_FAST: '@cf/meta/llama-3-8b-instruct',
    TEXT_POWERFUL: '@cf/meta/llama-3-70b-instruct',
    IMAGE_SDXL: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    IMAGE_DREAMSHAPER: '@cf/lykon/dreamshaper-8-lcm',
    IMG2IMG: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    VISION: '@cf/unum/uform-gen2-qwen-500m',
    EMBEDDINGS: '@cf/baai/bge-base-en-v1.5'
};

// Style modifiers for image generation
const IMAGE_STYLES = {
    'realistic': 'photorealistic, ultra detailed, 8K, sharp focus, natural lighting',
    'cinematic': 'cinematic, movie poster, dramatic lighting, film grain, epic composition',
    'anime': 'anime style, manga art, vibrant colors, detailed background, cel shaded',
    'artistic': 'digital art, masterpiece, trending on artstation, beautiful composition',
    'cyberpunk': 'cyberpunk, neon lights, futuristic city, dark atmosphere, high tech',
    'fantasy': 'fantasy art, magical, ethereal, mystical, dreamlike, enchanted',
    'portrait': 'professional portrait, studio lighting, bokeh, high resolution',
    'landscape': 'breathtaking landscape, golden hour, ultra wide, dramatic clouds'
};

// ================================================
// NEW: IMAGE GENERATION (Nano Banana quality)
// ================================================

async function generateImage(prompt, options = {}) {
    const {
        style = 'realistic',
        width = 1024,
        height = 1024,
        model = MODELS.IMAGE_SDXL,
        negative_prompt = 'blurry, low quality, distorted, ugly, watermark',
        num_steps = 30,
        guidance = 7.5,
        seed = Math.floor(Math.random() * 1000000)
    } = options;

    console.log(`🎨 [AI-IMAGE] Generating: ${prompt.substring(0, 100)}...`);

    const styleModifier = IMAGE_STYLES[style] || IMAGE_STYLES['realistic'];
    const enhancedPrompt = `${styleModifier}. ${prompt}. High quality, detailed.`;

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${model}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: enhancedPrompt,
                negative_prompt: negative_prompt,
                width: width,
                height: height,
                num_steps: num_steps,
                guidance: guidance,
                seed: seed
            })
        });

        if (!response.ok) {
            throw new Error(`Image generation failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.result && data.result.image) {
            const base64Image = `data:image/png;base64,${data.result.image}`;
            return {
                success: true,
                images: [base64Image],
                prompt: enhancedPrompt,
                style: style,
                generated_at: new Date().toISOString()
            };
        }
        
        throw new Error('No image generated');

    } catch (error) {
        console.error("❌ Image generation error:", error.message);
        const placeholderUrl = `https://placehold.co/${width}x${height}/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 50))}`;
        return {
            success: false,
            images: [placeholderUrl],
            error: error.message,
            generated_at: new Date().toISOString()
        };
    }
}

// ================================================
// NEW: VIDEO SCRIPT GENERATION (Sora-level)
// ================================================

async function generateVideoScript(topic, duration = 30, style = 'cinematic') {
    console.log(`🎬 [AI-VIDEO] Generating script: ${topic}, ${duration}s, ${style} style`);

    const scenes = Math.ceil(duration / 5);
    const sceneDuration = Math.floor(duration / scenes);

    const prompt = `Create a detailed video script for a ${duration}-second ${style} style video about "${topic}".
The script should have ${scenes} scenes, each ${sceneDuration} seconds long.
For each scene, include: visual description, camera movement, audio/narration.
Also suggest music style and voiceover tone.`;

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.TEXT_POWERFUL}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (response.ok) {
            const data = await response.json();
            const script = data.result?.response?.trim();
            
            if (script) {
                return {
                    success: true,
                    script: script,
                    duration: duration,
                    style: style,
                    scenes: scenes,
                    generated_at: new Date().toISOString()
                };
            }
        }
        
        // Fallback script
        return {
            success: false,
            script: generateFallbackVideoScript(topic, duration, style, scenes, sceneDuration),
            duration: duration,
            style: style,
            generated_at: new Date().toISOString()
        };

    } catch (error) {
        console.error("❌ Video script error:", error.message);
        return {
            success: false,
            script: generateFallbackVideoScript(topic, duration, style, scenes, sceneDuration),
            error: error.message,
            generated_at: new Date().toISOString()
        };
    }
}

function generateFallbackVideoScript(topic, duration, style, scenes, sceneDuration) {
    let script = `VIDEO SCRIPT: "${topic}"\n`;
    script += `Duration: ${duration} seconds\n`;
    script += `Style: ${style}\n`;
    script += `Scenes: ${scenes}\n\n`;
    
    for (let i = 1; i <= scenes; i++) {
        const startTime = (i - 1) * sceneDuration;
        const endTime = i * sceneDuration;
        script += `Scene ${i} (${startTime}s - ${endTime}s): `;
        
        if (i === 1) {
            script += `Opening shot introducing ${topic}\n`;
        } else if (i === scenes) {
            script += `Conclusion and call to action for ${topic}\n`;
        } else {
            script += `Detailed exploration of ${topic} - key point ${i - 1}\n`;
        }
    }
    
    return script;
}

// ================================================
// NEW: STRUCTURED CONTENT GENERATION
// ================================================

async function generateStructuredContent(contentType, topic, tone = "professional") {
    console.log(`✍️ [AI-CONTENT] Generating ${contentType} about "${topic}" (${tone} tone)`);

    const prompt = `Generate ${contentType} content about "${topic}" in a ${tone} tone.
For social media: include hashtags and emojis.
For blog: include headings and bullet points.
For email: include subject line and signature.
For ad: include headline and call-to-action.`;

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.TEXT_FAST}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (response.ok) {
            const data = await response.json();
            const content = data.result?.response?.trim();
            if (content) return content;
        }
        
        return generateFallbackContent(contentType, topic, tone);

    } catch (error) {
        console.error("❌ Content generation error:", error.message);
        return generateFallbackContent(contentType, topic, tone);
    }
}

function generateFallbackContent(contentType, topic, tone) {
    if (contentType === 'social') {
        return `🔥 **${topic.toUpperCase()}** 🔥\n\nCheck out this amazing content!\n\n#${topic.replace(/ /g, '')} #AI #Automation`;
    }
    if (contentType === 'blog') {
        return `# ${topic}\n\n## Introduction\nThis guide explores ${topic} in depth.\n\n## Conclusion\nThank you for reading!`;
    }
    if (contentType === 'email') {
        return `Subject: Update about ${topic}\n\nDear customer,\n\nExciting news about ${topic}!\n\nBest regards,\nThe Team`;
    }
    return `[AI Generated ${contentType}]\nTopic: ${topic}\nTone: ${tone}`;
}

// ================================================
// NEW: AI LEAD SCORING
// ================================================

async function scoreLeadWithAI(leadData) {
    console.log(`🎯 [AI-LEAD] Scoring lead: ${leadData.name || leadData.email || 'Unknown'}`);

    const prompt = `Rate this lead from 0-100. Return ONLY a number.
Name: ${leadData.name || 'Unknown'}
Title: ${leadData.job_title || 'Unknown'}
Company: ${leadData.company || 'Unknown'}
Budget: ${leadData.budget || 'Not specified'}
Lead Score (0-100):`;

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.TEXT_FAST}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 10
            })
        });

        if (response.ok) {
            const data = await response.json();
            const score = parseInt(data.result?.response?.trim());
            if (!isNaN(score) && score >= 0 && score <= 100) return score;
        }
        
        return calculateLeadScore(leadData);

    } catch (error) {
        console.error("❌ Lead scoring error:", error.message);
        return calculateLeadScore(scoreLeadData);
    }
}

function calculateLeadScore(leadData) {
    let score = 50;
    if (leadData.email) score += 10;
    if (leadData.phone) score += 10;
    if (leadData.company) score += 10;
    if (leadData.budget && leadData.budget > 5000) score += 15;
    return Math.min(Math.max(score, 0), 100);
}

// ================================================
// NEW: HASHTAG GENERATION
// ================================================

async function generateHashtags(topic, count = 15) {
    console.log(`🏷️ [AI-HASHTAGS] Generating ${count} hashtags for: ${topic}`);

    const prompt = `Generate ${count} trending hashtags for topic: "${topic}".
Return ONLY hashtags separated by spaces.`;

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.TEXT_FAST}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 200
            })
        });

        if (response.ok) {
            const data = await response.json();
            const hashtags = data.result?.response?.trim().split(' ').filter(t => t.startsWith('#'));
            if (hashtags && hashtags.length > 0) return hashtags.slice(0, count);
        }
        
        return [`#${topic.replace(/ /g, '')}`, '#AI', '#Automation', '#Tech'];

    } catch (error) {
        console.error("❌ Hashtag error:", error.message);
        return [`#${topic.replace(/ /g, '')}`, '#AI', '#Automation'];
    }
}

// ================================================
// EXPORTS (Your original export is still here)
// ================================================

module.exports = { 
    // YOUR ORIGINAL FUNCTION - STILL HERE, STILL WORKING
    generateAIResponse,
    
    // NEW FUNCTIONS ADDED
    generateImage,
    generateVideoScript,
    generateStructuredContent,
    scoreLeadWithAI,
    generateHashtags,
    
    // Configuration (optional)
    MODELS,
    IMAGE_STYLES
};












/**
 * ai.js - Unified AI Service (Standardized)
 * Powers: Text Generation, Image Generation, Video Generation, Lead Scoring, Content Creation
 * Features: Metrics logging, retries, rate limiting, model fallback, token management
 * 
 * Cloudflare AI Models Used:
 * - Text: @cf/meta/llama-3-8b-instruct, @cf/meta/llama-3-70b-instruct
 * - Image: @cf/stabilityai/stable-diffusion-xl-base-1.0, @cf/lykon/dreamshaper-8-lcm
 * - Multi-modal: @cf/unum/uform-gen2-qwen-500m
 * - Embeddings: @cf/baai/bge-base-en-v1.5
 */

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');

// ================================================
// CLOUDFLARE AI CONFIGURATION
// ================================================

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_AI_API_TOKEN;
const CLOUDFLARE_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run`;

// Available Cloudflare AI Models (MUST be defined BEFORE RATE_LIMITS)
const MODELS = {
    // Text Generation
    TEXT_FAST: '@cf/meta/llama-3-8b-instruct',
    TEXT_POWERFUL: '@cf/meta/llama-3-70b-instruct',
    TEXT_CODE: '@cf/deepseek-ai/deepseek-math-7b-instruct',
    TEXT_FALLBACK: '@cf/meta/llama-3-8b-instruct',
    
    // Image Generation
    IMAGE_SDXL: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    IMAGE_DREAMSHAPER: '@cf/lykon/dreamshaper-8-lcm',
    IMAGE_FALLBACK: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    
    // Multi-modal
    VISION: '@cf/unum/uform-gen2-qwen-500m',
    
    // Embeddings
    EMBEDDINGS: '@cf/baai/bge-base-en-v1.5'
};

// Rate limiting configuration (NOW AFTER MODELS is defined)
const RATE_LIMITS = {
    [MODELS.TEXT_FAST]: { requestsPerMinute: 30, requestsPerDay: 1000 },
    [MODELS.TEXT_POWERFUL]: { requestsPerMinute: 10, requestsPerDay: 500 },
    [MODELS.IMAGE_SDXL]: { requestsPerMinute: 5, requestsPerDay: 200 }
};

// Token usage tracking (in-memory cache, will reset on restart)
let tokenUsage = {
    total: 0,
    byModel: {},
    byUser: {},
    byDate: {}
};

// Style modifiers for image generation
const IMAGE_STYLES = {
    'realistic': 'photorealistic, ultra detailed, 8K, sharp focus, natural lighting, professional photography',
    'cinematic': 'cinematic, movie poster, dramatic lighting, film grain, epic composition, 4K',
    'anime': 'anime style, manga art, vibrant colors, detailed background, cel shaded, high quality',
    'artistic': 'digital art, masterpiece, trending on artstation, beautiful composition, vibrant colors',
    'cyberpunk': 'cyberpunk, neon lights, futuristic city, dark atmosphere, high tech, detailed',
    'fantasy': 'fantasy art, magical, ethereal, mystical, dreamlike, enchanted, detailed',
    'portrait': 'professional portrait, studio lighting, bokeh, high resolution, detailed skin',
    'landscape': 'breathtaking landscape, golden hour, ultra wide, dramatic clouds, vivid colors',
    'abstract': 'abstract art, geometric shapes, colorful, modern, expressionist, creative',
    '3d': '3D render, octane render, ray tracing, photorealistic, detailed textures, 8K',
    'watercolor': 'watercolor painting, soft edges, artistic, traditional medium, paint texture',
    'oil': 'oil painting on canvas, brush strokes, classical art, renaissance style',
    'sketch': 'pencil sketch, charcoal drawing, monochrome, artistic, hand-drawn',
    'pixel': 'pixel art, retro gaming, 8-bit, nostalgic, blocky, video game style',
    'retro': 'retro wave, synthwave, neon, 80s aesthetic, purple and blue, outrun',
    'minimalist': 'minimalist, simple, clean, geometric, modern, abstract',
    'surreal': 'surrealism, dreamlike, impossible geometry, Dali style, bizarre',
    'gothic': 'gothic, dark, dramatic, ornate, medieval, shadows, mysterious',
    'steampunk': 'steampunk, Victorian, brass, gears, mechanical, vintage sci-fi',
    'vaporwave': 'vaporwave, pastel, neon, glitchy, 80s, aesthetic, palm trees'
};

// Video style prompts
const VIDEO_STYLES = {
    'cinematic': 'cinematic video style, movie quality, dramatic lighting, professional camera work',
    'animation': '2D animation style, smooth movement, vibrant colors, fluid motion',
    'realistic': 'ultra realistic video, 4K quality, natural lighting, smooth 60fps',
    'artistic': 'artistic video style, creative visuals, beautiful composition, abstract elements',
    'sci-fi': 'science fiction style, futuristic, holographic effects, neon lights, advanced tech',
    'fantasy': 'fantasy video style, magical effects, mythical creatures, enchanted landscapes',
    'action': 'action video style, dynamic camera, fast-paced, exciting, high energy'
};

// ================================================
// METRICS LOGGING
// ================================================

async function logMetrics(model, operation, tokensUsed, latency, userId, success, error = null) {
    const logId = uuidv4();
    const now = new Date().toISOString();
    
    // Update in-memory token usage
    tokenUsage.total += tokensUsed || 0;
    tokenUsage.byModel[model] = (tokenUsage.byModel[model] || 0) + (tokensUsed || 0);
    
    if (userId) {
        tokenUsage.byUser[userId] = (tokenUsage.byUser[userId] || 0) + (tokensUsed || 0);
    }
    
    const dateKey = now.split('T')[0];
    tokenUsage.byDate[dateKey] = (tokenUsage.byDate[dateKey] || 0) + (tokensUsed || 0);
    
    try {
        await supabase.from('ai_metrics_logs').insert({
            id: logId,
            model: model,
            operation: operation,
            tokens_used: tokensUsed || 0,
            latency_ms: latency,
            user_id: userId,
            success: success,
            error_message: error,
            created_at: now
        });
        
        console.log(`📊 [AI-METRICS] ${operation}: ${tokensUsed || 0} tokens, ${latency}ms, ${success ? 'success' : 'failed'}`);
    } catch (err) {
        console.error('Failed to log AI metrics:', err.message);
    }
}

// ================================================
// RATE LIMITING CHECK
// ================================================

async function checkRateLimit(model, userId = null) {
    const limits = RATE_LIMITS[model];
    if (!limits) return { allowed: true };
    
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60000);
    const dayAgo = new Date(now.getTime() - 86400000);
    
    try {
        // Count requests in last minute
        const { count: minuteCount } = await supabase
            .from('ai_metrics_logs')
            .select('id', { count: 'exact', head: true })
            .eq('model', model)
            .gte('created_at', minuteAgo.toISOString());
        
        // Count requests today
        const { count: dayCount } = await supabase
            .from('ai_metrics_logs')
            .select('id', { count: 'exact', head: true })
            .eq('model', model)
            .gte('created_at', dayAgo.toISOString());
        
        if (minuteCount >= limits.requestsPerMinute) {
            return { allowed: false, reason: 'Rate limit exceeded: too many requests per minute', retryAfter: 60 };
        }
        
        if (dayCount >= limits.requestsPerDay) {
            return { allowed: false, reason: 'Rate limit exceeded: daily limit reached', retryAfter: 86400 };
        }
        
        return { allowed: true };
    } catch (error) {
        console.error('Rate limit check error:', error.message);
        return { allowed: true }; // Allow on error
    }
}

// ================================================
// GENERIC AI REQUEST WITH RETRIES AND FALLBACK
// ================================================

async function makeAIRequest(model, payload, options = {}) {
    const {
        userId = null,
        operation = 'unknown',
        maxRetries = 3,
        fallbackModel = null,
        timeout = 30000
    } = options;
    
    const startTime = Date.now();
    let lastError = null;
    
    // Check rate limit
    const rateLimit = await checkRateLimit(model, userId);
    if (!rateLimit.allowed) {
        const error = new Error(rateLimit.reason);
        await logMetrics(model, operation, 0, Date.now() - startTime, userId, false, error.message);
        throw error;
    }
    
    const modelsToTry = [model];
    if (fallbackModel) modelsToTry.push(fallbackModel);
    if (model !== MODELS.TEXT_FALLBACK) modelsToTry.push(MODELS.TEXT_FALLBACK);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        for (const currentModel of modelsToTry) {
            try {
                console.log(`🤖 [AI-REQUEST] Attempt ${attempt}/${maxRetries} with model: ${currentModel}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                const response = await fetch(`${CLOUDFLARE_API_BASE}/${currentModel}`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const data = await response.json();
                const latency = Date.now() - startTime;
                
                // Estimate tokens (rough estimate: ~4 chars per token)
                const responseText = JSON.stringify(data);
                const estimatedTokens = Math.ceil(responseText.length / 4);
                
                await logMetrics(currentModel, operation, estimatedTokens, latency, userId, true);
                
                return {
                    success: true,
                    data: data,
                    model: currentModel,
                    tokensUsed: estimatedTokens,
                    latency: latency,
                    attempt: attempt
                };
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Model ${currentModel} failed: ${error.message}`);
                
                // Log failed attempt
                await logMetrics(currentModel, operation, 0, Date.now() - startTime, userId, false, error.message);
                
                // Wait before retry
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    }
    
    // All attempts failed
    return {
        success: false,
        error: lastError?.message || 'All AI requests failed',
        model: model,
        attempts: maxRetries
    };
}

// ================================================
// TEXT GENERATION (Unified Interface)
// ================================================

async function generateText(prompt, options = {}) {
    const {
        systemPrompt = null,
        temperature = 0.7,
        maxTokens = 2048,
        model = MODELS.TEXT_FAST,
        fallbackModel = MODELS.TEXT_FALLBACK,
        userId = null,
        operation = 'text_generation'
    } = options;
    
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });
    
    const payload = {
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: false
    };
    
    const result = await makeAIRequest(model, payload, {
        userId,
        operation,
        fallbackModel,
        maxRetries: 3
    });
    
    if (result.success) {
        return {
            text: result.data.result?.response?.trim() || "",
            model: result.model,
            tokensUsed: result.tokensUsed,
            latency: result.latency,
            success: true
        };
    }
    
    return {
        text: generateFallbackResponse(prompt),
        model: model,
        success: false,
        error: result.error
    };
}

async function generateStructuredContent(contentType, topic, tone = "professional", userId = null) {
    const systemPrompt = `You are a professional content writer. Generate ${contentType} content about "${topic}" in a ${tone} tone.
The content should be engaging, well-structured, and ready to use.
For social media: include relevant hashtags and emojis.
For blog: include headings, bullet points, and conclusion.
For email: include subject line, greeting, body, and signature.
For ad: include attention-grabbing headline, benefits, and call-to-action.`;
    
    const userPrompt = `Generate ${contentType} content about "${topic}" in ${tone} tone.`;
    
    const result = await generateText(userPrompt, {
        systemPrompt,
        temperature: 0.7,
        maxTokens: 1500,
        userId,
        operation: 'content_generation'
    });
    
    if (result.success) {
        return result.text;
    }
    
    return generateFallbackContent(contentType, topic, tone);
}

async function generateHashtags(topic, count = 15, userId = null) {
    const prompt = `Generate ${count} trending, relevant hashtags for topic: "${topic}".
Include a mix of broad and niche hashtags.
Return ONLY hashtags separated by spaces, no explanations or other text.
Example: #AI #Automation #Workflow`;
    
    const result = await generateText(prompt, {
        temperature: 0.7,
        maxTokens: 200,
        userId,
        operation: 'hashtag_generation'
    });
    
    if (result.success) {
        const hashtags = result.text.split(' ').filter(t => t.startsWith('#'));
        if (hashtags.length > 0) {
            return hashtags.slice(0, count);
        }
    }
    
    // Fallback hashtags
    const baseTag = `#${topic.replace(/ /g, '')}`;
    const commonTags = ['#AI', '#Automation', '#Workflow', '#Tech', '#Innovation', '#Future', '#Digital', '#Smart', '#NextGen', '#Pro'];
    return [baseTag, ...commonTags.slice(0, count - 1)];
}

// ================================================
// AI LEAD SCORING
// ================================================

async function scoreLeadWithAI(leadData, userId = null) {
    const prompt = `Rate this lead from 0-100 based on quality, likelihood to convert, and potential value.
Return ONLY a number between 0-100.

Lead Information:
- Name: ${leadData.name || 'Unknown'}
- Email: ${leadData.email || 'Unknown'}
- Job Title: ${leadData.job_title || 'Unknown'}
- Company: ${leadData.company || 'Unknown'}
- Budget: ${leadData.budget || 'Not specified'}
- Industry: ${leadData.industry || 'Not specified'}
- Message/Notes: ${leadData.notes || leadData.message || 'None'}

Lead Score (0-100):`;
    
    const result = await generateText(prompt, {
        temperature: 0.3,
        maxTokens: 10,
        userId,
        operation: 'lead_scoring'
    });
    
    if (result.success) {
        const score = parseInt(result.text);
        if (!isNaN(score) && score >= 0 && score <= 100) {
            return score;
        }
    }
    
    // Fallback scoring logic
    return calculateLeadScore(leadData);
}

function calculateLeadScore(leadData) {
    let score = 50;
    if (leadData.email) {
        const domain = leadData.email.split('@')[1];
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) score += 15;
        score += 10;
    }
    if (leadData.phone) score += 10;
    if (leadData.company) score += 10;
    if (leadData.job_title) {
        const executives = ['CEO', 'CTO', 'CFO', 'Founder', 'Director', 'VP', 'President', 'Owner'];
        if (executives.some(title => leadData.job_title.includes(title))) score += 20;
        else if (leadData.job_title.includes('Manager')) score += 10;
        else score += 5;
    }
    if (leadData.budget) {
        if (leadData.budget > 10000) score += 25;
        else if (leadData.budget > 5000) score += 15;
        else if (leadData.budget > 1000) score += 10;
        else score += 5;
    }
    if (leadData.industry) score += 5;
    if (leadData.website) score += 5;
    if (leadData.message && leadData.message.length > 100) score += 10;
    
    return Math.min(Math.max(score, 0), 100);
}

// ================================================
// IMAGE GENERATION (Unified Interface)
// ================================================

async function generateImage(prompt, options = {}) {
    const {
        style = 'realistic',
        width = 1024,
        height = 1024,
        model = MODELS.IMAGE_SDXL,
        fallbackModel = MODELS.IMAGE_FALLBACK,
        negativePrompt = 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature',
        numSteps = 30,
        guidance = 7.5,
        seed = Math.floor(Math.random() * 1000000),
        userId = null
    } = options;
    
    const styleModifier = IMAGE_STYLES[style] || IMAGE_STYLES['realistic'];
    const enhancedPrompt = `${styleModifier}. ${prompt}. High quality, detailed, professional.`;
    
    const payload = {
        prompt: enhancedPrompt,
        negative_prompt: negativePrompt,
        width: width,
        height: height,
        num_steps: numSteps,
        guidance: guidance,
        seed: seed
    };
    
    const result = await makeAIRequest(model, payload, {
        userId,
        operation: 'image_generation',
        fallbackModel,
        maxRetries: 2,
        timeout: 60000
    });
    
    if (result.success && result.data.result?.image) {
        const base64Image = `data:image/png;base64,${result.data.result.image}`;
        return {
            success: true,
            images: [base64Image],
            prompt: enhancedPrompt,
            style: style,
            model: result.model,
            width: width,
            height: height,
            seed: seed,
            tokensUsed: result.tokensUsed,
            latency: result.latency,
            generated_at: new Date().toISOString()
        };
    }
    
    // Fallback placeholder
    const placeholderUrl = `https://placehold.co/${width}x${height}/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 50))}`;
    return {
        success: false,
        images: [placeholderUrl],
        prompt: enhancedPrompt,
        error: result.error || 'Image generation failed',
        generated_at: new Date().toISOString()
    };
}

async function generateImageVariations(prompt, count = 4, options = {}) {
    const promises = [];
    for (let i = 0; i < count; i++) {
        promises.push(generateImage(prompt, { ...options, seed: Math.floor(Math.random() * 1000000) }));
    }
    
    const results = await Promise.all(promises);
    const allImages = results.flatMap(r => r.images);
    
    return {
        success: results.some(r => r.success),
        images: allImages,
        count: allImages.length,
        generated_at: new Date().toISOString()
    };
}

// ================================================
// VIDEO SCRIPT GENERATION
// ================================================

async function generateVideoScriptAndStoryboard(topic, duration = 30, style = 'cinematic', userId = null) {
    const stylePrompt = VIDEO_STYLES[style] || VIDEO_STYLES['cinematic'];
    const scenes = Math.ceil(duration / 5);
    const sceneDuration = Math.floor(duration / scenes);
    
    const systemPrompt = `You are a professional video scriptwriter and storyboard artist.
Create a detailed video script for a ${duration}-second ${style} style video about "${topic}".
The script should have ${scenes} scenes, each ${sceneDuration} seconds long.
For each scene, include: visual description, camera movement, audio/narration, and transition.
Also suggest relevant music style and voiceover tone.`;
    
    const result = await generateText(systemPrompt, {
        temperature: 0.7,
        maxTokens: 2000,
        userId,
        operation: 'video_script_generation'
    });
    
    let script = "";
    if (result.success) {
        script = result.text;
    } else {
        script = generateVideoScript(topic, duration, style, scenes, sceneDuration);
    }
    
    return {
        success: result.success,
        script: script,
        duration: duration,
        style: style,
        scenes: scenes,
        scene_duration: sceneDuration,
        tokensUsed: result.tokensUsed || 0,
        latency: result.latency || 0,
        generated_at: new Date().toISOString()
    };
}

// ================================================
// EMBEDDINGS
// ================================================

async function generateEmbedding(text, userId = null) {
    const payload = { text: text };
    
    const result = await makeAIRequest(MODELS.EMBEDDINGS, payload, {
        userId,
        operation: 'embedding_generation',
        maxRetries: 2
    });
    
    if (result.success && result.data.result?.data?.[0]?.embedding) {
        return {
            success: true,
            embedding: result.data.result.data[0].embedding,
            dimensions: 768,
            tokensUsed: result.tokensUsed,
            latency: result.latency
        };
    }
    
    return {
        success: false,
        embedding: [],
        error: result.error || 'Embedding generation failed'
    };
}

// ================================================
// TOKEN USAGE STATISTICS
// ================================================

function getTokenUsage() {
    return {
        ...tokenUsage,
        timestamp: new Date().toISOString()
    };
}

async function getTokenUsageByUser(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    try {
        const { data, error } = await supabase
            .from('ai_metrics_logs')
            .select('tokens_used, model, operation, created_at')
            .eq('user_id', userId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const total = data.reduce((sum, log) => sum + (log.tokens_used || 0), 0);
        const byModel = {};
        const byOperation = {};
        const byDate = {};
        
        data.forEach(log => {
            const model = log.model;
            const operation = log.operation;
            const date = log.created_at.split('T')[0];
            
            byModel[model] = (byModel[model] || 0) + (log.tokens_used || 0);
            byOperation[operation] = (byOperation[operation] || 0) + (log.tokens_used || 0);
            byDate[date] = (byDate[date] || 0) + (log.tokens_used || 0);
        });
        
        return {
            userId,
            total,
            byModel,
            byOperation,
            byDate,
            logs: data,
            days
        };
    } catch (error) {
        console.error('Failed to get token usage by user:', error.message);
        return { userId, total: 0, error: error.message };
    }
}

// ================================================
// FALLBACK FUNCTIONS
// ================================================

function generateFallbackResponse(message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
        return "Hello! Welcome to Workflow Studio Pro. How can I help automate your business today?";
    }
    if (lowerMsg.includes('image') || lowerMsg.includes('picture')) {
        return "I can help generate professional images using our Cloudflare AI. Just describe what you'd like to see!";
    }
    if (lowerMsg.includes('video')) {
        return "Our AI can generate video scripts and storyboards. What type of video would you like to create?";
    }
    if (lowerMsg.includes('workflow') || lowerMsg.includes('automate')) {
        return "Workflow Studio Pro lets you build powerful automations with drag-and-drop nodes. Want to see some templates?";
    }
    if (lowerMsg.includes('price') || lowerMsg.includes('cost')) {
        return "Our Pro plan starts at $49/month. Would you like to see all our features?";
    }
    
    return "Thanks for your message! Our AI automation platform can help with content creation, image generation, video scripts, lead scoring, and workflow automation. What would you like to explore?";
}

function generateFallbackContent(contentType, topic, tone) {
    if (contentType === 'social') {
        return `🔥 **${topic.toUpperCase()}** 🔥\n\n${tone === 'professional' ? 'Discover' : 'Check out'} this amazing content about ${topic}!\n\n✅ Key insights\n✅ Actionable tips\n✅ Expert advice\n\n#${topic.replace(/ /g, '')} #Automation #AI\n\n👇 Like & share if this helped you!`;
    }
    if (contentType === 'blog') {
        return `# ${topic}\n\n## Introduction\nThis comprehensive guide explores ${topic} in depth, written in a ${tone} tone.\n\n## Key Takeaways\n- First major insight about ${topic}\n- Second important point to consider\n- Third actionable strategy\n\n## Conclusion\n${topic} continues to evolve. Stay tuned for more updates!`;
    }
    if (contentType === 'email') {
        return `Subject: Important Update about ${topic}\n\nDear valued customer,\n\nWe wanted to share some exciting news about ${topic}. Our team has been working hard to bring you the best solutions.\n\nBest regards,\nThe Workflow Studio Team`;
    }
    return `[AI Generated ${contentType}]\nTopic: ${topic}\nTone: ${tone}\n\nThis is AI-generated content about ${topic} in a ${tone} tone.`;
}

function generateVideoScript(topic, duration, style, scenes = 6, sceneDuration = 5) {
    let script = `VIDEO SCRIPT: "${topic}"\n`;
    script += `Duration: ${duration} seconds\n`;
    script += `Style: ${style}\n`;
    script += `Scenes: ${scenes}\n\n`;
    
    for (let i = 1; i <= scenes; i++) {
        const startTime = (i - 1) * sceneDuration;
        const endTime = i * sceneDuration;
        script += `Scene ${i} (${startTime}s - ${endTime}s): `;
        
        if (i === 1) {
            script += `Opening shot introducing ${topic}\n`;
            script += `  Visual: Wide establishing shot\n`;
            script += `  Audio: Dramatic intro music\n`;
        } else if (i === scenes) {
            script += `Conclusion and call to action for ${topic}\n`;
            script += `  Visual: Closing shot with logo\n`;
            script += `  Audio: Upbeat outro music\n`;
        } else {
            script += `Detailed exploration of ${topic} - key point ${i - 1}\n`;
            script += `  Visual: Close-up details and animations\n`;
            script += `  Audio: Voiceover explaining concept\n`;
        }
    }
    
    return script;
}

// ================================================
// EXPORTS
// ================================================

module.exports = {
    // Main unified functions
    generateText,
    generateStructuredContent,
    generateImage,
    generateImageVariations,
    generateVideoScriptAndStoryboard,
    scoreLeadWithAI,
    generateHashtags,
    generateEmbedding,
    
    // Metrics and utilities
    logMetrics,
    checkRateLimit,
    getTokenUsage,
    getTokenUsageByUser,
    
    // Fallback functions
    generateFallbackResponse,
    generateFallbackContent,
    generateVideoScript,
    calculateLeadScore,
    
    // Configuration
    MODELS,
    IMAGE_STYLES,
    VIDEO_STYLES,
    RATE_LIMITS,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN
};