// widget.js - Dynamic SaaS AI Chat Widget (Cloudflare + Smart Hub + Full File Upload + No Duplicate Leads)
(function () {
  if (document.getElementById("ai-widget-container")) return;

  const marker = document.getElementById("ai-chat-widget");
  if (!marker) {
    console.warn("AI Widget: Marker #ai-chat-widget not found.");
    return;
  }

  const scriptTag = document.currentScript;
  const scriptUrl = scriptTag ? new URL(scriptTag.src) : null;
  const SERVER_URL = scriptUrl ? scriptUrl.origin : "https://ai-smart-hub.onrender.com";
  const WIDGET_KEY = marker.dataset.key || "";

  if (!WIDGET_KEY) {
    console.error("AI Widget: Missing data-key.");
    return;
  }

  let leadCaptured = localStorage.getItem(`ai_lead_captured_${WIDGET_KEY}`) === "true";
  let isMuted = localStorage.getItem(`ai_widget_muted`) === "true";
  let activeSessionId = localStorage.getItem(`ai_widget_session_${WIDGET_KEY}`) || null;
  let smartSettings = null;

  let isProcessing = false;
  let pendingFileData = null;
  let pendingFileName = '';

  fetch(`${SERVER_URL}/api/public/widget-config/${WIDGET_KEY}`)
    .then(res => res.json())
    .then(dbConfig => initWidget(dbConfig))
    .catch(err => {
      console.warn("Widget config fetch failed, using fallback", err);
      initWidget({});
    });

  async function loadSmartSettings() {
    try {
      const res = await fetch(`${SERVER_URL}/api/smart-hub/settings`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
      });
      if (res.ok) {
        smartSettings = await res.json();
        console.log("[WIDGET] Smart Hub settings loaded");
      }
    } catch (err) {
      console.warn("[WIDGET] Smart Hub settings load failed", err);
    }
  }

  function initWidget(dbConfig) {
    const businessName = dbConfig.business_name || marker.getAttribute("data-title") || "AI Assistant";

    const config = {
      key: WIDGET_KEY,
      primaryColor: dbConfig.widget_color || marker.dataset.primaryColor || "#4285f4",
      position: marker.dataset.position || "bottom-right",
      welcome: dbConfig.welcome_message || marker.dataset.welcome || "Hi! I'm your AI assistant. How can I help you today?",
      title: businessName,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(businessName)}&background=4285f4&color=fff`
    };

    // Styles (kept yours, added file preview tweaks)
    const style = document.createElement('style');
    style.textContent = `
      #ai-widget-container { 
        font-family: 'Segoe UI', Roboto, -apple-system, sans-serif; 
        --gemini-gradient: linear-gradient(135deg, #4285f4, #9b72cb, #d96570);
        --primary-color: ${config.primaryColor};
      }
      
      .widget-bubble { position: fixed; z-index: 99999; bottom: 20px; right: 20px; width: 64px; height: 64px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 8px 32px rgba(0,0,0,0.15); transition: all 0.4s cubic-bezier(0.4,0,0.2,1); border: 1px solid rgba(0,0,0,0.08); }
      .widget-bubble:hover { transform: scale(1.1) rotate(5deg); }
      .widget-bubble svg { width: 28px; height: 28px; stroke: var(--primary-color); }

      .widget-window { position: fixed; z-index: 100000; bottom: 100px; right: 20px; width: 420px; max-width: 90vw; height: 700px; max-height: 85vh; background: rgba(255,255,255,0.98); backdrop-filter: blur(15px); border-radius: 28px; display: none; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,0.12); overflow: hidden; border: 1px solid rgba(0,0,0,0.05); transition: transform 0.3s ease, opacity 0.3s ease; }
      .widget-window.open { display: flex; animation: geminiShow 0.5s cubic-bezier(0.165,0.84,0.44,1); }

      .widget-header { padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; background: white; border-bottom: 1px solid #f0f0f0; }
      .header-info { display: flex; align-items: center; gap: 12px; }
      .gemini-logo { width: 36px; height: 36px; background: var(--gemini-gradient); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; font-weight: bold; }
      .header-actions { display: flex; gap: 8px; }
      .circle-btn { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f1f3f4; color: #5f6368; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; font-size: 14px; }
      .circle-btn:hover { background: #e8eaed; color: #202124; }

      .widget-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
      .message { max-width: 85%; padding: 12px 16px; font-size: 15px; line-height: 1.5; border-radius: 18px; position: relative; animation: msgIn 0.3s ease-out; }
      .message.bot { align-self: flex-start; background: #f8f9fa; color: #3c4043; border-bottom-left-radius: 4px; }
      .message.user { align-self: flex-end; background: var(--primary-color); color: white; border-bottom-right-radius: 4px; }
      .message img, .message iframe { max-width: 100%; border-radius: 12px; margin-top: 10px; border: 2px solid rgba(255,255,255,0.2); }

      .lead-overlay { position: absolute; inset: 0; background: white; z-index: 100001; display: flex; flex-direction: column; justify-content: center; padding: 40px; text-align: center; }
      .lead-field { width: 100%; padding: 14px; margin-bottom: 12px; border: 1px solid #dadce0; border-radius: 12px; outline: none; box-sizing: border-box; font-size: 15px; }
      .lead-field:focus { border-color: var(--primary-color); box-shadow: 0 0 0 3px rgba(66,133,244,0.1); }
      .lead-submit { background: var(--gemini-gradient); color: white; border: none; padding: 16px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 16px; margin-top: 10px; }

      .file-preview-bar { display: none; padding: 10px 20px; background: #f8f9fa; border-top: 1px solid #f1f3f4; align-items: center; gap: 12px; }
      .preview-thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: contain; border: 2px solid var(--primary-color); background: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px; }
      .preview-info { flex: 1; font-size: 12px; color: #5f6368; }
      .preview-cancel { cursor: pointer; color: #d93025; font-weight: bold; font-size: 18px; }

      .widget-input-area { padding: 20px; background: white; border-top: 1px solid #f1f3f4; }
      .input-bar { background: #f1f3f4; border-radius: 24px; display: flex; align-items: center; padding: 4px 12px; border: 2px solid transparent; }
      .input-bar:focus-within { background: white; border-color: #d2e3fc; box-shadow: 0 1px 6px rgba(0,0,0,0.08); }
      .input-bar input { flex: 1; border: none; background: transparent; padding: 12px; outline: none; font-size: 15px; }

      .typing-indicator { padding: 0 24px 10px; font-size: 12px; color: #70757a; display: none; font-style: italic; }

      @keyframes geminiShow { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes msgIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .mic-active { color: #d93025 !important; background: #fce8e6 !important; animation: pulse 1.5s infinite; }
      @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
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
          <div class="gemini-logo">✨</div>
          <div>
            <div style="font-weight:600; color:#202124;">${config.title}</div>
            <div style="font-size:12px; color:#1a73e8;">● Online Assistant</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="circle-btn" id="widget-mute-btn" title="Toggle Sound">${isMuted ? '🔇' : '🔊'}</button>
          <button class="circle-btn close-btn" title="Close Chat">×</button>
        </div>
      </div>

      <div id="lead-form" class="lead-overlay" style="${leadCaptured ? 'display:none' : 'display:flex'}">
        <h3 style="margin-bottom:8px;">Welcome!</h3>
        <p style="font-size:14px; color:#5f6368; margin-bottom:24px;">Please tell us who you are to start.</p>
        <input type="text" id="lead-name" class="lead-field" placeholder="Your Name" required />
        <input type="email" id="lead-email" class="lead-field" placeholder="Email Address" required />
        <button id="lead-submit-btn" class="lead-submit">Start Conversation</button>
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
          <input type="file" id="widget-file-input" style="display:none" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx" />
          <button class="circle-btn" id="widget-upload-btn" title="Attach Image, PDF, or File" style="background:transparent">📎</button>
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
    const typingInd = win.querySelector("#widget-typing");
    const leadForm = win.querySelector("#lead-form");
    const previewBar = win.querySelector("#file-preview-bar");
    const previewIcon = win.querySelector("#file-preview-icon");
    const previewCancel = win.querySelector("#file-preview-cancel");
    const fileNameDisplay = win.querySelector("#file-name-display");

    bubble.onclick = async () => {
      win.classList.toggle("open");
      if (win.classList.contains("open")) {
        if (!leadCaptured) {
          win.querySelector("#lead-name").focus();
        } else {
          inputField.focus();
          await loadSmartSettings();
        }
      }
    };

    win.querySelector(".close-btn").onclick = () => {
      win.classList.remove("open");
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

      // Prevent duplicate lead submission (check localStorage first)
      const existingLeads = JSON.parse(localStorage.getItem(`ai_leads_${WIDGET_KEY}`) || '[]');
      if (existingLeads.includes(email)) {
        console.log("[WIDGET] Email already captured, bypassing lead submission:", email);
        leadCaptured = true;
        localStorage.setItem(`ai_lead_captured_${WIDGET_KEY}`, "true");
        leadForm.style.display = "none";
        inputField.focus();
        await loadSmartSettings();
        return;
      }

      try {
        const res = await fetch(`${SERVER_URL}/api/public/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone: "N/A", widget_key: WIDGET_KEY })
        });

        if (res.ok) {
          // Store email locally to prevent duplicates in future
          existingLeads.push(email);
          localStorage.setItem(`ai_leads_${WIDGET_KEY}`, JSON.stringify(existingLeads));
          localStorage.setItem(`ai_lead_captured_${WIDGET_KEY}`, "true");
          leadCaptured = true;
          leadForm.style.display = "none";
          inputField.focus();
          await loadSmartSettings();
        } else {
          alert("Failed to save your info. Please try again.");
        }
      } catch (e) {
        console.error("Lead submission error:", e);
        alert("Connection issue. Please try again.");
      }
    };

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = SpeechRecognition ? new SpeechRecognition() : null;

    if (recognition) {
      recognition.onresult = (e) => {
        inputField.value = e.results[0][0].transcript;
        sendMessage();
      };
      recognition.onend = () => voiceBtn.classList.remove("mic-active");
    }

    voiceBtn.onclick = () => {
      if (!recognition) return alert("Voice not supported.");
      voiceBtn.classList.add("mic-active");
      recognition.start();
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

      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingFileData = ev.target.result;
        pendingFileName = file.name;

        const isImage = file.type.startsWith('image/');
        previewIcon.innerHTML = isImage ? `<img src="${pendingFileData}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : '📄';
        fileNameDisplay.textContent = pendingFileName;

        previewBar.style.display = "flex";
        inputField.placeholder = `Ask about "${pendingFileName}"...`;
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
      const div = document.createElement("div");
      div.className = `message ${role}`;

      let linkedText = text
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:inherit;text-decoration:underline; font-weight:bold;">$1</a>')
        .replace(/(^|\s)(www\.[^\s]+)/g, (m, s, url) => `${s}<a href="https://${url}" target="_blank" style="color:inherit;text-decoration:underline; font-weight:bold;">${url}</a>`);

      if (smartSettings?.booking_url && /book|appointment|schedule|meeting|calendly/i.test(text)) {
        linkedText += `<br><br>Book here: <a href="${smartSettings.booking_url}" target="_blank" style="color:#1a73e8; font-weight:bold;">${smartSettings.booking_url}</a>`;
      }

      if (/human|representative|agent|person|talk to someone/i.test(text)) {
        linkedText += `<br><br>Transferring to human agent... 📞 Hold on.`;
      }

      div.innerHTML = `<div>${linkedText}</div>`;

      if (fileData) {
        if (fileData.startsWith('data:image/')) {
          const img = document.createElement("img");
          img.src = fileData;
          div.appendChild(img);
        } else if (fileData.startsWith('data:application/pdf')) {
          const iframe = document.createElement("iframe");
          iframe.src = fileData;
          iframe.style.width = "100%";
          iframe.style.height = "400px";
          iframe.style.border = "none";
          div.appendChild(iframe);
        } else {
          const link = document.createElement("a");
          link.href = fileData;
          link.download = fileName;
          link.textContent = `📥 Download ${fileName}`;
          link.style.color = "#1a73e8";
          link.style.fontWeight = "bold";
          div.appendChild(link);
        }
      }

      msgContainer.appendChild(div);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    async function sendMessage() {
      if (isProcessing) return;
      const text = inputField.value.trim();

      if (pendingFileData && !text) {
        alert("Please describe what you want the AI to do with the file (e.g., summarize, explain, extract data).");
        inputField.focus();
        return;
      }

      if (!text && !pendingFileData) return;

      const userName = win.querySelector("#lead-name")?.value || "Visitor";
      const currentFile = pendingFileData;
      const currentFileName = pendingFileName;
      const currentText = text;

      appendMessage(currentText, "user", currentFile, currentFileName);
      inputField.value = "";
      pendingFileData = null;
      pendingFileName = '';
      previewBar.style.display = "none";
      inputField.placeholder = "Type a message...";

      isProcessing = true;
      typingInd.style.display = "block";

      try {
        const body = {
          message: currentText,
          widget_key: WIDGET_KEY,
          client_name: userName,
          session_id: activeSessionId
        };

        // Handle images & PDFs uniformly — send to Cloudflare (server.js will route images to vision if needed)
        if (currentFile) {
          body.file_data = currentFile; // base64 data URL
          body.file_name = currentFileName;
        }

        console.log("[WIDGET → SERVER] Sending request:", body);

        const response = await fetch(`${SERVER_URL}/api/public/chat`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(body)
        });

        console.log("[WIDGET] Response status:", response.status);

        const data = await response.json();
        console.log("[WIDGET] Response data:", data);

        typingInd.style.display = "none";
        isProcessing = false;

        if (response.ok && data.success && data.reply) {
          if (data.session_id) {
            activeSessionId = data.session_id;
            localStorage.setItem(`ai_widget_session_${WIDGET_KEY}`, activeSessionId);
          }
          appendMessage(data.reply, "bot");
          speak(data.reply);
        } else {
          const errorMsg = data.error || "Server returned error";
          console.error("[WIDGET] Server error:", errorMsg);
          appendMessage(`Error: ${errorMsg}. Please try again.`, "bot");
        }
      } catch (err) {
        typingInd.style.display = "none";
        isProcessing = false;
        console.error("[WIDGET] Fetch error:", err);
        appendMessage("Connection issue. Please check your internet or try again later.", "bot");
      }
    }

    sendBtn.onclick = sendMessage;
    inputField.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    function speak(text) {
      if (isMuted || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/(https?:\/\/[^\s]+)/g, 'a link');
      const msg = new SpeechSynthesisUtterance(cleanText);
      const voices = window.speechSynthesis.getVoices();
      msg.voice = voices.find(v => v.lang.includes("en")) || voices[0];
      window.speechSynthesis.speak(msg);
    }
  }
})();