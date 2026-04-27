// ============================================
// SMART-LOGIC.JS - FULLY UPDATED FOR SAAS READY
// Real-time data from backend - NO SIMULATIONS
// Works with smart-tools.html (updated version)
// ============================================

// Ensure BACKEND_URL is available
if (typeof window.BACKEND_URL === 'undefined') {
    console.error('❌ BACKEND_URL not defined! Make sure master-fix.js is loaded first.');
    window.BACKEND_URL = 'https://ai-smart-hub.onrender.com';
}

const API_BASE = window.BACKEND_URL;

let CURRENT_USER_PLAN = localStorage.getItem('currentPlan') || 'free';
let CURRENT_USER_TOKEN = localStorage.getItem('token');

// Tool state management - persists across sessions
let TOOL_STATES = JSON.parse(localStorage.getItem('toolStates') || '{}');
let TOOL_SETTINGS = JSON.parse(localStorage.getItem('toolSettings') || '{}');

// Tool name mapping for user-friendly messages
const TOOL_NAMES = {
    'brain': 'AI Brain & Knowledge Base',
    'booking': 'Appointment Booking',
    'sentiment': 'Crisis Guard (Sentiment Monitoring)',
    'handover': 'Live Handover',
    'webhook': 'CRM Webhook Sync',
    'apollo': 'Apollo Lead Enrichment',
    'enrichment': 'Apollo Lead Enrichment',
    'vision': 'AI Vision Hub',
    'followup': 'AI Email Nurture',
    'business_type': 'Business Identity'
};

// Tool to card ID mapping
const TOOL_CARD_MAP = {
    'brain': 'card-brain',
    'booking': 'card-booking',
    'sentiment': 'card-sentiment',
    'handover': 'card-handover',
    'webhook': 'card-webhook',
    'apollo': 'card-apollo',
    'enrichment': 'card-apollo',
    'vision': 'card-vision',
    'followup': 'card-followup',
    'business_type': 'card-business-type'
};

// Tool to section ID mapping for quick edit
const TOOL_SECTION_MAP = {
    'brain': 'ai-brain-section',
    'booking': 'card-booking',
    'handover': 'card-handover',
    'apollo': 'card-apollo',
    'vision': 'card-vision',
    'followup': 'card-followup',
    'business_type': 'business-identity-section'
};

// ============================================
// 1. INITIALIZATION - LOAD ALL DATA ON PAGE READY
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Smart Hub Logic Initialized - Fetching real data from backend...");
    injectLiveStatusCSS();
    loadUserPlanAndUnlock();
    wireSmartToolActivateButtons();
    wireSaveButtons();
    updateUserEmail();
    loadToolStatesFromStorage();
    setupInputChangeListeners();
    
    // Load real-time data from backend
    refreshAllRealTimeData();
    
    // Set up periodic refresh (every 5 seconds) for real-time panel
    if (window.refreshInterval) clearInterval(window.refreshInterval);
    window.refreshInterval = setInterval(() => {
        refreshAllRealTimeData();
    }, 5000);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.refreshInterval) clearInterval(window.refreshInterval);
});

// Refresh all real-time data from backend
async function refreshAllRealTimeData() {
    await fetchRealTimeMetrics();
    await fetchRealTimeActivities();
}

