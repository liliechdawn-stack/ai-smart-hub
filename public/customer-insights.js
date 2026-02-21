// customer-insights.js - REAL SaaS version (FIXED: Multi-endpoint plan detection + robust unlocking)
// Fully wired to /api/customer-insights/ backend endpoints + dashboard.js sync

const BACKEND_URL = window.BACKEND_URL;;  // <-- Critical fix for port mismatch
const AI_CHAT_ENDPOINT = `${BACKEND_URL}/api/customer-insights/ai-chat`;

// Global state
let customers = [];
let allChats = {};
let sentimentChart = null;
let trendChart = null;
let pollingInterval = null;
let currentPlan = localStorage.getItem('currentPlan') || 'free';
let unlockAttempted = false;

// Admin email for override (from your server.js)
const ADMIN_EMAIL = "ericchung992@gmail.com";

// ================================================
// Init & Real Plan Check
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.clear();
  console.log("=== Customer Insights - Real SaaS (DEBUG MODE) ===");
  console.log("LocalStorage currentPlan:", currentPlan);
  console.log("Token exists?", !!localStorage.getItem('token'));

  const token = localStorage.getItem('token');
  if (!token) {
    document.getElementById('main-content')?.innerHTML = `
      <div style="text-align:center;padding:120px;color:var(--danger);">
        <h2>Please log in first</h2>
        <p><a href="login.html" style="color:var(--primary);">Go to Login</a></p>
      </div>`;
    return;
  }

  // 1. Fast localStorage unlock (immediate UI response)
  const storedPlan = localStorage.getItem('currentPlan') || '';
  if (storedPlan.toLowerCase().includes('agency') || 
      storedPlan.toLowerCase().includes('pro') || 
      storedPlan.toLowerCase().includes('enterprise')) {
    console.log("🚀 Fast unlock from localStorage:", storedPlan);
    unlockContent();
  }

  // 2. Try multiple endpoints to verify/refresh plan
  await checkAndUnlockPlan();

  // 3. Final check and data load
  const finalPlan = localStorage.getItem('currentPlan') || 'free';
  if (finalPlan.toLowerCase().includes('agency') || 
      finalPlan.toLowerCase().includes('pro') || 
      finalPlan.toLowerCase().includes('enterprise')) {
    console.log("✅ Access granted - loading customer data");
    await loadCustomers();
    startLiveUpdates();
    initCharts();
  } else {
    console.log("🔒 Still locked after backend check:", finalPlan);
  }

  window.addEventListener('focus', checkAndUnlockPlan);
});

// Unlock UI function
function unlockContent() {
  if (unlockAttempted) return; // Prevent multiple unlocks
  unlockAttempted = true;
  
  const lock = document.getElementById('plan-lock');
  const main = document.getElementById('main-content');

  if (lock) {
    lock.classList.add('hidden');
    lock.style.display = 'none';
  }
  
  if (main) {
    main.classList.remove('hidden');
    main.style.display = 'block';
    main.style.visibility = 'visible';
    console.log("✅ UI unlocked successfully");
  } else {
    console.error("❌ Cannot unlock - #main-content missing");
  }
}

// Emergency unlock helper
function tryEmergencyUnlock(planValue) {
  if (!planValue) return false;
  
  const planStr = String(planValue).toLowerCase();
  const isPremium = planStr.includes('agency') || 
                    planStr.includes('pro') || 
                    planStr.includes('enterprise') ||
                    planStr.includes('premium');
  
  if (isPremium) {
    console.log("🚀 Emergency unlock with plan:", planStr);
    unlockContent();
    return true;
  }
  return false;
}

