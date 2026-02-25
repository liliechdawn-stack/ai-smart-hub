/**
 * Admin Panel JavaScript
 * FULLY FIXED - Added /api/ prefix to all endpoints
 */

// CRITICAL FIX: Use window.BACKEND_URL from config.js
const API_URL = window.BACKEND_URL || 'https://ai-smart-hub.onrender.com';

// ================= AUTH =================
const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "login.html";
}

// Decode JWT token to get user info
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch (err) {
    return null;
  }
}

const userInfo = parseJwt(token);
if (!userInfo) {
  localStorage.clear();
  window.location.href = "login.html";
}

// Only allow admin email to access this page
const ADMIN_EMAIL = "ericchung992@gmail.com";
if (userInfo.email !== ADMIN_EMAIL) {
  alert("Access denied. Admin only.");
  window.location.href = "dashboard.html";
}

// ================= DOM ELEMENTS =================
const logoutBtn = document.getElementById("logoutBtn");
const navUsers = document.getElementById("navUsers");
const navActivities = document.getElementById("navActivities");

// Use correct element IDs that match HTML
const usersSection = document.getElementById("usersSection");
const activitiesSection = document.getElementById("activitiesSection");

const usersTableBody = document.getElementById("usersTableBody");
const userSearch = document.getElementById("userSearch");
const activitiesTableBody = document.getElementById("activitiesTableBody");

// Stats elements
const statTotalUsers = document.getElementById("stat-total-users");
const statTotalMessages = document.getElementById("stat-total-messages");
const statTotalAgencies = document.getElementById("stat-total-agencies");

// Loading elements
const usersLoading = document.getElementById("usersLoading");
const activitiesLoading = document.getElementById("activitiesLoading");

// ================= LOGOUT =================
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });
}

// ================= NAVIGATION =================
if (navUsers) {
  navUsers.addEventListener("click", () => showView("users"));
}
if (navActivities) {
  navActivities.addEventListener("click", () => showView("activities"));
}

function showView(view) {
  // Use correct section IDs
  if (usersSection) usersSection.style.display = view === "users" ? "block" : "none";
  if (activitiesSection) activitiesSection.style.display = view === "activities" ? "block" : "none";

  if (navUsers) navUsers.classList.toggle("active", view === "users");
  if (navActivities) navActivities.classList.toggle("active", view === "activities");
  
  if (view === "users") loadUsers();
  if (view === "activities") loadActivities();
}

// ================= LOAD USERS =================
let allUsers = [];

async function loadUsers() {
  if (usersLoading) usersLoading.classList.remove("hidden");
  if (usersTableBody) {
    usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;">Loading users...</td></tr>`;
  }
  
  try {
    console.log("[ADMIN] Fetching users from:", `${API_URL}/api/admin/users`);
    
    // FIXED: Added /api/ prefix
    const res = await fetch(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    // Check for HTTP errors
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error("Access denied - Admin privileges required");
      } else if (res.status === 401) {
        throw new Error("Session expired - Please login again");
      } else {
        const errorText = await res.text();
        throw new Error(`Server error (${res.status}): ${errorText.substring(0, 100)}`);
      }
    }

    allUsers = await res.json();
    console.log("[ADMIN] Loaded users:", allUsers.length);
    
    updateStats(allUsers);
    renderUserTable(allUsers);
  } catch (err) {
    console.error("[ADMIN] Load Users Error:", err);
    if (usersTableBody) {
      usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#ff4d4d;padding:40px;">
        <strong>Error loading users</strong><br>
        ${err.message}<br>
        <button onclick="loadUsers()" style="margin-top:15px;padding:8px 20px;background:#d4af37;color:black;border:none;border-radius:6px;cursor:pointer;">Retry</button>
      </td></tr>`;
    }
  }
  
  if (usersLoading) usersLoading.classList.add("hidden");
}

function updateStats(users) {
  if (statTotalUsers) statTotalUsers.textContent = users.length;
  
  let msgs = 0;
  let agencies = 0;
  users.forEach(u => {
    msgs += (u.messages_used || 0);
    if (u.plan === 'agency') agencies++;
  });
  
  if (statTotalMessages) statTotalMessages.textContent = msgs.toLocaleString();
  if (statTotalAgencies) statTotalAgencies.textContent = agencies;
}

// Helper to escape HTML
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderUserTable(users) {
  if (!usersTableBody) return;
  
  usersTableBody.innerHTML = "";
  
  if (users.length === 0) {
    usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;">No users found</td></tr>`;
    return;
  }

  users.forEach(u => {
    const tr = document.createElement("tr");
    
    const displayName = u.business_name || u.name || u.email?.split('@')[0] || "Unnamed Business";
    const isVerified = u.is_verified === 1 || u.is_verified === true;
    
    tr.innerHTML = `
      <td>
        <div style="font-weight:600; color:#d4af37">${escapeHtml(displayName)}</div>
        <div style="font-size:0.8rem; color:#aaaaaa">${escapeHtml(u.email)}</div>
      </td>
      <td>
        <select id="plan-${u.id}" style="margin-bottom: 5px; display: block;">
          <option value="free" ${u.plan === 'free' ? 'selected' : ''}>Free</option>
          <option value="basic" ${u.plan === 'basic' ? 'selected' : ''}>Basic</option>
          <option value="pro" ${u.plan === 'pro' ? 'selected' : ''}>Pro</option>
          <option value="agency" ${u.plan === 'agency' ? 'selected' : ''}>Agency</option>
        </select>
        <span class="status-badge ${isVerified ? 'status-verified' : 'status-pending'}">
            ${isVerified ? 'VERIFIED' : 'PENDING'}
        </span>
        <select id="verify-${u.id}" style="width: 80px; font-size: 10px; padding: 2px; margin-top:5px;">
            <option value="1" ${isVerified ? 'selected' : ''}>Verify</option>
            <option value="0" ${!isVerified ? 'selected' : ''}>Unverify</option>
        </select>
      </td>
      <td><input type="number" class="table-input" id="msg-${u.id}" value="${u.messages_used || 0}"></td>
      <td><input type="number" class="table-input" id="lead-${u.id}" value="${u.leads_used || 0}"></td>
      <td>
        <button class="btn-save" onclick="updateUser('${u.id}')">Update</button>
        <button class="btn-delete" onclick="deleteUser('${u.id}')">Delete</button>
      </td>
    `;
    usersTableBody.appendChild(tr);
  });
}