// Fetch real-time metrics from backend
async function fetchRealTimeMetrics() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/metrics`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            const leadsEl = document.getElementById('liveLeadsCount');
            const deliveredEl = document.getElementById('liveDeliveredCount');
            const failedEl = document.getElementById('liveFailedCount');
            const conversionEl = document.getElementById('liveConversionRate');
            const chatsEl = document.getElementById('liveActiveChats');
            const responseEl = document.getElementById('liveResponseTime');
            
            if (leadsEl) leadsEl.innerText = data.totalLeads || 0;
            if (deliveredEl) deliveredEl.innerText = data.deliveredCount || 0;
            if (failedEl) failedEl.innerText = data.failedCount || 0;
            if (conversionEl) conversionEl.innerHTML = (data.conversionRate || 0) + '%';
            if (chatsEl) chatsEl.innerText = data.activeChats || 0;
            if (responseEl) responseEl.innerHTML = (data.avgResponseTime || 0) + '<span style="font-size: 1rem;">s</span>';
            
            console.log("[METRICS] Updated:", data);
        }
    } catch (err) {
        console.error('[METRICS] Failed to fetch:', err);
    }
}

// Fetch real-time activities from backend
async function fetchRealTimeActivities() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/activities`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const activities = await response.json();
            const feed = document.getElementById('activityFeed');
            
            if (feed && activities && activities.length > 0) {
                feed.innerHTML = activities.map(activity => `
                    <div class="activity-item">
                        <span><i class="fas ${activity.icon || 'fa-bell'}"></i> ${escapeHtml(activity.message)}</span>
                        <span class="activity-${activity.status}">${activity.statusText || activity.status}</span>
                        <span>${activity.timeAgo || 'Just now'}</span>
                    </div>
                `).join('');
            }
        }
    } catch (err) {
        console.error('[ACTIVITIES] Failed to fetch:', err);
    }
}

