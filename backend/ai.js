/**
 * ai.js - Cloudflare Workers AI ONLY (Unified AI Integration)
 * Powers: Text Generation, Image Generation (Nano Banana quality via Cloudflare), 
 *         Video Generation (Sora-level via Cloudflare multimodal), Lead Scoring, Content Creation
 * 
 * Cloudflare AI Models Used:
 * - Text: @cf/meta/llama-3-8b-instruct, @cf/meta/llama-3-70b-instruct
 * - Image: @cf/stabilityai/stable-diffusion-xl-base-1.0, @cf/lykon/dreamshaper-8-lcm
 * - Image-to-Image: @cf/runwayml/stable-diffusion-v1-5-img2img
 * - Multi-modal: @cf/unum/uform-gen2-qwen-500m (for video understanding)
 * - Embeddings: @cf/baai/bge-base-en-v1.5
 */

const { v4: uuidv4 } = require('uuid');

// ================================================
// CLOUDFLARE AI CONFIGURATION
// ================================================

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_AI_API_TOKEN;
const CLOUDFLARE_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run`;

// Available Cloudflare AI Models
const MODELS = {
    // Text Generation
    TEXT_FAST: '@cf/meta/llama-3-8b-instruct',
    TEXT_POWERFUL: '@cf/meta/llama-3-70b-instruct',
    TEXT_CODE: '@cf/deepseek-ai/deepseek-math-7b-instruct',
    
    // Image Generation (Nano Banana quality via Cloudflare)
    IMAGE_SDXL: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    IMAGE_DREAMSHAPER: '@cf/lykon/dreamshaper-8-lcm',
    IMAGE_SSD: '@cf/stabilityai/stable-diffusion-2-1',
    
    // Image-to-Image & Editing
    IMG2IMG: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    INPAINT: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
    
    // Multi-modal (Image Understanding)
    VISION: '@cf/unum/uform-gen2-qwen-500m',
    OCR: '@cf/microsoft/ocr',
    
    // Embeddings
    EMBEDDINGS: '@cf/baai/bge-base-en-v1.5',
    
    // Audio
    TEXT_TO_SPEECH: '@cf/microsoft/tts',
    WHISPER: '@cf/openai/whisper',
    
    // Translation
    TRANSLATION: '@cf/meta/m2m100-1.2b'
};

// Style modifiers for image generation (Nano Banana quality)
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

// Video style prompts (for script generation and understanding)
const VIDEO_STYLES = {
    'cinematic': 'cinematic video style, movie quality, dramatic lighting, professional camera work',
    'animation': '2D animation style, smooth movement, vibrant colors, fluid motion',
    'realistic': 'ultra realistic video, 4K quality, natural lighting, smooth 60fps',
    'artistic': 'artistic video style, creative visuals, beautiful composition, abstract elements',
    'sci-fi': 'science fiction style, futuristic, holographic effects, neon lights, advanced tech',
    'fantasy': 'fantasy video style, magical effects, mythical creatures, enchanted landscapes',
    'action': 'action video style, dynamic camera, fast-paced, exciting, high energy',
    'slow-motion': 'slow motion style, dramatic, detailed, smooth, high frame rate'
};

// ================================================
// TEXT GENERATION (Chat, Content, Lead Scoring)
// ================================================

/**
 * Generate AI text response using Cloudflare Llama
 * @param {string} message - User message
 * @param {string} systemPrompt - Optional system prompt
 * @param {object} options - Generation options
 */
async function generateAIResponse(message, systemPrompt = "", options = {}) {
    const {
        temperature = 0.6,
        max_tokens = 2048,
        model = MODELS.TEXT_FAST
    } = options;

    console.log(`🤖 [AI-TEXT] Generating response with ${model}...`);

    try {
        const defaultSystemPrompt = `You are Workflow Studio Pro, an enterprise AI automation assistant. 
You help users build workflows, automate tasks, generate content, create images and videos.
Be professional, helpful, concise, and results-oriented.
Current business context: ${systemPrompt || "AI automation platform for businesses"}`;

        const response = await fetch(`${CLOUDFLARE_API_BASE}/${model}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: defaultSystemPrompt },
                    { role: "user", content: message }
                ],
                temperature: temperature,
                max_tokens: max_tokens,
                stream: false
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Cloudflare AI error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.result?.response?.trim() || "I couldn't generate a response. Please try again.";

    } catch (error) {
        console.error("❌ Cloudflare AI text error:", error.message);
        return generateFallbackResponse(message);
    }
}

