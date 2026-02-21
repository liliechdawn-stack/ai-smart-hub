// ----------------------
// Variables & URLs
// ----------------------
const API_URL = "http://localhost:5000/api";
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const subscribeBtn = document.getElementById("subscribeBtn");
const leadsTableBody = document.querySelector("#leadsTable tbody");
const logoutBtn = document.getElementById("logoutBtn");

// ----------------------
// LOGIN
// ----------------------
if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem("token", data.token);
      window.location.href = "dashboard.html";
    } else if(data.error === "Subscription inactive") {
      alert("You need to subscribe first!");
      subscribeBtn.style.display = "block";
    } else {
      alert(data.error);
    }
  });
}

// ----------------------
// REGISTER
// ----------------------
if (registerForm) {
  registerForm.addEventListener("submit", async e => {
    e.preventDefault();
    const businessName = document.getElementById("businessName").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;

    // First create business
    const resBusiness = await fetch(`${API_URL}/leads`, { method: "GET" }); // placeholder to create business first manually

    const businessId = prompt("Enter your Business ID (created manually in DB)"); // You can replace with real business creation route

    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, business_id: businessId })
    });

    const data = await res.json();
    if (res.ok) {
      alert("Registration successful! Please login.");
    } else {
      alert(data.error);
    }
  });
}

// ----------------------
// SUBSCRIBE (Stripe Checkout)
// ----------------------
if (subscribeBtn) {
  subscribeBtn.addEventListener("click", async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/subscription/create-checkout-session`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ plan: "premium" })
    });
    const data = await res.json();
    window.location.href = data.url;
  });
}

// ----------------------
// DASHBOARD LEADS FETCH
// ----------------------
async function loadLeads() {
  const token = localStorage.getItem("token");
  if (!token) return window.location.href = "index.html";

  const res = await fetch(`${API_URL}/leads`, {
    headers: { "Authorization": "Bearer " + token }
  });

  if (!res.ok) return alert("Failed to fetch leads");

  const leads = await res.json();
  leadsTableBody.innerHTML = "";
  leads.forEach(lead => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${lead.name}</td><td>${lead.email}</td><td>${lead.phone || ""}</td><td>${lead.created_at}</td>`;
    leadsTableBody.appendChild(tr);
  });
}

// ----------------------
// LOGOUT
// ----------------------
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "index.html";
  });
}

// ----------------------
// AUTO LOAD DASHBOARD
// ----------------------
if (window.location.href.includes("dashboard.html")) {
  loadLeads();
}
