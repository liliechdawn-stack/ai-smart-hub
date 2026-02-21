const API_URL = window.BACKEND_URL;;

// DOM Elements
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const subscribeBtn = document.getElementById("subscribeBtn");

// ========== LOGIN ==========
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    alert("Email and password required");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Login failed");
      return;
    }

    // ================= SAVE SESSION (FIXED) =================
    localStorage.setItem("token", data.token);
    localStorage.setItem("widget_key", data.widget_key || ""); 
    localStorage.setItem("plan", data.plan || "free");
    localStorage.setItem("email", email);
    localStorage.setItem("business_id", data.business_id || "");

    // ✅ THE CRITICAL FIX: Save the name so the dashboard can display it
    // This grabs 'business_name' or 'name' from your backend response
    const displayName = data.business_name || data.name || "My Business";
    localStorage.setItem("businessName", displayName);

    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    alert("Server error");
  }
});

// ========== SIGNUP ==========
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("businessName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

  if (!name || !email || !password) {
    alert("All fields are required");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      alert("Registration successful! Please login.");
      signupForm.reset();
    } else {
      alert(data.error || "Signup failed");
    }
  } catch (err) {
    console.error(err);
    alert("Server error");
  }
});

// ========== SUBSCRIBE BUTTON ==========
if (subscribeBtn) {
  subscribeBtn.addEventListener("click", async () => {
    const token = localStorage.getItem("token");
    const email = localStorage.getItem("email") || "customer@email.com";

    if (!token) {
      alert("Please login first");
      return;
    }

    const selectedPlan = prompt(
      "Enter plan to subscribe (basic/pro/agency):"
    )?.toLowerCase();

    if (!["basic", "pro", "agency"].includes(selectedPlan)) {
      alert("Invalid plan");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/subscription/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: selectedPlan, email }), 
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to create checkout session");
      }
    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  });
}