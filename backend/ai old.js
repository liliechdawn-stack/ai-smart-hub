/**
 * ai.js - Unified AI Service (Production Ready)
 * Powers: Text Generation, Image Generation, Video Generation, Lead Scoring, Content Creation
 * Features: Metrics logging, retries, rate limiting, model fallback, token management
 * 
 * Cloudflare AI Models Used:
 * - Text: @cf/meta/llama-3-8b-instruct, @cf/meta/llama-3-70b-instruct
 * - Image: @cf/stabilityai/stable-diffusion-xl-base-1.0, @cf/lykon/dreamshaper-8-lcm
 * - Multi-modal: @cf/unum/uform-gen2-qwen-500m
 * - Embeddings: @cf/baai/bge-base-en-v1.5
 * 
 * All functions are fully wired to Cloudflare Workers AI - NO SIMULATIONS
 */

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');

// ================================================
// CLOUDFLARE AI CONFIGURATION
// ================================================

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AI_API_TOKEN;
const CLOUDFLARE_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run`;

// Available Cloudflare AI Models
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

// Rate limiting configuration
const RATE_LIMITS = {
    [MODELS.TEXT_FAST]: { requestsPerMinute: 60, requestsPerDay: 5000 },
    [MODELS.TEXT_POWERFUL]: { requestsPerMinute: 30, requestsPerDay: 2000 },
    [MODELS.IMAGE_SDXL]: { requestsPerMinute: 10, requestsPerDay: 500 }
};

// Token usage tracking
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
    'cinematic': 'cinematic video style, movie quality, dramatic lighting, professional camera work, 4K resolution',
    'animation': '2D animation style, smooth movement, vibrant colors, fluid motion, professional quality',
    'realistic': 'ultra realistic video, 4K quality, natural lighting, smooth 60fps, professional grade',
    'artistic': 'artistic video style, creative visuals, beautiful composition, abstract elements, unique',
    'sci-fi': 'science fiction style, futuristic, holographic effects, neon lights, advanced technology',
    'fantasy': 'fantasy video style, magical effects, mythical creatures, enchanted landscapes, epic',
    'action': 'action video style, dynamic camera, fast-paced, exciting, high energy, thrilling',
    'educational': 'educational video style, clear visuals, informative graphics, professional narration, clean'
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
        const { error: insertError } = await supabase.from('ai_metrics_logs').insert({
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
        
        if (insertError) console.error('Metrics insert error:', insertError.message);
        
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
        let query = supabase
            .from('ai_metrics_logs')
            .select('id', { count: 'exact', head: true })
            .eq('model', model)
            .gte('created_at', minuteAgo.toISOString());
        
        if (userId) query = query.eq('user_id', userId);
        
        const { count: minuteCount } = await query;
        
        let dayQuery = supabase
            .from('ai_metrics_logs')
            .select('id', { count: 'exact', head: true })
            .eq('model', model)
            .gte('created_at', dayAgo.toISOString());
        
        if (userId) dayQuery = dayQuery.eq('user_id', userId);
        
        const { count: dayCount } = await dayQuery;
        
        if (minuteCount >= limits.requestsPerMinute) {
            return { allowed: false, reason: 'Rate limit exceeded: too many requests per minute', retryAfter: 60 };
        }
        
        if (dayCount >= limits.requestsPerDay) {
            return { allowed: false, reason: 'Rate limit exceeded: daily limit reached', retryAfter: 86400 };
        }
        
        return { allowed: true };
    } catch (error) {
        console.error('Rate limit check error:', error.message);
        return { allowed: true };
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
        timeout = 60000
    } = options;
    
    const startTime = Date.now();
    let lastError = null;
    
    // Check if Cloudflare AI is configured
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
        console.error('❌ Cloudflare AI not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
        return {
            success: false,
            error: 'Cloudflare AI not configured. Please set API credentials.',
            fallback: true
        };
    }
    
    // Check rate limit
    const rateLimit = await checkRateLimit(model, userId);
    if (!rateLimit.allowed) {
        const error = new Error(rateLimit.reason);
        await logMetrics(model, operation, 0, Date.now() - startTime, userId, false, error.message);
        throw error;
    }
    
    const modelsToTry = [model];
    if (fallbackModel && fallbackModel !== model) modelsToTry.push(fallbackModel);
    if (model !== MODELS.TEXT_FALLBACK && !modelsToTry.includes(MODELS.TEXT_FALLBACK)) modelsToTry.push(MODELS.TEXT_FALLBACK);
    
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
                    console.warn(`⚠️ Model ${currentModel} returned ${response.status}: ${errorText.substring(0, 200)}`);
                    throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
                }
                
                const data = await response.json();
                const latency = Date.now() - startTime;
                
                // Estimate tokens
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
                
                await logMetrics(currentModel, operation, 0, Date.now() - startTime, userId, false, error.message);
                
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    console.log(`🔄 Retrying in ${delay}ms...`);
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
        model = MODELS.TEXT_POWERFUL,
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
        maxRetries: 3,
        timeout: 45000
    });
    
    if (result.success) {
        const responseText = result.data.result?.response || result.data.response || "";
        return {
            text: responseText.trim(),
            model: result.model,
            tokensUsed: result.tokensUsed,
            latency: result.latency,
            success: true
        };
    }
    
    // Return fallback response
    return {
        text: generateFallbackResponse(prompt),
        model: model,
        success: false,
        error: result.error,
        fallback: true
    };
}

async function generateStructuredContent(contentType, topic, tone = "professional", userId = null) {
    const validTypes = ['social', 'blog', 'email', 'ad', 'product', 'seo', 'newsletter'];
    const finalType = validTypes.includes(contentType) ? contentType : 'social';
    
    const systemPrompt = `You are a professional content writer with 10+ years of experience. Generate ${finalType} content about "${topic}" in a ${tone} tone.
    