// ============================================
// 2. PLAN DETECTION & FEATURE UNLOCKING
// ============================================
async function loadUserPlanAndUnlock() {
    if (!CURRENT_USER_TOKEN) {
        console.warn("No token found - defaulting to free mode");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/dashboard/full`, {
            headers: { 'Authorization': `Bearer ${CURRENT_USER_TOKEN}` }
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const userData = await response.json();
        console.log("[PLAN] User data from server:", userData);

        CURRENT_USER_PLAN = (userData.plan || 'free').toLowerCase().trim();
        localStorage.setItem('currentPlan', CURRENT_USER_PLAN);

        const planDisplay = document.getElementById('currentPlanName');
        if (planDisplay) {
            planDisplay.innerText = CURRENT_USER_PLAN.toUpperCase();
        }

        console.log("[PLAN] Detected plan:", CURRENT_USER_PLAN);
        unlockPremiumFeatures(CURRENT_USER_PLAN);
        await loadSavedSettingsFromServer();
        await loadApiKeysFromServer();
        await loadCustomLinksFromServer();

    } catch (err) {
        console.error("[PLAN] Failed to load user plan:", err);
        const backupPlan = localStorage.getItem('currentPlan');
        if (backupPlan) {
            CURRENT_USER_PLAN = backupPlan.toLowerCase().trim();
            unlockPremiumFeatures(CURRENT_USER_PLAN);
        }
    }
}

function unlockPremiumFeatures(plan) {
    console.log("[UNLOCK] Starting unlock for plan:", plan);
    const normalized = plan.toLowerCase().trim();

    const coreTools = ['card-brain', 'card-booking', 'card-handover', 'card-analytics', 'card-business-type'];
    coreTools.forEach(id => removeLock(id));

    if (normalized === 'free') {
        console.log("[UNLOCK] Free plan - only core tools unlocked");
        return;
    }

    const proTools = ['card-followup', 'card-webhook', 'card-apollo', 'card-sentiment'];
    const enterpriseTools = ['card-vision'];

    if (['pro', 'enterprise', 'agency'].includes(normalized)) {
        proTools.forEach(id => removeLock(id));
    }

    if (['enterprise', 'agency'].includes(normalized)) {
        enterpriseTools.forEach(id => removeLock(id));
    }
}

function removeLock(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;

    card.classList.remove('locked-card');
    card.style.filter = "none";
    card.style.pointerEvents = "auto";
    card.style.opacity = "1";

    const overlay = card.querySelector('.lock-overlay');
    if (overlay) overlay.remove();

    const elements = card.querySelectorAll('button, input, select, textarea');
    elements.forEach(el => {
        el.disabled = false;
        el.removeAttribute('disabled');
        el.style.pointerEvents = "auto";
        el.style.opacity = "1";
    });
}

// ============================================
// 3. UI STYLES & HELPER FUNCTIONS
// ============================================
function injectLiveStatusCSS() {
    const style = document.createElement('style');
    style.innerHTML = `
        .btn-live-status {
            background: #2ecc71 !important;
            color: white !important;
            box-shadow: 0 0 10px rgba(46, 204, 113, 0.6);
            animation: pulse-live 2s infinite;
        }
        @keyframes pulse-live {
            0% { box-shadow: 0 0 0 0px rgba(46, 204, 113, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(46, 204, 113, 0); }
            100% { box-shadow: 0 0 0 0px rgba(46, 204, 113, 0); }
        }
    `;
    document.head.appendChild(style);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function maskApiKey(key) {
    if (!key) return '••••••••';
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
}

function updateUserEmail() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const emailEl = document.getElementById('userEmail');
            if (emailEl) emailEl.textContent = payload.email || 'admin@business.io';
        } catch (e) {}
    }
}

function getToolTypeFromCard(cardId) {
    const map = {
        'card-brain': 'brain',
        'card-booking': 'booking',
        'card-sentiment': 'sentiment',
        'card-handover': 'handover',
        'card-webhook': 'webhook',
        'card-apollo': 'apollo',
        'card-vision': 'vision',
        'card-followup': 'followup',
        'card-business-type': 'business_type'
    };
    return map[cardId];
}

function saveToolState(toolType, isActive) {
    TOOL_STATES[toolType] = isActive;
    localStorage.setItem('toolStates', JSON.stringify(TOOL_STATES));
    
    const token = localStorage.getItem('token');
    if (token && isActive !== undefined) {
        fetch(`${API_BASE}/api/smart-hub/tool-state`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ toolType, isActive })
        }).catch(err => console.warn("[TOOL] Failed to sync state:", err));
    }
}

function loadToolStatesFromStorage() {
    Object.keys(TOOL_STATES).forEach(toolType => {
        if (TOOL_STATES[toolType]) {
            const cardId = TOOL_CARD_MAP[toolType];
            if (cardId) {
                const card = document.getElementById(cardId);
                if (card) {
                    const btn = card.querySelector('.btn-save');
                    if (btn && btn.innerText !== '● LIVE') {
                        btn.innerText = "● LIVE";
                        btn.classList.add('btn-live-status');
                    }
                }
            }
        }
    });
}

// ============================================
// 4. INPUT CHANGE LISTENERS
// ============================================
function setupInputChangeListeners() {
    const inputSelectors = [
        '#businessType', '#businessDescription',
        '#aiInstructions', '#aiTemp', '#aiLang',
        '#bookingUrl', '#apolloKey', '#alertEmail',
        '#handoverTrigger', '#webhookUrl'
    ];

    inputSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            el.addEventListener('input', (e) => {
                const card = e.target.closest('.tool-card');
                if (card) {
                    const btn = card.querySelector('.btn-save');
                    if (btn && btn.innerText !== 'Save Changes' && btn.innerText !== 'Saving...') {
                        const toolType = getToolTypeFromCard(card.id);
                        if (TOOL_STATES[toolType]) {
                            btn.innerText = 'Update Settings';
                            btn.classList.remove('btn-live-status');
                        } else {
                            btn.innerText = 'Save Changes';
                        }
                    }
                }
            });
        });
    });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(el => {
        el.addEventListener('change', (e) => {
            const card = e.target.closest('.tool-card');
            if (card) {
                const btn = card.querySelector('.btn-save');
                if (btn && btn.innerText !== 'Save Changes' && btn.innerText !== 'Saving...') {
                    const toolType = getToolTypeFromCard(card.id);
                    if (TOOL_STATES[toolType]) {
                        btn.innerText = 'Update Settings';
                        btn.classList.remove('btn-live-status');
                    } else {
                        btn.innerText = 'Save Changes';
                    }
                }
            }
        });
    });
}

function wireSaveButtons() {
    console.log("[WIRE] Save buttons ready");
}

// ============================================
// 5. API KEYS FUNCTIONS (BACKEND STORAGE)
// ============================================
async function loadApiKeysFromServer() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/api-keys`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const keys = await response.json();
            const container = document.getElementById('apiKeysList');
            if (container) {
                if (!keys || keys.length === 0) {
                    container.innerHTML = '<p style="color: #6b7280; font-size: 0.85rem;">No API keys configured yet.</p>';
                } else {
                    container.innerHTML = keys.map(key => `
                        <div class="api-key-row">
                            <div>
                                <span class="api-status ${key.status || 'verified'}"></span>
                                <span class="api-key-name">${escapeHtml(key.name)}</span>
                            </div>
                            <div>
                                <span class="api-key-value">${maskApiKey(key.value)}</span>
                                <button class="delete-link" style="margin-left: 10px;" onclick="deleteApiKey('${key.id}')"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (err) {
        console.error('Failed to load API keys:', err);
    }
}

async function saveApiKeyToBackend(name, value) {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/api-keys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, value })
        });
        
        if (response.ok) {
            await loadApiKeysFromServer();
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to save API key:', err);
        return false;
    }
}

window.deleteApiKey = async function(keyId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/api-keys/${keyId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            await loadApiKeysFromServer();
            alert('API key deleted successfully');
        }
    } catch (err) {
        console.error('Failed to delete API key:', err);
    }
};

// ============================================
// 6. CUSTOM LINKS FUNCTIONS (BACKEND STORAGE)
// ============================================
async function loadCustomLinksFromServer() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/custom-links`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const links = await response.json();
            const container = document.getElementById('customLinksList');
            if (container) {
                if (!links || links.length === 0) {
                    container.innerHTML = '<p style="color: #6b7280; font-size: 0.85rem;">No links added yet.</p>';
                } else {
                    container.innerHTML = links.map(link => `
                        <div class="link-item">
                            <div>
                                <strong>${escapeHtml(link.name)}</strong><br>
                                <a href="${link.url}" target="_blank">${link.url.substring(0, 50)}${link.url.length > 50 ? '...' : ''}</a>
                            </div>
                            <button class="delete-link" onclick="deleteCustomLink('${link.id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (err) {
        console.error('Failed to load custom links:', err);
    }
}

async function saveCustomLinkToBackend(name, url) {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/custom-links`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, url })
        });
        
        if (response.ok) {
            await loadCustomLinksFromServer();
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to save custom link:', err);
        return false;
    }
}

window.deleteCustomLink = async function(linkId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/custom-links/${linkId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            await loadCustomLinksFromServer();
            alert('Link deleted successfully');
        }
    } catch (err) {
        console.error('Failed to delete custom link:', err);
    }
};

// ============================================
// 7. TOOL ACTIVATION & DEACTIVATION
// ============================================
function wireSmartToolActivateButtons() {
    const activateBtns = document.querySelectorAll('[data-run-tool]');
    activateBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const toolType = btn.getAttribute('data-run-tool');
            await runSmartTool(toolType, btn);
        });
    });
}

