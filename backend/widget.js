// widget.js - Professional SaaS AI Chat Widget (FULLY FIXED - NO REPETITION)
// Features: Business Identity Integration, Proper Conversation Flow, Professional AI Responses
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

  // ===== STATE MANAGEMENT =====
  let leadCaptured = localStorage.getItem(`ai_lead_captured_${WIDGET_KEY}`) === "true";
  let isMuted = localStorage.getItem(`ai_widget_muted`) === "true";
  let activeSessionId = localStorage.getItem(`ai_widget_session_${WIDGET_KEY}`) || null;
  let smartSettings = {};
  let businessIdentity = {};
  let isLiveMode = false;
  let customBgColor = localStorage.getItem(`ai_widget_bg_color_${WIDGET_KEY}`) || "#1a1a1a";
  let isProcessing = false;
  let pendingFileData = null;
  let pendingFileName = '';
  let userEmail = localStorage.getItem(`ai_user_email_${WIDGET_KEY}`) || '';
  let userName = localStorage.getItem(`ai_user_name_${WIDGET_KEY}`) || '';
  let businessPlan = 'free';
  let businessName = '';
  let aiName = ''; // Store AI's name
  let hasIntroduced = false; // Track if AI has introduced itself
  let recognition = null;
  let recognitionActive = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Track conversation history to prevent repetition
  let conversationHistory = JSON.parse(localStorage.getItem(`ai_conversation_${WIDGET_KEY}`) || '[]');
  let lastResponseText = ''; // Track last response to prevent repetition
  let messageCount = 0; // Track number of messages in this session
  
  // Track captured emails
  let capturedEmails = new Set(JSON.parse(localStorage.getItem(`ai_captured_emails_${WIDGET_KEY}`) || '[]'));

  // ===== FETCH WIDGET CONFIG & BUSINESS IDENTITY =====
  fetch(`${SERVER_URL}/api/public/widget-config/${WIDGET_KEY}`)
    .then(res => res.json())
    .then(async dbConfig => {
      businessPlan = dbConfig.plan || 'free';
      businessName = dbConfig.business_name || marker.getAttribute("data-title") || "our store";
      aiName = dbConfig.ai_name || marker.getAttribute("data-ai-name") || "AI Assistant";
      
      // Store business identity
      businessIdentity = {
        business_type: dbConfig.business_type || 'retail',
        business_description: dbConfig.business_description || 'a modern retail store'
      };
      
      // Store smart settings
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
      
      console.log("[WIDGET] Business Name:", businessName);
      console.log("[WIDGET] Smart Hub settings:", smartSettings);
      
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

  function initWidget(dbConfig) {
    // Set welcome message WITHOUT introduction if lead already captured
    let welcomeMessage;
    if (leadCaptured) {
      welcomeMessage = `How can I help you today?`;
      hasIntroduced = true; // Mark as already introduced
    } else {
      welcomeMessage = dbConfig.welcome_message || marker.dataset.welcome || `Hi! I'm ${aiName}, the AI assistant for ${businessName}. How can I help you today?`;
    }

    const config = {
      key: WIDGET_KEY,
      primaryColor: dbConfig.widget_color || marker.dataset.primaryColor || "#d4af37",
      position: marker.dataset.position || "bottom-right",
      welcome: welcomeMessage,
      title: businessName
    };

    // Professional styles
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
      
      /* Black and White Pixel Face */
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
            <div style="font-weight:600;">${config.title}</div>
            <div style="font-size:12px; opacity:0.8;" id="ai-status">● Online Assistant</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="circle-btn" id="widget-live-btn" title="Live Chat Mode">🎥</button>
          <button class="circle-btn" id="widget-mute-btn" title="Toggle Sound">${isMuted ? '🔇' : '🔊'}</button>
          <button class="circle-btn close-btn" title="Close Chat">✕</button>
        </div>
      </div>

      <div id="lead-form" class="lead-overlay" style="${leadCaptured ? 'display:none' : 'display:flex'}">
        <h3 style="margin-bottom:8px;">Welcome to ${config.title}!</h3>
        <p style="font-size:14px; color:#5f6368; margin-bottom:24px;">Please tell us who you are to start.</p>
        <input type="text" id="lead-name" class="lead-field" placeholder="Your Name" value="${userName}" required />
        <input type="email" id="lead-email" class="lead-field" placeholder="Email Address" value="${userEmail}" required />
        <button id="lead-submit-btn" class="lead-submit">Start Conversation</button>
      </div>

      <div id="pixel-face-container" class="pixel-face-container">
        <div class="live-controls">
          <span class="color-picker-label">Background</span>
          <input type="color" id="bg-color-picker" class="color-picker" value="${customBgColor}" />
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
        <div class="message bot">${config.welcome}</div>
      </div>

      <div class="file-preview-bar" id="file-preview-bar">
        <div class="preview-thumb" id="file-preview-icon">📄</div>
        <div class="preview-info">File attached: <strong id="file-name-display"></strong><br>Type a question about it below.</div>
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

    // ===== SPEECH RECOGNITION SETUP =====
    function initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("[WIDGET] Speech recognition not supported");
        return null;
      }
      
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';
      recog.maxAlternatives = 1;
      
      return recog;
    }
    
    recognition = initSpeechRecognition();
    
    if (recognition) {
      let finalTranscript = '';
      let timeoutId = null;
      
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
                  voiceWave.style.display = "none";
                  voiceStatus.textContent = "Processing...";
                  updateCatExpression('thinking');
                  sendMessage(finalTranscript.trim());
                } else {
                  inputField.value = finalTranscript.trim();
                }
                finalTranscript = '';
                timeoutId = null;
              }
            }, 800);
          } else {
            interimTranscript += transcript;
            if (isLiveMode) {
              voiceStatus.textContent = `Listening: ${interimTranscript}`;
            }
          }
        }
      };
      
      recognition.onend = () => {
        console.log("[WIDGET] Recognition ended");
        voiceBtn.classList.remove("mic-active");
        
        if (isLiveMode && recognitionActive) {
          setTimeout(() => {
            if (isLiveMode && recognitionActive) {
              try {
                recognition.start();
                console.log("[WIDGET] Recognition restarted");
              } catch (e) {
                console.warn("[WIDGET] Could not restart recognition:", e);
              }
            }
          }, 300);
        } else {
          voiceWave.style.display = "none";
          if (isLiveMode) {
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
          voiceWave.style.display = "flex";
          voiceStatus.textContent = "Listening...";
          updateCatExpression('listening');
        }
      };
      
      recognition.onerror = (e) => {
        console.error("[WIDGET] Speech recognition error:", e.error);
        
        if (e.error === 'no-speech' || e.error === 'audio-capture') {
          if (isLiveMode && recognitionActive) {
            setTimeout(() => {
              try {
                recognition.start();
              } catch (err) {}
            }, 500);
          }
        } else if (e.error === 'not-allowed') {
          voiceStatus.textContent = "Microphone access denied";
          recognitionActive = false;
        } else if (e.error === 'network') {
          reconnectAttempts++;
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(() => {
              if (isLiveMode && recognitionActive) {
                try {
                  recognition.start();
                } catch (err) {}
              }
            }, 1000 * reconnectAttempts);
          } else {
            voiceStatus.textContent = "Network error - please refresh";
            recognitionActive = false;
          }
        }
      };
    }

    function updateCatExpression(expression) {
      pixelFace.classList.remove('smiling', 'listening', 'thinking', 'surprised', 'happy');
      pixelFace.classList.add(expression);
    }

    bubble.onclick = async () => {
      win.classList.toggle("open");
      if (win.classList.contains("open")) {
        if (!leadCaptured) {
          win.querySelector("#lead-name").focus();
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

    win.querySelector(".close-btn").onclick = () => {
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

    win.querySelector("#lead-submit-btn").onclick = async () => {
      const name = win.querySelector("#lead-name").value.trim();
      const email = win.querySelector("#lead-email").value.trim().toLowerCase();

      if (!name || !email) return alert("Please provide your name and email.");

      localStorage.setItem(`ai_user_name_${WIDGET_KEY}`, name);
      localStorage.setItem(`ai_user_email_${WIDGET_KEY}`, email);
      userName = name;
      userEmail = email;

      if (capturedEmails.has(email)) {
        console.log("[WIDGET] Duplicate email detected:", email);
        leadCaptured = true;
        localStorage.setItem(`ai_lead_captured_${WIDGET_KEY}`, "true");
        leadForm.style.display = "none";
        inputField.focus();
        
        // Don't introduce again, just welcome back
        appendMessage(`Welcome back, ${name}! 👋 How can I help you today?`, "bot");
        hasIntroduced = true; // Mark as introduced
        return;
      }

      try {
        const res = await fetch(`${SERVER_URL}/api/public/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone: "N/A", widget_key: WIDGET_KEY })
        });

        if (res.ok) {
          capturedEmails.add(email);
          localStorage.setItem(`ai_captured_emails_${WIDGET_KEY}`, JSON.stringify(Array.from(capturedEmails)));
          
          localStorage.setItem(`ai_lead_captured_${WIDGET_KEY}`, "true");
          leadCaptured = true;
          leadForm.style.display = "none";
          inputField.focus();
          
          // Mark as introduced - the welcome message already introduced
          hasIntroduced = true;
          
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
            localStorage.setItem(`ai_lead_captured_${WIDGET_KEY}`, "true");
            leadForm.style.display = "none";
            inputField.focus();
            hasIntroduced = true;
          } else {
            alert("Failed to save your info. Please try again.");
          }
        }
      } catch (e) {
        console.error("Lead submission error:", e);
        alert("Connection issue. Please try again.");
      }
    };

    liveBtn.onclick = () => {
      isLiveMode = !isLiveMode;
      if (isLiveMode) {
        win.classList.add("live-mode");
        aiStatus.textContent = "● Live Mode";
        voiceStatus.textContent = "Live chat activated - start speaking";
        updateCatExpression('smiling');
        recognitionActive = true;
        
        if (recognition) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.warn("[WIDGET] Could not start recognition:", e);
            }
          }, 500);
        }
      } else {
        win.classList.remove("live-mode");
        aiStatus.textContent = "● Online Assistant";
        voiceWave.style.display = "none";
        voiceStatus.textContent = "Live chat activated - start speaking";
        
        if (recognition) {
          recognitionActive = false;
          try {
            recognition.stop();
          } catch (e) {}
        }
        updateCatExpression('smiling');
      }
    };

    bgColorPicker.onchange = (e) => {
      customBgColor = e.target.value;
      localStorage.setItem(`ai_widget_bg_color_${WIDGET_KEY}`, customBgColor);
      win.style.background = customBgColor;
    };

    voiceBtn.onclick = () => {
      if (!recognition) {
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
        }
      }
    };

    muteBtn.onclick = () => {
      isMuted = !isMuted;
      localStorage.setItem(`ai_widget_muted`, isMuted);
      muteBtn.textContent = isMuted ? "🔇" : "🔊";
    };

    uploadBtn.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        alert("File too large. Maximum size is 10MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingFileData = ev.target.result;
        pendingFileName = file.name;

        const isImage = file.type.startsWith('image/');
        if (isImage) {
          previewIcon.innerHTML = `<img src="${pendingFileData}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
        } else {
          previewIcon.innerHTML = '📄';
        }
        
        fileNameDisplay.textContent = pendingFileName;
        previewBar.style.display = "flex";
        inputField.placeholder = `Optional message about file...`;
        inputField.focus();
      };
      reader.readAsDataURL(file);
    };

    previewCancel.onclick = () => {
      pendingFileData = null;
      pendingFileName = '';
      previewBar.style.display = "none";
      fileInput.value = "";
      inputField.placeholder = "Type a message...";
    };

    function appendMessage(text, role, fileData = null, fileName = '') {
      if (isLiveMode) return;

      const div = document.createElement("div");
      div.className = `message ${role}`;

      let linkedText = text
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:inherit;text-decoration:underline;">$1</a>')
        .replace(/(^|\s)(www\.[^\s]+)/g, (m, s, url) => `${s}<a href="https://${url}" target="_blank" style="color:inherit;text-decoration:underline;">${url}</a>`);

      // Add booking link if applicable
      const bookingUrl = smartSettings?.booking_url || '';
      if (bookingUrl && smartSettings?.booking_active) {
        const bookingKeywords = /book|appointment|schedule|meeting|calendly|reserve|consultation|demo/i;
        if (bookingKeywords.test(text)) {
          linkedText += `<br><br>📅 <a href="${bookingUrl}" target="_blank" style="color:#1a73e8; font-weight:600; text-decoration:underline;">Click here to book</a>`;
        }
      }

      div.innerHTML = `<div>${linkedText}</div>`;

      if (fileData) {
        if (fileData.startsWith('data:image/')) {
          const img = document.createElement("img");
          img.src = fileData;
          img.alt = "Uploaded image";
          div.appendChild(img);
        } else if (fileData.startsWith('data:application/pdf')) {
          const iframe = document.createElement("iframe");
          iframe.src = fileData;
          iframe.style.width = "100%";
          iframe.style.height = "400px";
          iframe.style.border = "none";
          iframe.title = "PDF Preview";
          div.appendChild(iframe);
        } else {
          const link = document.createElement("a");
          link.href = fileData;
          link.download = fileName;
          link.textContent = `📥 Download ${fileName}`;
          link.style.color = "#1a73e8";
          link.style.fontWeight = "500";
          link.style.display = "block";
          link.style.marginTop = "10px";
          div.appendChild(link);
        }
      }

      msgContainer.appendChild(div);
      msgContainer.scrollTop = msgContainer.scrollHeight;
      
      // Save to conversation history
      conversationHistory.push({ role, text, timestamp: new Date().toISOString() });
      if (conversationHistory.length > 20) conversationHistory.shift();
      localStorage.setItem(`ai_conversation_${WIDGET_KEY}`, JSON.stringify(conversationHistory));
    }

    async function sendMessage(voiceText = null) {
      if (isProcessing) return;
      
      let text = voiceText || inputField.value.trim();

      if (!text && !pendingFileData) return;

      if (isLiveMode) {
        updateCatExpression('thinking');
      }

      const currentFile = pendingFileData;
      const currentFileName = pendingFileName;
      const currentText = text;

      if (!isLiveMode) {
        appendMessage(currentText || "(File attached)", "user", currentFile, currentFileName);
      }
      
      inputField.value = "";
      
      if (pendingFileData) {
        pendingFileData = null;
        pendingFileName = '';
        previewBar.style.display = "none";
        fileInput.value = "";
        inputField.placeholder = "Type a message...";
      }

      isProcessing = true;
      typingInd.style.display = "block";

      try {
        const body = {
          message: currentText || "Please analyze this file.",
          widget_key: WIDGET_KEY,
          client_name: userName || "Visitor",
          client_email: userEmail || null,
          is_visitor: true,
          session_id: activeSessionId,
          conversation_history: conversationHistory.slice(-5), // Send last 5 messages for context
          business_name: businessName,
          ai_name: aiName,
          has_introduced: hasIntroduced // CRITICAL: Tell backend if we've already introduced
        };

        if (currentFile) {
          body.file_data = currentFile;
          body.file_name = currentFileName;
          
          if (currentFile.startsWith('data:image/') && smartSettings?.vision_active) {
            body.vision_enabled = true;
          }
        }

        console.log("[WIDGET → SERVER] Sending request:", body);

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

        typingInd.style.display = "none";
        isProcessing = false;

        if (isLiveMode) {
          updateCatExpression('smiling');
          voiceStatus.textContent = "Live chat activated - start speaking";
        }

        if (response.ok && data.success && data.reply) {
          if (data.session_id) {
            activeSessionId = data.session_id;
            localStorage.setItem(`ai_widget_session_${WIDGET_KEY}`, activeSessionId);
          }
          
          // Mark as introduced after first response
          if (!hasIntroduced) {
            hasIntroduced = true;
          }
          
          messageCount++;
          
          // Prevent repetition - don't show if it's the same as last response
          if (data.reply !== lastResponseText || messageCount === 1) {
            if (!isLiveMode) {
              appendMessage(data.reply, "bot");
              speak(data.reply);
            } else {
              speak(data.reply);
            }
            lastResponseText = data.reply;
          }
        } else {
          const errorMsg = data.error || "Server returned error";
          if (!isLiveMode) {
            appendMessage(`I'm having trouble connecting. Please try again.`, "bot");
          } else {
            speak("Connection error. Please try again.");
            voiceStatus.textContent = "Connection error";
            updateCatExpression('surprised');
            setTimeout(() => {
              voiceStatus.textContent = "Live chat activated - start speaking";
              updateCatExpression('smiling');
            }, 2000);
          }
        }
      } catch (err) {
        typingInd.style.display = "none";
        isProcessing = false;
        console.error("[WIDGET] Fetch error:", err);
        
        let errorMessage = "Connection issue. Please try again.";
        if (!isLiveMode) {
          appendMessage(errorMessage, "bot");
        } else {
          speak("Connection error. Please try again.");
          voiceStatus.textContent = "Connection error";
          updateCatExpression('surprised');
          setTimeout(() => {
            voiceStatus.textContent = "Live chat activated - start speaking";
            updateCatExpression('smiling');
          }, 2000);
        }
      }
    }

    sendBtn.onclick = () => sendMessage();
    inputField.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    function speak(text) {
      if (isMuted || !window.speechSynthesis) return;
      
      window.speechSynthesis.cancel();
      
      const cleanText = text
        .replace(/(https?:\/\/[^\s]+)/g, 'a link')
        .replace(/\*/g, '')
        .replace(/#/g, '')
        .replace(/[•●]/g, '');
      
      const msg = new SpeechSynthesisUtterance(cleanText);
      
      msg.rate = 0.85;
      msg.pitch = 1.25;
      msg.volume = 0.95;
      
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
            msg.voice = voice;
            break;
          }
        }
        
        if (!msg.voice) {
          const femaleVoice = voices.find(v => 
            v.lang.includes('en') && 
            (v.name.includes('female') || v.name.includes('Female') || 
             v.name.includes('Zira') || v.name.includes('Samantha') ||
             v.name.includes('Victoria'))
          );
          msg.voice = femaleVoice || voices.find(v => v.lang.includes('en')) || voices[0];
        }
      }
      
      if (window.speechSynthesis.getVoices().length > 0) {
        setVoice();
      } else {
        window.speechSynthesis.onvoiceschanged = setVoice;
      }
      
      window.speechSynthesis.speak(msg);
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        console.log("[WIDGET] Voices loaded for speech");
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
})();