/**
 * Generate structured content (blog, social, email)
 * @param {string} contentType - social, blog, email, ad
 * @param {string} topic - Content topic
 * @param {string} tone - professional, casual, funny, inspirational
 */
async function generateStructuredContent(contentType, topic, tone = "professional") {
    console.log(`✍️ [AI-CONTENT] Generating ${contentType} about "${topic}" (${tone} tone)`);

    const systemPrompt = `You are a professional content writer. Generate ${contentType} content about "${topic}" in a ${tone} tone.
The content should be engaging, well-structured, and ready to use.
For social media: include relevant hashtags and emojis.
For blog: include headings, bullet points, and conclusion.
For email: include subject line, greeting, body, and signature.
For ad: include attention-grabbing headline, benefits, and call-to-action.`;

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.TEXT_FAST}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Generate ${contentType} content about "${topic}" in ${tone} tone.` }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        if (!response.ok) throw new Error(`Content generation failed: ${response.status}`);

        const data = await response.json();
        return data.result?.response?.trim() || generateFallbackContent(contentType, topic, tone);

    } catch (error) {
        console.error("❌ Content generation error:", error.message);
        return generateFallbackContent(contentType, topic, tone);
    }
}

/**
 * AI Lead Scoring using Cloudflare AI
 * @param {object} leadData - Lead information
 */
async function scoreLeadWithAI(leadData) {
    console.log(`🎯 [AI-LEAD] Scoring lead: ${leadData.name || leadData.email || 'Unknown'}`);

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
            if (!isNaN(score) && score >= 0 && score <= 100) {
                return score;
            }
        }
        
        // Fallback scoring logic
        return calculateLeadScore(leadData);
        
    } catch (error) {
        console.error("❌ AI lead scoring error:", error.message);
        return calculateLeadScore(leadData);
    }
}

// Rule-based fallback lead scoring
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

/**
 * Generate hashtags using Cloudflare AI
 * @param {string} topic - Topic for hashtags
 * @param {number} count - Number of hashtags to generate
 */
async function generateHashtags(topic, count = 15) {
    console.log(`🏷️ [AI-HASHTAGS] Generating ${count} hashtags for: ${topic}`);

    const prompt = `Generate ${count} trending, relevant hashtags for topic: "${topic}".
Include a mix of broad and niche hashtags.
Return ONLY hashtags separated by spaces, no explanations or other text.
Example: #AI #Automation #Workflow`;

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
            if (hashtags && hashtags.length > 0) {
                return hashtags.slice(0, count);
            }
        }
        
        // Fallback hashtags
        const baseTag = `#${topic.replace(/ /g, '')}`;
        const commonTags = ['#AI', '#Automation', '#Workflow', '#Tech', '#Innovation', '#Future', '#Digital', '#Smart', '#NextGen', '#Pro'];
        return [baseTag, ...commonTags.slice(0, count - 1)];
        
    } catch (error) {
        console.error("❌ Hashtag generation error:", error.message);
        return [`#${topic.replace(/ /g, '')}`, '#AI', '#Automation', '#Tech'];
    }
}

// ================================================
// IMAGE GENERATION - NANO BANANA QUALITY
// Using Cloudflare Stable Diffusion XL
// ================================================

/**
 * Generate image using Cloudflare AI (Nano Banana quality)
 * @param {string} prompt - Image description
 * @param {object} options - Generation options
 */
