// fix-all-html.js - MASTER FIX FOR ALL HTML FILES
// Add this script to every HTML file right after master-fix.js

(function() {
    console.log('🔧 HTML MASTER FIX: Initializing...');
    
    // ================================================
    // FIX 1: Ensure BACKEND_URL is consistent
    // ================================================
    if (typeof window.BACKEND_URL === 'undefined') {
        console.warn('⚠️ BACKEND_URL not found, setting from config');
        window.BACKEND_URL = 'https://ai-smart-hub.onrender.com';
    }
    
    // Clean URL - remove trailing slash
    if (window.BACKEND_URL.endsWith('/')) {
        window.BACKEND_URL = window.BACKEND_URL.slice(0, -1);
    }
    
    // Set API_BASE for compatibility
    window.API_BASE = window.BACKEND_URL;
    
    console.log('✅ Backend URL fixed:', window.BACKEND_URL);
    
    // ================================================
    // FIX 2: Token validation and redirect
    // ================================================
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['login.html', 'index.html', 'pricing.html', 'about.html'];
    const token = localStorage.getItem('token');
    
    // Redirect to login if no token and page requires auth
    if (!token && !publicPages.includes(currentPage)) {
        console.log('🔒 No token, redirecting to login');
        window.location.href = 'login.html';
        return;
    }
    
    // ================================================
    // FIX 3: Fix all API endpoint URLs in the page
    // ================================================
    function fixAPIEndpoints() {
        // Find all fetch calls in inline scripts and fix them
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.innerHTML && script.innerHTML.includes('fetch(')) {
                // This is an inline script - we'll override fetch globally instead
                console.log('📦 Found inline script with fetch calls');
            }
        }
        
        // Override fetch to ensure all API calls use the correct base URL
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            // If URL is relative and starts with /api, prepend BACKEND_URL
            if (typeof url === 'string' && url.startsWith('/api')) {
                url = window.BACKEND_URL + url;
                console.log('🌐 Fixed API call:', url);
            }
            // If URL is relative and doesn't start with /api, still prepend for safety
            else if (typeof url === 'string' && !url.startsWith('http')) {
                url = window.BACKEND_URL + (url.startsWith('/') ? url : '/' + url);
                console.log('🌐 Fixed relative call:', url);
            }
            return originalFetch.call(this, url, options);
        };
    }
    
    fixAPIEndpoints();
    
    // ================================================
    // FIX 4: Plan detection and localStorage sync
    // ================================================
    async function syncPlanWithBackend() {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        try {
            const response = await fetch(`${window.BACKEND_URL}/api/dashboard/full`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                const plan = (data.plan || 'free').toLowerCase().trim();
                localStorage.setItem('currentPlan', plan);
                console.log('✅ Plan synced:', plan);
                
                // Update plan display if it exists
                const planElements = document.querySelectorAll('#currentPlan, #currentPlanName, .plan-display');
                planElements.forEach(el => {
                    if (el) el.textContent = plan.toUpperCase();
                });
            }
        } catch (err) {
            console.warn('⚠️ Could not sync plan:', err);
        }
    }
    
    // Run plan sync on page load
    if (token) {
        syncPlanWithBackend();
    }
    
    // ================================================
    // FIX 5: Fix missing pricing.html redirects
    // ================================================
    // Create a hidden pricing section if needed
    if (!document.querySelector('a[href="pricing.html"]')) {
        console.log('📋 Adding hidden pricing fallback');
        const pricingLink = document.createElement('a');
        pricingLink.href = '#';
        pricingLink.style.display = 'none';
        pricingLink.onclick = function(e) {
            e.preventDefault();
            showPricingModal();
        };
        document.body.appendChild(pricingLink);
    }
    
    // Global function to show pricing modal
    window.showPricingModal = function() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        modal.innerHTML = `
            <div style="background: white; padding: 40px; border-radius: 16px; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto;">
                <h2 style="color: #d4af37; margin-bottom: 30px;">Choose Your Plan</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    <div style="border: 2px solid #eee; border-radius: 12px; padding: 20px; text-align: center;">
                        <h3 style="color: #333;">Basic</h3>
                        <p style="font-size: 24px; color: #d4af37; font-weight: 700;">₦10,000<span style="font-size: 14px; color: #666;">/mo</span></p>
                        <ul style="list-style: none; padding: 0; margin: 20px 0; text-align: left;">
                            <li>✓ 500 AI messages</li>
                            <li>✓ Unlimited leads</li>
                            <li>✓ Email support</li>
                        </ul>
                        <button onclick="window.location.href='dashboard.html?upgrade=basic'" style="background: #d4af37; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer;">Select</button>
                    </div>
                    <div style="border: 2px solid #d4af37; border-radius: 12px; padding: 20px; text-align: center; position: relative;">
                        <span style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #d4af37; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">POPULAR</span>
                        <h3 style="color: #333;">Pro</h3>
                        <p style="font-size: 24px; color: #d4af37; font-weight: 700;">₦25,000<span style="font-size: 14px; color: #666;">/mo</span></p>
                        <ul style="list-style: none; padding: 0; margin: 20px 0; text-align: left;">
                            <li>✓ 3,000 AI messages</li>
                            <li>✓ Unlimited leads</li>
                            <li>✓ Priority AI</li>
                            <li>✓ Analytics export</li>
                        </ul>
                        <button onclick="window.location.href='dashboard.html?upgrade=pro'" style="background: #d4af37; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer;">Select</button>
                    </div>
                    <div style="border: 2px solid #eee; border-radius: 12px; padding: 20px; text-align: center;">
                        <h3 style="color: #333;">Agency</h3>
                        <p style="font-size: 24px; color: #d4af37; font-weight: 700;">₦80,000<span style="font-size: 14px; color: #666;">/mo</span></p>
                        <ul style="list-style: none; padding: 0; margin: 20px 0; text-align: left;">
                            <li>✓ 10 businesses</li>
                            <li>✓ Unlimited leads</li>
                            <li>✓ White-label widget</li>
                            <li>✓ API access</li>
                        </ul>
                        <button onclick="window.location.href='dashboard.html?upgrade=agency'" style="background: #d4af37; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer;">Select</button>
                    </div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px; padding: 10px 20px; background: #666; color: white; border: none; border-radius: 8px; cursor: pointer;">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    };
    
    // ================================================
    // FIX 6: Fix logout functionality
    // ================================================
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            localStorage.clear();
            window.location.href = 'login.html';
        };
    }
    
    // ================================================
    // FIX 7: Fix verification banner
    // ================================================
    const verifyBanner = document.getElementById('verification-banner');
    if (verifyBanner && token) {
        // Check if email is verified
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.email === 'ericchung992@gmail.com') {
                verifyBanner.classList.add('hidden');
            }
        } catch (e) {}
    }
    
    // ================================================
    // FIX 8: Fix admin access
    // ================================================
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn && token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.email === 'ericchung992@gmail.com') {
                adminBtn.classList.remove('hidden');
                adminBtn.onclick = () => window.location.href = 'admin.html';
            }
        } catch (e) {}
    }
    
    // ================================================
    // FIX 9: Fix widget key display
    // ================================================
    async function loadWidgetKey() {
        const keyElement = document.getElementById('widgetKey');
        const codeElement = document.getElementById('embedCode');
        if (!keyElement || !token) return;
        
        try {
            const res = await fetch(`${window.BACKEND_URL}/api/widget/key`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                keyElement.textContent = data.key;
                
                if (codeElement) {
                    const businessName = localStorage.getItem('businessName') || 'Business';
                    codeElement.textContent = `<script>
  (function() {
    const key = "${data.key}";
    const baseUrl = "${window.BACKEND_URL}";
    const script = document.createElement("script");
    script.src = baseUrl + "/widget.js";
    script.async = true;
    document.head.appendChild(script);

    const widgetDiv = document.createElement("div");
    widgetDiv.id = "ai-chat-widget";
    widgetDiv.setAttribute("data-key", key);
    widgetDiv.setAttribute("data-primary-color", "#d4af37");
    widgetDiv.setAttribute("data-position", "bottom-right");
    widgetDiv.setAttribute("data-title", "${businessName} AI");
    widgetDiv.setAttribute("data-voice-enabled", "true");

    document.body.appendChild(widgetDiv);
  })();
<\/script>`;
                }
            }
        } catch (err) {
            console.warn('Could not load widget key:', err);
        }
    }
    
    // Load widget key if on dashboard
    if (document.getElementById('widgetKey')) {
        loadWidgetKey();
    }
    
    // ================================================
    // FIX 10: Fix plan cards and upgrade buttons
    // ================================================
    document.querySelectorAll('.subscribePlanBtn, .upgrade-btn, [onclick*="pricing.html"]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (this.getAttribute('onclick')?.includes('pricing.html')) {
                e.preventDefault();
                showPricingModal();
            }
        });
    });
    
    // ================================================
    // FIX 11: Global error handler for missing endpoints
    // ================================================
    window.addEventListener('unhandledrejection', function(event) {
        if (event.reason?.message?.includes('Failed to fetch')) {
            console.warn('API endpoint not available:', event.reason);
            // Don't show alert for every failed fetch
        }
    });
    
    // ================================================
    // FIX 12: Fix date parsing in tables
    // ================================================
    // This will be handled by the individual page scripts
    
    console.log('✅ HTML MASTER FIX applied successfully for', currentPage);
})();