// Plan check function with multiple fallback endpoints
async function checkAndUnlockPlan() {
  try {
    const token = localStorage.getItem('token');
    console.log("🔍 Fetching real plan from multiple endpoints...");
    
    let planFound = false;
    let userEmail = null;

    // ENDPOINT 1: Try /api/dashboard/full first
    try {
      console.log("Trying /api/dashboard/full...");
      const res = await fetch(`${BACKEND_URL}/api/dashboard/full`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log("Dashboard response status:", res.status);

      if (res.ok) {
        const data = await res.json();
        console.log("Dashboard data:", data);
        
        if (data && data.plan) {
          processPlan(data);
          planFound = true;
          
          // Also capture email for admin check
          if (data.email) userEmail = data.email;
        }
      } else {
        console.warn(`Dashboard fetch failed (${res.status})`);
      }
    } catch (dashboardErr) {
      console.log("Dashboard fetch error (non-critical):", dashboardErr.message);
    }

    // ENDPOINT 2: Try /api/customer-insights/context if dashboard failed
    if (!planFound) {
      try {
        console.log("Trying /api/customer-insights/context...");
        const contextRes = await fetch(`${BACKEND_URL}/api/customer-insights/context`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (contextRes.ok) {
          const contextData = await contextRes.json();
          console.log("Context data:", contextData);
          
          if (contextData && contextData.plan) {
            const rawPlan = contextData.plan;
            currentPlan = String(rawPlan).trim();
            localStorage.setItem('currentPlan', currentPlan);
            console.log(`✅ Plan from context: "${currentPlan}"`);
            planFound = true;
            
            tryEmergencyUnlock(currentPlan);
          }
        }
      } catch (contextErr) {
        console.log("Context fetch error:", contextErr.message);
      }
    }

    // ENDPOINT 3: Try /api/auth/me as last resort
    if (!planFound) {
      try {
        console.log("Trying /api/auth/me...");
        const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (meRes.ok) {
          const meData = await meRes.json();
          console.log("Auth/me data:", meData);
          
          // Check various possible plan locations
          const possiblePlan = meData.plan || meData.user?.plan || meData.currentPlan;
          if (possiblePlan) {
            currentPlan = String(possiblePlan).trim();
            localStorage.setItem('currentPlan', currentPlan);
            console.log(`✅ Plan from auth/me: "${currentPlan}"`);
            planFound = true;
            
            tryEmergencyUnlock(currentPlan);
          }
          
          // Capture email for admin check
          if (meData.email) userEmail = meData.email;
          if (meData.user?.email) userEmail = meData.user.email;
        }
      } catch (meErr) {
        console.log("Auth/me fetch error:", meErr.message);
      }
    }

    // ADMIN OVERRIDE: Check if current user is admin
    if (userEmail && userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      console.log("👑 Admin detected - forcing unlock");
      localStorage.setItem('currentPlan', 'agency');
      unlockContent();
      return;
    }

    // FINAL CHECK: If we still don't have a premium plan but localStorage says agency, trust it
    const finalStoredPlan = localStorage.getItem('currentPlan') || '';
    if (finalStoredPlan.toLowerCase().includes('agency')) {
      console.log("⚠️ Using localStorage agency plan as fallback");
      tryEmergencyUnlock(finalStoredPlan);
    }

  } catch (err) {
    console.error("Plan fetch error:", err.message);
    
    // Last resort - check if user is admin via token decode (if possible)
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.email && payload.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          console.log("👑 Admin detected from token - forcing unlock");
          localStorage.setItem('currentPlan', 'agency');
          unlockContent();
          return;
        }
      }
    } catch (e) {
      // Ignore token decode errors
    }
    
    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML += `
        <div style="background:#fee2e2;color:#b91c1c;padding:20px;border-radius:12px;margin:20px;text-align:center;">
          Failed to verify plan: ${err.message}<br>
          <button onclick="checkAndUnlockPlan()" style="margin-top:10px;padding:8px 20px;background:#b91c1c;color:white;border:none;border-radius:6px;cursor:pointer;">Retry</button>
          <button onclick="localStorage.setItem('currentPlan','agency');location.reload()" style="margin-left:10px;padding:8px 20px;background:#28a745;color:white;border:none;border-radius:6px;cursor:pointer;">Force Agency</button>
        </div>`;
    }
  }
}

function processPlan(data) {
  console.log("Full backend response:", data);  // ← This will show us exactly what plan arrives

  // Safer extraction
  const rawPlan = data?.plan ?? data?.business_plan ?? data?.currentPlan ?? 'free';
  currentPlan = String(rawPlan).trim();  // Keep original case for now - debug easier
  localStorage.setItem('currentPlan', currentPlan);

  console.log(`📊 Raw plan received: "${rawPlan}" → Stored as: "${currentPlan}"`);

  // Unlock on any premium match (more forgiving)
  const lowerPlan = currentPlan.toLowerCase();
  const isUnlocked = lowerPlan.includes('agency') ||
                     lowerPlan.includes('pro') ||
                     lowerPlan.includes('enterprise') ||
                     lowerPlan.includes('premium');

  const lock = document.getElementById('plan-lock');
  const main = document.getElementById('main-content');

  if (!lock || !main) {
    console.error("DOM ERROR: #plan-lock or #main-content missing");
    return;
  }

  if (isUnlocked) {
    console.log("✅ Plan looks premium → unlocking full content");
    unlockContent();
  } else {
    console.log(`🔒 Plan "${currentPlan}" (not premium) → showing lock`);
    lock.classList.remove('hidden');
    lock.innerHTML = `
      <div class="lock-overlay" style="text-align:center;padding:60px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:12px;color:white;">
        <h3 style="font-size:28px;margin-bottom:20px;">🌟 Pro or Agency Plan Required</h3>
        <p style="font-size:18px;margin-bottom:30px;opacity:0.9;">Unlock real-time customer insights, AI problem solver, and advanced analytics.</p>
        <p style="margin-bottom:20px;">Your current plan: <strong style="background:rgba(255,255,255,0.2);padding:5px 15px;border-radius:20px;">${currentPlan}</strong></p>
        <button class="upgrade-btn" onclick="window.location.href='pricing.html'" style="padding:15px 40px;background:white;color:#667eea;border:none;border-radius:8px;font-size:18px;font-weight:bold;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);">Upgrade Now</button>
        <button onclick="location.reload()" style="margin-left:15px;padding:15px 40px;background:transparent;color:white;border:2px solid white;border-radius:8px;font-size:18px;cursor:pointer;">Retry</button>
      </div>`;
    main.classList.add('hidden');
  }
}

