// smart-logic.js - Smart Business Hub - AI Logic Controller (FULLY FIXED)
// Unlocks tools for ANY Pro / Enterprise / Agency subscriber
// Saves & loads settings to/from real backend
// LIVE button stays "● LIVE" after activation (persists on refresh AND logout)
// Added Business Identity support with proper unlocking
// Tool states now persist in database and localStorage

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

// 1. Load on page ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("Smart Hub Logic Initialized - Fetching real plan...");
    injectLiveStatusCSS();
    loadUserPlanAndUnlock();
    wireSmartToolActivateButtons();
    wireSaveButtons();
    updateUserEmail();
    loadToolStatesFromStorage();
});

// Load tool states from localStorage and apply to UI
function loadToolStatesFromStorage() {
    console.log("[TOOL] Loading tool states from localStorage:", TOOL_STATES);
    
    Object.keys(TOOL_STATES).forEach(toolType => {
        if (TOOL_STATES[toolType]) {
            const cardId = TOOL_CARD_MAP[toolType];
            if (cardId) {
                const card = document.getElementById(cardId);
                if (card) {
                    const btn = card.querySelector('.btn-save');
                    if (btn) {
                        btn.innerText = "● LIVE";
                        btn.classList.add('btn-live-status');
                        console.log(`[TOOL] Applied LIVE state to ${toolType}`);
                    }
                }
            }
        }
    });
}

// Save tool state to localStorage and optionally to backend
function saveToolState(toolType, isActive) {
    TOOL_STATES[toolType] = isActive;
    localStorage.setItem('toolStates', JSON.stringify(TOOL_STATES));
    console.log(`[TOOL] State saved for ${toolType}: ${isActive ? 'LIVE' : 'inactive'}`);
    
    // Also save to backend if token exists
    const token = localStorage.getItem('token');
    if (token) {
        fetch(`${API_BASE}/api/smart-hub/tool-state`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ toolType, isActive })
        }).catch(err => console.warn("[TOOL] Failed to sync state to backend:", err));
    }
}

// Wire all save buttons
function wireSaveButtons() {
    console.log("[WIRE] Save buttons ready");
}

// Update user email in team table
function updateUserEmail() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const emailEl = document.getElementById('userEmail');
            if (emailEl) {
                emailEl.textContent = payload.email || 'admin@business.io';
            }
        } catch (e) {}
    }
}

/**
 * ✅ Injects professional CSS for the "LIVE" status
 */
function injectLiveStatusCSS() {
    const style = document.createElement('style');
    style.innerHTML = `
        .btn-live-status {
            background: #2ecc71 !important;
            color: white !important;
            box-shadow: 0 0 10px rgba(46, 204, 113, 0.6);
            border: none !important;
            font-weight: bold;
            animation: pulse-live 2s infinite;
        }
        .btn-inactive {
            background: #6c757d !important;
            color: white !important;
        }
        .btn-inactive:hover {
            background: #5a6268 !important;
        }
        @keyframes pulse-live {
            0% { box-shadow: 0 0 0 0px rgba(46, 204, 113, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(46, 204, 113, 0); }
            100% { box-shadow: 0 0 0 0px rgba(46, 204, 113, 0); }
        }
    `;
    document.head.appendChild(style);
}

// 2. Fetch real plan & unlock features
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

        // Unlock based on real plan
        unlockPremiumFeatures(CURRENT_USER_PLAN);

        // Load saved settings + re-apply LIVE statuses
        await loadSavedSettingsFromServer();

    } catch (err) {
        console.error("[PLAN] Failed to load user plan:", err);
        // Fallback to localStorage if backend is down
        const backupPlan = localStorage.getItem('currentPlan');
        if (backupPlan) {
            CURRENT_USER_PLAN = backupPlan.toLowerCase().trim();
            unlockPremiumFeatures(CURRENT_USER_PLAN);
        }
    }
}

// 3. Unlock logic - FIXED to include ALL cards including Business Identity
function unlockPremiumFeatures(plan) {
    console.log("[UNLOCK] Starting unlock for plan:", plan);

    const normalized = plan.toLowerCase().trim();

    // Always unlock core tools (available to everyone)
    const coreTools = ['card-brain', 'card-booking', 'card-handover', 'card-analytics', 'card-business-type'];
    coreTools.forEach(id => removeLock(id));

    if (normalized === 'free') {
        console.log("[UNLOCK] Free plan - only core tools unlocked");
        return;
    }

    // Pro / Enterprise / Agency get these
    const proTools = [
        'card-followup', 
        'card-webhook', 
        'card-enrichment', 
        'card-apollo',
        'card-sentiment'          
    ];

    // Enterprise / Agency get extra
    const enterpriseTools = [
        'card-intel', 
        'card-vision-ai', 
        'card-vision'
    ];

    if (['pro', 'enterprise', 'agency'].includes(normalized)) {
        console.log("[UNLOCK] Unlocking Pro tools:", proTools);
        proTools.forEach(id => removeLock(id));
    }

    if (['enterprise', 'agency'].includes(normalized)) {
        console.log("[UNLOCK] Unlocking Enterprise tools:", enterpriseTools);
        enterpriseTools.forEach(id => removeLock(id));
    }
}

