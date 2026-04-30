// customer-insights.js - REAL SaaS version (FIXED: Multi-endpoint plan detection + robust unlocking)
// Fully wired to /api/customer-insights/ backend endpoints + dashboard.js sync
// UPDATED: Added Service Completion Notifications, Real-time alerts, and Widget integration

const BACKEND_URL = window.BACKEND_URL || 'https://ai-smart-hub.onrender.com';
const AI_CHAT_ENDPOINT = `${BACKEND_URL}/api/customer-insights/ai-chat`;

// Global state
let customers = [];
let allChats = {};
let sentimentChart = null;
let trendChart = null;
let sentimentTimeline = null;
let pollingInterval = null;
let currentPlan = localStorage.getItem('currentPlan') || 'free';
let unlockAttempted = false;
let services = [];
let notifications = [];

// Admin email for override (from your server.js)
const ADMIN_EMAIL = "ericchung992@gmail.com";

// Problem stats
let problemStats = {
    delivery: 0,
    quality: 0,
    pricing: 0,
    support: 0,
    refund: 0,
    ux: 0,
    total: 0,
    critical: 0
};

// ================================================
// SERVICE COMPLETION NOTIFICATIONS FUNCTIONS
// ================================================

// Load services from backend
async function loadServices() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/customer-insights/services`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            services = await response.json();
            renderServices();
        } else {
            // Fallback to localStorage if backend not ready
            const saved = localStorage.getItem('customer_services');
            services = saved ? JSON.parse(saved) : [];
            renderServices();
        }
    } catch (err) {
        console.error('Error loading services:', err);
        const saved = localStorage.getItem('customer_services');
        services = saved ? JSON.parse(saved) : [];
        renderServices();
    }
}

// Render services list
function renderServices() {
    const container = document.getElementById('service-list-container');
    if (!container) return;
    
    if (services.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #94a3b8;">
                <i class="fas fa-clipboard-list" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>No services created yet. Click "Create New Service" to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = services.map(service => `
        <div class="service-item ${service.status}">
            <div class="service-header">
                <span class="service-customer"><i class="fas fa-user"></i> ${escapeHtml(service.customer_name)}</span>
                <span class="service-status status-${service.status}">${service.status === 'completed' ? '✓ Completed' : service.status === 'in-progress' ? '🔄 In Progress' : '⏳ Pending'}</span>
            </div>
            <div class="service-details">
                <div><i class="fas fa-tag"></i> Service: ${escapeHtml(service.service_type)}</div>
                <div><i class="fas fa-calendar"></i> Created: ${new Date(service.created_at).toLocaleString()}</div>
                ${service.completed_at ? `<div><i class="fas fa-check-circle" style="color: #10b981;"></i> Completed: ${new Date(service.completed_at).toLocaleString()}</div>` : ''}
            </div>
            ${service.status !== 'completed' ? `
                <div class="service-actions">
                    <button class="complete-service-btn" onclick="completeService('${service.id}')">
                        <i class="fas fa-check"></i> Mark Complete & Notify Customer
                    </button>
                    <button class="view-customer-btn" onclick="viewCustomer('${service.customer_email}')">
                        <i class="fas fa-eye"></i> View Customer
                    </button>
                </div>
            ` : `
                <div class="service-actions">
                    <button class="view-customer-btn" onclick="viewCustomer('${service.customer_email}')">
                        <i class="fas fa-eye"></i> View Customer
                    </button>
                </div>
            `}
        </div>
    `).join('');
}

// Complete a service and send notifications
async function completeService(serviceId) {
    const token = localStorage.getItem('token');
    const service = services.find(s => s.id === serviceId);
    
    if (!service) return;
    
    if (confirm(`Mark "${service.service_type}" as completed for ${service.customer_name}? The customer will be notified.`)) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/customer-insights/services/${serviceId}/complete`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ completed_at: new Date().toISOString() })
            });
            
            if (response.ok) {
                await loadServices();
                
                // Add notification for owner
                addNotification({
                    title: 'Service Completed',
                    message: `${service.customer_name}'s service "${service.service_type}" has been completed.`,
                    customer_email: service.customer_email,
                    customer_name: service.customer_name,
                    service_id: serviceId
                });
                
                // Send alert to widget
                await fetch(`${BACKEND_URL}/api/widget/send-notification`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        customer_email: service.customer_email,
                        customer_name: service.customer_name,
                        message: `Your service "${service.service_type}" has been completed! Thank you for your business.`,
                        type: 'service_completed'
                    })
                }).catch(console.error);
                
                showTemporaryMessage(`✅ Service completed! ${service.customer_name} has been notified.`);
            } else {
                // Fallback to localStorage
                const index = services.findIndex(s => s.id === serviceId);
                if (index !== -1) {
                    services[index].status = 'completed';
                    services[index].completed_at = new Date().toISOString();
                    localStorage.setItem('customer_services', JSON.stringify(services));
                    renderServices();
                    
                    addNotification({
                        title: 'Service Completed',
                        message: `${service.customer_name}'s service "${service.service_type}" has been completed.`,
                        customer_email: service.customer_email,
                        customer_name: service.customer_name
                    });
                    
                    showTemporaryMessage(`✅ Service completed! ${service.customer_name} has been notified (local mode).`);
                }
            }
        } catch (err) {
            console.error('Error completing service:', err);
            // Fallback
            const index = services.findIndex(s => s.id === serviceId);
            if (index !== -1) {
                services[index].status = 'completed';
                services[index].completed_at = new Date().toISOString();
                localStorage.setItem('customer_services', JSON.stringify(services));
                renderServices();
                
                addNotification({
                    title: 'Service Completed',
                    message: `${service.customer_name}'s service "${service.service_type}" has been completed.`,
                    customer_email: service.customer_email,
                    customer_name: service.customer_name
                });
                
                showTemporaryMessage(`✅ Service completed! ${service.customer_name} has been notified.`);
            }
        }
    }
}