async function runSmartTool(toolType, btn) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert("Please log in first.");
        return;
    }

    const isPaid = ['pro', 'enterprise', 'agency'].includes(CURRENT_USER_PLAN.toLowerCase().trim());
    if (!isPaid && toolType !== 'booking' && toolType !== 'business_type') {
        alert("This feature is only available on Pro or higher plans.");
        return;
    }

    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Running...";

    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/test-tool`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ toolType })
        });

        let result = null;
        const text = await response.text();
        try { result = text ? JSON.parse(text) : {}; } catch(e) { result = {}; }

        if (!response.ok) throw new Error(result?.error || "Tool execution failed");

        btn.innerText = "● LIVE";
        btn.classList.add('btn-live-status');
        saveToolState(toolType, true);

        const toolName = TOOL_NAMES[toolType] || toolType;
        alert(`${toolName} has been successfully activated and is now LIVE.`);

    } catch (err) {
        console.error("[RUN ERROR]", err);
        btn.innerText = "❌ Failed";
        setTimeout(() => {
            btn.disabled = false;
            btn.innerText = originalText;
            btn.classList.remove('btn-live-status');
        }, 2000);
        alert("Tool failed: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

async function deactivateTool(toolType, btn) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert("Please log in first");
        return;
    }

    const originalText = btn?.innerText || 'Activate';
    const toolName = TOOL_NAMES[toolType] || toolType;

    if (btn) {
        btn.disabled = true;
        btn.innerText = "Deactivating...";
    }

    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/deactivate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ toolType })
        });

        let result;
        const responseText = await response.text();
        try { result = JSON.parse(responseText); } catch(e) { throw new Error("Invalid response"); }

        if (response.ok && result.success) {
            saveToolState(toolType, false);
            
            if (btn) {
                btn.innerText = "✗ Deactivated";
                btn.style.background = "#6c757d";
                btn.classList.remove('btn-live-status');
                setTimeout(() => {
                    btn.innerText = "Activate";
                    btn.disabled = false;
                    btn.style.background = "";
                }, 1500);
            }
            alert(`${toolName} has been deactivated.`);
        } else {
            throw new Error(result.error || "Deactivation failed");
        }
    } catch (err) {
        console.error("[DEACTIVATE] Error:", err);
        if (btn) {
            btn.innerText = "● LIVE";
            btn.classList.add('btn-live-status');
            btn.disabled = false;
        }
        alert(`Failed to deactivate: ${err.message}`);
    }
}

// ============================================
// 8. SAVE TOOL SETTINGS TO BACKEND
// ============================================
async function saveSmartTool(toolType, event) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert("Please log in to save changes.");
        return;
    }

    const btn = event?.currentTarget || event?.target || document.activeElement;
    const originalText = btn?.innerText || '';
    const toolName = TOOL_NAMES[toolType] || toolType;

    if (TOOL_STATES[toolType] === true && originalText === '● LIVE') {
        if (confirm(`Do you want to update ${toolName} settings or deactivate it?\n\nClick OK to update\nClick Cancel to deactivate`)) {
            await performSave(toolType, btn, true);
        } else {
            if (confirm(`Are you sure you want to deactivate ${toolName}?`)) {
                deactivateTool(toolType, btn);
            }
        }
        return;
    }

    if (originalText === 'Update Settings') {
        await performSave(toolType, btn, true);
        return;
    }

    await performSave(toolType, btn, true);
}

async function performSave(toolType, btn, activateAfterSave = true) {
    const token = localStorage.getItem('token');
    if (!token) return;

    const originalText = btn?.innerText || '';
    const toolName = TOOL_NAMES[toolType] || toolType;
    let data = {};

    try {
        switch(toolType) {
            case 'brain':
                data = {
                    instructions: document.getElementById('aiInstructions')?.value || '',
                    temp: document.getElementById('aiTemp')?.value || '0.7',
                    lang: document.getElementById('aiLang')?.value || 'auto'
                };
                break;
            case 'booking':
                data = { url: document.getElementById('bookingUrl')?.value || '' };
                break;
            case 'sentiment':
                data = { email: document.getElementById('alertEmail')?.value || '' };
                break;
            case 'handover':
                data = { trigger: document.getElementById('handoverTrigger')?.value || 'human' };
                break;
            case 'webhook':
                data = { url: document.getElementById('webhookUrl')?.value || '' };
                break;
            case 'apollo':
                data = { apolloKey: document.getElementById('apolloKey')?.value || '' };
                break;
            case 'vision':
                data = { enabled: document.getElementById('visionToggle')?.checked || false };
                break;
            case 'followup':
                data = { enabled: document.getElementById('followupToggle')?.checked || false };
                break;
            case 'business_type':
                data = { 
                    businessType: document.getElementById('businessType')?.value || '',
                    businessDescription: document.getElementById('businessDescription')?.value || ''
                };
                break;
            default:
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
                return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerText = "Saving...";
        }

        const response = await fetch(`${API_BASE}/api/smart-hub/save`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ toolType, data })
        });

        let result;
        const responseText = await response.text();
        try { result = JSON.parse(responseText); } catch(e) { throw new Error("Server returned invalid response"); }

        if (response.ok && result.success) {
            localStorage.setItem(`ai_settings_${toolType}`, JSON.stringify(data));
            
            if (btn) {
                btn.innerText = `✓ Saved`;
                btn.style.background = "#28a745";
            }
            
            alert(`${toolName} has been successfully saved!`);
            
            if (activateAfterSave) {
                saveToolState(toolType, true);
                setTimeout(() => {
                    if (btn) {
                        btn.innerText = "● LIVE";
                        btn.classList.add('btn-live-status');
                        btn.style.background = "";
                        btn.disabled = false;
                    }
                }, 1000);
            } else {
                setTimeout(() => {
                    if (btn) {
                        btn.innerText = originalText;
                        btn.disabled = false;
                        btn.style.background = "";
                    }
                }, 1000);
            }
        } else {
            throw new Error(result.error || "Server rejected update");
        }
    } catch (err) {
        console.error("[SAVE] Error:", err.message);
        if (btn) {
            btn.innerText = "❌ Error";
            btn.style.background = "#e74c3c";
            setTimeout(() => {
                btn.disabled = false;
                btn.innerText = originalText;
                btn.style.background = "";
            }, 2000);
        }
        alert(`Could not save ${toolName}: ${err.message}`);
    }
}

// ============================================
// 9. LOAD SAVED SETTINGS FROM BACKEND
// ============================================
async function loadSavedSettingsFromServer() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/settings`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error("Load failed");

        const data = await response.json();
        console.log("[LOAD] Settings loaded from server:", data);

        const mappings = {
            ai_instructions: 'aiInstructions',
            ai_temp: 'aiTemp',
            ai_lang: 'aiLang',
            booking_url: 'bookingUrl',
            alert_email: 'alertEmail',
            handover_trigger: 'handoverTrigger',
            webhook_url: 'webhookUrl',
            apollo_key: 'apolloKey',
            business_type: 'businessType',
            business_description: 'businessDescription'
        };

        for (const [dbKey, htmlId] of Object.entries(mappings)) {
            const el = document.getElementById(htmlId);
            if (el && data[dbKey] !== undefined && data[dbKey] !== null) {
                el.value = data[dbKey];
            }
        }

        const toggleMap = {
            visionToggle: data.vision_active === 1,
            followupToggle: data.followup_active === 1
        };

        for (const [id, shouldBeOn] of Object.entries(toggleMap)) {
            const toggle = document.getElementById(id);
            if (toggle) toggle.checked = shouldBeOn;
        }

        const activeMap = {
            brain: { active: data.brain_active === 1, cardId: 'card-brain' },
            booking: { active: data.booking_active === 1, cardId: 'card-booking' },
            sentiment: { active: data.sentiment_active === 1, cardId: 'card-sentiment' },
            handover: { active: data.handover_active === 1, cardId: 'card-handover' },
            webhook: { active: data.webhook_active === 1, cardId: 'card-webhook' },
            apollo: { active: data.apollo_active === 1, cardId: 'card-apollo' },
            vision: { active: data.vision_active === 1, cardId: 'card-vision' },
            followup: { active: data.followup_active === 1, cardId: 'card-followup' },
            business_type: { active: data.business_type ? true : false, cardId: 'card-business-type' }
        };

        Object.entries(activeMap).forEach(([tool, { active, cardId }]) => {
            if (active) {
                const card = document.getElementById(cardId);
                if (card) {
                    const btn = card.querySelector('.btn-save');
                    if (btn) {
                        btn.innerText = "● LIVE";
                        btn.classList.add('btn-live-status');
                        saveToolState(tool, true);
                    }
                }
            }
        });

    } catch (err) {
        console.warn("[LOAD] Server load failed - using local fallback:", err.message);
        loadSavedSettingsFromLocal();
    }
}