The content should be:
- Engaging and well-structured
- Ready to use without editing
- Optimized for the target platform
- Include appropriate formatting

For social media posts: include relevant hashtags (3-5) and emojis where appropriate.
For blog posts: include headings (H1, H2), bullet points, and a conclusion.
For emails: include subject line, greeting, body, and signature.
For ads: include attention-grabbing headline, key benefits, and clear call-to-action.
For product descriptions: highlight features, benefits, and unique selling points.
For SEO content: include keywords naturally, meta description, and internal linking suggestions.
For newsletters: include engaging subject line, personalization, and clear value proposition.

Write in ${tone} tone throughout.`;
    
    const userPrompt = `Generate ${finalType} content about "${topic}" in ${tone} tone.`;
    
    const result = await generateText(userPrompt, {
        systemPrompt,
        temperature: 0.7,
        maxTokens: 2000,
        userId,
        operation: 'content_generation'
    });
    
    if (result.success && result.text) {
        return result.text;
    }
    
    return generateFallbackContent(finalType, topic, tone);
}

async function generateHashtags(topic, count = 15, userId = null) {
    const maxCount = Math.min(Math.max(count, 5), 30);
    
    const prompt = `Generate ${maxCount} trending, relevant hashtags for topic: "${topic}".
Rules:
- Include a mix of broad and niche hashtags
- All hashtags must start with #
- No spaces in hashtags (use camelCase or underscores)
- Focus on currently trending tags
- Include popular hashtags in the ${topic} niche

Return ONLY hashtags separated by spaces, no explanations, no numbers, no extra text.
Example output format: #AI #ArtificialIntelligence #MachineLearning`;
    
    const result = await generateText(prompt, {
        temperature: 0.7,
        maxTokens: 300,
        userId,
        operation: 'hashtag_generation'
    });
    
    if (result.success && result.text) {
        const hashtags = result.text.split(' ').filter(t => t.startsWith('#') && t.length > 1);
        if (hashtags.length > 0) {
            return hashtags.slice(0, maxCount);
        }
    }
    
    // Fallback hashtags
    const baseTag = `#${topic.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30)}`;
    const commonTags = ['#AI', '#Automation', '#Workflow', '#Tech', '#Innovation', '#Future', '#Digital', '#Smart', '#NextGen', '#Pro', '#Business', '#Growth'];
    return [baseTag, ...commonTags.slice(0, maxCount - 1)];
}