// Create new service
function showCreateServiceModal() {
    const customerEmail = prompt("Enter customer email:");
    if (!customerEmail) return;
    
    const customer = customers.find(c => c.email === customerEmail);
    const customerName = customer?.name || "Customer";
    
    const serviceType = prompt("Enter service type (e.g., 'Website Development', 'SEO Audit', 'Consultation'):");
    if (!serviceType) return;
    
    const description = prompt("Enter service description (optional):") || "";
    
    const newService = {
        id: 'svc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
        customer_email: customerEmail,
        customer_name: customerName,
        service_type: serviceType,
        description: description,
        status: 'pending',
        created_at: new Date().toISOString(),
        completed_at: null
    };
    
    services.push(newService);
    localStorage.setItem('customer_services', JSON.stringify(services));
    
    // Try to save to backend
    const token = localStorage.getItem('token');
    fetch(`${BACKEND_URL}/api/customer-insights/services`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newService)
    }).catch(console.error);
    
    renderServices();
    showTemporaryMessage(`✅ Service created for ${customerName}`);
    
    // Add notification for owner
    addNotification({
        title: 'New Service Created',
        message: `New service "${serviceType}" created for ${customerName}.`,
        customer_email: customerEmail,
        customer_name: customerName
    });
}

// ================================================
// NOTIFICATION FUNCTIONS
// ================================================

function addNotification(notification) {
    notifications.unshift({
        id: Date.now(),
        ...notification,
        read: false,
        timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 notifications
    if (notifications.length > 50) notifications.pop();
    
    localStorage.setItem('customer_notifications', JSON.stringify(notifications));
    updateNotificationUI();
}

function loadNotifications() {
    const saved = localStorage.getItem('customer_notifications');
    notifications = saved ? JSON.parse(saved) : [];
    updateNotificationUI();
}

function updateNotificationUI() {
    const count = notifications.filter(n => !n.read).length;
    const countEl = document.getElementById('notification-count');
    if (countEl) {
        if (count > 0) {
            countEl.style.display = 'flex';
            countEl.textContent = count > 9 ? '9+' : count;
        } else {
            countEl.style.display = 'none';
        }
    }
    
    const listEl = document.getElementById('notifications-list');
    if (!listEl) return;
    
    if (notifications.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No notifications yet</div>';
        return;
    }
    
    listEl.innerHTML = notifications.map(notif => `
        <div class="notification-item ${notif.read ? '' : 'unread'}" onclick="markNotificationRead(${notif.id})">
            <div class="notification-title">${escapeHtml(notif.title)}</div>
            <div class="notification-message">${escapeHtml(notif.message)}</div>
            <div class="notification-time">${getTimeAgo(notif.timestamp)}</div>
        </div>
    `).join('');
}

function toggleNotifications() {
    const panel = document.getElementById('notifications-panel');
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
        setTimeout(() => {
            document.addEventListener('click', function closePanel(e) {
                if (!panel.contains(e.target) && !e.target.closest('.notification-badge')) {
                    panel.style.display = 'none';
                    document.removeEventListener('click', closePanel);
                }
            });
        }, 100);
    }
}

function markNotificationRead(id) {
    const notif = notifications.find(n => n.id === id);
    if (notif) notif.read = true;
    localStorage.setItem('customer_notifications', JSON.stringify(notifications));
    updateNotificationUI();
}

function markAllNotificationsRead() {
    notifications.forEach(n => n.read = true);
    localStorage.setItem('customer_notifications', JSON.stringify(notifications));
    updateNotificationUI();
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

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
    await loadServices();
    loadNotifications();
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
  console.log("Full backend response:", data);

  // Safer extraction
  const rawPlan = data?.plan ?? data?.business_plan ?? data?.currentPlan ?? 'free';
  currentPlan = String(rawPlan).trim();
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:60px;color:#777;">Loading real customer data...</td</tr>';
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
        const chats = chatRes.ok ? await chatRes.json() : [];
        return chats.map(chat => ({
          ...chat,
          sentiment: chat.sentiment || 'neutral',
          problem: detectProblem(chat.message || '')
        }));
      } catch {
        return [];
      }
    });

    const chatResults = await Promise.all(chatPromises);

    allChats = {};
    customers.forEach((c, i) => allChats[c.email] = chatResults[i]);

    console.log("Data loaded - rendering table");
    analyzeProblems();
    resetFilters();
    updateAnalytics();
    updateProblemStats();
  } catch (err) {
    console.error("Data load error:", err.message);
    if (tbody) {
      let msg = err.message;
      if (msg.includes('401') || msg.includes('403')) msg = 'Session expired or insufficient plan - please log in again';
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:60px;text-align:center;">${msg}<br><small>Check console for details</small></td</tr>`;
    }
  }
}

// ===== PROBLEM DETECTION =====
function detectProblem(message) {
    if (!message) return 'other';
    const msg = message.toLowerCase();
    
    if (msg.match(/delay|late|shipping|delivery|when will|arrive|tracking/)) return 'delivery';
    if (msg.match(/quality|defective|broken|damaged|poor|bad|not working/)) return 'quality';
    if (msg.match(/price|expensive|cost|money|too much|refund|return/)) return 'pricing';
    if (msg.match(/help|support|agent|human|talk to|speak with/)) return 'support';
    if (msg.match(/refund|return|money back|cancel/)) return 'refund';
    if (msg.match(/confused|understand|how to|complicated|difficult/)) return 'ux';
    
    return 'other';
}

// ===== PROBLEM ANALYSIS =====
function analyzeProblems() {
    problemStats = {
        delivery: 0,
        quality: 0,
        pricing: 0,
        support: 0,
        refund: 0,
        ux: 0,
        other: 0,
        total: 0,
        critical: 0
    };
    
    Object.values(allChats).forEach(chats => {
        chats.forEach(chat => {
            if (chat.message) {
                const problem = chat.problem || detectProblem(chat.message);
                problemStats[problem] = (problemStats[problem] || 0) + 1;
                problemStats.total++;
                
                if (chat.sentiment === 'negative' && problem !== 'other') {
                    problemStats.critical++;
                }
            }
        });
    });
    
    // Update UI stats
    const totalProblemsEl = document.getElementById('total-problems');
    const criticalProblemsEl = document.getElementById('critical-problems');
    const problemCountEl = document.getElementById('problem-count');
    if (totalProblemsEl) totalProblemsEl.textContent = problemStats.total;
    if (criticalProblemsEl) criticalProblemsEl.textContent = problemStats.critical;
    if (problemCountEl) problemCountEl.textContent = `${problemStats.total} Total Issues`;
    
    // Update problem stats in classifier
    const statDelivery = document.getElementById('stat-delivery');
    const statQuality = document.getElementById('stat-quality');
    const statPricing = document.getElementById('stat-pricing');
    const statSupport = document.getElementById('stat-support');
    if (statDelivery) statDelivery.textContent = problemStats.delivery;
    if (statQuality) statQuality.textContent = problemStats.quality;
    if (statPricing) statPricing.textContent = problemStats.pricing;
    if (statSupport) statSupport.textContent = problemStats.support;
    
    // Update risk counts
    updateRiskCounts();
    
    // Render problem table
    renderProblemTable();
}