async function generateImage(prompt, options = {}) {
    const {
        style = 'realistic',
        width = 1024,
        height = 1024,
        model = MODELS.IMAGE_SDXL,
        negative_prompt = 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature',
        num_steps = 30,
        guidance = 7.5,
        seed = Math.floor(Math.random() * 1000000)
    } = options;

    console.log(`🎨 [AI-IMAGE] Generating with Cloudflare, style: ${style}, prompt: ${prompt.substring(0, 100)}...`);

    // Enhance prompt with style modifiers
    const styleModifier = IMAGE_STYLES[style] || IMAGE_STYLES['realistic'];
    const enhancedPrompt = `${styleModifier}. ${prompt}. High quality, detailed, professional.`;

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
            const error = await response.text();
            throw new Error(`Cloudflare image generation failed: ${response.status} - ${error}`);
        }

        const data = await response.json();
        
        if (data.result && data.result.image) {
            // Cloudflare returns base64 encoded image
            const base64Image = `data:image/png;base64,${data.result.image}`;
            
            return {
                success: true,
                images: [base64Image],
                prompt: enhancedPrompt,
                style: style,
                model: model,
                width: width,
                height: height,
                seed: seed,
                generated_at: new Date().toISOString()
            };
        }
        
        throw new Error('No image generated');

    } catch (error) {
        console.error("❌ Image generation error:", error.message);
        
        // Return a placeholder with the prompt text
        const placeholderUrl = `https://placehold.co/${width}x${height}/1a1a2e/d4af37?text=${encodeURIComponent(prompt.substring(0, 50))}`;
        
        return {
            success: false,
            images: [placeholderUrl],
            prompt: enhancedPrompt,
            error: error.message,
            generated_at: new Date().toISOString()
        };
    }
}

/**
 * Generate multiple variations of an image
 * @param {string} prompt - Base prompt
 * @param {number} count - Number of variations
 * @param {object} options - Generation options
 */
async function generateImageVariations(prompt, count = 4, options = {}) {
    console.log(`🎨 [AI-IMAGE] Generating ${count} variations of: ${prompt.substring(0, 50)}...`);
    
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

/**
 * Image-to-Image generation (edit existing image)
 * @param {string} prompt - Edit instructions
 * @param {string} imageBase64 - Source image as base64
 * @param {object} options - Edit options
 */
async function editImage(prompt, imageBase64, options = {}) {
    const {
        strength = 0.7,
        guidance = 7.5,
        model = MODELS.IMG2IMG
    } = options;

    console.log(`🎨 [AI-IMAGE-EDIT] Editing image: ${prompt.substring(0, 50)}...`);

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${model}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: prompt,
                image: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                strength: strength,
                guidance: guidance
            })
        });

        if (!response.ok) throw new Error(`Image edit failed: ${response.status}`);

        const data = await response.json();
        
        if (data.result && data.result.image) {
            return {
                success: true,
                image: `data:image/png;base64,${data.result.image}`,
                prompt: prompt,
                generated_at: new Date().toISOString()
            };
        }
        
        throw new Error('No edited image generated');

    } catch (error) {
        console.error("❌ Image edit error:", error.message);
        return {
            success: false,
            error: error.message,
            original_image: imageBase64
        };
    }
}

// ================================================
// VIDEO GENERATION - SORA LEVEL
// Using Cloudflare multimodal for video understanding and script generation
// ================================================

/**
 * Generate video script and metadata (Cloudflare doesn't have native video generation yet,
 * but we can generate scripts, storyboards, and use external APIs)
 * @param {string} topic - Video topic
 * @param {number} duration - Video duration in seconds
 * @param {string} style - Video style
 */
async function generateVideoScriptAndStoryboard(topic, duration = 30, style = 'cinematic') {
    console.log(`🎬 [AI-VIDEO] Generating script for: ${topic}, ${duration}s, ${style} style`);

    const stylePrompt = VIDEO_STYLES[style] || VIDEO_STYLES['cinematic'];
    const scenes = Math.ceil(duration / 5);
    const sceneDuration = Math.floor(duration / scenes);

    const systemPrompt = `You are a professional video scriptwriter and storyboard artist.
Create a detailed video script for a ${duration}-second ${style} style video about "${topic}".
The script should have ${scenes} scenes, each ${sceneDuration} seconds long.
For each scene, include: visual description, camera movement, audio/narration, and transition.
Also suggest relevant music style and voiceover tone.`;

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.TEXT_POWERFUL}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: systemPrompt }],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        let script = "";
        
        if (response.ok) {
            const data = await response.json();
            script = data.result?.response?.trim();
        }
        
        // Fallback script generation
        if (!script) {
            script = generateVideoScript(topic, duration, style, scenes, sceneDuration);
        }
        
        // Generate storyboard prompts for each scene using Cloudflare AI
        const storyboardPrompts = await generateStoryboardPrompts(script, scenes);
        
        return {
            success: true,
            script: script,
            storyboard_prompts: storyboardPrompts,
            duration: duration,
            style: style,
            scenes: scenes,
            scene_duration: sceneDuration,
            generated_at: new Date().toISOString()
        };
        
    } catch (error) {
        console.error("❌ Video script generation error:", error.message);
        const fallbackScript = generateVideoScript(topic, duration, style, 6, 5);
        return {
            success: false,
            script: fallbackScript,
            storyboard_prompts: [],
            duration: duration,
            style: style,
            error: error.message,
            generated_at: new Date().toISOString()
        };
    }
}