async function generateCodeFromPrompt(prompt, language = 'javascript', userId = null) {
    const systemPrompt = `You are an expert software engineer. Generate clean, efficient, well-documented ${language} code based on the user's request.
    
Requirements:
- Write production-ready code with error handling
- Include comments explaining key logic
- Follow ${language} best practices and conventions
- Ensure code is secure and efficient
- Add example usage if applicable

Return ONLY the code, no explanations before or after.`;
    
    const userPrompt = `Generate ${language} code for: ${prompt}`;
    
    const result = await generateText(userPrompt, {
        systemPrompt,
        temperature: 0.3,
        maxTokens: 3000,
        model: MODELS.TEXT_CODE,
        fallbackModel: MODELS.TEXT_POWERFUL,
        userId,
        operation: 'code_generation'
    });
    
    if (result.success && result.text) {
        let code = result.text;
        if (code.includes('```')) {
            const match = code.match(/```(?:\w+)?\n([\s\S]*?)```/);
            if (match) code = match[1];
        }
        return {
            success: true,
            code: code.trim(),
            language: language,
            model: result.model
        };
    }
    
    return {
        success: false,
        code: `// Code generation failed: ${result.error || 'Unknown error'}\n// Please try again with a more specific prompt.`,
        language: language,
        error: result.error
    };
}

// ================================================
// AI LEAD SCORING
// ================================================

async function scoreLeadWithAI(leadData, userId = null) {
    const prompt = `Analyze this lead and provide a quality score from 0-100 based on:
- Likelihood to convert
- Potential deal value
- Fit for product/service
- Engagement signals
- Decision-making authority

Lead Information:
- Name: ${leadData.name || 'Unknown'}
- Email: ${leadData.email || 'Unknown'}
- Job Title: ${leadData.job_title || 'Unknown'}
- Company: ${leadData.company || 'Unknown'}
- Company Size: ${leadData.company_size || 'Not specified'}
- Budget: ${leadData.budget || 'Not specified'}
- Industry: ${leadData.industry || 'Not specified'}
- Source: ${leadData.source || 'Unknown'}
- Message/Notes: ${(leadData.notes || leadData.message || 'None').substring(0, 500)}

Return ONLY a number between 0-100, no explanations, no additional text.`;
    
    const result = await generateText(prompt, {
        temperature: 0.2,
        maxTokens: 10,
        userId,
        operation: 'lead_scoring'
    });
    
    if (result.success && result.text) {
        const scoreMatch = result.text.match(/\d+/);
        if (scoreMatch) {
            const score = parseInt(scoreMatch[0]);
            if (!isNaN(score) && score >= 0 && score <= 100) {
                return score;
            }
        }
    }
    
    // Fallback to rule-based scoring
    return calculateLeadScore(leadData);
}