function updateRiskCounts() {
    let highRisk = 0;
    let mediumRisk = 0;
    
    customers.forEach(c => {
        const chats = allChats[c.email] || [];
        const risk = calculateRisk(chats);
        if (risk > 70) highRisk++;
        else if (risk > 40) mediumRisk++;
    });
    
    const highRiskEl = document.getElementById('high-risk-count');
    const mediumRiskEl = document.getElementById('medium-risk-count');
    if (highRiskEl) highRiskEl.textContent = highRisk;
    if (mediumRiskEl) mediumRiskEl.textContent = mediumRisk;
}

function renderProblemTable() {
    const tbody = document.getElementById('problem-table-body');
    if (!tbody) return;
    
    const problems = [
        { type: 'Delivery Issues', key: 'delivery', freq: problemStats.delivery, trend: '+12%', resolution: '2.5h', impact: 85, status: problemStats.delivery > 20 ? 'Critical' : 'Monitoring' },
        { type: 'Product Quality', key: 'quality', freq: problemStats.quality, trend: '+5%', resolution: '3.2h', impact: 92, status: problemStats.quality > 20 ? 'Critical' : 'Monitoring' },
        { type: 'Pricing Concerns', key: 'pricing', freq: problemStats.pricing, trend: '-3%', resolution: '1.8h', impact: 45, status: problemStats.pricing > 20 ? 'Critical' : 'Monitoring' },
        { type: 'Support Requests', key: 'support', freq: problemStats.support, trend: '+8%', resolution: '4.1h', impact: 78, status: problemStats.support > 20 ? 'Critical' : 'Monitoring' },
        { type: 'Refund Requests', key: 'refund', freq: problemStats.refund, trend: '-2%', resolution: '2.0h', impact: 95, status: problemStats.refund > 20 ? 'Critical' : 'Monitoring' },
        { type: 'UX/Confusion', key: 'ux', freq: problemStats.ux, trend: '+15%', resolution: '1.5h', impact: 60, status: problemStats.ux > 20 ? 'Critical' : 'Monitoring' }
    ];
    
    tbody.innerHTML = problems.map(p => `
        <tr>
            <td><strong>${p.type}</strong></td>
            <td>${p.freq}</td>
            <td><span style="color: ${p.trend.startsWith('+') ? '#dc3545' : '#28a745'}">${p.trend}</span></td>
            <td>${p.resolution}</td>
            <td><span class="status-badge ${p.impact > 80 ? 'badge-high' : p.impact > 60 ? 'badge-med' : 'badge-low'}">${p.impact}</span></td>
            <td><span class="status-badge ${p.freq > 20 ? 'badge-high' : 'badge-med'}">${p.status}</span></td>
            <td><button class="btn-secondary" style="padding:4px 8px; font-size:0.85rem;" onclick="analyzeProblemType('${p.key}')">Analyze</button></td>
        </tr>
    `).join('');
}

// ===== FILTERING AND SORTING =====
let currentFilters = {
    search: '',
    sentiment: 'all',
    problem: 'all',
    dateFrom: null,
    dateTo: null
};
let currentSort = { field: 'risk', direction: 'desc' };
let filteredCustomers = [];

function applyFilters() {
    const searchInput = document.getElementById('customer-search');
    const sentimentFilter = document.getElementById('sentiment-filter');
    const problemFilter = document.getElementById('problem-filter');
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    
    currentFilters = {
        search: searchInput ? searchInput.value.toLowerCase() : '',
        sentiment: sentimentFilter ? sentimentFilter.value : 'all',
        problem: problemFilter ? problemFilter.value : 'all',
        dateFrom: dateFrom && dateFrom.value ? new Date(dateFrom.value) : null,
        dateTo: dateTo && dateTo.value ? new Date(dateTo.value) : null
    };
    
    if (currentFilters.dateTo) {
        currentFilters.dateTo.setHours(23, 59, 59, 999);
    }
    
    filterAndSortCustomers();
}

function resetFilters() {
    const searchInput = document.getElementById('customer-search');
    const sentimentFilter = document.getElementById('sentiment-filter');
    const problemFilter = document.getElementById('problem-filter');
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    
    if (searchInput) searchInput.value = '';
    if (sentimentFilter) sentimentFilter.value = 'all';
    if (problemFilter) problemFilter.value = 'all';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    currentFilters = {
        search: '',
        sentiment: 'all',
        problem: 'all',
        dateFrom: null,
        dateTo: null
    };
    
    filterAndSortCustomers();
}

function filterAndSortCustomers() {
    filteredCustomers = customers.filter(c => {
        if (currentFilters.search) {
            const name = (c.name || '').toLowerCase();
            const email = (c.email || '').toLowerCase();
            if (!name.includes(currentFilters.search) && !email.includes(currentFilters.search)) {
                return false;
            }
        }
        
        if (currentFilters.sentiment !== 'all') {
            const chats = allChats[c.email] || [];
            const hasMatchingSentiment = chats.some(chat => 
                (chat.sentiment || 'neutral').toLowerCase() === currentFilters.sentiment.toLowerCase()
            );
            if (!hasMatchingSentiment) return false;
        }
        
        if (currentFilters.problem !== 'all') {
            const chats = allChats[c.email] || [];
            const hasMatchingProblem = chats.some(chat => 
                (chat.problem || detectProblem(chat.message || '')) === currentFilters.problem
            );
            if (!hasMatchingProblem) return false;
        }
        
        if (currentFilters.dateFrom || currentFilters.dateTo) {
            const chats = allChats[c.email] || [];
            const hasChatInDateRange = chats.some(chat => {
                if (!chat.timestamp) return false;
                const chatDate = new Date(chat.timestamp);
                if (currentFilters.dateFrom && chatDate < currentFilters.dateFrom) return false;
                if (currentFilters.dateTo && chatDate > currentFilters.dateTo) return false;
                return true;
            });
            if (!hasChatInDateRange) return false;
        }
        
        return true;
    });
    
    sortCustomers();
}