function removeLock(cardId) {
    const card = document.getElementById(cardId);
    if (!card) {
        console.warn(`[UNLOCK] Card not found: ${cardId}`);
        return;
    }

    console.log(`[UNLOCK] Removing lock from card: ${cardId}`);

    card.classList.remove('locked-card');
    card.style.filter = "none";
    card.style.pointerEvents = "auto";
    card.style.opacity = "1";

    const overlay = card.querySelector('.lock-overlay');
    if (overlay) {
        console.log(`[UNLOCK] Removing overlay from ${cardId}`);
        overlay.remove();
    }

    const elements = card.querySelectorAll('button, input, select, textarea');
    elements.forEach(el => {
        el.disabled = false;
        el.removeAttribute('disabled');
        el.style.pointerEvents = "auto";
        el.style.opacity = "1";
    });
}

// ========================================================
// Wire activate / test buttons
// ========================================================
function wireSmartToolActivateButtons() {
    const map = {
        brain: '[data-run-tool="brain"]',
        booking: '[data-run-tool="booking"]',
        sentiment: '[data-run-tool="sentiment"]',
        handover: '[data-run-tool="handover"]',
        webhook: '[data-run-tool="webhook"]',
        enrichment: '[data-run-tool="enrichment"]',
        vision: '[data-run-tool="vision"]'
    };

    Object.keys(map).forEach(tool => {
        const btns = document.querySelectorAll(map[tool]);
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                runSmartTool(tool, btn);
            });
        });
    });

    console.log("[WIRE] Smart tool activation buttons wired");
}

// ========================================================
// Tool runner - LIVE stays permanently after success
// ========================================================
async function runSmartTool(toolType, btn) {
    const token = localStorage.getItem('token');
    if (!token) return alert("Please log in first.");

    console.log("[RUN] Current plan:", CURRENT_USER_PLAN);

    // Booking and Business Identity allowed on free - all others need paid plan
    const isPaid = ['pro', 'enterprise', 'agency'].includes(CURRENT_USER_PLAN.toLowerCase().trim());

    if (!isPaid && toolType !== 'booking' && toolType !== 'business_type') {
        alert("This feature is only available on Pro or higher plans.");
        return;
    }

    const originalText = btn.innerText;

    try {
        btn.disabled = true;
        btn.innerText = "Running...";

        const endpoint = `${API_BASE}/api/smart-hub/test-tool`;
        console.log("[SMART-LOGIC] Calling backend:", endpoint);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ toolType })
        });

        let result = null;
        const text = await response.text();
        try {
            result = text ? JSON.parse(text) : {};
        } catch (e) {
            console.warn("Non-JSON response:", text);
            result = {};
        }

        console.log("[RUN RESULT]", toolType, result);

        if (!response.ok) {
            throw new Error(result?.error || "Tool execution failed");
        }

        // SUCCESS: Make button LIVE permanently and save state
        btn.innerText = "● LIVE";
        btn.classList.add('btn-live-status');
        btn.disabled = false;
        
        // Save tool state
        saveToolState(toolType, true);

        const toolName = TOOL_NAMES[toolType] || toolType;
        if (result && result.output) {
            alert(`${toolName} has been successfully activated!\n\n${result.output}`);
        } else {
            alert(`${toolName} has been successfully activated and is now LIVE.`);
        }

    } catch (err) {
        console.error("[RUN ERROR]", err);
        btn.innerText = "❌ Failed";
        alert("Tool failed: " + err.message);
        
        setTimeout(() => {
            btn.disabled = false;
            btn.innerText = originalText;
            btn.classList.remove('btn-live-status');
        }, 2000);
    }
}