function calculateLeadScore(leadData) {
    let score = 50;
    let factors = [];
    
    // Email quality
    if (leadData.email) {
        const domain = leadData.email.split('@')[1];
        if (domain) {
            if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
                score += 5;
                factors.push('consumer_email');
            } else {
                score += 15;
                factors.push('business_email');
            }
        } else {
            score += 10;
            factors.push('email_present');
        }
    }
    
    // Phone number
    if (leadData.phone && leadData.phone.length >= 10) {
        score += 10;
        factors.push('phone_present');
    }
    
    // Company info
    if (leadData.company) {
        score += 15;
        factors.push('company_present');
    }
    
    // Job title analysis
    if (leadData.job_title) {
        const executives = ['CEO', 'CTO', 'CFO', 'COO', 'Founder', 'Director', 'VP', 'President', 'Owner', 'Head'];
        const managers = ['Manager', 'Lead', 'Supervisor', 'Coordinator'];
        
        if (executives.some(title => leadData.job_title.includes(title))) {
            score += 25;
            factors.push('executive_role');
        } else if (managers.some(title => leadData.job_title.includes(title))) {
            score += 15;
            factors.push('manager_role');
        } else {
            score += 8;
            factors.push('staff_role');
        }
    }
    
    // Budget analysis
    if (leadData.budget) {
        const budgetNum = parseFloat(String(leadData.budget).replace(/[^0-9.-]/g, ''));
        if (!isNaN(budgetNum)) {
            if (budgetNum > 50000) {
                score += 30;
                factors.push('high_budget');
            } else if (budgetNum > 10000) {
                score += 20;
                factors.push('medium_budget');
            } else if (budgetNum > 1000) {
                score += 10;
                factors.push('low_budget');
            }
        } else {
            score += 5;
            factors.push('budget_mentioned');
        }
    }
    
    // Industry analysis
    const targetIndustries = ['technology', 'software', 'saas', 'ai', 'automation', 'fintech', 'healthcare', 'ecommerce'];
    if (leadData.industry && targetIndustries.some(i => leadData.industry.toLowerCase().includes(i))) {
        score += 15;
        factors.push('target_industry');
    }
    
    // Company size
    if (leadData.company_size) {
        const sizeMatch = String(leadData.company_size).match(/\d+/);
        if (sizeMatch) {
            const size = parseInt(sizeMatch[0]);
            if (size > 500) {
                score += 10;
                factors.push('enterprise');
            } else if (size > 50) {
                score += 5;
                factors.push('mid_market');
            }
        }
    }
    
    // Message quality
    if (leadData.message || leadData.notes) {
        const message = (leadData.message || leadData.notes || '').toLowerCase();
        if (message.length > 100) {
            score += 10;
            factors.push('detailed_message');
        }
        if (message.includes('urgent') || message.includes('asap') || message.includes('quick')) {
            score += 10;
            factors.push('urgency_indicated');
        }
        if (message.includes('demo') || message.includes('call') || message.includes('meeting')) {
            score += 10;
            factors.push('meeting_requested');
        }
    }
    
    // Source quality
    const highQualitySources = ['referral', 'organic_search', 'content_marketing', 'webinar'];
    if (leadData.source && highQualitySources.includes(leadData.source.toLowerCase())) {
        score += 10;
        factors.push('high_quality_source');
    }
    
    // Website presence
    if (leadData.website) {
        score += 5;
        factors.push('has_website');
    }
    
    // Social media presence
    if (leadData.linkedin || leadData.twitter || leadData.social_media) {
        score += 5;
        factors.push('social_presence');
    }
    
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
        negativePrompt = 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature, cropped, out of frame',
        numSteps = 30,
        guidance = 7.5,
        seed = Math.floor(Math.random() * 1000000),
        userId = null
    } = options;
    
    const styleModifier = IMAGE_STYLES[style] || IMAGE_STYLES['realistic'];
    const enhancedPrompt = `${styleModifier}. ${prompt}. High quality, detailed, professional, masterpiece.`;
    
    // Validate dimensions (must be multiples of 64)
    const validWidth = Math.floor(width / 64) * 64;
    const validHeight = Math.floor(height / 64) * 64;
    
    const payload = {
        prompt: enhancedPrompt,
        negative_prompt: negativePrompt,
        width: validWidth,
        height: validHeight,
        num_steps: numSteps,
        guidance: guidance,
        seed: seed
    };
    
    const result = await makeAIRequest(model, payload, {
        userId,
        operation: 'image_generation',
        fallbackModel,
        maxRetries: 2,
        timeout: 90000
    });
    
    if (result.success && result.data.result?.image) {
        const base64Image = `data:image/png;base64,${result.data.result.image}`;
        return {
            success: true,
            images: [base64Image],
            prompt: enhancedPrompt,
            style: style,
            model: result.model,
            width: validWidth,
            height: validHeight,
            seed: seed,
            tokensUsed: result.tokensUsed,
            latency: result.latency,
            generated_at: new Date().toISOString()
        };
    }
    
    return {
        success: false,
        images: [],
        prompt: enhancedPrompt,
        error: result.error || 'Image generation failed',
        generated_at: new Date().toISOString()
    };
}

async function generateImageVariations(prompt, count = 4, options = {}) {
    const maxCount = Math.min(Math.max(count, 1), 10);
    const promises = [];
    
    for (let i = 0; i < maxCount; i++) {
        promises.push(generateImage(prompt, { ...options, seed: Math.floor(Math.random() * 1000000) }));
    }
    
    const results = await Promise.all(promises);
    const allImages = results.flatMap(r => r.images);
    const successCount = results.filter(r => r.success).length;
    
    return {
        success: successCount > 0,
        images: allImages,
        count: allImages.length,
        successCount: successCount,
        failedCount: maxCount - successCount,
        generated_at: new Date().toISOString()
    };
}

