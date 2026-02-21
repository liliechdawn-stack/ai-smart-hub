const API_URL = window.BACKEND_URL;;

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
const navActivity = document.getElementById("navActivity");
const navSettings = document.getElementById("navSettings");

const usersView = document.getElementById("usersView");
const activityView = document.getElementById("activityView");
const settingsView = document.getElementById("settingsView");

const usersList = document.getElementById("usersList");
const searchUser = document.getElementById("searchUser");
const filterPlan = document.getElementById("filterPlan");

const selectUserActivity = document.getElementById("selectUserActivity");
const activityList = document.getElementById("activityList");

// ================= LOGOUT =================
logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "login.html";
});

// ================= NAVIGATION =================
navUsers.addEventListener("click", () => showView("users"));
navActivity.addEventListener("click", () => showView("activity"));
navSettings.addEventListener("click", () => showView("settings"));

function showView(view) {
  usersView.style.display = view === "users" ? "block" : "none";
  activityView.style.display = view === "activity" ? "block" : "none";
  settingsView.style.display = view === "settings" ? "block" : "none";

  navUsers.classList.toggle("active", view === "users");
  navActivity.classList.toggle("active", view === "activity");
  navSettings.classList.toggle("active", view === "settings");
}

// ================= LOAD USERS =================
let allUsers = [];

async function loadUsers() {
  try {
    const res = await fetch(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Unauthorized");

    allUsers = await res.json();
    renderUsers(allUsers);
    populateUserActivitySelect(allUsers);
  } catch (err) {
    alert("Failed to load users. Check your token.");
    console.error(err);
  }
}

function renderUsers(users) {
  const searchText = searchUser.value.toLowerCase();
  const planFilter = filterPlan.value;

  usersList.innerHTML = "";

  users
    .filter(u => {
      const matchesSearch =
        u.email.toLowerCase().includes(searchText) ||
        u.businessName.toLowerCase().includes(searchText);
      const matchesPlan = planFilter ? u.plan === planFilter : true;
      return matchesSearch && matchesPlan;
    })
    .forEach(u => {
      const div = document.createElement("div");
      div.className = "user-card";
      div.innerHTML = `
        <h3>${u.businessName} (${u.email})</h3>
        <p>Plan: ${u.plan}</p>
        <p>Messages Used: ${u.messagesUsed} / ${u.messagesLimit}</p>
        <p>Leads Added: ${u.leadsUsed} / ${u.leadsLimit}</p>
      `;
      usersList.appendChild(div);
    });
}

searchUser.addEventListener("input", () => renderUsers(allUsers));
filterPlan.addEventListener("change", () => renderUsers(allUsers));

// ================= LOAD USER ACTIVITY =================
async function loadActivity(userId) {
  if (!userId) {
    activityList.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/admin/users/${userId}/activity`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed");

    const activities = await res.json();
    activityList.innerHTML = "";

    activities.forEach(a => {
      const div = document.createElement("div");
      div.className = "user-card";
      div.innerHTML = `
        <p><strong>${a.client_name}</strong> messaged AI:</p>
        <p>${a.message}</p>
        <p>Response: ${a.response}</p>
        <p><small>${new Date(a.created_at).toLocaleString()}</small></p>
      `;
      activityList.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    activityList.innerHTML = "<p>Failed to load activity.</p>";
  }
}

function populateUserActivitySelect(users) {
  selectUserActivity.innerHTML = `<option value="">Select User</option>`;
  users.forEach(u => {
    const option = document.createElement("option");
    option.value = u.id;
    option.textContent = `${u.businessName} (${u.email})`;
    selectUserActivity.appendChild(option);
  });
}

selectUserActivity.addEventListener("change", e => {
  loadActivity(e.target.value);
});

// ================= INITIAL LOAD =================
showView("users"); // default view
loadUsers();