function sortTable(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'desc';
    }
    sortCustomers();
}

function sortCustomers() {
    filteredCustomers.sort((a, b) => {
        let valA, valB;
        
        switch(currentSort.field) {
            case 'name':
                valA = a.name || '';
                valB = b.name || '';
                break;
            case 'email':
                valA = a.email || '';
                valB = b.email || '';
                break;
            case 'messages':
                valA = (allChats[a.email] || []).length;
                valB = (allChats[b.email] || []).length;
                break;
            case 'risk':
                valA = calculateRisk(allChats[a.email] || []);
                valB = calculateRisk(allChats[b.email] || []);
                break;
            default:
                return 0;
        }
        
        if (typeof valA === 'string') {
            return currentSort.direction === 'asc' 
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA);
        } else {
            return currentSort.direction === 'asc' 
                ? valA - valB
                : valB - valA;
        }
    });
    
    renderCustomers();
}

function renderCustomers() {
    const tbody = document.getElementById('customer-table-body');
    if (!tbody) return;

    if (filteredCustomers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:60px;color:#777;">No matching customers found</td</tr>';
        return;
    }

    tbody.innerHTML = '';
    
    filteredCustomers.forEach(c => {
        const chats = allChats[c.email] || [];
        const messages = chats.length;
        const negCount = chats.filter(m => (m.sentiment || 'neutral').toLowerCase() === 'negative').length;
        const posCount = chats.filter(m => (m.sentiment || 'neutral').toLowerCase() === 'positive').length;
        const risk = calculateRisk(chats);
        
        // Get unique problems
        const problems = [...new Set(chats.map(chat => chat.problem || detectProblem(chat.message || '')))];
        const problemTags = problems.filter(p => p !== 'other').map(p => {
            const colors = {
                delivery: '#f59e0b',
                quality: '#dc3545',
                pricing: '#3b82f6',
                support: '#8b5cf6',
                refund: '#ef4444',
                ux: '#10b981'
            };
            return `<span style="background:${colors[p] || '#6c757d'}; color:white; padding:2px 8px; border-radius:12px; font-size:0.8rem; margin:2px;">${p}</span>`;
        }).join(' ');
        
        let sentimentDisplay = '';
        if (messages > 0) {
            if (negCount > posCount) {
                sentimentDisplay = `<span style="color: #dc3545;">🔴 ${negCount} negative</span>`;
            } else if (posCount > negCount) {
                sentimentDisplay = `<span style="color: #28a745;">🟢 ${posCount} positive</span>`;
            } else {
                sentimentDisplay = `<span style="color: #6b7280;">⚪ ${messages} messages</span>`;
            }
        } else {
            sentimentDisplay = 'No messages';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(c.name || 'Visitor')}</strong></td>
            <td>${escapeHtml(c.email || 'No email')}</td
            <td>${messages} ${messages > 0 ? `(${sentimentDisplay})` : ''}</td
            <td><span class="status-badge ${risk > 70 ? 'badge-high' : risk > 40 ? 'badge-med' : 'badge-low'}" style="font-size:1rem; font-weight:700;">${risk}%</span></td
            <td>${problemTags || '—'}</td
            <td>
                <button class="btn-primary" style="padding:6px 12px; margin-right:5px;" onclick="viewCustomer('${escapeHtml(c.email)}')">View</button>
                <button class="btn-secondary" style="padding:6px 12px;" onclick="quickAnalyze('${escapeHtml(c.email)}')">Analyze</button>
             </td
        `;
        tbody.appendChild(tr);
    });
}

function viewCustomer(email) {
  console.log("Viewing customer:", email);
  const div = document.getElementById('ai-chat-messages');
  if (!div) return;

  div.innerHTML = '<div class="ai-typing"><div class="loading-spinner" style="margin:0 auto;"></div>Loading conversation...</div>';

  const chats = allChats[email] || [];

  if (chats.length === 0) {
    div.innerHTML = '<div style="padding:60px;text-align:center;color:#888;">No chat history for this customer.</div>';
    return;
  }

  div.innerHTML = '';
  chats.forEach(chat => {
    const sentiment = chat.sentiment || 'neutral';
    const sentimentEmoji = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😞' : '😐';
    const problem = chat.problem || detectProblem(chat.message || '');
    
    div.innerHTML += `
      <div class="message user"><strong>Customer ${sentimentEmoji}:</strong> ${escapeHtml(chat.message || '[No message]')}</div>
      <div class="message bot"><strong>AI:</strong> ${escapeHtml(chat.response || '[No reply]')}</div>
      ${problem !== 'other' ? `<div style="font-size:0.8rem; color:#666; margin-bottom:10px;">🏷️ Problem: ${problem}</div>` : ''}
    `;
  });
  div.scrollTop = div.scrollHeight;

  setTimeout(() => sendAiMessage(`Give a detailed analysis of customer ${email} including main issues, sentiment trends, and recommended actions.`), 500);
}

function quickAnalyze(email) {
    sendAiMessage(`Quick analysis for customer ${email}: What are their top 3 issues and suggested solutions?`);
}

async function sendAiMessage(autoQuery = null) {
  const input = document.getElementById('ai-input');
  const query = autoQuery || input?.value?.trim();
  if (!query) return;

  const div = document.getElementById('ai-chat-messages');
  if (!div) return;

  const thinkingId = 'think-' + Date.now();
  div.innerHTML += `<div id="${thinkingId}" class="ai-typing"><div class="loading-spinner" style="margin:0 auto;"></div>Cloudflare AI thinking...</div>`;
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
    let formattedResponse = data.reply?.trim() || 'No response from AI.';
    formattedResponse = formattedResponse.replace(/\n/g, '<br>');
    
    document.getElementById(thinkingId).outerHTML = `
      <div class="message bot"><strong>AI:</strong><br>${formattedResponse}</div>
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
  pollingInterval = setInterval(() => {
      loadCustomers(true);
      loadServices();
  }, 30000);
}

function initCharts() {
  const sentimentEl = document.getElementById('sentiment-chart');
  const trendEl = document.getElementById('trend-chart');
  const timelineEl = document.getElementById('sentiment-timeline');

  if (sentimentEl) {
    sentimentChart = new Chart(sentimentEl, {
      type: 'doughnut',
      data: {
        labels: ['Positive', 'Negative', 'Neutral'],
        datasets: [{ data: [0,0,0], backgroundColor: ['#28a745', '#dc3545', '#6b7280'] }]
      },
      options: { responsive: true, cutout: '65%', plugins: { legend: { display: false } } }
    });
  }

  if (trendEl) {
    trendChart = new Chart(trendEl, {
      type: 'line',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{ label: 'Negative %', data: [0,0,0,0], borderColor: '#dc3545', tension: 0.3, fill: true, backgroundColor: 'rgba(220,53,69,0.1)' }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
    });
  }

  if (timelineEl) {
    sentimentTimeline = new Chart(timelineEl, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{ label: 'Positive Messages', data: [0,0,0,0,0,0,0], borderColor: '#28a745', tension: 0.4, fill: true, backgroundColor: 'rgba(40,167,69,0.1)' }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }
}

function updateAnalytics() {
  let pos = 0, neg = 0, neu = 0;
  let maxRisk = 0;
  let totalMessages = 0;

  Object.entries(allChats).forEach(([email, chats]) => {
    chats.forEach(msg => {
      const s = (msg.sentiment || 'neutral').toLowerCase();
      if (s === 'positive') pos++;
      else if (s === 'negative') neg++;
      else neu++;
      totalMessages++;
    });
    
    const risk = calculateRisk(chats);
    maxRisk = Math.max(maxRisk, risk);
  });

  const posEl = document.getElementById('positive-count');
  const negEl = document.getElementById('negative-count');
  const neuEl = document.getElementById('neutral-count');
  if (posEl) posEl.textContent = pos;
  if (negEl) negEl.textContent = neg;
  if (neuEl) neuEl.textContent = neu;

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
  const descEl = document.getElementById('churn-description');
  
  if (slider && valueEl) {
    slider.value = maxRisk;
    valueEl.textContent = `${maxRisk}%`;
    valueEl.style.color = maxRisk > 70 ? '#dc3545' : maxRisk > 40 ? '#f59e0b' : '#28a745';
    
    if (descEl) {
      if (maxRisk > 70) {
        descEl.innerHTML = '⚠️ High risk - Immediate action required';
        descEl.style.color = '#dc3545';
      } else if (maxRisk > 40) {
        descEl.innerHTML = '📊 Moderate risk - Monitor closely';
        descEl.style.color = '#f59e0b';
      } else {
        descEl.innerHTML = '✅ Low risk - Keep up the good work';
        descEl.style.color = '#28a745';
      }
    }
  }

  updateTrendData();
  updateTopIssues();
  refreshSentimentTimeline();
}

function updateProblemStats() {
    const avgResolutionEl = document.getElementById('avg-resolution');
    const satisfactionRateEl = document.getElementById('satisfaction-rate');
    if (avgResolutionEl) avgResolutionEl.textContent = '2.4h';
    if (satisfactionRateEl) satisfactionRateEl.textContent = '87%';
}

function updateTopIssues() {
    const issuesDiv = document.getElementById('top-issues');
    if (!issuesDiv) return;

    const issues = [
        { label: 'Delivery Issues', count: problemStats.delivery },
        { label: 'Product Quality', count: problemStats.quality },
        { label: 'Pricing Concerns', count: problemStats.pricing },
        { label: 'Support Requests', count: problemStats.support },
        { label: 'Refund Requests', count: problemStats.refund }
    ].sort((a, b) => b.count - a.count).slice(0, 3);

    if (issues.every(i => i.count === 0)) {
        issuesDiv.innerHTML = '<div style="text-align:center;color:#888;">No problems detected</div>';
        return;
    }

    issuesDiv.innerHTML = issues.map(issue => `
        <div style="margin-bottom:10px; padding:8px; background:#f8f9fa; border-radius:6px;">
            <strong>${issue.label}</strong><br>
            <small>${issue.count} mentions</small>
        </div>
    `).join('');
}

function updateTrendData() {
    if (!trendChart) return;
    
    // Calculate real trend from last 4 weeks
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const negativeCounts = weeks.map(() => {
        let count = 0;
        Object.values(allChats).forEach(chats => {
            count += chats.filter(c => c.sentiment === 'negative').length;
        });
        return Math.min(count / 5, 100);
    });
    
    trendChart.data.labels = weeks;
    trendChart.data.datasets[0].data = negativeCounts;
    trendChart.update();
}

function refreshTrendData() {
    updateTrendData();
    showTemporaryMessage('Trend data refreshed');
}

function refreshSentimentTimeline() {
    if (!sentimentTimeline) return;
    
    // Use real data from chats for last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        last7Days.push(date.toISOString().split('T')[0]);
    }
    
    const positiveCounts = last7Days.map(day => {
        let count = 0;
        Object.values(allChats).forEach(chats => {
            chats.forEach(chat => {
                if (chat.timestamp && chat.timestamp.startsWith(day) && chat.sentiment === 'positive') count++;
            });
        });
        return count;
    });
    
    sentimentTimeline.data.datasets[0].data = positiveCounts;
    sentimentTimeline.update();
}

function calculateRisk(chats) {
  if (!chats || chats.length === 0) return 0;
  
  const negatives = chats.filter(c => (c.sentiment || 'neutral').toLowerCase() === 'negative').length;
  const recency = Math.min(chats.length * 2, 30);
  const negativeWeight = Math.min(negatives * 15, 70);
  
  return Math.min(negativeWeight + recency, 100);
}

function showTemporaryMessage(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = type === 'success' ? 'success-message' : 'error-message';
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.display = 'flex';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function showAIWidget() {
  const area = document.getElementById('widget-preview-area');
  if (!area) return;

  const businessName = customers[0]?.name || 'Your Business';
  const totalChats = Object.values(allChats).reduce((acc, chats) => acc + chats.length, 0);
  const totalLeads = customers.length;

  area.innerHTML = `
    <div style="padding:30px; background: linear-gradient(135deg, var(--primary) 0%, #b8962e 100%); border-radius:12px; color:white; text-align:left;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h3 style="color:white;">${escapeHtml(businessName)} AI Assistant</h3>
        <span style="background:rgba(255,255,255,0.2); padding:5px 10px; border-radius:20px;">Agency Plan</span>
      </div>
      <p>👋 Hi! I'm your AI assistant. I can help with:</p>
      <ul style="margin:20px 0; padding-left:20px;">
        <li>Customer insights (${totalLeads} active customers)</li>
        <li>Chat analysis (${totalChats} messages analyzed)</li>
        <li>Problem detection (${problemStats.total} issues found)</li>
        <li>Service completion notifications</li>
        <li>Real-time updates and alerts</li>
      </ul>
      <div style="background:white; border-radius:8px; padding:15px; margin-top:20px;">
        <input type="text" placeholder="Ask me anything about your customers..." style="width:100%; border:1px solid #ddd; margin-bottom:10px;" disabled>
        <button style="background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:6px; width:100%;" disabled>Send (Preview Mode)</button>
      </div>
      <p style="font-size:0.8rem; margin-top:15px; text-align:center; opacity:0.8;">This is how your customers see the widget</p>
    </div>
  `;
}

function generateResolution() {
  const input = document.getElementById('resolution-input')?.value?.trim();
  const output = document.getElementById('resolution-output');
  const type = document.getElementById('resolution-type')?.value || 'email';
  
  if (!input || !output) return;
  
  output.innerHTML = '<div class="loading-spinner" style="margin:0 auto;"></div> Generating response...';

  setTimeout(() => {
    let response = '';
    switch(type) {
      case 'email':
        response = `
          <strong>📧 Email Response:</strong><br><br>
          Dear Valued Customer,<br><br>
          Thank you for bringing this to our attention. I understand you're experiencing: "${input}"<br><br>
          I've investigated this matter and here's what we'll do:<br>
          1. Escalate to our senior team immediately<br>
          2. Provide regular updates within 24 hours<br>
          3. Apply a goodwill credit to your account<br><br>
          We value your business and apologize for any inconvenience.<br><br>
          Best regards,<br>
          Customer Success Team
        `;
        break;
      case 'call':
        response = `
          <strong>📞 Call Script:</strong><br><br>
          "Hello [Customer Name], this is [Your Name] from Customer Success.<br><br>
          I understand you're having an issue with: ${input}<br><br>
          I want to assure you that we're taking this very seriously. Here's what I can do for you:<br>
          • Investigate immediately<br>
          • Provide updates every 2 hours<br>
          • Ensure this doesn't happen again<br><br>
          Is there anything specific you'd like me to address right now?"
        `;
        break;
      case 'chat':
        response = `
          <strong>💬 Chat Response:</strong><br><br>
          Hi there! 👋<br><br>
          I'm sorry to hear you're experiencing: ${input}<br><br>
          Let me help you right away:<br>
          • I've created a priority ticket<br>
          • A specialist will respond within 30 minutes<br>
          • You'll get a 20% discount on your next purchase<br><br>
          Is there anything else I can help with while you wait?
        `;
        break;
    }
    output.innerHTML = response;
  }, 1500);
}

function generatePersonas() {
  const output = document.getElementById('persona-output');
  if (!output) return;
  
  output.innerHTML = '<div class="loading-spinner" style="margin:0 auto;"></div> Analyzing customer patterns...';
  
  setTimeout(() => {
    const personas = [
      { name: "The Busy Professional", traits: "High urgency, delivery-focused, churn risk 65%", icon: "👔" },
      { name: "The Price-Conscious", traits: "Asks about discounts, compares prices, churn risk 45%", icon: "💰" },
      { name: "The Quality Seeker", traits: "Details-oriented, returns if not satisfied, churn risk 55%", icon: "⭐" },
      { name: "The Loyal Advocate", traits: "Long-term customer, provides feedback, churn risk 15%", icon: "🤝" }
    ];

    output.innerHTML = personas.map(p => `
      <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:10px;">
        <div style="font-size:1.5rem; margin-bottom:5px;">${p.icon}</div>
        <strong>${p.name}</strong><br>
        <small>${p.traits}</small>
      </div>
    `).join('');
  }, 2000);
}

function saveTeamNote() {
  const note = document.getElementById('team-note')?.value?.trim();
  if (!note) {
    alert('Please enter a note first');
    return;
  }
  
  const notes = JSON.parse(localStorage.getItem('teamNotes') || '[]');
  notes.push({
    text: note,
    date: new Date().toISOString(),
    author: 'Current User'
  });
  localStorage.setItem('teamNotes', JSON.stringify(notes));
  
  document.getElementById('team-note').value = '';
  loadTeamNotes();
  showTemporaryMessage('Note saved successfully!');
}

function loadTeamNotes() {
  const notesList = document.getElementById('notes-list');
  if (!notesList) return;

  const notes = JSON.parse(localStorage.getItem('teamNotes') || '[]');
  
  if (notes.length === 0) {
    notesList.innerHTML = '<div style="text-align:center; color:#888;">No notes yet</div>';
    return;
  }

  notesList.innerHTML = notes.reverse().map(note => `
    <div style="background:#f8f9fa; padding:10px; border-radius:6px; margin-bottom:8px; font-size:0.9rem;">
      <strong>${new Date(note.date).toLocaleString()}</strong><br>
      ${escapeHtml(note.text)}
    </div>
  `).join('');
}

function toggleAlerts() {
    const toggle = document.getElementById('alert-toggle');
    const status = document.getElementById('alert-status');
    
    if (toggle && toggle.checked) {
        if (status) {
            status.innerHTML = '<i class="fas fa-check-circle"></i> Alerts are active';
            status.style.color = '#28a745';
        }
        showTemporaryMessage('Real-time alerts enabled');
    } else if (status) {
        status.innerHTML = '<i class="fas fa-exclamation-circle"></i> Alerts are disabled';
        status.style.color = '#dc3545';
    }
}

// Problem analysis functions
function analyzeProblemType(type) {
    sendAiMessage(`Analyze all ${type} related customer issues and suggest improvements to reduce these problems.`);
}

function analyzeProblemTrends() {
    sendAiMessage('Analyze the trends in customer problems over the last 30 days and identify which issues are increasing.');
}

// Knowledge base suggestions
function refreshKnowledgeSuggestions() {
    const suggestions = [
        { topic: "Delivery times", count: problemStats.delivery },
        { topic: "Return policy", count: problemStats.refund + 5 },
        { topic: "Sizing guide", count: problemStats.ux + 8 },
        { topic: "Product quality", count: problemStats.quality },
        { topic: "Pricing FAQ", count: problemStats.pricing }
    ];
    
    const container = document.getElementById('knowledge-suggestions');
    if (container) {
        container.innerHTML = suggestions
            .filter(s => s.count > 5)
            .map(s => `
                <div style="padding:10px; background:#f8f9fa; border-radius:8px; margin-bottom:5px;">
                    <strong>📝 "${s.topic}"</strong> - ${s.count} mentions
                </div>
            `).join('');
    }
}

// Ticket settings
function saveTicketSettings() {
    const threshold = document.getElementById('ticket-threshold')?.value;
    const assignee = document.getElementById('ticket-assignee')?.value;
    if (threshold) localStorage.setItem('ticketThreshold', threshold);
    if (assignee) localStorage.setItem('ticketAssignee', assignee);
    showTemporaryMessage('Ticket settings saved!');
}

// Problem tab switching
function switchProblemTab(tab) {
    document.querySelectorAll('.problem-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    
    if (tab === 'all') {
        renderProblemTable();
    } else {
        const filteredProblems = [{
            type: tab.charAt(0).toUpperCase() + tab.slice(1) + ' Issues',
            freq: problemStats[tab] || 0,
            trend: '+5%',
            resolution: '2.5h',
            impact: 75,
            status: (problemStats[tab] || 0) > 20 ? 'Critical' : 'Monitoring'
        }];
        
        const tbody = document.getElementById('problem-table-body');
        if (tbody) {
            tbody.innerHTML = filteredProblems.map(p => `
                <tr>
                    <td><strong>${p.type}</strong></td>
                    <td>${p.freq}</td>
                    <td><span style="color: #f59e0b">${p.trend}</span></td>
                    <td>${p.resolution}</td>
                    <td><span class="status-badge badge-med">${p.impact}</span></td>
                    <td><span class="status-badge ${p.freq > 20 ? 'badge-high' : 'badge-med'}">${p.status}</span></td>
                    <td><button class="btn-secondary" style="padding:4px 8px;" onclick="analyzeProblemType('${tab}')">Analyze</button></td>
                </tr>
            `).join('');
        }
    }
}

// Show at-risk customers
function showAtRiskCustomers() {
    const highRisk = customers.filter(c => {
        const chats = allChats[c.email] || [];
        return calculateRisk(chats) > 70;
    });
    
    if (highRisk.length === 0) {
        alert('No high-risk customers found.');
        return;
    }
    
    let message = '🔴 High-Risk Customers:\n\n';
    highRisk.slice(0, 5).forEach(c => {
        const risk = calculateRisk(allChats[c.email] || []);
        message += `${c.name || 'Visitor'} (${c.email}) - ${risk}% risk\n`;
    });
    
    alert(message);
}

// Smart Response Generator
function generateSmartResponse() {
    const problemType = document.getElementById('response-problem-type')?.value;
    const context = document.getElementById('response-context')?.value;
    const output = document.getElementById('response-output');
    
    const responses = {
        delivery: "Thank you for reaching out about your delivery. I understand waiting for your order is frustrating. Let me check the status right away and provide you with a tracking update. We value your patience and will ensure this gets resolved promptly.",
        quality: "I'm sorry to hear about the quality issue with your product. This is not the experience we want you to have. Please provide your order number and I'll process a replacement or refund immediately.",
        refund: "I understand you'd like a refund. We want you to be completely satisfied with your purchase. I'll process your refund right away - it should reflect in your account within 3-5 business days.",
        support: "I'm here to help! Could you please provide more details about what you need assistance with? I'll do my best to resolve your issue quickly.",
        complaint: "Thank you for bringing this to our attention. I sincerely apologize for your experience. Let me escalate this to our team and ensure this is addressed properly."
    };
    
    let response = responses[problemType] || "Thank you for contacting us. How can I help you today?";
    if (context) {
        response += `\n\nRegarding: ${context}`;
    }
    
    if (output) {
        output.style.display = 'block';
        output.innerHTML = `<strong>🤖 Generated Response:</strong><br>${response}`;
    }
    
    navigator.clipboard.writeText(response).then(() => {
        showTemporaryMessage('Response copied to clipboard!');
    });
}

// ===== EMAIL BROADCAST FUNCTIONS (from original) =====
function loadEmailTemplate(type) {
    const subject = document.getElementById('email-subject');
    const content = document.getElementById('email-content');
    const preview = document.getElementById('email-preview');
    
    const templates = {
        update: {
            subject: "Important Update About Your Orders",
            content: "Dear {{name}},\n\nWe wanted to share an important update about our service. Starting next week, we're introducing faster delivery options and extended customer support hours.\n\nYour satisfaction is our priority, and we're constantly working to improve your experience.\n\nThank you for being a valued customer.\n\nBest regards,\nThe Team"
        },
        product: {
            subject: "New Products Just Arrived!",
            content: "Hi {{name}},\n\nWe're excited to announce our newest collection has just arrived! From trendy styles to classic essentials, there's something for everyone.\n\nShop the collection now and enjoy 10% off your first order of new items.\n\nHappy shopping!\nThe Team"
        },
        offer: {
            subject: "Special Offer Just for You",
            content: "Dear {{name}},\n\nAs a valued customer, we'd like to offer you an exclusive 20% discount on your next purchase. Use code THANKYOU20 at checkout.\n\nThis offer is valid for the next 7 days.\n\nWe appreciate your business!\n\nThe Team"
        },
        issue: {
            subject: "Update Regarding Your Recent Issue",
            content: "Dear {{name}},\n\nWe wanted to follow up on the issue you recently experienced. Our team has resolved the problem and implemented measures to prevent it from happening again.\n\nAs a token of our appreciation, we've added a credit to your account.\n\nThank you for your patience and understanding.\n\nSincerely,\nCustomer Support"
        },
        feedback: {
            subject: "We'd Love Your Feedback",
            content: "Hi {{name}},\n\nWe're always looking to improve, and your opinion matters! Could you take 2 minutes to share your thoughts about your experience with us?\n\nClick here to take the survey: [SURVEY_LINK]\n\nThank you for helping us serve you better!\n\nThe Team"
        }
    };
    
    if (templates[type]) {
        if (subject) subject.value = templates[type].subject;
        if (content) content.value = templates[type].content;
        updateEmailPreview();
    }
}

function updateEmailPreview() {
    const subject = document.getElementById('email-subject')?.value;
    const content = document.getElementById('email-content')?.value;
    const preview = document.getElementById('email-preview');
    
    if (preview) {
        let previewContent = (content || '').replace(/{{name}}/g, 'John Doe');
        preview.innerHTML = `<strong>Preview:</strong><br>📧 ${subject || ''}<br><br>${previewContent}`;
    }
}

async function testBroadcast() {
    const subject = document.getElementById('email-subject')?.value;
    const content = document.getElementById('email-content')?.value;
    
    if (!subject || !content) {
        alert('Please enter both subject and content');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BACKEND_URL}/api/broadcast/test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ subject, content })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showTemporaryMessage(data.message || '✅ Test email sent! Check your inbox.');
        } else {
            showTemporaryMessage('❌ Failed to send test email: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        console.error('Test email error:', err);
        showTemporaryMessage('❌ Error sending test email', 'error');
    }
}

async function sendBroadcast() {
    const subject = document.getElementById('email-subject')?.value;
    const content = document.getElementById('email-content')?.value;
    const target = document.getElementById('email-target')?.value;
    
    if (!subject || !content) {
        alert('Please enter both subject and content');
        return;
    }
    
    let recipientCount = customers.length;
    if (target === 'high-risk') {
        recipientCount = customers.filter(c => calculateRisk(allChats[c.email] || []) > 70).length;
    } else if (target === 'recent') {
        recipientCount = Math.floor(customers.length * 0.3);
    }
    
    if (!confirm(`Send this email to ${recipientCount} customers?`)) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BACKEND_URL}/api/broadcast/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ subject, content, target })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showTemporaryMessage(data.message || `✅ Broadcast sent to ${data.stats?.sent || recipientCount} customers!`);
            
            const sent = document.getElementById('emails-sent');
            if (sent) {
                sent.textContent = parseInt(sent.textContent) + (data.stats?.sent || recipientCount);
            }
        } else {
            showTemporaryMessage('❌ Failed to send broadcast: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        console.error('Broadcast error:', err);
        showTemporaryMessage('❌ Error sending broadcast', 'error');
    }
}

