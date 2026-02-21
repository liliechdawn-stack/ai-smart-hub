// public/js/master-fix.js - MASTER FIX for all pages
(function() {
    console.log('🔧 MASTER FIX: Initializing...');
    
    // Force the correct backend URL
    window.BACKEND_URL = 'https://ai-smart-hub.onrender.com';
    window.API_BASE = window.BACKEND_URL;
    
    console.log('✅ Backend URL set to:', window.BACKEND_URL);
    
    // Override fetch to ensure all API calls go to the right place
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        // If it's a relative URL starting with /api, prepend the backend URL
        if (typeof url === 'string' && url.startsWith('/api')) {
            const fullUrl = window.BACKEND_URL + url;
            console.log('🌐 Fetching:', fullUrl);
            return originalFetch(fullUrl, options);
        }
        // If it's a relative URL without /api, assume it's from the same origin
        if (typeof url === 'string' && !url.startsWith('http')) {
            const fullUrl = window.BACKEND_URL + (url.startsWith('/') ? url : '/' + url);
            console.log('🌐 Fetching (relative):', fullUrl);
            return originalFetch(fullUrl, options);
        }
        // Otherwise use as-is
        return originalFetch(url, options);
    };
    
    // Fix localStorage items
    const token = localStorage.getItem('token');
    if (token) {
        console.log('✅ Token found in localStorage');
    } else {
        console.log('⚠️ No token found - user may need to login');
    }
    
    // Add global error handler
    window.addEventListener('error', function(e) {
        console.error('❌ Global error:', e.message, 'at', e.filename, 'line', e.lineno);
    });
    
    console.log('✅ MASTER FIX applied successfully');
})();