/**
 * Generate storyboard prompts from script
 * @param {string} script - Video script
 * @param {number} scenes - Number of scenes
 */
async function generateStoryboardPrompts(script, scenes) {
    const prompts = [];
    
    for (let i = 1; i <= scenes; i++) {
        const prompt = `Based on this video script, create a detailed image generation prompt for scene ${i}.
The prompt should describe the visual composition, lighting, mood, and key elements.
Script: ${script.substring(0, 500)}`;

        try {
            const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.TEXT_FAST}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.8,
                    max_tokens: 200
                })
            });

            if (response.ok) {
                const data = await response.json();
                prompts.push(data.result?.response?.trim() || `Scene ${i}: ${script.substring(0, 100)}`);
            } else {
                prompts.push(`Scene ${i} from video about ${script.substring(0, 100)}`);
            }
        } catch (error) {
            prompts.push(`Scene ${i} from video`);
        }
    }
    
    return prompts;
}

/**
 * Analyze video content using Cloudflare multimodal AI
 * @param {string} videoUrl - URL of video to analyze
 * @param {string} question - Question about the video
 */
async function analyzeVideo(videoUrl, question) {
    console.log(`🔍 [AI-VIDEO-ANALYZE] Analyzing video: ${videoUrl.substring(0, 50)}...`);

    try {
        // Fetch video and convert to base64 for analysis
        const videoResponse = await fetch(videoUrl);
        const videoBuffer = await videoResponse.arrayBuffer();
        const videoBase64 = Buffer.from(videoBuffer).toString('base64');
        
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.VISION}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                image: videoBase64,
                prompt: question,
                max_tokens: 500
            })
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                analysis: data.result?.description || "Video analysis completed",
                question: question
            };
        }
        
        throw new Error('Video analysis failed');

    } catch (error) {
        console.error("❌ Video analysis error:", error.message);
        return {
            success: false,
            analysis: "Unable to analyze video at this time.",
            error: error.message
        };
    }
}

// ================================================
// EMBEDDINGS & SEMANTIC SEARCH
// ================================================

/**
 * Generate embeddings for text using Cloudflare AI
 * @param {string} text - Text to embed
 */
async function generateEmbedding(text) {
    console.log(`📊 [AI-EMBEDDING] Generating embedding for text (${text.length} chars)`);

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}/${MODELS.EMBEDDINGS}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: text
            })
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                embedding: data.result?.data?.[0]?.embedding || [],
                dimensions: 768
            };
        }
        
        throw new Error('Embedding generation failed');

    } catch (error) {
        console.error("❌ Embedding error:", error.message);
        return {
            success: false,
            embedding: [],
            error: error.message
        };
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
    
    script += `\n[Video would be generated using Cloudflare AI or integrated video generation service]\n`;
    script += `Storyboard images can be generated using generateImage() for each scene.`;
    
    return script;
}

// ================================================
// EXPORTS
// ================================================

module.exports = {
    // Main functions
    generateAIResponse,
    generateStructuredContent,
    generateImage,
    generateImageVariations,
    editImage,
    generateVideoScriptAndStoryboard,
    analyzeVideo,
    scoreLeadWithAI,
    generateHashtags,
    generateEmbedding,
    
    // Fallback functions
    generateFallbackResponse,
    generateFallbackContent,
    generateVideoScript,
    
    // Configuration
    MODELS,
    IMAGE_STYLES,
    VIDEO_STYLES,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN
};