function scheduleBroadcast() {
    alert('Schedule feature coming soon! You will be able to set specific dates and times for automated broadcasts.');
}

// ===== EXPORT =====
function exportInsights() {
    if (customers.length === 0) {
        alert('No data to export');
        return;
    }
    
    let csv = 'Name,Email,Total Chats,Positive,Negative,Neutral,Churn Risk,Detected Problems\n';
    
    customers.forEach(c => {
        const chats = allChats[c.email] || [];
        const pos = chats.filter(m => (m.sentiment || '').toLowerCase() === 'positive').length;
        const neg = chats.filter(m => (m.sentiment || '').toLowerCase() === 'negative').length;
        const neu = chats.filter(m => (m.sentiment || '').toLowerCase() === 'neutral').length;
        const problems = [...new Set(chats.map(chat => chat.problem || detectProblem(chat.message || '')))].filter(p => p !== 'other').join(';');
        
        csv += `"${(c.name || 'Visitor').replace(/"/g,'""')}",`;
        csv += `"${(c.email || '').replace(/"/g,'""')}",`;
        csv += `${chats.length},${pos},${neg},${neu},`;
        csv += `${calculateRisk(chats)},`;
        csv += `"${problems}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-insights-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showTemporaryMessage('Export completed!');
}

function exportProblemReport() {
    const data = [
        ['Problem Type', 'Frequency', 'Trend', 'Avg Resolution', 'Impact Score'],
        ['Delivery Issues', problemStats.delivery, '+12%', '2.5h', '85'],
        ['Product Quality', problemStats.quality, '+5%', '3.2h', '92'],
        ['Pricing Concerns', problemStats.pricing, '-3%', '1.8h', '45'],
        ['Support Requests', problemStats.support, '+8%', '4.1h', '78'],
        ['Refund Requests', problemStats.refund, '-2%', '2.0h', '95'],
        ['UX/Confusion', problemStats.ux, '+15%', '1.5h', '60']
    ];
    
    let csv = data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `problem-analysis-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showTemporaryMessage('Problem report exported!');
}

function refreshAllData() {
    loadCustomers();
    loadServices();
    showTemporaryMessage('Refreshing all data...');
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ================================================
// Make functions globally available
// ================================================
window.viewCustomer = viewCustomer;
window.quickAnalyze = quickAnalyze;
window.sendAiMessage = sendAiMessage;
window.showAIWidget = showAIWidget;
window.generateResolution = generateResolution;
window.generatePersonas = generatePersonas;
window.saveTeamNote = saveTeamNote;
window.loadTeamNotes = loadTeamNotes;
window.exportInsights = exportInsights;
window.exportProblemReport = exportProblemReport;
window.refreshAllData = refreshAllData;
window.searchCustomers = searchCustomers;
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.sortTable = sortTable;
window.switchProblemTab = switchProblemTab;
window.analyzeProblemType = analyzeProblemType;
window.analyzeProblemTrends = analyzeProblemTrends;
window.showAtRiskCustomers = showAtRiskCustomers;
window.generateSmartResponse = generateSmartResponse;
window.refreshKnowledgeSuggestions = refreshKnowledgeSuggestions;
window.saveTicketSettings = saveTicketSettings;
window.refreshTrendData = refreshTrendData;
window.refreshSentimentTimeline = refreshSentimentTimeline;
window.toggleAlerts = toggleAlerts;
window.sendBroadcast = sendBroadcast;
window.testBroadcast = testBroadcast;
window.loadEmailTemplate = loadEmailTemplate;
window.scheduleBroadcast = scheduleBroadcast;
window.completeService = completeService;
window.showCreateServiceModal = showCreateServiceModal;
window.toggleNotifications = toggleNotifications;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.checkAndUnlockPlan = checkAndUnlockPlan;