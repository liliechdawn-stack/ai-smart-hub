// dashboard.js - Updated for Enrichment Data, Session-based Chat Threads, Voice Controls, and Support
const API_URL = "http://localhost:5000/api";
const token = localStorage.getItem("token");

if (!token) {
  alert("Please login first");
  window.location.href = "login.html";
}

// Global Voice State
let isMuted = false;
const synth = window.speechSynthesis;

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const sections = {
    analytics: document.getElementById("analyticsSection"),
    leads: document.getElementById("leadsSection"),
    chats: document.getElementById("chatSection"),
    settings: document.getElementById("settingsSection"),
    widget: document.getElementById("widgetSection"),
    support: document.getElementById("supportSection"), 
    guidance: document.getElementById("guidanceSection") 
  };

  const navLinks = {
    navAnalytics: sections.analytics,
    navLeads: sections.leads,
    navChats: sections.chats,
    navSettings: sections.settings,
    navWidget: sections.widget,
    navSupport: sections.support,   
    navGuidance: sections.guidance  
  };

  const businessNameSpan = document.getElementById("businessName");
  const currentPlanSpan = document.getElementById("currentPlan");
  const messagesUsedSpan = document.getElementById("messagesUsed");
  const leadsUsedSpan = document.getElementById("leadsUsed");
  const totalChatsSpan = document.getElementById("totalChats");
  const messagesRemainingSpan = document.getElementById("messagesRemaining");
  const leadsRemainingSpan = document.getElementById("leadsRemaining");

  const chatTableBody = document.querySelector("#chatTable tbody");
  const chatResponses = document.getElementById("chatResponses");
  const leadsTableBody = document.querySelector("#leadsTable tbody");

  const logoutBtn = document.getElementById("logoutBtn");
  const adminBtn = document.getElementById("adminBtn");

  // Navigation handler
  Object.keys(navLinks).forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = () => {
        Object.values(sections).forEach(s => s?.classList.add("hidden"));
        Object.keys(navLinks).forEach(k => document.getElementById(k)?.classList.remove("active"));

        navLinks[id].classList.remove("hidden");
        el.classList.add("active");

        if (id === "navSettings") {
          renderPlanCards(currentPlanSpan?.textContent.trim() || "free");
        }
        if (id === "navGuidance") {
          loadGuidance();
        }
      };
    }
  });

  // ================= VOICE LOGIC =================
  function speak(text) {
    if (isMuted) return;
    synth.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    
    const softVoice = voices.find(v => 
      v.name.includes("Natural") || 
      v.name.includes("Aria") || 
      v.name.includes("Google UK English Female") ||
      v.name.includes("Zira")
    );

    if (softVoice) utterance.voice = softVoice;
    utterance.pitch = 1.1; 
    utterance.rate = 0.95; 
    synth.speak(utterance);
  }

  const muteBtn = document.getElementById("muteVoiceBtn");
  if (muteBtn) {
    muteBtn.onclick = () => {
      isMuted = !isMuted;
      muteBtn.innerHTML = isMuted ? "    Voice Muted" : "    Voice On";
      muteBtn.classList.toggle("muted-active", isMuted);
      if (isMuted) synth.cancel();
    };
  }

  // ================= PLANS DATA =================
  const ALL_PLANS = [
    { name: "basic",   price: "10,000 / month", messages: "500 AI messages",   leads: "Unlimited leads", features: ["Email support", "Remove branding"] },
    { name: "pro",     price: "25,000 / month", messages: "3,000 AI messages", leads: "Unlimited leads", features: ["Priority AI", "Custom prompts", "Analytics export"] },
    { name: "agency",  price: "80,000 / month", messages: "10 businesses",     leads: "Unlimited leads", features: ["White-label widget", "API access"] }
  ];

  function renderPlanCards(currentPlan = "free") {
    const container = document.getElementById("planCards");
    if (!container) return;
    container.innerHTML = "";

    ALL_PLANS.forEach(plan => {
      const isCurrent = currentPlan.toLowerCase() === plan.name.toLowerCase();
      const card = document.createElement("div");
      card.className = `plan-card ${isCurrent ? "current" : ""}`;
      card.innerHTML = `
        <h3 style="margin:0 0 16px; font-size:1.8rem; color:white;">${plan.name.toUpperCase()}</h3>
        <div style="font-size:2.4rem; font-weight:700; color:var(--gold); margin:12px 0;">${plan.price}</div>
        <ul style="list-style:none; padding:0; margin:20px 0 32px 0; font-size:1.05rem;">
          <li style="margin:10px 0;">✓ ${plan.messages}</li>
          <li style="margin:10px 0;">✓ ${plan.leads}</li>
          ${plan.features.map(f => `<li style="margin:10px 0;">✓ ${f}</li>`).join("")}
        </ul>
        <button class="subscribePlanBtn ${isCurrent ? "" : "btn-gold"}" 
                data-plan="${plan.name}"
                ${isCurrent ? "disabled" : ""}
                style="width:100%; padding:14px; font-size:1.1rem;">
          ${isCurrent ? "Current Plan" : "Upgrade Now"}
        </button>
      `;
      container.appendChild(card);
    });

    document.querySelectorAll(".subscribePlanBtn:not([disabled])").forEach(btn => {
      btn.addEventListener("click", async () => {
        const plan = btn.dataset.plan;
        try {
          const res = await fetch(`${API_URL}/subscription/create-checkout-session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ plan, email: localStorage.getItem("email") || "unknown@email.com" })
          });
          const data = await res.json();
          if (data.url) { window.location.href = data.url; } 
          else { alert(data.error || "Failed to create checkout session"); }
        } catch (err) { alert("Connection error - please try again"); }
      });
    });
  }

  // ================= LOAD DASHBOARD (ENHANCED OPERATIONAL FIX) =================
  async function loadDashboard() {
    try {
      const res = await fetch(`${API_URL}/dashboard/full`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load dashboard");

      const data = await res.json();

      // Fix: Normalize and Sync Plan to localStorage
      const actualPlan = (data.plan || "free").toLowerCase().trim();
      localStorage.setItem("userPlan", actualPlan);

      const finalBizName = data.business_name || data.name || localStorage.getItem("businessName") || "Business";
      if (businessNameSpan) {
        businessNameSpan.textContent = finalBizName;
      }

      // Update UI Display and resolve the "STUCK ON FREE" issue
      if (currentPlanSpan) {
        currentPlanSpan.textContent = actualPlan.toUpperCase();
        // Visual indicator for premium plans
        if (actualPlan === 'agency' || actualPlan === 'enterprise') {
            currentPlanSpan.style.color = "#2ecc71"; 
        }
      }

      messagesUsedSpan.textContent = data.messages_used ?? 0;
      leadsUsedSpan.textContent = data.leads_used ?? 0;
      totalChatsSpan.textContent = data.chats?.length || 0;
      messagesRemainingSpan.textContent = Math.max(0, (data.messages_limit || 0) - (data.messages_used || 0));
      leadsRemainingSpan.textContent = Math.max(0, (data.leads_limit || 0) - (data.leads_used || 0));

      if (localStorage.getItem("email") === "ericchung992@gmail.com") {
        adminBtn.classList.remove("hidden");
        adminBtn.onclick = () => window.location.href = "admin.html";
      }

      renderChats(data.chats || []);
      renderLeads(data.leads || []);

      // Trigger a storage event so other open tabs/iframes update their tool locks immediately
      window.dispatchEvent(new Event('storage'));

    } catch (err) { 
        console.error("Dashboard load error:", err);
        // Fallback to local storage if API fails to prevent lockout
        const cached = localStorage.getItem("userPlan") || "free";
        if(currentPlanSpan) currentPlanSpan.textContent = cached.toUpperCase();
    }
  }

  // Renders chat threads
  function renderChats(chats) {
    if (!chatTableBody) return;
    chatTableBody.innerHTML = "";

    chats.forEach(c => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.innerHTML = `
        <td><strong>${c.client_name || "Visitor"}</strong></td>
        <td>${c.msg_count || 1} messages in thread</td>
        <td>Last active: ${new Date(c.last_message).toLocaleString()}</td>
        <td><button class="btn-gold view-chat-btn" data-id="${c.session_id}">Open Thread</button></td>
      `;
      tr.onclick = () => loadChatSession(c.session_id);
      chatTableBody.appendChild(tr);
    });
  }

  // Fetch and display full session history
  async function loadChatSession(sessionId) {
    try {
      const res = await fetch(`${API_URL}/chat/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const messages = await res.json();
      
      chatResponses.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
           <h3 style="color:var(--gold); margin:0;">Chat History</h3>
           <button class="btn-gold" id="liveChatJoinBtn" style="padding:5px 15px; font-size:0.8rem;">🔌 Switch to Live Chat</button>
        </div>
      `;
      
      messages.forEach(m => {
        const bubble = document.createElement("div");
        bubble.className = "chat-bubble-container"; 
        bubble.innerHTML = `
          <div style="margin-bottom:15px; padding:10px; background:#1a1a1a; border-radius:8px;">
            <p style="color:var(--gold); margin:0;"><strong>User:</strong> ${m.message}</p>
            <p style="color:white; margin:5px 0 0 0;"><strong>AI (Cloudflare):</strong> ${m.response}</p>
            <small style="color:#666;">${new Date(m.created_at).toLocaleString()}</small>
          </div>
        `;
        chatResponses.appendChild(bubble);
      });
      
      chatResponses.scrollTop = chatResponses.scrollHeight;

      document.getElementById("liveChatJoinBtn").onclick = () => {
        alert("Live Chat mode activated. AI is paused for this session. You can now type directly to the customer.");
      };

    } catch (err) { console.error("Error loading session:", err); }
  }

  // ================= ENHANCED: RENDER LEADS WITH ENRICHMENT DATA =================
  function renderLeads(leads) {
    if (!leadsTableBody) return;
    leadsTableBody.innerHTML = "";
    
    // Update Table Header if not already updated in HTML to include "Company/Title"
    const tableHeader = document.querySelector("#leadsTable thead tr");
    if (tableHeader && !tableHeader.innerHTML.includes("Company")) {
        tableHeader.innerHTML = `
            <th>Name</th>
            <th>Email</th>
            <th>Company & Role</th>
            <th>Date</th>
        `;
    }

    leads.forEach(l => {
      // Enrichment logic: check if data exists from Apollo
      const companyInfo = l.company ? `<span style="color:var(--gold)">${l.company}</span>` : "Individual";
      const roleInfo = l.job_title ? `<br><small style="color:#aaa">${l.job_title}</small>` : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
          <td>${l.name}</td>
          <td>${l.email}</td>
          <td>${companyInfo}${roleInfo}</td>
          <td>${new Date(l.created_at).toLocaleString()}</td>
        `;
      leadsTableBody.appendChild(tr);
    });
  }

  // ================= SUPPORT TICKET SUBMISSION =================
  document.getElementById("submitTicketBtn")?.addEventListener("click", async () => {
    const subject = document.getElementById("supportSubject").value;
    const message = document.getElementById("supportMessage").value;
    
    if(!message) return alert("Please describe your problem.");

    try {
      const res = await fetch(`${API_URL}/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject, message, priority: "medium" })
      });
      const data = await res.json();
      if(data.success) {
        alert("Ticket submitted! We will contact you soon.");
        document.getElementById("supportMessage").value = "";
      }
    } catch(err) { alert("Error submitting ticket."); }
  });

  // ================= GUIDANCE LOADER =================
  async function loadGuidance() {
    const guideDiv = document.getElementById("guidanceContent");
    if(!guideDiv) return;
    try {
      const res = await fetch(`${API_URL}/content/guidance`);
      const data = await res.json();
      guideDiv.innerHTML = `
        <h3>${data.title}</h3>
        <ul>${data.steps.map(s => `<li style="margin:15px 0;">${s}</li>`).join("")}</ul>
      `;
    } catch(e) { guideDiv.innerHTML = "Failed to load guidance."; }
  }

  // Send AI message from Dashboard
  document.getElementById("sendBtn")?.addEventListener("click", async () => {
    const msg = document.getElementById("aiMessage")?.value.trim();
    const name = document.getElementById("clientName")?.value.trim();

    if (!msg || !name) return alert("Please fill client name and message");

    try {
      const res = await fetch(`${API_URL}/widget/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg, client_name: name })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      speak(data.reply);

      document.getElementById("aiMessage").value = "";
      loadDashboard(); 
    } catch (err) { alert(err.message || "Could not send message"); }
  });

  // Add new lead
  document.getElementById("addLeadBtn")?.addEventListener("click", async () => {
    const name = document.getElementById("leadName")?.value.trim();
    const email = document.getElementById("leadEmail")?.value.trim();
    const phone = document.getElementById("leadPhone")?.value.trim();

    if (!name || !email) return alert("Name and email are required");

    try {
      const res = await fetch(`${API_URL}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, phone })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add lead");

      alert("Lead added successfully!");
      document.getElementById("leadName").value = "";
      document.getElementById("leadEmail").value = "";
      document.getElementById("leadPhone").value = "";
      loadDashboard();
    } catch (err) { alert(err.message || "Could not add lead"); }
  });

  // Logout
  logoutBtn.onclick = () => {
    localStorage.clear();
    window.location.href = "login.html";
  };

  const dashEl = document.querySelector(".dashboard");
  if (dashEl) dashEl.style.display = "flex";
  loadDashboard();
});