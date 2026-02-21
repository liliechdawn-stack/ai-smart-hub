// subscription.js - Subscription Management with Dynamic Plan Cards
const planCardsContainer = document.getElementById("planCards");
const API_URL = "http://localhost:5000/api";
const token = localStorage.getItem("token");
const userEmail = localStorage.getItem("email") || "customer@email.com";

const ALL_PLANS = [
  { name: "basic", price: "₦10,000 / month", messages: "500 AI messages", leads: "Unlimited leads", features: ["Email support","Remove branding"] },
  { name: "pro", price: "₦25,000 / month", messages: "3,000 AI messages", leads: "Unlimited leads", features: ["Priority AI","Custom prompts","Analytics export"] },
  { name: "agency", price: "₦80,000 / month", messages: "10 businesses", leads: "Unlimited leads", features: ["White-label widget","API access"] }
];

// Render the plan cards dynamically
function renderPlanCards(currentPlan, expiresDate = null) {
  if (!planCardsContainer) return;
  
  planCardsContainer.innerHTML = "";

  // Show current plan expiry if available (helps user know it's 1-month only)
  if (expiresDate) {
    const expiryEl = document.createElement("p");
    expiryEl.style.color = "#e67e22";
    expiryEl.style.margin = "10px 0";
    expiryEl.innerText = `Your current plan expires on ${new Date(expiresDate).toLocaleDateString()}`;
    planCardsContainer.appendChild(expiryEl);
  }

  const planOrder = ["free", "basic", "pro", "agency"];
  const currentPlanIndex = planOrder.indexOf(currentPlan.toLowerCase());

  ALL_PLANS.forEach(p => {
    // Hide plans the user already has or has exceeded
    if (planOrder.indexOf(p.name) <= currentPlanIndex) return;

    const card = document.createElement("div");
    card.className = "plan-card";
    card.innerHTML = `
      <h3>${p.name.toUpperCase()}</h3>
      <p class="price">${p.price}</p>
      <ul>
        <li>${p.messages}</li>
        <li>${p.leads}</li>
        ${p.features.map(f => `<li>${f}</li>`).join("")}
      </ul>
      <button class="subscribePlanBtn" data-plan="${p.name}">Subscribe</button>
    `;
    planCardsContainer.appendChild(card);
  });

  // Attach event listeners to the newly created buttons
  document.querySelectorAll(".subscribePlanBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const selectedPlan = btn.getAttribute("data-plan");
      
      if (!token) {
        alert("Please log in to subscribe.");
        window.location.href = "login.html";
        return;
      }

      // Visual feedback: Disable button and show loading state
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Processing...";

      try {
        const res = await fetch(`${API_URL}/subscription/create-checkout-session`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ plan: selectedPlan, email: userEmail })
        });

        const data = await res.json();

        if (data.url) {
          // Redirect to the Paystack checkout URL provided by the server
          window.location.href = data.url;
        } else {
          alert(data.error || "Failed to create checkout session");
          btn.disabled = false;
          btn.textContent = originalText;
        }
      } catch (err) {
        console.error("Subscription error:", err);
        alert("Server error. Please try again later.");
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

// Load dashboard overview to check current status and render available upgrades
(async () => {
  if (!token) {
    console.warn("No token found, rendering plans as 'free' user.");
    renderPlanCards("free");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/dashboard/full`, {  // ← Fixed endpoint (was wrong before)
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) throw new Error("Failed to fetch dashboard");
    
    const data = await res.json();
    
    // Pass both current plan AND expiry date to render function
    renderPlanCards(data.plan || "free", data.plan_expires);

  } catch (err) {
    console.error("Initial load error:", err);
    // Fallback: Show all plans if the dashboard check fails
    renderPlanCards("free");
  }
})();