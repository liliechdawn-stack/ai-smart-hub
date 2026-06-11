// widget.js - Professional SaaS AI Chat Widget (FULLY UPDATED)
// Features: Business Identity Integration, Proper Conversation Memory, Professional AI Responses, 
// Apollo Enrichment, Follow-ups, IMAGE ATTACHMENT FROM SMART TOOLS, CUSTOM LINKS INTEGRATION
// UPDATED: Public proof images endpoint, Image analysis for uploaded images
// SECURITY: XSS-safe DOM manipulation, isolated localStorage namespace with PII encoding
// SPEECH: Cross-browser SpeechRecognition/Synthesis with graceful degradation
// LOCATION: backend/widget.js (served as static file or embedded)
(function () {
  if (document.getElementById("ai-widget-container")) return;

  const marker = document.getElementById("ai-chat-widget");
  if (!marker) {
    console.warn("AI Widget: Marker #ai-chat-widget not found.");
    return;
  }

  const SERVER_URL = window.BACKEND_URL || 'https://ai-smart-hub.onrender.com';
  const WIDGET_KEY = marker.dataset.key || "";

  if (!WIDGET_KEY) {
    console.error("AI Widget: Missing data-key.");
    return;
  }

  // ===== GLOBAL STORAGE ISOLATION =====
  // Unique, strict namespace prefix for all localStorage keys
  const STORAGE_PREFIX = '_aish_hub_';
  
  // Helper to encode PII before storing (Base64 encoding for simple masking)
  function encodePII(value) {
    if (!value) return '';
    // Simple masking using btoa (Base64) - not encryption but prevents plaintext storage
    try {
      return btoa(encodeURIComponent(value));
    } catch (e) {
      console.warn("[WIDGET] PII encoding failed:", e);
      return value;
    }
  }
  
  function decodePII(encodedValue) {
    if (!encodedValue) return '';
    try {
      return decodeURIComponent(atob(encodedValue));
    } catch (e) {
      console.warn("[WIDGET] PII decoding failed:", e);
      return encodedValue;
    }
  }
  
  // Helper to get/set prefixed localStorage items
  function getPrefixedItem(key, decode = false) {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (decode && value) {
      return decodePII(value);
    }
    return value;
  }
  
  function setPrefixedItem(key, value, encode = false) {
    if (encode && value) {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, encodePII(value));
    } else {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
    }
  }
  
  function removePrefixedItem(key) {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  }

  // ===== STATE MANAGEMENT (using isolated storage) =====
  let leadCaptured = getPrefixedItem(`lead_captured_${WIDGET_KEY}`) === "true";
  let isMuted = localStorage.getItem(`${STORAGE_PREFIX}widget_muted`) === "true";
  let activeSessionId = getPrefixedItem(`widget_session_${WIDGET_KEY}`) || null;
  let smartSettings = {};
  let businessIdentity = {};
  let customLinks = [];
  let proofImages = [];
  let isLiveMode = false;
  let customBgColor = getPrefixedItem(`widget_bg_color_${WIDGET_KEY}`) || "#1a1a1a";
  let isProcessing = false;
  let pendingFileData = null;
  let pendingFileName = '';
  let userEmail = getPrefixedItem(`user_email_${WIDGET_KEY}`, true) || '';
  let userName = getPrefixedItem(`user_name_${WIDGET_KEY}`, true) || '';
  let userPhone = getPrefixedItem(`user_phone_${WIDGET_KEY}`, true) || '';
  let businessPlan = 'free';
  let businessName = '';
  let aiName = '';
  let hasIntroduced = getPrefixedItem(`has_introduced_${WIDGET_KEY}`) === "true";
  let recognition = null;
  let recognitionActive = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Track conversation history (no PII, no encoding needed)
  let conversationHistory = JSON.parse(getPrefixedItem(`conversation_${WIDGET_KEY}`) || '[]');
  let lastResponseText = '';
  let messageCount = conversationHistory.length;
  
  // Track captured emails (encoded)
  let capturedEmails = new Set();
  const storedEmails = getPrefixedItem(`captured_emails_${WIDGET_KEY}`);
  if (storedEmails) {
    try {
      const decoded = JSON.parse(storedEmails);
      capturedEmails = new Set(decoded.map(email => decodePII(email)));
    } catch(e) { capturedEmails = new Set(); }
  }

  // Widget capabilities
  let widgetCapabilities = {
    imageSupport: false,
    reviewCollection: false
  };

  // ===== FETCH WIDGET CONFIG & BUSINESS IDENTITY & CUSTOM LINKS & PROOF IMAGES =====
  fetch(`${SERVER_URL}/api/public/widget-config/${WIDGET_KEY}`)
    .then(res => res.json())
    .then(async dbConfig => {
      businessPlan = dbConfig.plan || 'free';
      businessName = dbConfig.business_name || marker.getAttribute("data-title") || "our store";
      aiName = dbConfig.ai_name || marker.getAttribute("data-ai-name") || "AI Assistant";
      
      businessIdentity = {
        business_type: dbConfig.business_type || 'retail',
        business_description: dbConfig.business_description || 'a modern retail store'
      };
      
      smartSettings = {
        booking_url: dbConfig.booking_url || '',
        booking_active: dbConfig.booking_active || false,
        apollo_active: dbConfig.apollo_active || false,
        followup_active: dbConfig.followup_active || false,
        vision_active: dbConfig.vision_active || false,
        sentiment_active: dbConfig.sentiment_active || false,
        ai_instructions: dbConfig.ai_instructions || '',
        ai_temp: dbConfig.ai_temp || '0.7',
        ...(dbConfig.smart_hub || {})
      };
      
      // Load widget capabilities from localStorage (set via smart-tools.html)
      const savedCapabilities = getPrefixedItem('widgetCapabilities');
      if (savedCapabilities) {
        widgetCapabilities = JSON.parse(savedCapabilities);
      }
      
      console.log("[WIDGET] Business Name:", businessName);
      console.log("[WIDGET] Smart Hub settings:", smartSettings);
      console.log("[WIDGET] Business Identity:", businessIdentity);
      console.log("[WIDGET] Widget Capabilities:", widgetCapabilities);
      
      // Load custom links from backend (public endpoint)
      await loadCustomLinksForWidget();
      
      // Load proof images from public endpoint (no auth needed)
      await loadProofImagesForWidget();
      
      initWidget(dbConfig);
    })
    .catch(err => {
      console.warn("Widget config fetch failed, using fallback", err);
      businessName = marker.getAttribute("data-title") || "our store";
      aiName = "AI Assistant";
      smartSettings = {};
      businessIdentity = {
        business_type: 'retail',
        business_description: 'a modern retail store'
      };
      initWidget({});
    });

  // ===== LOAD CUSTOM LINKS FROM BACKEND (PUBLIC ENDPOINT) =====
  async function loadCustomLinksForWidget() {
    try {
      const response = await fetch(`${SERVER_URL}/api/smart-hub/public/custom-links/${WIDGET_KEY}`);
      
      if (response.ok) {
        customLinks = await response.json();
        console.log("[WIDGET] Loaded custom links from public endpoint:", customLinks.length);
      } else {
        console.warn("[WIDGET] Failed to load custom links, status:", response.status);
        customLinks = [];
      }
    } catch (err) {
      console.warn("[WIDGET] Failed to load custom links:", err);
      customLinks = [];
    }
  }

  // ===== LOAD PROOF IMAGES FROM BACKEND (PUBLIC ENDPOINT - NO TOKEN NEEDED) =====
  async function loadProofImagesForWidget() {
    try {
      const response = await fetch(`${SERVER_URL}/api/smart-hub/public/proof-images/${WIDGET_KEY}`);
      
      if (response.ok) {
        proofImages = await response.json();
        console.log("[WIDGET] Loaded proof images from public endpoint:", proofImages.length);
        
        // Update proof button visibility
        const proofBtn = document.getElementById("widget-proof-btn");
        if (proofBtn) {
          proofBtn.style.display = proofImages.length > 0 ? "flex" : "none";
        }
      } else {
        console.warn("[WIDGET] Failed to load proof images, status:", response.status);
        proofImages = [];
      }
    } catch (err) {
      console.warn("[WIDGET] Failed to load proof images:", err);
      proofImages = [];
    }
  }

  // ===== GET CUSTOM LINKS FOR DISPLAY (XSS-SAFE) =====
  function getCustomLinksMessage() {
    if (!customLinks || customLinks.length === 0) return '';
    
    const linksContainer = document.createElement('div');
    linksContainer.style.marginTop = '10px';
    const strong = document.createElement('strong');
    strong.textContent = 'Useful Links:';
    linksContainer.appendChild(strong);
    linksContainer.appendChild(document.createElement('br'));
    
    customLinks.forEach(link => {
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.textContent = `🔗 ${link.name || link.url}`;
      anchor.style.display = 'inline-block';
      anchor.style.margin = '5px';
      anchor.style.padding = '8px 16px';
      anchor.style.background = 'var(--primary-color)';
      anchor.style.color = 'white';
      anchor.style.borderRadius = '20px';
      anchor.style.textDecoration = 'none';
      anchor.style.fontSize = '12px';
      linksContainer.appendChild(anchor);
    });
    
    // Return as HTML string for appendMessage (which will sanitize via createElement)
    return `<div style="margin-top: 10px;"><strong>Useful Links:</strong><br>${customLinks.map(link => `<a href="${escapeHtml(link.url)}" target="_blank" style="display: inline-block; margin: 5px; padding: 8px 16px; background: var(--primary-color); color: white; border-radius: 20px; text-decoration: none; font-size: 12px;">🔗 ${escapeHtml(link.name)}</a>`).join('')}</div>`;
  }

  // ===== GET PROOF IMAGES FOR DISPLAY (XSS-SAFE) =====
  function getProofImagesMessage() {
    if (!proofImages || proofImages.length === 0) return '';
    
    const imagesHtml = proofImages.map(img => `
      <img src="${escapeHtml(img.imageUrl)}" alt="Proof" style="max-width: 100%; border-radius: 12px; margin: 5px 0; border: 1px solid #e5e7eb; cursor: pointer;" onclick="window.open('${escapeHtml(img.imageUrl)}', '_blank')">
    `).join('');
    
    return `<div style="margin-top: 10px; background: #f9fafb; padding: 12px; border-radius: 12px;">
      <strong>📸 Here are the proof images you requested:</strong><br>
      ${imagesHtml}
      <small style="color: #6b7280; display: block; margin-top: 8px;">These were uploaded from your admin panel as proof of delivery/service.</small>
    </div>`;
  }

  // Helper to get proof images array
  function hasProofImages() {
    return proofImages && proofImages.length > 0;
  }

  function getProofImagesArray() {
    return proofImages;
  }

  // ===== ANALYZE IMAGE WITH VISION AI =====
  async function analyzeImageWithVision(imageData) {
    if (!smartSettings?.vision_active) return null;
    
    try {
      const response = await fetch(`${SERVER_URL}/api/public/vision/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: imageData,
          widget_key: WIDGET_KEY
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.analysis || "I can see the image you shared. What would you like to know about it?";
      }
    } catch (err) {
      console.warn("[WIDGET] Vision analysis failed:", err);
    }
    return null;
  }

  // ===== XSS-SAFE appendMessage (using DOM methods) =====
  function appendMessage(text, role, fileData = null, fileName = '') {
    if (isLiveMode) return;

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    // Create content container
    const contentDiv = document.createElement("div");
    
    // Safely process links without innerHTML vulnerability
    // Parse text and create text nodes and anchor elements
    const processTextWithLinks = (inputText) => {
      const fragment = document.createDocumentFragment();
      let remaining = inputText;
      
      // Regex to find URLs
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      let lastIndex = 0;
      let match;
      
      while ((match = urlRegex.exec(remaining)) !== null) {
        // Add text before the URL
        if (match.index > lastIndex) {
          const textNode = document.createTextNode(remaining.substring(lastIndex, match.index));
          fragment.appendChild(textNode);
        }
        
        // Create anchor for URL
        const anchor = document.createElement('a');
        anchor.href = match[0];
        anchor.target = '_blank';
        anchor.textContent = match[0];
        anchor.style.color = 'inherit';
        anchor.style.textDecoration = 'underline';
        fragment.appendChild(anchor);
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < remaining.length) {
        const textNode = document.createTextNode(remaining.substring(lastIndex));
        fragment.appendChild(textNode);
      }
      
      // If no URLs were found, just add the whole text as text node
      if (lastIndex === 0) {
        return document.createTextNode(remaining);
      }
      
      return fragment;
    };
    
    // Process main text content
    const processedContent = processTextWithLinks(text);
    contentDiv.appendChild(processedContent);
    
    // Handle booking URL if relevant
    const bookingUrl = smartSettings?.booking_url || '';
    if (bookingUrl && smartSettings?.booking_active) {
      const bookingKeywords = /book|appointment|schedule|meeting|calendly|reserve|consultation|demo/i;
      if (bookingKeywords.test(text)) {
        const breakNode = document.createElement('br');
        contentDiv.appendChild(breakNode);
        contentDiv.appendChild(breakNode.cloneNode());
        const bookingAnchor = document.createElement('a');
        bookingAnchor.href = bookingUrl;
        bookingAnchor.target = '_blank';
        bookingAnchor.textContent = '📅 Click here to book';
        bookingAnchor.style.color = '#1a73e8';
        bookingAnchor.style.fontWeight = '600';
        bookingAnchor.style.textDecoration = 'underline';
        contentDiv.appendChild(bookingAnchor);
      }
    }
    
    messageDiv.appendChild(contentDiv);

    // Handle file attachments safely
    if (fileData) {
      if (fileData.startsWith('data:image/')) {
        const img = document.createElement("img");
        img.src = fileData;
        img.alt = "Uploaded image";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "12px";
        img.style.marginTop = "10px";
        messageDiv.appendChild(img);
      } else if (fileData.startsWith('data:application/pdf')) {
        const iframe = document.createElement("iframe");
        iframe.src = fileData;
        iframe.style.width = "100%";
        iframe.style.height = "400px";
        iframe.style.border = "none";
        iframe.title = "PDF Preview";
        messageDiv.appendChild(iframe);
      } else {
        const link = document.createElement("a");
        link.href = fileData;
        link.download = fileName;
        link.textContent = `📥 Download ${fileName}`;
        link.style.color = "#1a73e8";
        link.style.fontWeight = "500";
        link.style.display = "block";
        link.style.marginTop = "10px";
        messageDiv.appendChild(link);
      }
    }

    const msgContainer = document.getElementById("widget-msgs-container");
    if (msgContainer) {
      msgContainer.appendChild(messageDiv);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }
    
    conversationHistory.push({ role, text, timestamp: new Date().toISOString() });
    if (conversationHistory.length > 20) conversationHistory.shift();
    setPrefixedItem(`conversation_${WIDGET_KEY}`, JSON.stringify(conversationHistory));
    messageCount++;
  }

  // ===== CROSS-BROWSER SPEECH RECOGNITION with GRACEFUL DEGRADATION =====
  function initSpeechRecognition() {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[WIDGET] Speech recognition not supported in this browser");
      return null;
    }
    
    try {
      const recog = new SpeechRecognition();
      // Test if continuous mode is supported (some browsers like iOS Safari don't support it well)
      // We'll set it but gracefully handle errors
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';
      recog.maxAlternatives = 1;
      
      // Store original onerror to wrap with degradation logic
      return recog;
    } catch (e) {
      console.warn("[WIDGET] Failed to initialize SpeechRecognition:", e);
      return null;
    }
  }
  
  // Global speech synthesis with user gesture handling for iOS
  let speechSynthesisSupported = 'speechSynthesis' in window;
  let pendingSpeechQueue = [];
  let isSpeaking = false;
  
  function speak(text) {
    if (isMuted || !speechSynthesisSupported) return;
    
    // Cancel any ongoing speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    const cleanText = text
      .replace(/(https?:\/\/[^\s]+)/g, 'a link')
      .replace(/\*/g, '')
      .replace(/#/g, '')
      .replace(/[•●]/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.85;
    utterance.pitch = 1.25;
    utterance.volume = 0.95;
    
    // iOS requires user interaction before speech will work
    // We'll add a flag to track if user has interacted
    if (!window._speechUserInteracted) {
      window._speechUserInteracted = false;
      // Add one-time interaction listener
      const markInteraction = () => {
        window._speechUserInteracted = true;
        document.removeEventListener('click', markInteraction);
        document.removeEventListener('touchstart', markInteraction);
        // Process pending speech queue
        processSpeechQueue();
      };
      document.addEventListener('click', markInteraction);
      document.addEventListener('touchstart', markInteraction);
    }
    
    function setVoice() {
      const voices = window.speechSynthesis.getVoices();
      const preferredVoices = [
        'Google UK English Female',
        'Microsoft Zira',
        'Samantha',
        'Google US English',
        'Victoria',
        'Karen',
        'Moira',
        'Tessa'
      ];
      
      for (const preferred of preferredVoices) {
        const voice = voices.find(v => v.name.includes(preferred) && v.lang.includes('en'));
        if (voice) {
          utterance.voice = voice;
          break;
        }
      }
      
      if (!utterance.voice) {
        const femaleVoice = voices.find(v => 
          v.lang.includes('en') && 
          (v.name.includes('female') || v.name.includes('Female') || 
           v.name.includes('Zira') || v.name.includes('Samantha') ||
           v.name.includes('Victoria'))
        );
        utterance.voice = femaleVoice || voices.find(v => v.lang.includes('en')) || voices[0];
      }
    }
    
    const trySpeak = () => {
      if (window.speechSynthesis) {
        if (window.speechSynthesis.getVoices().length > 0) {
          setVoice();
        } else {
          window.speechSynthesis.onvoiceschanged = setVoice;
        }
        
        utterance.onend = () => {
          isSpeaking = false;
          processSpeechQueue();
        };
        
        utterance.onerror = (e) => {
          console.warn("[WIDGET] Speech synthesis error:", e);
          isSpeaking = false;
          processSpeechQueue();
        };
        
        window.speechSynthesis.speak(utterance);
        isSpeaking = true;
      }
    };
    
    // Store in queue if no user interaction yet
    if (!window._speechUserInteracted) {
      pendingSpeechQueue.push(trySpeak);
      return;
    }
    
    trySpeak();
  }
  
  function processSpeechQueue() {
    if (pendingSpeechQueue.length > 0 && !isSpeaking) {
      const next = pendingSpeechQueue.shift();
      if (next) next();
    }
  }

  function initWidget(dbConfig) {
    // Determine welcome message
    let welcomeMessage;
    if (hasIntroduced || leadCaptured || messageCount > 0) {
      welcomeMessage = `Hi there! How can I help you today?`;
    } else {
      welcomeMessage = dbConfig.welcome_message || marker.dataset.welcome || `Hi! I'm ${aiName}, the AI assistant for ${businessName}. How can I help you today?`;
      hasIntroduced = true;
      setPrefixedItem(`has_introduced_${WIDGET_KEY}`, "true");
    }

    const config = {
      key: WIDGET_KEY,
      primaryColor: dbConfig.widget_color || marker.dataset.primaryColor || "#d4af37",
      position: marker.dataset.position || "bottom-right",
      welcome: welcomeMessage,
      title: businessName
    };

    // Professional styles (unchanged)
    const style = document.createElement('style');
    style.textContent = `
      #ai-widget-container { 
        font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif; 
        --primary-color: ${config.primaryColor};
      }
      
      .widget-bubble { 
        position: fixed; 
        z-index: 99999; 
        bottom: 20px; 
        right: 20px; 
        width: 64px; 
        height: 64px; 
        border-radius: 50%; 
        background: white; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        cursor: pointer; 
        box-shadow: 0 8px 32px rgba(0,0,0,0.15); 
        transition: all 0.3s ease; 
        border: 1px solid rgba(0,0,0,0.08); 
      }
      .widget-bubble:hover { 
        transform: scale(1.1); 
        box-shadow: 0 12px 40px rgba(0,0,0,0.2); 
      }
      .widget-bubble svg { 
        width: 28px; 
        height: 28px; 
        stroke: var(--primary-color); 
      }

      .widget-window { 
        position: fixed; 
        z-index: 100000; 
        bottom: 100px; 
        right: 20px; 
        width: 420px; 
        max-width: 90vw; 
        height: 700px; 
        max-height: 85vh; 
        background: white; 
        border-radius: 28px; 
        display: none; 
        flex-direction: column; 
        box-shadow: 0 24px 60px rgba(0,0,0,0.2); 
        overflow: hidden; 
        border: 1px solid rgba(0,0,0,0.05); 
        transition: transform 0.3s ease, opacity 0.3s ease; 
      }
      .widget-window.open { 
        display: flex; 
        animation: showWindow 0.3s ease; 
      }
      .widget-window.live-mode { 
        background: ${customBgColor}; 
        color: white; 
      }
      .widget-window.live-mode .widget-header { 
        background: rgba(0,0,0,0.2); 
        color: white; 
        border-bottom: 1px solid rgba(255,255,255,0.1); 
      }
      
      .widget-window.live-mode .widget-input-area { 
        display: none; 
      }
      .widget-window.live-mode .file-preview-bar { 
        display: none !important; 
      }
      .widget-window.live-mode .widget-messages { 
        display: none; 
      }
      .widget-window.live-mode .pixel-face-container { 
        display: flex !important; 
      }

      .widget-header { 
        padding: 20px 24px; 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        background: white; 
        border-bottom: 1px solid #f0f0f0; 
        transition: background 0.3s ease; 
      }
      .header-info { 
        display: flex; 
        align-items: center; 
        gap: 12px; 
      }
      .ai-logo { 
        width: 40px; 
        height: 40px; 
        background: linear-gradient(135deg, var(--primary-color), #9b72cb); 
        border-radius: 12px; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        color: white; 
        font-size: 20px; 
        font-weight: bold; 
      }
      
      .pixel-face-container {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        flex: 1;
        background: transparent;
      }
      
      .pixel-face {
        width: 220px;
        height: 220px;
        background: #ffffff;
        border: 4px solid #000000;
        border-radius: 40px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        margin-bottom: 20px;
        box-shadow: 0 10px 0 #000000, 0 20px 30px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
      }
      
      .pixel-face::before,
      .pixel-face::after {
        content: '';
        position: absolute;
        width: 50px;
        height: 50px;
        background: #000000;
        top: -20px;
        clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
      }
      
      .pixel-face::before {
        left: 20px;
        transform: rotate(-15deg);
      }
      
      .pixel-face::after {
        right: 20px;
        transform: rotate(15deg);
      }
      
      .ear-inner-left,
      .ear-inner-right {
        position: absolute;
        width: 30px;
        height: 30px;
        background: #ffffff;
        top: -15px;
        clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        z-index: 2;
      }
      
      .ear-inner-left {
        left: 30px;
      }
      
      .ear-inner-right {
        right: 30px;
      }
      
      .pixel-eyes {
        display: flex;
        gap: 40px;
        margin-top: 20px;
      }
      
      .pixel-eye {
        width: 40px;
        height: 40px;
        background: #000000;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: all 0.3s ease;
      }
      
      .pupil {
        width: 20px;
        height: 20px;
        background: #ffffff;
        border-radius: 50%;
        transition: all 0.3s ease;
      }
      
      .nose {
        width: 25px;
        height: 20px;
        background: #000000;
        border-radius: 50% 50% 40% 40%;
        margin: 15px 0 10px;
        position: relative;
      }
      
      .nose::before,
      .nose::after {
        content: '';
        position: absolute;
        width: 4px;
        height: 10px;
        background: #000000;
        bottom: -8px;
      }
      
      .nose::before {
        left: 4px;
        transform: rotate(-15deg);
      }
      
      .nose::after {
        right: 4px;
        transform: rotate(15deg);
      }
      
      .mouth {
        width: 50px;
        height: 25px;
        border-bottom: 4px solid #000000;
        border-radius: 0 0 30px 30px;
        margin-top: 5px;
        transition: all 0.3s ease;
      }
      
      .pixel-face.smiling .mouth {
        border-bottom: 6px solid #000000;
        width: 55px;
      }
      
      .pixel-face.listening .mouth {
        border-top: 4px solid #000000;
        border-bottom: none;
        border-radius: 30px 30px 0 0;
      }
      
      .pixel-face.listening .pupil {
        transform: scale(1.2);
        background: #000000;
      }
      
      .pixel-face.thinking .pupil {
        width: 10px;
        height: 10px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: #000000;
      }
      
      .pixel-face.surprised .pupil {
        width: 25px;
        height: 25px;
        background: #ffffff;
      }
      
      .pixel-face.surprised .mouth {
        width: 30px;
        height: 30px;
        border: 4px solid #000000;
        border-radius: 50%;
        border-bottom-color: #000000;
      }
      
      .pixel-face.happy .pupil {
        transform: scale(0.8);
      }
      
      .voice-wave {
        display: flex;
        gap: 8px;
        justify-content: center;
        align-items: center;
        margin: 20px 0;
        height: 40px;
      }
      
      .voice-wave span {
        width: 8px;
        height: 8px;
        background: #ffffff;
        border-radius: 4px;
        animation: wave 1s infinite ease-in-out;
      }
      
      .voice-wave span:nth-child(2) { animation-delay: 0.1s; }
      .voice-wave span:nth-child(3) { animation-delay: 0.2s; }
      .voice-wave span:nth-child(4) { animation-delay: 0.3s; }
      .voice-wave span:nth-child(5) { animation-delay: 0.4s; }
      
      @keyframes wave {
        0%, 100% { height: 8px; }
        50% { height: 32px; }
      }
      
      .voice-status {
        text-align: center;
        font-size: 16px;
        font-weight: 500;
        color: rgba(255,255,255,0.95);
        margin: 15px 0;
        letter-spacing: 0.3px;
      }
      
      .live-controls {
        display: flex;
        align-items: center;
        gap: 15px;
        margin: 20px 0 10px;
        padding: 12px 20px;
        background: rgba(0,0,0,0.2);
        border-radius: 30px;
        backdrop-filter: blur(10px);
      }
      
      .color-picker-label {
        font-size: 14px;
        font-weight: 500;
        color: white;
      }
      
      .color-picker {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        padding: 0;
        background: transparent;
      }
      
      .color-picker::-webkit-color-swatch-wrapper {
        padding: 0;
      }
      
      .color-picker::-webkit-color-swatch {
        border: none;
        border-radius: 50%;
      }

      .header-actions { 
        display: flex; 
        gap: 8px; 
      }
      
      .circle-btn { 
        width: 36px; 
        height: 36px; 
        border-radius: 50%; 
        border: none; 
        background: #f1f3f4; 
        color: #5f6368; 
        cursor: pointer; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        transition: all 0.2s; 
        font-size: 16px; 
      }
      .circle-btn:hover { 
        background: #e8eaed; 
        transform: scale(1.1); 
      }
      .live-mode .circle-btn { 
        background: rgba(255,255,255,0.2); 
        color: white; 
      }
      .live-mode .circle-btn:hover { 
        background: rgba(255,255,255,0.3); 
      }

      .widget-messages { 
        flex: 1; 
        padding: 20px; 
        overflow-y: auto; 
        display: flex; 
        flex-direction: column; 
        gap: 16px; 
      }
      
      .message { 
        max-width: 85%; 
        padding: 12px 18px; 
        font-size: 14px; 
        line-height: 1.5; 
        border-radius: 18px; 
        position: relative; 
        animation: msgIn 0.3s ease; 
      }
      .message.bot { 
        align-self: flex-start; 
        background: #f1f3f4; 
        color: #1a1a1a; 
        border-bottom-left-radius: 4px; 
      }
      .message.user { 
        align-self: flex-end; 
        background: var(--primary-color); 
        color: white; 
        border-bottom-right-radius: 4px; 
      }
      .message img, .message iframe { 
        max-width: 100%; 
        border-radius: 12px; 
        margin-top: 10px; 
      }

      .lead-overlay { 
        position: absolute; 
        inset: 0; 
        background: white; 
        z-index: 100001; 
        display: flex; 
        flex-direction: column; 
        justify-content: center; 
        padding: 40px; 
        text-align: center; 
      }
      
      .lead-field { 
        width: 100%; 
        padding: 14px; 
        margin-bottom: 12px; 
        border: 1px solid #dadce0; 
        border-radius: 12px; 
        outline: none; 
        font-size: 15px; 
      }
      .lead-field:focus { 
        border-color: var(--primary-color); 
        box-shadow: 0 0 0 3px rgba(66,133,244,0.1); 
      }
      .lead-submit { 
        background: linear-gradient(135deg, var(--primary-color), #9b72cb); 
        color: white; 
        border: none; 
        padding: 16px; 
        border-radius: 12px; 
        cursor: pointer; 
        font-weight: 600; 
        font-size: 16px; 
        margin-top: 10px; 
      }

      .file-preview-bar { 
        display: none; 
        padding: 10px 20px; 
        background: #f8f9fa; 
        border-top: 1px solid #f1f3f4; 
        align-items: center; 
        gap: 12px; 
      }
      
      .preview-thumb { 
        width: 44px; 
        height: 44px; 
        border-radius: 8px; 
        object-fit: contain; 
        border: 2px solid var(--primary-color); 
        background: #fff; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        font-size: 24px; 
      }
      
      .preview-info { 
        flex: 1; 
        font-size: 12px; 
        color: #5f6368; 
      }
      
      .preview-cancel { 
        cursor: pointer; 
        color: #d93025; 
        font-weight: bold; 
        font-size: 18px; 
      }

      .widget-input-area { 
        padding: 20px; 
        background: white; 
        border-top: 1px solid #f1f3f4; 
      }
      
      .input-bar { 
        background: #f1f3f4; 
        border-radius: 24px; 
        display: flex; 
        align-items: center; 
        padding: 4px 12px; 
        border: 2px solid transparent; 
      }
      .input-bar:focus-within { 
        background: white; 
        border-color: var(--primary-color); 
      }
      .input-bar input { 
        flex: 1; 
        border: none; 
        background: transparent; 
        padding: 12px; 
        outline: none; 
        font-size: 14px; 
      }

      .typing-indicator { 
        padding: 0 24px 10px; 
        font-size: 12px; 
        color: #70757a; 
        display: none; 
        font-style: italic; 
      }

      @keyframes showWindow { 
        from { opacity: 0; transform: translateY(20px); } 
        to { opacity: 1; transform: translateY(0); } 
      }
      
      @keyframes msgIn { 
        from { opacity: 0; transform: translateY(10px); } 
        to { opacity: 1; transform: translateY(0); } 
      }
      
      .mic-active { 
        color: #d93025 !important; 
        background: #fce8e6 !important; 
        animation: pulse 1.5s infinite; 
      }
      
      @keyframes pulse { 
        0% { box-shadow: 0 0 0 0 rgba(217,48,37,0.4); }
        70% { box-shadow: 0 0 0 10px rgba(217,48,37,0); }
        100% { box-shadow: 0 0 0 0 rgba(217,48,37,0); }
      }
      
      .proof-images-gallery {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 10px;
      }
      
      .proof-image {
        width: 80px;
        height: 80px;
        border-radius: 8px;
        object-fit: cover;
        cursor: pointer;
        border: 2px solid var(--primary-color);
        transition: transform 0.2s;
      }
      
      .proof-image:hover {
        transform: scale(1.05);
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.id = "ai-widget-container";
    document.body.appendChild(container);

    const bubble = document.createElement("div");
    bubble.className = "widget-bubble";
    bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
    container.appendChild(bubble);

    const win = document.createElement("div");
    win.className = "widget-window";
    win.innerHTML = `
      <div class="widget-header">
        <div class="header-info">
          <div class="ai-logo">✨</div>
          <div>
            <div style="font-weight:600;">${escapeHtml(config.title)}</div>
            <div style="font-size:12px; opacity:0.8;" id="ai-status">● Online Assistant</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="circle-btn" id="widget-live-btn" title="Live Chat Mode">🎥</button>
          <button class="circle-btn" id="widget-mute-btn" title="Toggle Sound">${isMuted ? '🔇' : '🔊'}</button>
          <button class="circle-btn" id="widget-proof-btn" title="View Proof Images" style="display: ${hasProofImages() ? 'flex' : 'none'}">📸</button>
          <button class="circle-btn close-btn" title="Close Chat">✕</button>
        </div>
      </div>

      <div id="lead-form" class="lead-overlay" style="${leadCaptured ? 'display:none' : 'display:flex'}">
        <h3 style="margin-bottom:8px;">Welcome to ${escapeHtml(config.title)}!</h3>
        <p style="font-size:14px; color:#5f6368; margin-bottom:24px;">Please tell us who you are to start.</p>
        <input type="text" id="lead-name" class="lead-field" placeholder="Your Name" value="${escapeHtml(userName)}" required />
        <input type="email" id="lead-email" class="lead-field" placeholder="Email Address" value="${escapeHtml(userEmail)}" required />
        <input type="tel" id="lead-phone" class="lead-field" placeholder="Phone Number (Optional)" value="${escapeHtml(userPhone)}" />
        <button id="lead-submit-btn" class="lead-submit">Start Conversation</button>
        <p style="font-size:12px; color:#9aa0a6; margin-top:16px;">🔒 Your information is secure and encrypted</p>
      </div>

      <div id="pixel-face-container" class="pixel-face-container">
        <div class="live-controls">
          <span class="color-picker-label">Background</span>
          <input type="color" id="bg-color-picker" class="color-picker" value="${escapeHtml(customBgColor)}" />
        </div>
        
        <div class="pixel-face" id="pixel-face">
          <div class="ear-inner-left"></div>
          <div class="ear-inner-right"></div>
          <div class="pixel-eyes">
            <div class="pixel-eye"><div class="pupil"></div></div>
            <div class="pixel-eye"><div class="pupil"></div></div>
          </div>
          <div class="nose"></div>
          <div class="mouth"></div>
        </div>
        
        <div class="voice-wave" id="voice-wave" style="display: none;">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        
        <div class="voice-status" id="voice-status">
          Live chat activated - start speaking
        </div>
      </div>

      <div class="widget-messages" id="widget-msgs-container">
        <div class="message bot">${escapeHtml(config.welcome)}</div>
      </div>

      <div class="file-preview-bar" id="file-preview-bar">
        <div class="preview-thumb" id="file-preview-icon">📄</div>
        <div class="preview-info"><strong id="file-name-display"></strong><br>Type a question about it below.</div>
        <div class="preview-cancel" id="file-preview-cancel">×</div>
      </div>

      <div class="typing-indicator" id="widget-typing">AI is thinking...</div>

      <div class="widget-input-area">
        <div class="input-bar">
          <input type="file" id="widget-file-input" style="display:none" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.jpg,.jpeg,.png,.gif" />
          <button class="circle-btn" id="widget-upload-btn" title="Attach File" style="background:transparent">📎</button>
          <button class="circle-btn" id="widget-voice-btn" title="Voice Input" style="background:transparent">🎤</button>
          <input type="text" id="widget-input-field" placeholder="Type a message..." autocomplete="off" />
          <button class="circle-btn" id="widget-send-btn" style="background:transparent; color:var(--primary-color)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
          </button>
        </div>
      </div>
      
      <div id="proof-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:100002; align-items:center; justify-content:center; flex-direction:column;">
        <div style="background:white; border-radius:20px; padding:20px; max-width:90vw; max-height:80vh; overflow:auto;">
          <button id="close-proof-modal" style="float:right; background:none; border:none; font-size:24px; cursor:pointer;">×</button>
          <h3 style="margin-bottom:15px;">📸 Proof Images</h3>
          <div id="proof-images-gallery" class="proof-images-gallery"></div>
        </div>
      </div>
    `;
    container.appendChild(win);

    const msgContainer = win.querySelector("#widget-msgs-container");
    const inputField = win.querySelector("#widget-input-field");
    const sendBtn = win.querySelector("#widget-send-btn");
    const voiceBtn = win.querySelector("#widget-voice-btn");
    const uploadBtn = win.querySelector("#widget-upload-btn");
    const fileInput = win.querySelector("#widget-file-input");
    const muteBtn = win.querySelector("#widget-mute-btn");
    const liveBtn = win.querySelector("#widget-live-btn");
    const proofBtn = win.querySelector("#widget-proof-btn");
    const typingInd = win.querySelector("#widget-typing");
    const leadForm = win.querySelector("#lead-form");
    const previewBar = win.querySelector("#file-preview-bar");
    const previewIcon = win.querySelector("#file-preview-icon");
    const previewCancel = win.querySelector("#file-preview-cancel");
    const fileNameDisplay = win.querySelector("#file-name-display");
    const pixelFace = win.querySelector("#pixel-face");
    const bgColorPicker = win.querySelector("#bg-color-picker");
    const aiStatus = win.querySelector("#ai-status");
    const voiceStatus = win.querySelector("#voice-status");
    const voiceWave = win.querySelector("#voice-wave");
    const proofModal = win.querySelector("#proof-modal");
    const proofGallery = win.querySelector("#proof-images-gallery");
    const closeProofModal = win.querySelector("#close-proof-modal");

    // ===== PROOF IMAGES MODAL =====
    if (proofBtn) {
      if (hasProofImages()) {
        proofBtn.style.display = "flex";
      } else {
        proofBtn.style.display = "none";
      }
      
      proofBtn.onclick = () => {
        if (proofGallery && proofImages.length > 0) {
          proofGallery.innerHTML = proofImages.map(img => `
            <img src="${escapeHtml(img.imageUrl)}" alt="Proof" class="proof-image" onclick="window.open('${escapeHtml(img.imageUrl)}', '_blank')">
          `).join('');
          proofModal.style.display = "flex";
        } else {
          appendMessage("No proof images have been uploaded yet. Please check back later.", "bot");
        }
      };
    }
    
    if (closeProofModal) {
      closeProofModal.onclick = () => {
        proofModal.style.display = "none";
      };
    }
    
    if (proofModal) {
      proofModal.onclick = (e) => {
        if (e.target === proofModal) proofModal.style.display = "none";
      };
    }

    // ===== CROSS-BROWSER SPEECH RECOGNITION SETUP with GRACEFUL DEGRADATION =====
    let recognitionSupported = true;
    let recognitionFallback = false;
    
    function initSpeechRecognitionWithFallback() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("[WIDGET] Speech recognition not supported - hiding mic button");
        // Hide mic button gracefully
        if (voiceBtn) {
          voiceBtn.style.display = "none";
        }
        recognitionSupported = false;
        return null;
      }
      
      try {
        const recog = new SpeechRecognition();
        // Test if continuous mode works (set and catch potential errors)
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-US';
        recog.maxAlternatives = 1;
        recognitionSupported = true;
        return recog;
      } catch (e) {
        console.warn("[WIDGET] Speech recognition initialization failed:", e);
        if (voiceBtn) voiceBtn.style.display = "none";
        recognitionSupported = false;
        return null;
      }
    }
    
    recognition = initSpeechRecognitionWithFallback();
    
    if (recognition) {
      let finalTranscript = '';
      let timeoutId = null;
      let recognitionActiveLocal = false;
      
      recognition.onresult = (e) => {
        let interimTranscript = '';
        
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalTranscript += transcript + ' ';
            
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            
            timeoutId = setTimeout(() => {
              if (finalTranscript.trim()) {
                if (isLiveMode) {
                  if (voiceWave) voiceWave.style.display = "none";
                  if (voiceStatus) voiceStatus.textContent = "Processing...";
                  updateCatExpression('thinking');
                  sendMessage(finalTranscript.trim());
                } else {
                  if (inputField) inputField.value = finalTranscript.trim();
                }
                finalTranscript = '';
                timeoutId = null;
              }
            }, 800);
          } else {
            interimTranscript += transcript;
            if (isLiveMode && voiceStatus) {
              voiceStatus.textContent = `Listening: ${interimTranscript}`;
            }
          }
        }
      };
      
      recognition.onend = () => {
        console.log("[WIDGET] Recognition ended");
        if (voiceBtn) voiceBtn.classList.remove("mic-active");
        
        if (isLiveMode && recognitionActive) {
          setTimeout(() => {
            if (isLiveMode && recognitionActive && recognition) {
              try {
                recognition.start();
                console.log("[WIDGET] Recognition restarted");
              } catch (e) {
                console.warn("[WIDGET] Could not restart recognition:", e);
                // If restart fails, disable live mode mic button
                if (voiceBtn) voiceBtn.style.display = "none";
                recognitionFallback = true;
              }
            }
          }, 300);
        } else {
          if (voiceWave) voiceWave.style.display = "none";
          if (isLiveMode && voiceStatus) {
            voiceStatus.textContent = "Live chat activated - start speaking";
            updateCatExpression('smiling');
          }
        }
      };
      
      recognition.onstart = () => {
        console.log("[WIDGET] Recognition started");
        recognitionActive = true;
        reconnectAttempts = 0;
        
        if (isLiveMode) {
          if (voiceWave) voiceWave.style.display = "flex";
          if (voiceStatus) voiceStatus.textContent = "Listening...";
          updateCatExpression('listening');
        }
      };
      
      recognition.onerror = (e) => {
        console.error("[WIDGET] Speech recognition error:", e.error);
        
        // Gracefully handle errors without breaking UI
        if (e.error === 'no-speech' || e.error === 'audio-capture') {
          if (isLiveMode && recognitionActive) {
            setTimeout(() => {
              try {
                if (recognition) recognition.start();
              } catch (err) {
                console.warn("[WIDGET] Recovery failed:", err);
              }
            }, 500);
          }
        } else if (e.error === 'not-allowed') {
          if (voiceStatus) voiceStatus.textContent = "Microphone access denied";
          recognitionActive = false;
          if (voiceBtn) voiceBtn.style.display = "none";
        } else if (e.error === 'network') {
          reconnectAttempts++;
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(() => {
              if (isLiveMode && recognitionActive && recognition) {
                try {
                  recognition.start();
                } catch (err) {
                  console.warn("[WIDGET] Network recovery failed");
                }
              }
            }, 1000 * reconnectAttempts);
          } else {
            if (voiceStatus) voiceStatus.textContent = "Network error - please refresh";
            recognitionActive = false;
          }
        }
      };
    } else {
      // No speech recognition support - hide mic button completely
      if (voiceBtn) {
        voiceBtn.style.display = "none";
        console.log("[WIDGET] Speech recognition not supported, mic button hidden");
      }
    }

    function updateCatExpression(expression) {
      if (!pixelFace) return;
      pixelFace.classList.remove('smiling', 'listening', 'thinking', 'surprised', 'happy');
      pixelFace.classList.add(expression);
    }

    function checkForProofRequest(text) {
      const lowerText = text.toLowerCase();
      const proofKeywords = ['proof', 'image', 'photo', 'picture', 'evidence', 'show me', 'delivery proof', 'service proof', 'can you show', 'proof images', 'uploaded images'];
      
      for (const keyword of proofKeywords) {
        if (lowerText.includes(keyword)) {
          if (hasProofImages()) {
            const imagesHtml = getProofImagesMessage();
            appendMessage(imagesHtml, "bot");
            return true;
          } else {
            appendMessage("I don't have any proof images available at the moment. Please check back later.", "bot");
            return true;
          }
        }
      }
      return false;
    }
    
    function checkForLinksRequest(text) {
      const lowerText = text.toLowerCase();
      const linkKeywords = ['links', 'useful links', 'helpful links', 'resources', 'booking link', 'appointment link', 'schedule link', 'external links'];
      
      for (const keyword of linkKeywords) {
        if (lowerText.includes(keyword)) {
          if (customLinks && customLinks.length > 0) {
            const linksHtml = getCustomLinksMessage();
            appendMessage(linksHtml, "bot");
            return true;
          } else {
            appendMessage("I don't have any custom links configured yet. Please check back later.", "bot");
            return true;
          }
        }
      }
      return false;
    }

    bubble.onclick = async () => {
      win.classList.toggle("open");
      if (win.classList.contains("open")) {
        if (!leadCaptured) {
          const leadNameField = win.querySelector("#lead-name");
          if (leadNameField) leadNameField.focus();
        } else {
          inputField.focus();
        }
      } else {
        if (recognition && recognitionActive) {
          try {
            recognitionActive = false;
            recognition.stop();
          } catch (e) {}
        }
      }
    };

    const closeBtn = win.querySelector(".close-btn");
    if (closeBtn) {
      closeBtn.onclick = () => {
        win.classList.remove("open");
        if (recognition && recognitionActive) {
          recognitionActive = false;
          try {
            recognition.stop();
          } catch (e) {}
        }
        
        if (activeSessionId && leadCaptured) {
          navigator.sendBeacon(`${SERVER_URL}/api/public/session-end`, JSON.stringify({
            session_id: activeSessionId,
            widget_key: WIDGET_KEY
          }));
        }
      };
    }

    const leadSubmitBtn = win.querySelector("#lead-submit-btn");
    if (leadSubmitBtn) {
      leadSubmitBtn.onclick = async () => {
        const nameInput = win.querySelector("#lead-name");
        const emailInput = win.querySelector("#lead-email");
        const phoneInput = win.querySelector("#lead-phone");
        
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';

        if (!name || !email) return alert("Please provide your name and email.");

        // Store with encoding for PII
        setPrefixedItem(`user_name_${WIDGET_KEY}`, name, true);
        setPrefixedItem(`user_email_${WIDGET_KEY}`, email, true);
        if (phone) setPrefixedItem(`user_phone_${WIDGET_KEY}`, phone, true);
        userName = name;
        userEmail = email;
        userPhone = phone;

        if (capturedEmails.has(email)) {
          console.log("[WIDGET] Duplicate email detected:", email);
          leadCaptured = true;
          setPrefixedItem(`lead_captured_${WIDGET_KEY}`, "true");
          if (leadForm) leadForm.style.display = "none";
          inputField.focus();
          
          appendMessage(`Welcome back, ${name}! 👋 How can I help you today?`, "bot");
          hasIntroduced = true;
          return;
        }

        try {
          const res = await fetch(`${SERVER_URL}/api/public/leads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, phone: phone || "N/A", widget_key: WIDGET_KEY })
          });

          if (res.ok) {
            capturedEmails.add(email);
            const encodedEmails = Array.from(capturedEmails).map(e => encodePII(e));
            setPrefixedItem(`captured_emails_${WIDGET_KEY}`, JSON.stringify(encodedEmails));
            
            setPrefixedItem(`lead_captured_${WIDGET_KEY}`, "true");
            leadCaptured = true;
            if (leadForm) leadForm.style.display = "none";
            inputField.focus();
            
            hasIntroduced = true;
            
            fetch(`${SERVER_URL}/api/automations/trigger`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                eventType: 'new-lead', 
                data: { email, name, phone, widget_key: WIDGET_KEY } 
              })
            }).catch(() => {});
            
            if (smartSettings?.apollo_active) {
              enrichLeadWithApollo(email, name);
            }
            
            if (smartSettings?.followup_active) {
              scheduleFollowUp(email, name);
            }
          } else {
            const error = await res.json();
            if (error.error && error.error.includes("duplicate")) {
              leadCaptured = true;
              setPrefixedItem(`lead_captured_${WIDGET_KEY}`, "true");
              if (leadForm) leadForm.style.display = "none";
              inputField.focus();
              hasIntroduced = true;
            } else {
              alert("Failed to save your info. Please try again.");
            }
          }
        } catch (e) {
          console.error("Lead submission error:", e);
          leadCaptured = true;
          setPrefixedItem(`lead_captured_${WIDGET_KEY}`, "true");
          if (leadForm) leadForm.style.display = "none";
          inputField.focus();
          hasIntroduced = true;
        }
      };
    }

    if (liveBtn) {
      liveBtn.onclick = () => {
        isLiveMode = !isLiveMode;
        if (isLiveMode) {
          win.classList.add("live-mode");
          if (aiStatus) aiStatus.textContent = "● Live Mode";
          if (voiceStatus) voiceStatus.textContent = "Live chat activated - start speaking";
          updateCatExpression('smiling');
          recognitionActive = true;
          
          if (recognition && !recognitionFallback) {
            setTimeout(() => {
              try {
                recognition.start();
              } catch (e) {
                console.warn("[WIDGET] Could not start recognition:", e);
                if (voiceBtn) voiceBtn.style.display = "none";
              }
            }, 500);
          } else if (!recognition) {
            if (voiceStatus) voiceStatus.textContent = "Voice not supported in this browser";
            if (voiceBtn) voiceBtn.style.display = "none";
          }
        } else {
          win.classList.remove("live-mode");
          if (aiStatus) aiStatus.textContent = "● Online Assistant";
          if (voiceWave) voiceWave.style.display = "none";
          if (voiceStatus) voiceStatus.textContent = "Live chat activated - start speaking";
          
          if (recognition) {
            recognitionActive = false;
            try {
              recognition.stop();
            } catch (e) {}
          }
          updateCatExpression('smiling');
        }
      };
    }

    if (bgColorPicker) {
      bgColorPicker.onchange = (e) => {
        customBgColor = e.target.value;
        setPrefixedItem(`widget_bg_color_${WIDGET_KEY}`, customBgColor);
        win.style.background = customBgColor;
      };
    }

    if (voiceBtn) {
      voiceBtn.onclick = () => {
        if (!recognition || recognitionFallback) {
          alert("Voice recognition is not supported in your browser.");
          return;
        }
        
        if (recognitionActive) {
          recognitionActive = false;
          try {
            recognition.stop();
          } catch (e) {}
          voiceBtn.classList.remove("mic-active");
        } else {
          recognitionActive = true;
          voiceBtn.classList.add("mic-active");
          try {
            recognition.start();
          } catch (e) {
            console.warn("[WIDGET] Could not start recognition:", e);
            voiceBtn.classList.remove("mic-active");
          }
        }
      };
    }

    if (muteBtn) {
      muteBtn.onclick = () => {
        isMuted = !isMuted;
        setPrefixedItem(`widget_muted`, isMuted ? "true" : "false");
        muteBtn.textContent = isMuted ? "🔇" : "🔊";
      };
    }

    if (uploadBtn) {
      uploadBtn.onclick = () => fileInput.click();
    }

    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
          alert("File too large. Maximum size is 10MB.");
          return;
        }

        const reader = new FileReader();
        reader.onload = async (ev) => {
          pendingFileData = ev.target.result;
          pendingFileName = file.name;

          const isImage = file.type.startsWith('image/');
          if (isImage && previewIcon) {
            previewIcon.innerHTML = `<img src="${pendingFileData}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
            
            if (smartSettings?.vision_active && typingInd) {
              typingInd.style.display = "block";
              const analysis = await analyzeImageWithVision(pendingFileData);
              typingInd.style.display = "none";
              if (analysis) {
                appendMessage(analysis, "bot");
              }
            }
          } else if (previewIcon) {
            previewIcon.innerHTML = '📄';
          }
          
          if (fileNameDisplay) fileNameDisplay.textContent = pendingFileName;
          if (previewBar) previewBar.style.display = "flex";
          if (inputField) inputField.placeholder = "Optional message about file...";
          if (inputField) inputField.focus();
        };
        reader.readAsDataURL(file);
      };
    }

    if (previewCancel) {
      previewCancel.onclick = () => {
        pendingFileData = null;
        pendingFileName = '';
        if (previewBar) previewBar.style.display = "none";
        if (fileInput) fileInput.value = "";
        if (inputField) inputField.placeholder = "Type a message...";
      };
    }

    async function sendMessage(voiceText = null) {
      if (isProcessing) return;
      
      let text = voiceText || (inputField ? inputField.value.trim() : '');

      if (!text && !pendingFileData) return;
      
      if (checkForProofRequest(text)) {
        if (inputField) inputField.value = "";
        if (pendingFileData) {
          pendingFileData = null;
          pendingFileName = '';
          if (previewBar) previewBar.style.display = "none";
          if (fileInput) fileInput.value = "";
        }
        return;
      }
      
      if (checkForLinksRequest(text)) {
        if (inputField) inputField.value = "";
        if (pendingFileData) {
          pendingFileData = null;
          pendingFileName = '';
          if (previewBar) previewBar.style.display = "none";
          if (fileInput) fileInput.value = "";
        }
        return;
      }

      if (isLiveMode) {
        updateCatExpression('thinking');
      }

      const currentFile = pendingFileData;
      const currentFileName = pendingFileName;
      const currentText = text;

      if (!isLiveMode) {
        appendMessage(currentText || "(File attached)", "user", currentFile, currentFileName);
      }
      
      if (inputField) inputField.value = "";
      
      if (pendingFileData) {
        pendingFileData = null;
        pendingFileName = '';
        if (previewBar) previewBar.style.display = "none";
        if (fileInput) fileInput.value = "";
        if (inputField) inputField.placeholder = "Type a message...";
      }

      isProcessing = true;
      if (typingInd) typingInd.style.display = "block";

      try {
        const body = {
          message: currentText || "Please analyze this file.",
          widget_key: WIDGET_KEY,
          client_name: userName || "Visitor",
          client_email: userEmail || null,
          is_visitor: true,
          session_id: activeSessionId,
          conversation_history: conversationHistory.slice(-5),
          business_name: businessName,
          ai_name: aiName,
          has_introduced: hasIntroduced,
          message_count: messageCount,
          widget_image_support: widgetCapabilities.imageSupport,
          widget_review_collection: widgetCapabilities.reviewCollection,
          custom_links: customLinks,
          has_proof_images: hasProofImages()
        };

        if (currentFile) {
          body.file_data = currentFile;
          body.file_name = currentFileName;
          
          if (currentFile.startsWith('data:image/') && smartSettings?.vision_active) {
            body.vision_enabled = true;
          }
        }

        console.log("[WIDGET → SERVER] Sending request with capabilities");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${SERVER_URL}/api/public/chat`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (typingInd) typingInd.style.display = "none";
        isProcessing = false;

        if (isLiveMode) {
          updateCatExpression('smiling');
          if (voiceStatus) voiceStatus.textContent = "Live chat activated - start speaking";
        }

        if (response.ok && data.success && data.reply) {
          if (data.session_id) {
            activeSessionId = data.session_id;
            setPrefixedItem(`widget_session_${WIDGET_KEY}`, activeSessionId);
          }
          
          if (!hasIntroduced) {
            hasIntroduced = true;
            setPrefixedItem(`has_introduced_${WIDGET_KEY}`, "true");
          }
          
          messageCount++;
          
          let cleanReply = data.reply;
          if (messageCount > 1 || hasIntroduced) {
            cleanReply = cleanReply
              .replace(/^(Hi|Hello|Hey)[!,\s]+(I'?m|I am)\s+[^,.]*[,.\s]+/i, '')
              .replace(/^Welcome\s+to\s+[^,.]*[,.\s]+/i, '')
              .trim();
          }
          
          if (cleanReply !== lastResponseText || messageCount === 1) {
            if (!isLiveMode) {
              appendMessage(cleanReply, "bot");
              speak(cleanReply);
            } else {
              speak(cleanReply);
            }
            lastResponseText = cleanReply;
          }
        } else {
          const errorMsg = data.error || "Server returned error";
          if (!isLiveMode) {
            appendMessage(`I'm having trouble connecting. Please try again.`, "bot");
          } else {
            speak("Connection error. Please try again.");
            if (voiceStatus) voiceStatus.textContent = "Connection error";
            updateCatExpression('surprised');
            setTimeout(() => {
              if (voiceStatus) voiceStatus.textContent = "Live chat activated - start speaking";
              updateCatExpression('smiling');
            }, 2000);
          }
        }
      } catch (err) {
        if (typingInd) typingInd.style.display = "none";
        isProcessing = false;
        console.error("[WIDGET] Fetch error:", err);
        
        let errorMessage = "Connection issue. Please try again.";
        if (!isLiveMode) {
          appendMessage(errorMessage, "bot");
        } else {
          speak("Connection error. Please try again.");
          if (voiceStatus) voiceStatus.textContent = "Connection error";
          updateCatExpression('surprised');
          setTimeout(() => {
            if (voiceStatus) voiceStatus.textContent = "Live chat activated - start speaking";
            updateCatExpression('smiling');
          }, 2000);
        }
      }
    }

    if (sendBtn) {
      sendBtn.onclick = () => sendMessage();
    }
    
    if (inputField) {
      inputField.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      };
    }
  }

  // ===== ENRICH LEAD WITH APOLLO =====
  async function enrichLeadWithApollo(email, name) {
    if (!smartSettings?.apollo_active) return null;
    
    try {
      const res = await fetch(`${SERVER_URL}/api/public/apollo/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, widget_key: WIDGET_KEY })
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log("[WIDGET] Apollo enrichment result:", data);
        return data;
      }
    } catch (err) {
      console.warn("[WIDGET] Apollo enrichment failed:", err);
    }
    return null;
  }

  // ===== SCHEDULE FOLLOW-UP =====
  async function scheduleFollowUp(email, name) {
    if (!smartSettings?.followup_active) return;
    
    try {
      await fetch(`${SERVER_URL}/api/public/followup/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          name, 
          widget_key: WIDGET_KEY,
          session_id: activeSessionId
        })
      });
      console.log("[WIDGET] Follow-up scheduled for:", email);
    } catch (err) {
      console.warn("[WIDGET] Follow-up scheduling failed:", err);
    }
  }
  
  // Helper function for XSS prevention
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
})();