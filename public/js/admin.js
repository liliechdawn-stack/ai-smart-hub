/**
 * Admin Panel JavaScript
 * Fixed version - compatible with admin.html
 */

// CRITICAL FIX: Define API_URL directly (no trailing space!)
const API_URL = 'https://ai-smart-hub.onrender.com';

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

// CRITICAL FIX: Use correct element IDs that match HTML
const usersSection = document.getElementById("usersSection");
const activitiesSection = document.getElementById("activitiesSection");

const usersTableBody = document.getElementById("usersTableBody");
const userSearch = document.getElementById("userSearch");
const activitiesTableBody = document.getElementById("activitiesTableBody");

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
  // CRITICAL FIX: Use correct section IDs
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
  const usersLoading = document.getElementById("usersLoading");
  if (usersLoading) usersLoading.classList.remove("hidden");
  if (usersTableBody) usersTableBody.innerHTML = "";
  
  try {
    const res = await fetch(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    // CRITICAL FIX: Check for HTTP errors
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Server error: ${res.status} - ${errorText}`);
    }

    allUsers = await res.json();
    updateStats(allUsers);
    renderUserTable(allUsers);
  } catch (err) {
    console.error("Load Users Error:", err);
    if (usersTableBody) {
      usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#ff4d4d;padding:20px;">Error loading users: ${err.message}</td></tr>`;
    }
  }
  
  if (usersLoading) usersLoading.classList.add("hidden");
}

function updateStats(users) {
  const totalUsersEl = document.getElementById("stat-total-users");
  const totalMessagesEl = document.getElementById("stat-total-messages");
  const totalAgenciesEl = document.getElementById("stat-total-agencies");
  
  if (totalUsersEl) totalUsersEl.textContent = users.length;
  
  let msgs = 0;
  let agencies = 0;
  users.forEach(u => {
    msgs += (u.messages_used || 0);
    if (u.plan === 'agency') agencies++;
  });
  
  if (totalMessagesEl) totalMessagesEl.textContent = msgs.toLocaleString();
  if (totalAgenciesEl) totalAgenciesEl.textContent = agencies;
}

function renderUserTable(users) {
  if (!usersTableBody) return;
  
  usersTableBody.innerHTML = "";
  
  if (users.length === 0) {
    usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;">No users found</td></tr>`;
    return;
  }

  users.forEach(u => {
    const tr = document.createElement("tr");
    
    const displayName = u.business_name || u.name || "Unnamed Business";
    const isVerified = u.is_verified === 1 || u.is_verified === true;
    
    tr.innerHTML = `
      <td>
        <div style="font-weight:600; color:#d4af37">${displayName}</div>
        <div style="font-size:0.8rem; color:#aaaaaa">${u.email}</div>
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
        <select id="verify-${u.id}" style="width: 80px; font-size: 10px; padding: 2px;">
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
  const messages_used = parseInt(document.getElementById(`msg-${userId}`).value);
  const leads_used = parseInt(document.getElementById(`lead-${userId}`).value);

  try {
    const res = await fetch(`${API_URL}/admin/users/${userId}`, {
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
  if (!confirm("PERMANENT ACTION: Delete this business and all its chat logs/leads?")) return;

  try {
    const res = await fetch(`${API_URL}/admin/users/${userId}`, {
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
      u.email.toLowerCase().includes(term) || 
      (u.business_name && u.business_name.toLowerCase().includes(term)) ||
      (u.name && u.name.toLowerCase().includes(term))
    );
    renderUserTable(filtered);
  });
}

// ================= LOAD ACTIVITIES =================
async function loadActivities() {
  const activitiesLoading = document.getElementById("activitiesLoading");
  if (activitiesLoading) activitiesLoading.classList.remove("hidden");
  if (activitiesTableBody) activitiesTableBody.innerHTML = "";
  
  try {
    const res = await fetch(`${API_URL}/admin/activities`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const activities = await res.json();
    
    if (activities.length === 0) {
      if (activitiesTableBody) {
        activitiesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;">No activities found</td></tr>`;
      }
      return;
    }

    activities.forEach(a => {
      if (activitiesTableBody) {
        activitiesTableBody.innerHTML += `
          <tr>
            <td>${a.client_name || "Visitor"}</td>
            <td>${a.message}</td>
            <td>${a.response}</td>
            <td>${new Date(a.created_at).toLocaleString()}</td>
          </tr>`;
      }
    });
  } catch (err) {
    console.error("Load Activities Error:", err);
    if (activitiesTableBody) {
      activitiesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ff4d4d;padding:20px;">Error loading activities: ${err.message}</td></tr>`;
    }
  }
  
  if (activitiesLoading) activitiesLoading.classList.add("hidden");
}

// ================= INITIAL LOAD =================
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const refreshActivitiesBtn = document.getElementById("refreshActivitiesBtn");

if (refreshUsersBtn) refreshUsersBtn.addEventListener("click", loadUsers);
if (refreshActivitiesBtn) refreshActivitiesBtn.addEventListener("click", loadActivities);

// Start
loadUsers();