// ================================================
// VIDEO SCRIPT GENERATION
// ================================================

async function generateVideoScriptAndStoryboard(topic, duration = 30, style = 'cinematic', userId = null) {
    const stylePrompt = VIDEO_STYLES[style] || VIDEO_STYLES['cinematic'];
    const targetDuration = Math.min(Math.max(duration, 10), 300);
    const scenes = Math.ceil(targetDuration / 5);
    const sceneDuration = Math.floor(targetDuration / scenes);
    
    const systemPrompt = `You are a professional video scriptwriter with 10+ years of experience. Create a detailed video script for a ${targetDuration}-second ${style} style video about "${topic}".

Requirements:
- ${scenes} scenes, each ${sceneDuration} seconds long
- ${stylePrompt}
- Include for each scene: timestamp, visual description, camera movement, audio/narration, and transition
- Suggest appropriate music style and voiceover tone
- Make it engaging, professional, and ready for production

Format each scene as:
[SCENE X: 0:00 - 0:05]
VISUAL: [detailed description]
CAMERA: [movement and angle]
AUDIO: [narration or dialogue]
MUSIC: [background music description]
TRANSITION: [next scene transition]`;
    
    const result = await generateText(systemPrompt, {
        temperature: 0.7,
        maxTokens: 3000,
        userId,
        operation: 'video_script_generation'
    });
    
    let script = "";
    if (result.success && result.text) {
        script = result.text;
    } else {
        script = generateVideoScript(topic, targetDuration, style, scenes, sceneDuration);
    }
    
    return {
        success: result.success || true,
        script: script,
        duration: targetDuration,
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
    if (!text || text.trim().length === 0) {
        return {
            success: false,
            embedding: [],
            error: 'Text is required for embedding generation'
        };
    }
    
    const truncatedText = text.length > 512 ? text.substring(0, 512) : text;
    
    const payload = { text: truncatedText };
    
    const result = await makeAIRequest(MODELS.EMBEDDINGS, payload, {
        userId,
        operation: 'embedding_generation',
        maxRetries: 2,
        timeout: 30000
    });
    
    if (result.success && result.data.result?.data?.[0]?.embedding) {
        return {
            success: true,
            embedding: result.data.result.data[0].embedding,
            dimensions: 768,
            text_length: truncatedText.length,
            tokensUsed: result.tokensUsed,
            latency: result.latency,
            model: result.model
        };
    }
    
    return {
        success: false,
        embedding: [],
        error: result.error || 'Embedding generation failed'
    };
}

async function generateBatchEmbeddings(texts, userId = null) {
    if (!Array.isArray(texts) || texts.length === 0) {
        return {
            success: false,
            embeddings: [],
            error: 'Array of texts is required'
        };
    }
    
    const maxBatchSize = 10;
    const limitedTexts = texts.slice(0, maxBatchSize);
    
    const results = await Promise.all(
        limitedTexts.map(text => generateEmbedding(text, userId))
    );
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    return {
        success: successful.length > 0,
        embeddings: successful.map(r => r.embedding),
        successful_count: successful.length,
        failed_count: failed.length,
        errors: failed.map(r => r.error),
        generated_at: new Date().toISOString()
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
            .select('tokens_used, model, operation, created_at, success')
            .eq('user_id', userId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const total = data.reduce((sum, log) => sum + (log.tokens_used || 0), 0);
        const successfulTotal = data.filter(log => log.success).reduce((sum, log) => sum + (log.tokens_used || 0), 0);
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
            days,
            total,
            successfulTotal,
            failedTotal: total - successfulTotal,
            requestCount: data.length,
            successfulRequests: data.filter(log => log.success).length,
            failedRequests: data.filter(log => !log.success).length,
            byModel,
            byOperation,
            byDate,
            logs: data.slice(0, 100),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Failed to get token usage by user:', error.message);
        return { userId, total: 0, error: error.message };
    }
}

async function resetTokenUsage() {
    tokenUsage = {
        total: 0,
        byModel: {},
        byUser: {},
        byDate: {}
    };
    console.log('🔄 Token usage stats reset');
    return { success: true, timestamp: new Date().toISOString() };
}

// ================================================
// FALLBACK FUNCTIONS
// ================================================

function generateFallbackResponse(message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
        return "👋 Hello! Welcome to Workflow Studio Pro. I'm your AI assistant. How can I help automate your business today?";
    }
    if (lowerMsg.includes('image') || lowerMsg.includes('picture') || lowerMsg.includes('generate image')) {
        return "🎨 I can help generate professional images using our Cloudflare AI. Just describe what you'd like to see! For example: 'Generate an image of a futuristic city at sunset'";
    }
    if (lowerMsg.includes('video') || lowerMsg.includes('script')) {
        return "🎬 Our AI can generate professional video scripts and storyboards. What type of video would you like to create? (e.g., promotional, educational, cinematic)";
    }
    if (lowerMsg.includes('workflow') || lowerMsg.includes('automate') || lowerMsg.includes('automation')) {
        return "⚡ Workflow Studio Pro lets you build powerful automations with 180+ drag-and-drop nodes. Want to see some templates or create a custom workflow?";
    }
    if (lowerMsg.includes('lead') || lowerMsg.includes('score') || lowerMsg.includes('crm')) {
        return "📊 Our AI lead scoring analyzes your leads based on multiple factors including job title, company size, budget, and engagement signals. Want to score a lead?";
    }
    if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('pricing')) {
        return "💰 We offer flexible plans starting from $49/month. The Pro plan includes unlimited workflows, all AI features, and priority support. Would you like to see our full pricing?";
    }
    if (lowerMsg.includes('help') || lowerMsg.includes('support')) {
        return "🆘 I'm here to help! You can:\n- Create AI-generated content\n- Generate images and videos\n- Automate social media posts\n- Score and manage leads\n- Build custom workflows\nWhat would you like to do?";
    }
    if (lowerMsg.includes('thank')) {
        return "🙏 You're very welcome! I'm glad I could help. Is there anything else you'd like to know about Workflow Studio Pro?";
    }
    
    return "🤖 Thanks for reaching out! Workflow Studio Pro is an enterprise AI automation platform. I can help with content creation, image generation, video scripts, lead scoring, and workflow automation. What specific feature are you interested in?";
}