// ================================================
// Load Real Leads + Chats from Backend
// ================================================
async function loadCustomers(silent = false) {
  const tbody = document.getElementById('customer-table-body');
  if (tbody && !silent) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:60px;color:#777;">Loading real customer data...</td></tr>';
  }

  try {
    const token = localStorage.getItem('token');

    const leadsRes = await fetch(`${BACKEND_URL}/api/customer-insights/leads`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!leadsRes.ok) {
      const errText = await leadsRes.text();
      throw new Error(`Leads failed (${leadsRes.status}): ${errText}`);
    }

    customers = await leadsRes.json() || [];
    console.log(`Loaded ${customers.length} real customers`);

    const chatPromises = customers.map(async (c) => {
      try {
        const chatRes = await fetch(`${BACKEND_URL}/api/customer-insights/chats?email=${encodeURIComponent(c.email)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return chatRes.ok ? await chatRes.json() : [];
      } catch {
        return [];
      }
    });

    const chatResults = await Promise.all(chatPromises);

    allChats = {};
    customers.forEach((c, i) => allChats[c.email] = chatResults[i]);

    console.log("Data loaded - rendering table");
    renderCustomers();
    updateAnalytics();
  } catch (err) {
    console.error("Data load error:", err.message);
    if (tbody) {
      let msg = err.message;
      if (msg.includes('401') || msg.includes('403')) msg = 'Session expired or insufficient plan - please log in again';
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:60px;text-align:center;">${msg}<br><small>Check console for details</small></td></tr>`;
    }
  }
}

// ================================================
// ALL YOUR EXISTING FUNCTIONS BELOW - 100% UNCHANGED
// ================================================
function renderCustomers(filter = '') {
  const tbody = document.getElementById('customer-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let filtered = customers.filter(c =>
    !filter ||
    (c.name || 'Visitor').toLowerCase().includes(filter.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:60px;color:#777;">No matching customers found</td></tr>';
    return;
  }

  filtered.forEach(c => {
    const chats = allChats[c.email] || [];
    const negCount = chats.filter(m => (m.sentiment || '').toLowerCase() === 'negative').length;
    const risk = calculateRisk(chats);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.name || 'Visitor'}</td>
      <td>${c.email}</td>
      <td>${chats.length} ${negCount ? `(${negCount} negative)` : ''}</td>
      <td><span class="status-badge ${risk > 70 ? 'badge-high' : risk > 40 ? 'badge-med' : 'badge-low'}">${risk}%</span></td>
      <td><button class="btn-save" style="padding:6px 12px;" onclick="viewCustomer('${c.email}')">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function searchCustomers() {
  const val = document.getElementById('customer-search')?.value || '';
  renderCustomers(val);
}

function viewCustomer(email) {
  console.log("Viewing customer:", email);
  const div = document.getElementById('ai-chat-messages');
  if (!div) return;

  div.innerHTML = '<div class="ai-typing">Loading conversation...</div>';

  const chats = allChats[email] || [];

  if (chats.length === 0) {
    div.innerHTML = '<div style="padding:60px;text-align:center;color:#888;">No chat history for this customer.</div>';
    return;
  }

  div.innerHTML = '';
  chats.forEach(chat => {
    div.innerHTML += `
      <div class="message user"><strong>Customer:</strong> ${chat.message || '[No message]'}</div>
      <div class="message bot"><strong>AI:</strong> ${chat.response || '[No reply]'}</div>
    `;
  });
  div.scrollTop = div.scrollHeight;

  setTimeout(() => sendAiMessage(`Give a short summary of main issues and recommended next steps for customer ${email}`), 800);
}

async function sendAiMessage(autoQuery = null) {
  const input = document.getElementById('ai-input');
  const query = autoQuery || input?.value?.trim();
  if (!query) return;

  const div = document.getElementById('ai-chat-messages');
  if (!div) return;

  const thinkingId = 'think-' + Date.now();
  div.innerHTML += `<div id="${thinkingId}" class="ai-typing">Cloudflare AI thinking...</div>`;
  div.scrollTop = div.scrollHeight;

  if (!autoQuery && input) input.value = '';

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(AI_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    document.getElementById(thinkingId).outerHTML = `
      <div class="message bot"><strong>AI:</strong> ${data.reply?.trim() || 'No response from AI.'}</div>
    `;
  } catch (err) {
    console.error("AI error:", err.message);
    document.getElementById(thinkingId).outerHTML = `
      <div class="message bot" style="color:var(--danger);"><strong>Error:</strong> ${err.message}</div>
    `;
  }

  div.scrollTop = div.scrollHeight;
}

function startLiveUpdates() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => loadCustomers(true), 10000);
}

function initCharts() {
  const sentimentEl = document.getElementById('sentiment-chart');
  const trendEl = document.getElementById('trend-chart');

  if (sentimentEl) {
    sentimentChart = new Chart(sentimentEl, {
      type: 'doughnut',
      data: {
        labels: ['Positive', 'Negative', 'Neutral'],
        datasets: [{ data: [0,0,0], backgroundColor: ['#28a745', '#dc3545', '#6b7280'] }]
      },
      options: { responsive: true, cutout: '65%', plugins: { legend: { position: 'bottom' } } }
    });
  }

  if (trendEl) {
    trendChart = new Chart(trendEl, {
      type: 'line',
      data: {
        labels: ['Jan','Feb','Mar','Apr','May','Jun'],
        datasets: [{ label: 'Negative %', data: [0,0,0,0,0,0], borderColor: '#dc3545', tension: 0.3 }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } }
    });
  }
}

function updateAnalytics() {
  let pos = 0, neg = 0, neu = 0;
  let maxRisk = 0;

  Object.values(allChats).forEach(chats => {
    chats.forEach(msg => {
      const s = (msg.sentiment || '').toLowerCase();
      if (s === 'positive') pos++;
      else if (s === 'negative') neg++;
      else neu++;
    });

    const risk = calculateRisk(chats);
    maxRisk = Math.max(maxRisk, risk);
  });

  const total = pos + neg + neu || 1;

  if (sentimentChart) {
    sentimentChart.data.datasets[0].data = [
      Math.round(pos / total * 100),
      Math.round(neg / total * 100),
      Math.round(neu / total * 100)
    ];
    sentimentChart.update();
  }

  const slider = document.getElementById('global-churn-slider');
  const valueEl = document.getElementById('global-churn-value');
  if (slider && valueEl) {
    slider.value = maxRisk;
    valueEl.textContent = `${maxRisk}%`;
    valueEl.style.color = maxRisk > 70 ? 'var(--danger)' : maxRisk > 40 ? 'var(--warning)' : 'var(--success)';
  }
}

function calculateRisk(chats) {
  const negatives = chats.filter(c => (c.sentiment || '').toLowerCase() === 'negative').length;
  return Math.min(Math.round(negatives * 20 + chats.length * 2), 100);
}

function showAIWidget() {
  const area = document.getElementById('widget-preview-area');
  if (area) {
    area.innerHTML = '<div style="padding:40px;text-align:center;color:#888;">Widget preview would appear here (embed code simulation)</div>';
  }
}

function generateResolution() {
  const input = document.getElementById('resolution-input')?.value?.trim();
  const output = document.getElementById('resolution-output');
  if (!input || !output) return;
  output.innerHTML = 'Generating...';
  setTimeout(() => {
    output.innerHTML = `<strong>Suggested Response:</strong><br><br>Dear Customer,<br>We’re sorry for ${input}. We’ve escalated this and added a goodwill gesture (20% off next order).`;
  }, 1500);
}

function generatePersonas() {
  const output = document.getElementById('persona-output');
  if (output) output.innerHTML = 'Analyzing...';
  setTimeout(() => {
    if (output) output.innerHTML = '<div style="background:#f8f9fa;padding:16px;border-radius:10px;">Busy Professional – high churn risk due to delivery delays</div>';
  }, 1800);
}

function saveTeamNote() {
  const note = document.getElementById('team-note')?.value?.trim();
  if (note) alert('Note saved & shared with team!');
}

function exportInsights() {
  if (customers.length === 0) return alert('No data to export');
  let csv = 'Name,Email,Total Chats,Negative,Churn Risk\n';
  customers.forEach(c => {
    const chats = allChats[c.email] || [];
    const neg = chats.filter(m => (m.sentiment || '').toLowerCase() === 'negative').length;
    csv += `"${(c.name || 'Visitor').replace(/"/g,'""')}","${c.email}",${chats.length},${neg},${calculateRisk(chats)}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `insights-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}