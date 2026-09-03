// ============================================
// FRONTEND APP.JS - AI SMART HUB 2.0
// PRODUCTION-READY CLIENT LOGIC
// ============================================

// ============================================
// 1. DYNAMIC API URL CONFIGURATION (Browser-Safe)
// ============================================

/**
 * Dynamically determines the API URL based on environment
 * - Localhost: uses local backend
 * - Production: uses Render URL
 * - Can be overridden with window.__API_URL
 * 
 * NOTE: process.env is NOT used here - this is browser-safe!
 */
const API_URL = (() => {
  // Allow override via global config
  if (window.__API_URL) return window.__API_URL;
  
  const hostname = window.location.hostname;
  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
  
  if (isLocal) {
    const port = window.location.port;
    // Map frontend ports to backend ports
    if (port === '3000' || port === '5173' || port === '8080') {
      return 'http://localhost:5000';
    }
    return `http://${hostname}:5000`;
  }
  
  // Production URL - hardcoded for browser environment
  return 'https://ai-smart-hub.onrender.com';
})();

console.log(`🔗 API URL resolved: ${API_URL}`);

// ============================================
// 2. DOM REFERENCES
// ============================================

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const subscribeBtn = document.getElementById("subscribeBtn");
const leadsTableBody = document.querySelector("#leadsTable tbody");
const logoutBtn = document.getElementById("logoutBtn");
const notificationContainer = document.getElementById("notificationContainer");

// ============================================
// 3. PRODUCTION-GRADE JWT & STORAGE HELPER
// ============================================