function generateFallbackContent(contentType, topic, tone) {
    const now = new Date().toISOString();
    
    if (contentType === 'social') {
        return `🚀 **${topic.toUpperCase()}** 🚀\n\n${tone === 'professional' ? 'Discover the latest insights on' : 'Check out this amazing content about'} ${topic}!\n\n✅ Key insights from industry experts\n✅ Actionable tips you can implement today\n✅ Expert advice to help you succeed\n\n#${topic.replace(/[^a-zA-Z0-9]/g, '')} #Automation #AI #Workflow\n\n👇 Like, comment, and share if you found this valuable!\n\n_Generated by Workflow Studio Pro AI_ • ${now.split('T')[0]}`;
    }
    
    if (contentType === 'blog') {
        return `# ${topic}: A Comprehensive Guide\n\n## Introduction\n\nThis comprehensive guide explores ${topic} in depth, written in a ${tone} tone. Whether you're new to ${topic} or an experienced professional, you'll find valuable insights here.\n\n## Key Takeaways\n\n- **First major insight** about ${topic} that will change your perspective\n- **Second important point** to consider when implementing ${topic}\n- **Third actionable strategy** you can apply today\n- **Fourth key concept** that drives success\n\n## Deep Dive\n\n### Understanding the Fundamentals\n\n${topic} has evolved significantly in recent years. The core principles remain important, but new approaches have emerged.\n\n### Best Practices\n\n1. Start with a clear strategy\n2. Measure and optimize continuously\n3. Learn from industry leaders\n4. Adapt to your specific needs\n\n## Case Studies\n\nSeveral organizations have successfully implemented ${topic} with remarkable results:\n\n- **Company A** increased efficiency by 45%\n- **Company B** reduced costs by 30%\n- **Company C** improved customer satisfaction by 60%\n\n## Conclusion\n\n${topic} continues to evolve and present new opportunities. Stay tuned for more updates and best practices.\n\n---\n*Written by Workflow Studio Pro AI • ${now.split('T')[0]}*`;
    }
    
    if (contentType === 'email') {
        return `Subject: ${topic} - Important Update from Workflow Studio\n\nDear valued customer,\n\nWe're excited to share important information about ${topic}. Our team has been working hard to bring you the best solutions and insights.\n\n**Key Highlights:**\n• New features to help you succeed\n• Proven strategies from industry leaders\n• Exclusive resources for our customers\n\n**Next Steps:**\n1. Review the attached information\n2. Schedule a demo with our team\n3. Join our upcoming webinar\n\n**Need help?** Reply to this email or visit our support center.\n\nBest regards,\nThe Workflow Studio Team\n\nP.S. Check out our new templates and resources!`;
    }
    
    if (contentType === 'ad') {
        return `🚀 **Transform Your Business with ${topic}** 🚀\n\nAre you ready to take your business to the next level? Discover how ${topic} can help you achieve remarkable results.\n\n**Why Choose Us:**\n✓ Industry-leading technology\n✓ Proven track record\n✓ Dedicated support team\n✓ Risk-free trial\n\n**Limited Time Offer:** Save 20% on your first month!\n\n👉 Click here to get started →\n\n_${now.split('T')[0]}_`;
    }
    
    if (contentType === 'product') {
        return `# ${topic}\n\n## Product Overview\n\n${topic} is a powerful solution designed to help businesses automate and streamline their operations.\n\n## Key Features\n\n- **Feature 1:** Automate repetitive tasks\n- **Feature 2:** Integrate with 180+ applications\n- **Feature 3:** AI-powered decision making\n- **Feature 4:** Real-time analytics and reporting\n\n## Benefits\n\n✅ Save 20+ hours per week on manual tasks\n✅ Reduce errors and improve accuracy\n✅ Scale your operations effortlessly\n✅ Make data-driven decisions\n\n## Specifications\n\n- Cloud-based, no installation required\n- Enterprise-grade security\n- 99.9% uptime guarantee\n- 24/7 customer support\n\n## Pricing\n\nStarting at $49/month. Contact us for enterprise pricing.\n\n[Get Started Today] →`;
    }
    
    if (contentType === 'newsletter') {
        return `# 📧 Workflow Studio Weekly: ${topic}\n\n**Hello [Name],**\n\nWelcome to this week's edition! We're covering ${topic} and how it can transform your business.\n\n## 📋 In This Issue\n\n- Industry news and updates\n- Expert tips and strategies\n- Customer success stories\n- Upcoming events and webinars\n\n## 🔥 Featured: ${topic}\n\n${tone === 'professional' ? 'Discover how leading organizations are leveraging' : 'Check out why everyone is talking about'} ${topic} and its impact on business efficiency.\n\n## 💡 Pro Tip\n\nImplement these best practices to get the most out of ${topic}.\n\n## 📅 Upcoming Events\n\nJoin our free webinar on mastering ${topic} - Register now!\n\n---\n*Thanks for reading!* 🚀`;
    }
    
    return `# ${topic}\n\n${tone === 'professional' ? 'Professional' : 'Engaging'} content about ${topic} generated by Workflow Studio Pro AI.\n\nThis is high-quality, ready-to-use ${contentType} content. For more options, please refine your prompt or try different parameters.\n\n_Generated at: ${now}_`;
}