// Admin Update Function (made global for onclick)
window.updateUser = async function(userId) {
  const plan = document.getElementById(`plan-${userId}`).value;
  const is_verified = parseInt(document.getElementById(`verify-${userId}`).value);
  const messages_used = parseInt(document.getElementById(`msg-${userId}`).value) || 0;
  const leads_used = parseInt(document.getElementById(`lead-${userId}`).value) || 0;

  try {
    console.log("[ADMIN] Updating user:", userId, {plan, is_verified, messages_used, leads_used});
    
    // FIXED: Added /api/ prefix
    const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ plan, is_verified, messages_used, leads_used })
    });

    if (res.ok) {
      alert("User updated successfully");
      loadUsers();
    } else {
      const error = await res.text();
      alert("Update failed: " + error);
    }
  } catch (e) {
    alert("Network error during update: " + e.message);
  }
};

// Admin Delete Function (made global for onclick)
window.deleteUser = async function(userId) {
  if (!confirm("⚠️ PERMANENT ACTION: Delete this business and all its data? This cannot be undone.")) return;

  try {
    console.log("[ADMIN] Deleting user:", userId);
    
    // FIXED: Added /api/ prefix
    const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      alert("Account Deleted");
      loadUsers();
    } else {
      const error = await res.text();
      alert("Deletion failed: " + error);
    }
  } catch (e) {
    alert("Deletion failed: " + e.message);
  }
};

// Search filter
if (userSearch) {
  userSearch.addEventListener("input", () => {
    const term = userSearch.value.toLowerCase();
    const filtered = allUsers.filter(u => 
      (u.email && u.email.toLowerCase().includes(term)) || 
      (u.business_name && u.business_name.toLowerCase().includes(term)) ||
      (u.name && u.name.toLowerCase().includes(term))
    );
    renderUserTable(filtered);
  });
}

// ================= LOAD ACTIVITIES =================
async function loadActivities() {
  if (activitiesLoading) activitiesLoading.classList.remove("hidden");
  if (activitiesTableBody) {
    activitiesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;">Loading activities...</td></tr>`;
  }
  
  try {
    console.log("[ADMIN] Fetching activities from:", `${API_URL}/api/admin/activities`);
    
    // FIXED: Added /api/ prefix
    const res = await fetch(`${API_URL}/api/admin/activities`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const activities = await res.json();
    console.log("[ADMIN] Loaded activities:", activities.length);
    
    if (!activitiesTableBody) return;
    activitiesTableBody.innerHTML = "";
    
    if (activities.length === 0) {
      activitiesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;">No activities found</td></tr>`;
      return;
    }

    activities.forEach(a => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(a.client_name || "Visitor")}</td>
        <td>${escapeHtml(a.message || '')}</td>
        <td>${escapeHtml(a.response || '')}</td>
        <td>${a.created_at ? new Date(a.created_at).toLocaleString() : 'Unknown'}</td>
      `;
      activitiesTableBody.appendChild(row);
    });
  } catch (err) {
    console.error("[ADMIN] Load Activities Error:", err);
    if (activitiesTableBody) {
      activitiesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ff4d4d;padding:40px;">
        <strong>Error loading activities</strong><br>
        ${err.message}<br>
        <button onclick="loadActivities()" style="margin-top:15px;padding:8px 20px;background:#d4af37;color:black;border:none;border-radius:6px;cursor:pointer;">Retry</button>
      </td></tr>`;
    }
  }
  
  if (activitiesLoading) activitiesLoading.classList.add("hidden");
}

// ================= INITIAL LOAD =================
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const refreshActivitiesBtn = document.getElementById("refreshActivitiesBtn");

if (refreshUsersBtn) refreshUsersBtn.addEventListener("click", loadUsers);
if (refreshActivitiesBtn) refreshActivitiesBtn.addEventListener("click", loadActivities);

// Make functions globally available
window.loadUsers = loadUsers;
window.loadActivities = loadActivities;

// Start
loadUsers();