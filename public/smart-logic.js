/**
 * Smart Business Hub - AI Logic Controller (REAL SAAS - FULLY FIXED)
 * Unlocks tools for ANY Pro / Enterprise / Agency subscriber
 * Saves & loads settings to/from real backend
 * LIVE button stays "● LIVE" after activation (persists on refresh)
 * FIX: Restores ALL toggles (Vision, Followup, Apollo) + correct button selector
 */

const API_BASE = "http://localhost:5000";

let CURRENT_USER_PLAN = 'free';
let CURRENT_USER_TOKEN = localStorage.getItem('token');

// 1. Load on page ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("Smart Hub Logic Initialized - Fetching real plan...");
    injectLiveStatusCSS(); // ✅ Adds the professional green glow styles
    loadUserPlanAndUnlock();
    wireSmartToolActivateButtons(); 
});

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
        const backupPlan = localStorage.getItem('userPlan');
        if (backupPlan) {
            CURRENT_USER_PLAN = backupPlan.toLowerCase().trim();
            unlockPremiumFeatures(CURRENT_USER_PLAN);
        }
    }
}

// 3. Unlock logic - FIXED to include ALL cards
function unlockPremiumFeatures(plan) {
    console.log("[UNLOCK] Starting unlock for plan:", plan);

    const normalized = plan.toLowerCase().trim();

    // Always unlock core tools (available to everyone)
    const coreTools = ['card-brain', 'card-booking', 'card-handover', 'card-analytics'];
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

    // Booking allowed on free - all others need paid plan
    const isPaid = ['pro', 'enterprise', 'agency'].includes(CURRENT_USER_PLAN.toLowerCase().trim());

    if (!isPaid && toolType !== 'booking') {
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

        // SUCCESS: Make button LIVE permanently
        btn.innerText = "● LIVE";
        btn.classList.add('btn-live-status');
        btn.disabled = false; // allow re-click if needed

        if (result && result.output) {
            alert("Tool executed successfully:\n\n" + result.output);
        } else {
            alert("Tool executed successfully.");
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
async function saveSmartTool(toolType) {
    const token = localStorage.getItem('token');
    if (!token) return alert("Please log in to save changes.");

    const btn = event?.target || document.activeElement;
    const originalText = btn.innerText;

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
                data = { 
                    apolloKey: document.getElementById('apolloKey')?.value || '',
                    autoSync: document.getElementById('syncToggle')?.checked || false 
                };
                break;
            case 'vision':
                data = { 
                    sensitivity: document.getElementById('visionSens')?.value || 'high',
                    area: document.getElementById('visionArea')?.value || 'all'
                };
                break;
        }

        console.log(`[SAVE] Sending for ${toolType}:`, data);

        btn.innerText = "Saving...";

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

        if (response.ok) {
            console.log(`[SAVE] Success for ${toolType}`);
            btn.innerText = "✓ Saved";
            btn.style.background = "#28a745";
            localStorage.setItem(`ai_settings_${toolType}`, JSON.stringify(data));
            
            // Re-run tool to activate LIVE status
            runSmartTool(toolType, btn);
        } else {
            const errorMsg = await response.text();
            console.error(`[SAVE] Failed for ${toolType}:`, errorMsg);
            throw new Error(errorMsg || "Server rejected update");
        }
    } catch (err) {
        console.error("[SAVE] Error:", err.message);
        btn.innerText = "❌ Error";
        btn.style.background = "#e74c3c";
        alert("Could not save: " + err.message);
    }

    setTimeout(() => {
        // After save animation, if tool is active, keep LIVE
        if (btn.innerText === "✓ Saved" || btn.innerText === "Saving...") {
            btn.innerText = "● LIVE";
            btn.classList.add('btn-live-status');
            btn.style.background = "";
        }
    }, 2500);
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
            cache: 'no-store' // prevent browser cache
        });

        if (!response.ok) throw new Error("Load failed");

        const data = await response.json();
        console.log("[LOAD] Settings loaded from server:", data);

        // Fill form fields
        if (data.ai_instructions && document.getElementById('aiInstructions')) {
            document.getElementById('aiInstructions').value = data.ai_instructions;
        }
        if (data.ai_temp && document.getElementById('aiTemp')) {
            document.getElementById('aiTemp').value = data.ai_temp;
        }
        if (data.ai_lang && document.getElementById('aiLang')) {
            document.getElementById('aiLang').value = data.ai_lang;
        }
        if (data.booking_url && document.getElementById('bookingUrl')) {
            document.getElementById('bookingUrl').value = data.booking_url;
        }
        if (document.getElementById('alertEmail')) {
            document.getElementById('alertEmail').value = data.alert_email;
        }
        if (document.getElementById('handoverTrigger')) {
            document.getElementById('handoverTrigger').value = data.handover_trigger;
        }
        if (document.getElementById('webhookUrl')) {
            document.getElementById('webhookUrl').value = data.webhook_url;
        }
        if (document.getElementById('apolloKey')) {
            document.getElementById('apolloKey').value = data.apollo_key;
        }
        if (document.getElementById('syncToggle')) {
            document.getElementById('syncToggle').checked = data.auto_sync === 1;
        }
        if (document.getElementById('visionSens')) {
            document.getElementById('visionSens').value = data.vision_sensitivity;
        }
        if (document.getElementById('visionArea')) {
            document.getElementById('visionArea').value = data.vision_area;
        }

        // FIX: Restore ALL toggles (this fixes Apollo, Followup, Vision resetting)
        if (document.getElementById('sentimentToggle')) {
            document.getElementById('sentimentToggle').checked = data.sentiment_active === 1;
            console.log("[RESTORE] sentimentToggle →", data.sentiment_active === 1);
        }
        if (document.getElementById('visionToggle')) {
            document.getElementById('visionToggle').checked = data.vision_active === 1;
            console.log("[RESTORE] visionToggle →", data.vision_active === 1);
        }
        if (document.getElementById('followupToggle')) {
            document.getElementById('followupToggle').checked = data.followup_active === 1;
            console.log("[RESTORE] followupToggle →", data.followup_active === 1);
        }
        if (document.getElementById('apolloToggle')) {
            document.getElementById('apolloToggle').checked = data.apollo_active === 1;
            console.log("[RESTORE] apolloToggle →", data.apollo_active === 1);
        }
        if (document.getElementById('analyticsToggle')) {
            document.getElementById('analyticsToggle').checked = data.analytics_active === 1;
            console.log("[RESTORE] analyticsToggle →", data.analytics_active === 1);
        }

        // FIX: Re-apply LIVE button status using correct selector (.btn-save)
        const activeMap = {
            brain: { active: data.brain_active === 1, cardId: 'card-brain' },
            booking: { active: data.booking_active === 1, cardId: 'card-booking' },
            sentiment: { active: data.sentiment_active === 1, cardId: 'card-sentiment' },
            handover: { active: data.handover_active === 1, cardId: 'card-handover' },
            webhook: { active: data.webhook_active === 1, cardId: 'card-webhook' },
            enrichment: { active: data.apollo_active === 1, cardId: 'card-apollo' },
            vision: { active: data.vision_active === 1, cardId: 'card-vision' },
            followup: { active: data.followup_active === 1, cardId: 'card-followup' } // added for Followup
        };

        Object.entries(activeMap).forEach(([tool, { active, cardId }]) => {
            if (active) {
                const card = document.getElementById(cardId);
                if (card) {
                    const btn = card.querySelector('.btn-save') || card.querySelector('button');
                    if (btn) {
                        console.log(`[LIVE] Re-applying LIVE for ${tool}`);
                        btn.innerText = "● LIVE";
                        btn.classList.add('btn-live-status');
                        btn.disabled = false;
                    } else {
                        console.warn(`[LIVE] No .btn-save found in ${cardId}`);
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
    const tools = ['brain', 'booking', 'sentiment', 'handover', 'webhook', 'enrichment', 'vision'];
    tools.forEach(tool => {
        const saved = localStorage.getItem(`ai_settings_${tool}`);
        if (saved) {
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
                document.getElementById('syncToggle').checked = data.autoSync || false;
            }
        }
    });
}

// 6. Team Management - UNCHANGED
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

// 7. Data Export - UNCHANGED
function exportBusinessData() {
    const btn = event.target;
    btn.innerText = "Exporting...";
    setTimeout(() => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localStorage));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "business_export.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        btn.innerText = "Download Report";
    }, 1000);
}