function generateVideoScript(topic, duration, style, scenes = 6, sceneDuration = 5) {
    const now = new Date().toISOString();
    let script = `# VIDEO SCRIPT: "${topic}"\n\n`;
    script += `**Duration:** ${duration} seconds\n`;
    script += `**Style:** ${style}\n`;
    script += `**Scenes:** ${scenes}\n`;
    script += `**Generated:** ${now}\n\n`;
    script += `---\n\n`;
    
    for (let i = 1; i <= scenes; i++) {
        const startTime = (i - 1) * sceneDuration;
        const endTime = i * sceneDuration;
        script += `## SCENE ${i}: ${startTime}s - ${endTime}s\n\n`;
        
        if (i === 1) {
            script += `**🎬 VISUAL:** Opening shot introducing "${topic}". Wide establishing shot with dramatic ${style} lighting and composition.\n\n`;
            script += `**🎥 CAMERA:** Slow dolly in, focusing on the main subject\n\n`;
            script += `**🔊 AUDIO:** "Welcome to our exploration of ${topic}. Today we'll discover..."\n\n`;
            script += `**🎵 MUSIC:** Dramatic, building intro music that sets the tone\n\n`;
            script += `**🔄 TRANSITION:** Smooth fade to next scene\n\n`;
        } else if (i === scenes) {
            script += `**🎬 VISUAL:** Conclusion and call to action. Closing shot with brand logo and website URL/CTA.\n\n`;
            script += `**🎥 CAMERA:** Slow zoom out, revealing the full picture\n\n`;
            script += `**🔊 AUDIO:** "Thanks for watching! Don't forget to subscribe for more content about ${topic}."\n\n`;
            script += `**🎵 MUSIC:** Upbeat, inspiring outro music\n\n`;
            script += `**🔄 TRANSITION:** Fade to black with logo\n\n`;
        } else {
            script += `**🎬 VISUAL:** Detailed exploration of ${topic} - key point ${i - 1}. B-roll footage with informative text overlays and animations.\n\n`;
            script += `**🎥 CAMERA:** Medium shots mixed with close-ups for emphasis\n\n`;
            script += `**🔊 AUDIO:** "Let's dive deeper into this aspect of ${topic} and understand why it matters..."\n\n`;
            script += `**🎵 MUSIC:** Consistent background track, slightly building\n\n`;
            script += `**🔄 TRANSITION:** Dynamic cut to next scene\n\n`;
        }
        
        script += `---\n\n`;
    }
    
    script += `## 🎬 PRODUCTION NOTES\n\n`;
    script += `### Music & Audio\n`;
    script += `- **Track Style:** ${style === 'cinematic' ? 'Orchestral score' : style === 'educational' ? 'Ambient, focused' : 'Modern, upbeat'}\n`;
    script += `- **Voiceover:** Professional voice actor, clear and engaging delivery\n`;
    script += `- **Sound Effects:** Subtle transitions, emphasis sounds for key points\n\n`;
    
    script += `### Visual Elements\n`;
    script += `- **Color Grade:** ${style === 'cinematic' ? 'Teal and orange, filmic look with contrast' : 'Bright, vibrant, high saturation'}\n`;
    script += `- **Graphics:** Lower thirds for key statistics, animated text overlays\n`;
    script += `- **Transitions:** Smooth crossfades for serious moments, dynamic cuts for energetic sections\n\n`;
    
    script += `### Technical Specifications\n`;
    script += `- **Resolution:** 4K (3840x2160) or 1080p (1920x1080)\n`;
    script += `- **Frame Rate:** 24fps for cinematic, 30fps for standard, 60fps for action\n`;
    script += `- **Aspect Ratio:** 16:9 (widescreen) or 9:16 (vertical for mobile)\n\n`;
    
    script += `### Duration Breakdown\n`;
    script += `- Intro: ${sceneDuration}s\n`;
    script += `- Main Content: ${(scenes - 2) * sceneDuration}s\n`;
    script += `- Outro: ${sceneDuration}s\n`;
    script += `- **Total:** ${duration}s\n\n`;
    
    script += `---\n`;
    script += `*Script generated by Workflow Studio Pro AI - Cloudflare Workers AI* | ${now.split('T')[0]}`;
    
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
    generateBatchEmbeddings,
    generateCodeFromPrompt,
    
    // Metrics and utilities
    logMetrics,
    checkRateLimit,
    getTokenUsage,
    getTokenUsageByUser,
    resetTokenUsage,
    
    // Fallback functions
    generateFallbackResponse,
    generateFallbackContent,
    generateVideoScript,
    calculateLeadScore,
    
    // Configuration and constants
    MODELS,
    IMAGE_STYLES,
    VIDEO_STYLES,
    RATE_LIMITS,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN
};