// 4. Save function - After save, re-run to activate LIVE
async function saveSmartTool(toolType, event) {
    const token = localStorage.getItem('token');
    if (!token) return alert("Please log in to save changes.");

    const btn = event?.currentTarget || event?.target || document.activeElement;
    const originalText = btn?.innerText || '';
    const toolName = TOOL_NAMES[toolType] || toolType;

    // Check if tool is already LIVE - for deactivation
    if (TOOL_STATES[toolType] === true) {
        if (confirm(`Are you sure you want to deactivate ${toolName}?`)) {
            deactivateTool(toolType, btn);
        }
        return;
    }

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
                console.log("[SAVE] Booking URL:", data.url);
                break;
            case 'sentiment':
                data = { 
                    enabled: document.getElementById('sentimentToggle')?.checked || false,
                    email: document.getElementById('alertEmail')?.value || ''
                };
                break;
            case 'handover':
                data = { trigger: document.getElementById('handoverTrigger')?.value || 'human' };
                break;
            case 'webhook':
                data = { url: document.getElementById('webhookUrl')?.value || '' };
                break;
            case 'enrichment':
            case 'apollo':
                const syncToggle = document.getElementById('syncToggle');
                data = { 
                    apolloKey: document.getElementById('apolloKey')?.value || '',
                    autoSync: syncToggle ? syncToggle.checked : false 
                };
                break;
            case 'vision':
                const visionSens = document.getElementById('visionSens');
                const visionArea = document.getElementById('visionArea');
                data = { 
                    sensitivity: visionSens ? visionSens.value : 'high',
                    area: visionArea ? visionArea.value : 'all'
                };
                break;
            case 'followup':
                data = { enabled: document.getElementById('followupToggle')?.checked || false };
                break;
            case 'business_type':
                data = { 
                    businessType: document.getElementById('businessType')?.value || '',
                    businessDescription: document.getElementById('businessDescription')?.value || ''
                };
                console.log("[SAVE] Business Identity:", data);
                break;
            default:
                console.warn("[SAVE] Unknown tool type:", toolType);
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
                return;
        }

        console.log(`[SAVE] Sending for ${toolType}:`, data);

        if (btn) {
            btn.disabled = true;
            btn.innerText = "Saving...";
        }

        const endpoint = `${API_BASE}/api/smart-hub/save`;
        console.log("[SMART-LOGIC] Calling backend:", endpoint);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ toolType, data })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log(`[SAVE] Success for ${toolType}`);
            
            // Save settings to localStorage
            localStorage.setItem(`ai_settings_${toolType}`, JSON.stringify(data));
            
            // Show success message
            if (btn) {
                btn.innerText = `✓ Saved`;
                btn.style.background = "#28a745";
            }
            
            alert(`${toolName} has been successfully saved!`);
            
            // Activate tool and save state
            saveToolState(toolType, true);
            
            // Update button to LIVE
            setTimeout(() => {
                if (btn) {
                    btn.innerText = "● LIVE";
                    btn.classList.add('btn-live-status');
                    btn.style.background = "";
                    btn.disabled = false;
                }
            }, 1000);
            
            // Re-run tool to test (for tools that support it)
            if (toolType !== 'business_type') {
                setTimeout(() => {
                    runSmartTool(toolType, btn);
                }, 1500);
            }
            
        } else {
            const errorMsg = result.error || "Server rejected update";
            console.error(`[SAVE] Failed for ${toolType}:`, errorMsg);
            throw new Error(errorMsg);
        }
    } catch (err) {
        console.error("[SAVE] Error:", err.message);
        if (btn) {
            btn.innerText = "❌ Error";
            btn.style.background = "#e74c3c";
        }
        alert(`Could not save ${toolName}: ${err.message}`);
        
        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
                btn.style.background = "";
            }
        }, 2000);
    }
}