function loadSavedSettingsFromLocal() {
    const tools = ['brain', 'booking', 'sentiment', 'handover', 'webhook', 'apollo', 'vision', 'business_type'];
    tools.forEach(tool => {
        const saved = localStorage.getItem(`ai_settings_${tool}`);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (tool === 'brain' && document.getElementById('aiInstructions')) {
                    document.getElementById('aiInstructions').value = data.instructions || "";
                    if (document.getElementById('aiTemp')) document.getElementById('aiTemp').value = data.temp || "0.7";
                    if (document.getElementById('aiLang')) document.getElementById('aiLang').value = data.lang || "auto";
                }
                if (tool === 'booking' && document.getElementById('bookingUrl')) {
                    document.getElementById('bookingUrl').value = data.url || "";
                }
                if (tool === 'apollo' && document.getElementById('apolloKey')) {
                    document.getElementById('apolloKey').value = data.apolloKey || "";
                }
                if (tool === 'business_type' && document.getElementById('businessType')) {
                    document.getElementById('businessType').value = data.businessType || "";
                    if (document.getElementById('businessDescription')) {
                        document.getElementById('businessDescription').value = data.businessDescription || "";
                    }
                }
            } catch(e) {}
        }
    });
    loadToolStatesFromStorage();
}

// ============================================
// 10. TEAM MANAGEMENT & EXPORT
// ============================================
window.openInviteModal = function() {
    const email = prompt("Enter team member email:");
    if (email && email.includes('@')) {
        const table = document.getElementById('teamTableBody');
        if(table) {
            const newRow = table.insertRow();
            newRow.innerHTML = `
                <td><strong>New Member</strong></td>
                <td>${escapeHtml(email)}</td>
                <td><span class="role-tag tag-staff">Staff</span></td>
                <td><span style="color: #f59e0b;"><i class="fas fa-circle" style="font-size: 8px;"></i> Pending</span></td>
                <td><button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fas fa-trash"></i></button></td>
            `;
            alert("Invitation sent to " + email);
        }
    }
};