const Auth = {
  TOKEN_KEY: 'token',
  USER_KEY: 'user',

  /**
   * Get JWT token from storage
   * @returns {string|null} The JWT token or null
   */
  getToken: () => {
    try {
      return localStorage.getItem(Auth.TOKEN_KEY);
    } catch {
      return null;
    }
  },

  /**
   * Store JWT token securely
   * @param {string} token - The JWT token
   * @param {object} user - Optional user data to store
   */
  setToken: (token, user = null) => {
    try {
      localStorage.setItem(Auth.TOKEN_KEY, token);
      if (user) localStorage.setItem(Auth.USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Storage failed', e);
    }
  },

  /**
   * Clear all authentication data
   */
  clearToken: () => {
    localStorage.removeItem(Auth.TOKEN_KEY);
    localStorage.removeItem(Auth.USER_KEY);
  },

  /**
   * Safe JWT expiration check without throwing atob encoding errors
   * Handles URL-safe base64, Unicode, and malformed tokens gracefully
   * @returns {boolean} True if authenticated
   */
  isAuthenticated: () => {
    const token = Auth.getToken();
    if (!token) return false;
    
    try {
      // Parse JWT payload safely
      const base64Url = token.split('.')[1];
      if (!base64Url) return false;
      
      // Convert URL-safe base64 to standard base64
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      
      // Decode with proper Unicode handling
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      
      const payload = JSON.parse(jsonPayload);
      
      // Check expiration if present
      if (payload.exp) {
        return payload.exp * 1000 > Date.now();
      }
      
      // No expiration claim - assume valid
      return true;
      
    } catch (error) {
      // Token is malformed or invalid
      Auth.clearToken();
      return false;
    }
  },

  /**
   * Get authenticated user data
   * @returns {object|null} User data or null
   */
  getUser: () => {
    try {
      const userData = localStorage.getItem(Auth.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  },

  /**
   * Logout user and redirect to login
   */
  logout: () => {
    Auth.clearToken();
    window.location.href = "index.html";
  },

  /**
   * Get auth headers for fetch requests
   * @returns {object} Headers object with Authorization
   */
  getAuthHeaders: () => {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }
};

// ============================================
// 4. UI HELPERS & NOTIFICATIONS
// ============================================

/**
 * Show a notification to the user
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {number} duration - Time in ms to show notification
 */
function showNotification(message, type = 'info', duration = 5000) {
  // If we have a container, show structured notification
  if (notificationContainer) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      padding: 12px 20px;
      margin: 10px 0;
      border-radius: 8px;
      background: ${type === 'error' ? '#ff4d4d' : type === 'success' ? '#2ecc71' : type === 'warning' ? '#f39c12' : '#3498db'};
      color: white;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: slideDown 0.3s ease;
      z-index: 9999;
    `;
    notificationContainer.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, duration);
    return;
  }
  
  // Fallback: Use console for non-UI notifications
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // Only use alert for critical errors in production
  if (type === 'error' && !window.location.hostname.includes('localhost')) {
    alert(message);
  }
}

/**
 * Safe text escaping to prevent XSS
 * @param {string} text - The text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create a DOM element with textContent safely
 * @param {string} tag - HTML tag name
 * @param {string} text - Text content
 * @param {object} attributes - Optional attributes
 * @returns {HTMLElement}
 */
function createSafeElement(tag, text, attributes = {}) {
  const element = document.createElement(tag);
  element.textContent = text || '';
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

// ============================================
// 5. FETCH HELPERS WITH PROPER ERROR HANDLING
// ============================================

/**
 * Wrapper for fetch that handles authentication and errors
 * Does NOT automatically clear UI - returns data for caller to handle
 * @param {string} url - The endpoint URL
 * @param {object} options - Fetch options
 * @returns {Promise<object>} Response data
 */
async function authenticatedFetch(url, options = {}) {
  const headers = Auth.getAuthHeaders();
  
  // Merge headers
  const finalHeaders = {
    ...headers,
    ...options.headers
  };
  
  try {
    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers: finalHeaders
    });
    
    // Handle unauthorized responses
    if (response.status === 401 || response.status === 403) {
      Auth.clearToken();
      if (!window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
      throw new Error('Session expired. Please login again.');
    }
    
    // Try to parse JSON, handle empty responses
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    if (!response.ok) {
      const errorMessage = typeof data === 'object' 
        ? data.error || data.message || 'Request failed' 
        : data || 'Request failed';
      throw new Error(errorMessage);
    }
    
    return data;
    
  } catch (error) {
    console.error(`API Error (${url}):`, error);
    throw error;
  }
}

/**
 * Raw fetch wrapper for public endpoints (no auth required)
 */
async function publicFetch(url, options = {}) {
  try {
    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    
    return data;
    
  } catch (error) {
    console.error(`Public API Error (${url}):`, error);
    throw error;
  }
}

// ============================================
// 6. LOGIN HANDLER
// ============================================

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    
    // Basic validation
    if (!email || !password) {
      showNotification("Please fill in all fields.", "warning");
      return;
    }
    
    try {
      const data = await publicFetch('/auth/login', {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      
      if (data.token) {
        Auth.setToken(data.token, data.user);
        showNotification("Login successful! Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 500);
      } else {
        showNotification("Invalid response from server.", "error");
      }
      
    } catch (error) {
      if (error.message && error.message.toLowerCase().includes('subscription')) {
        showNotification("Subscription required to access your workspace.", "warning");
        if (subscribeBtn) subscribeBtn.style.display = "block";
      } else {
        showNotification(error.message || "Login failed. Please try again.", "error");
      }
    }
  });
}

// ============================================
// 7. REGISTER HANDLER (Production-Grade Onboarding)
// ============================================

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const businessName = document.getElementById("businessName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirmPassword = document.getElementById("regConfirmPassword")?.value;
    
    // Basic validation
    if (!businessName || !email || !password) {
      showNotification("Please fill in all required fields.", "warning");
      return;
    }
    
    if (confirmPassword && password !== confirmPassword) {
      showNotification("Passwords do not match.", "error");
      return;
    }
    
    if (password.length < 8) {
      showNotification("Password must be at least 8 characters long.", "error");
      return;
    }
    
    try {
      // The backend will automatically create the organization and workspace
      const data = await publicFetch('/auth/register', {
        method: "POST",
        body: JSON.stringify({ 
          businessName, 
          email, 
          password,
          plan: 'free' // Default plan
        })
      });
      
      if (data.success || data.id) {
        showNotification("Registration successful! Please log in.", "success");
        // Clear form
        registerForm.reset();
        // Switch to login tab if exists
        const loginTab = document.getElementById('login-tab');
        if (loginTab) {
          loginTab.click();
        } else if (loginForm) {
          window.location.hash = '#login';
        }
        // Auto-fill email
        const loginEmail = document.getElementById("email");
        if (loginEmail) loginEmail.value = email;
      } else {
        showNotification(data.error || "Registration failed. Please try again.", "error");
      }
      
    } catch (error) {
      console.error("Register Error:", error);
      showNotification(error.message || "Failed to connect to registration service. Please try again later.", "error");
    }
  });
}

// ============================================
// 8. SUBSCRIBE HANDLER
// ============================================

if (subscribeBtn) {
  subscribeBtn.addEventListener("click", async () => {
    const token = Auth.getToken();
    if (!token) {
      showNotification("Please login first.", "warning");
      Auth.logout();
      return;
    }
    
    try {
      const data = await authenticatedFetch('/subscription/create-checkout-session', {
        method: "POST",
        body: JSON.stringify({ plan: "premium" })
      });
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        showNotification(data.error || "Unable to initialize payment checkout.", "error");
      }
      
    } catch (error) {
      console.error("Subscription Error:", error);
      showNotification(error.message || "Payment redirect failed. Please try again.", "error");
    }
  });
}

// ============================================
// 9. SAFE DOM RENDERING FOR LEADS
// ============================================

/**
 * Load and render leads with XSS protection
 * Uses textContent for all user-supplied data
 */
async function loadLeads() {
  if (!leadsTableBody) return;
  
  // Show loading state
  leadsTableBody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align: center; padding: 40px; color: #888;">
        <div class="loading-spinner" style="margin: 0 auto 12px;"></div>
        Loading leads...
      </td>
    </tr>
  `;
  
  const token = Auth.getToken();
  if (!token) {
    Auth.logout();
    return;
  }
  
  try {
    const data = await authenticatedFetch('/leads', {
      method: "GET"
    });
    
    // Clear table
    leadsTableBody.innerHTML = "";
    
    // Handle empty state
    if (!data || data.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.style.textAlign = "center";
      td.style.padding = "40px";
      td.style.color = "#888";
      td.textContent = "No leads found. Start capturing leads with your AI widget!";
      tr.appendChild(td);
      leadsTableBody.appendChild(tr);
      return;
    }
    
    // Render leads safely - using textContent prevents XSS
    data.forEach(lead => {
      const tr = document.createElement("tr");
      
      // Name - with safe text content
      const nameTd = document.createElement("td");
      nameTd.textContent = lead.name || "N/A";
      
      // Email - safe
      const emailTd = document.createElement("td");
      emailTd.textContent = lead.email || "N/A";
      
      // Phone - safe
      const phoneTd = document.createElement("td");
      phoneTd.textContent = lead.phone || "-";
      
      // Created At - formatted date
      const dateTd = document.createElement("td");
      if (lead.created_at) {
        try {
          const date = new Date(lead.created_at);
          dateTd.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch {
          dateTd.textContent = lead.created_at;
        }
      } else {
        dateTd.textContent = "-";
      }
      
      tr.appendChild(nameTd);
      tr.appendChild(emailTd);
      tr.appendChild(phoneTd);
      tr.appendChild(dateTd);
      
      leadsTableBody.appendChild(tr);
    });
    
  } catch (error) {
    console.error("Leads Loading Error:", error);
    leadsTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 40px; color: #ff4d4d;">
          <i class="fas fa-exclamation-circle" style="font-size: 24px; display: block; margin-bottom: 12px;"></i>
          Failed to load leads: ${escapeHtml(error.message)}
          <br>
          <button onclick="loadLeads()" class="btn-gold" style="margin-top: 12px; padding: 8px 24px;">
            <i class="fas fa-sync-alt"></i> Retry
          </button>
        </td>
      </tr>
    `;
  }
}

// Make loadLeads globally accessible for retry buttons
window.loadLeads = loadLeads;

// ============================================
// 10. LOGOUT HANDLER
// ============================================

if (logoutBtn) {
  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    Auth.logout();
  });
}

// ============================================
// 11. AUTO-LOAD & PAGE INITIALIZATION
// ============================================

/**
 * Initialize the page based on current location
 */
function initPage() {
  const currentPath = window.location.pathname;
  
  // Check if user is on dashboard but not authenticated
  if (currentPath.includes("dashboard.html") || currentPath.includes("dashboard")) {
    if (!Auth.isAuthenticated()) {
      Auth.logout();
      return;
    }
    
    // Auto-load leads on dashboard
    loadLeads();
    
    // Set user name if available
    const user = Auth.getUser();
    if (user && user.business_name) {
      const userNameEl = document.getElementById("userName");
      if (userNameEl) userNameEl.textContent = user.business_name;
    }
  }
  
  // Handle subscription flow on login page
  if (currentPath.includes("index.html") || currentPath.endsWith("/")) {
    const token = Auth.getToken();
    if (token && Auth.isAuthenticated()) {
      // If already logged in, redirect to dashboard
      window.location.href = "dashboard.html";
    }
  }
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

// ============================================
// 12. GLOBAL ERROR HANDLING
// ============================================

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  if (event.reason && event.reason.message) {
    showNotification(`Error: ${event.reason.message}`, 'error', 6000);
  }
});

// Handle network connectivity
window.addEventListener('online', () => {
  showNotification('🔄 Back online!', 'success', 3000);
});

window.addEventListener('offline', () => {
  showNotification('⚠️ You are offline. Some features may not work.', 'warning', 5000);
});

console.log('✅ AI Smart Hub 2.0 Frontend initialized');
console.log(`📍 API URL: ${API_URL}`);
console.log(`🔐 Authenticated: ${Auth.isAuthenticated()}`);