// Deactivate tool
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
        // Send deactivation to backend
        const response = await fetch(`${API_BASE}/api/smart-hub/deactivate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ toolType })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Update tool state
            saveToolState(toolType, false);
            
            if (btn) {
                btn.innerText = "✗ Deactivated";
                btn.style.background = "#6c757d";
                btn.classList.remove('btn-live-status');
                btn.classList.add('btn-inactive');
                
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
            btn.innerText = "❌ Error";
            btn.style.background = "#e74c3c";
            setTimeout(() => {
                btn.innerText = "● LIVE";
                btn.classList.add('btn-live-status');
                btn.disabled = false;
                btn.style.background = "";
            }, 2000);
        }
        alert(`Failed to deactivate: ${err.message}`);
    }
}

// 5. Load saved settings from server + RE-APPLY LIVE status permanently
async function loadSavedSettingsFromServer() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const endpoint = `${API_BASE}/api/smart-hub/settings`;
        console.log("[SMART-LOGIC] Loading settings from:", endpoint);

        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error("Load failed");

        const data = await response.json();
        console.log("[LOAD] Settings loaded from server:", data);

        // Fill form fields
        const mappings = {
            ai_instructions: 'aiInstructions',
            ai_temp: 'aiTemp',
            ai_lang: 'aiLang',
            booking_url: 'bookingUrl',
            alert_email: 'alertEmail',
            handover_trigger: 'handoverTrigger',
            webhook_url: 'webhookUrl',
            apollo_key: 'apolloKey',
            vision_sensitivity: 'visionSens',
            vision_area: 'visionArea',
            business_type: 'businessType',
            business_description: 'businessDescription'
        };

        for (const [dbKey, htmlId] of Object.entries(mappings)) {
            const el = document.getElementById(htmlId);
            if (el && data[dbKey] !== undefined && data[dbKey] !== null) {
                el.value = data[dbKey];
            }
        }

        // Restore ALL toggles
        const toggleMap = {
            sentimentToggle: data.sentiment_active === 1,
            visionToggle: data.vision_active === 1,
            followupToggle: data.followup_active === 1,
            apolloToggle: data.apollo_active === 1,
            syncToggle: data.auto_sync === 1
        };

        for (const [id, shouldBeOn] of Object.entries(toggleMap)) {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.checked = shouldBeOn;
                console.log(`[RESTORE] ${id} → ${shouldBeOn ? 'ON' : 'OFF'}`);
            }
        }

        // Re-apply LIVE button status from database
        const activeMap = {
            brain: { active: data.brain_active === 1, cardId: 'card-brain' },
            booking: { active: data.booking_active === 1, cardId: 'card-booking' },
            sentiment: { active: data.sentiment_active === 1, cardId: 'card-sentiment' },
            handover: { active: data.handover_active === 1, cardId: 'card-handover' },
            webhook: { active: data.webhook_active === 1, cardId: 'card-webhook' },
            enrichment: { active: data.apollo_active === 1, cardId: 'card-apollo' },
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
                        console.log(`[LIVE] Re-applying LIVE for ${tool}`);
                        btn.innerText = "● LIVE";
                        btn.classList.add('btn-live-status');
                        btn.disabled = false;
                        
                        // Save to localStorage state
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
    const tools = ['brain', 'booking', 'sentiment', 'handover', 'webhook', 'enrichment', 'vision', 'business_type'];
    tools.forEach(tool => {
        const saved = localStorage.getItem(`ai_settings_${tool}`);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                console.log(`[LOAD LOCAL] Loading ${tool}:`, data);
                
                if (tool === 'brain' && document.getElementById('aiInstructions')) {
                    document.getElementById('aiInstructions').value = data.instructions || "";
                    document.getElementById('aiTemp').value = data.temp || "0.7";
                    document.getElementById('aiLang').value = data.lang || "auto";
                }
                if (tool === 'booking' && document.getElementById('bookingUrl')) {
                    document.getElementById('bookingUrl').value = data.url || "";
                }
                if (tool === 'enrichment' && document.getElementById('apolloKey')) {
                    document.getElementById('apolloKey').value = data.apolloKey || "";
                    const syncToggle = document.getElementById('syncToggle');
                    if (syncToggle) syncToggle.checked = data.autoSync || false;
                }
                if (tool === 'business_type' && document.getElementById('businessType')) {
                    document.getElementById('businessType').value = data.businessType || "";
                    if (document.getElementById('businessDescription')) {
                        document.getElementById('businessDescription').value = data.businessDescription || "";
                    }
                }
            } catch (e) {
                console.warn(`[LOAD LOCAL] Error parsing ${tool}:`, e);
            }
        }
    });
    
    // Apply saved tool states from localStorage
    loadToolStatesFromStorage();
}

// 6. Team Management
function openInviteModal() {
    const email = prompt("Enter the email address of the team member:");
    if (email && email.includes('@')) {
        const table = document.getElementById('teamTableBody');
        if(!table) return;
        const newRow = table.insertRow();
        newRow.innerHTML = `
            <td><strong>New Member</strong></td>
            <td>${email}</td>
            <td><span class="role-tag tag-staff">Staff</span></td>
            <td><span style="color: orange">● Pending</span></td>
            <td><button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:red; cursor:pointer;">Remove</button></td>
        `;
        alert("Invitation sent to " + email);
    }
}

// 7. Data Export
function exportBusinessData() {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "Exporting...";
    btn.disabled = true;
    
    setTimeout(() => {
        try {
            // Include tool states in export
            const exportData = {
                localStorage: localStorage,
                toolStates: TOOL_STATES,
                timestamp: new Date().toISOString()
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "business_export.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } catch (e) {
            console.error("[EXPORT] Error:", e);
            alert("Export failed: " + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }, 1000);
}

// 8. Initialize any additional elements
function initializeBusinessType() {
    console.log("[INIT] Business Identity section ready");
}

// Make functions globally available
window.saveSmartTool = saveSmartTool;
window.openInviteModal = openInviteModal;
window.exportBusinessData = exportBusinessData;
window.runSmartTool = runSmartTool;
window.deactivateTool = deactivateTool;

// Call initialize on load
document.addEventListener('DOMContentLoaded', initializeBusinessType);