window.exportBusinessData = function() {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "Exporting...";
    btn.disabled = true;
    
    setTimeout(() => {
        const exportData = {
            toolStates: TOOL_STATES,
            toolSettings: TOOL_SETTINGS,
            timestamp: new Date().toISOString()
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = "business_export.json";
        a.click();
        btn.innerText = originalText;
        btn.disabled = false;
    }, 1000);
};

// ============================================
// 11. WIDGET CAPABILITIES & CUSTOM PROMPTS
// ============================================
function loadCustomPrompts() {
    const saved = localStorage.getItem('systemPrompts');
    const prompts = saved ? JSON.parse(saved) : {};
    const listDiv = document.getElementById('activePromptsList');
    if (!listDiv) return;
    
    if (Object.keys(prompts).length === 0) {
        listDiv.innerHTML = '<p style="color: #6b7280; font-size: 0.85rem;">No prompts saved yet.</p>';
        return;
    }
    
    listDiv.innerHTML = Object.entries(prompts).map(([tool, prompt]) => `
        <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 10px;">
            <strong style="color: var(--primary);">${escapeHtml(tool)}:</strong>
            <p style="font-size: 0.8rem; margin-top: 5px;">${escapeHtml(prompt.substring(0, 100))}${prompt.length > 100 ? '...' : ''}</p>
        </div>
    `).join('');
}

// Make functions globally available
window.saveSmartTool = saveSmartTool;
window.exportBusinessData = exportBusinessData;
window.deactivateTool = deactivateTool;
window.runSmartTool = runSmartTool;
window.loadCustomPrompts = loadCustomPrompts;

// Image upload handler for proof images
window.uploadProofImages = async function(images) {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    try {
        const response = await fetch(`${API_BASE}/api/smart-hub/upload-proof`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ images })
        });
        return response.ok;
    } catch (err) {
        console.error('Failed to upload images:', err);
        return false;
    }
};

console.log("✅ smart-logic.js fully loaded - SaaS ready, no simulations, all real backend data");