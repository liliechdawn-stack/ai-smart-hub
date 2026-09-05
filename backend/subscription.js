// subscription.js - Subscription Management with Dynamic Plan Cards
const planCardsContainer = document.getElementById("planCards");
const API_URL = 'https://ai-smart-hub.onrender.com';
const token = localStorage.getItem("token");
const userEmail = localStorage.getItem("email") || "customer@email.com";

// ============================================================
// Fetch plans from backend (single source of truth)
// ============================================================

async function fetchPricing() {
  try {
    const res = await fetch(`${API_URL}/api/subscription/pricing`);
    if (!res.ok) throw new Error("Failed to fetch pricing");
    const data = await res.json();
    return data.plans || [];
  } catch (err) {
    console.error("Pricing fetch error:", err);
    // Fallback: Return hard-coded plans (kept for backward compatibility)
    return getFallbackPlans();
  }
}

// ============================================================
// Fallback Plans (only used if API fails)
// ============================================================

function getFallbackPlans() {
  return [
    { 
      id: "basic", 
      name: "Basic", 
      price_usd: 7, 
      price_usd_annual: 70,
      features: ["500 AI messages", "500 leads", "Email support", "Widget"],
      description: "Perfect for small businesses."
    },
    { 
      id: "pro", 
      name: "Pro", 
      price_usd: 100, 
      price_usd_annual: 1000,
      features: ["3,000 AI messages", "3,000 leads", "Priority support", "Automations", "API Access"],
      description: "For growing businesses."
    },
    { 
      id: "agency", 
      name: "Agency", 
      price_usd: 160, 
      price_usd_annual: 1600,
      features: ["Unlimited messages", "Unlimited leads", "White-label", "API Access", "Team Management"],
      description: "For agencies managing multiple clients."
    },
    { 
      id: "enterprise", 
      name: "Enterprise", 
      price_usd: 499, 
      price_usd_annual: 4990,
      features: ["Everything in Agency", "Custom AI Models", "Dedicated Support", "SLA"],
      description: "For large enterprises."
    }
  ];
}

// ============================================================
// Format price for display
// ============================================================

function formatPrice(usd, isAnnual = false) {
  // Convert USD to NGN for display (using rate from backend)
  const rate = 1500; // This should come from backend
  const ngn = usd * rate;
  const period = isAnnual ? " / year" : " / month";
  
  // Format as NGN (₦)
  if (usd === 0) return "Free";
  return `₦${ngn.toLocaleString()}${period}`;
}

// ============================================================
// Render the plan cards dynamically
// ============================================================

function renderPlanCards(currentPlan, expiresDate = null, plans = []) {
  if (!planCardsContainer) return;
  
  planCardsContainer.innerHTML = "";

  // Show current plan expiry if available
  if (expiresDate) {
    const expiryEl = document.createElement("p");
    expiryEl.style.color = "#e67e22";
    expiryEl.style.margin = "10px 0";
    expiryEl.innerText = `Your current plan expires on ${new Date(expiresDate).toLocaleDateString()}`;
    planCardsContainer.appendChild(expiryEl);
  }

  const planOrder = ["free", "basic", "pro", "agency", "enterprise"];
  const currentPlanIndex = planOrder.indexOf(currentPlan.toLowerCase());

  // Filter out plans the user already has or has exceeded
  const availablePlans = plans.filter(p => {
    const planIndex = planOrder.indexOf(p.id.toLowerCase());
    return planIndex > currentPlanIndex;
  });

  if (availablePlans.length === 0) {
    const msg = document.createElement("p");
    msg.style.textAlign = "center";
    msg.style.padding = "20px";
    msg.innerText = "🎉 You're on the highest available plan!";
    planCardsContainer.appendChild(msg);
    return;
  }

  availablePlans.forEach(p => {
    const card = document.createElement("div");
    card.className = "plan-card";
    
    const monthlyPrice = formatPrice(p.price_usd, false);
    const annualPrice = formatPrice(p.price_usd_annual, true);
    
    // Convert feature keys to display names if needed
    const featureDisplay = p.features.map(f => {
      const featureMap = {
        basic_chat: "Basic AI Chat",
        advanced_chat: "Advanced AI Chat",
        unlimited_chat: "Unlimited AI Chat",
        lead_capture: "Lead Capture",
        widget: "AI Widget",
        knowledge_base: "Knowledge Base",
        broadcast_emails: "Broadcast Emails",
        automations: "Automations",
        workflows: "Workflows",
        all_automations: "All Automations",
        all_workflows: "All Workflows",
        business_intelligence: "Business Intelligence",
        api_access: "API Access",
        custom_branding: "Custom Branding",
        white_label: "White-label",
        team_management: "Team Management",
        custom_integrations: "Custom Integrations",
        advanced_analytics: "Advanced Analytics",
        vision_ai: "Vision AI",
        sentiment_analysis: "Sentiment Analysis",
        multi_workspace: "Multi-workspace",
        slack_integration: "Slack Integration",
        webhook_access: "Webhook Access",
        priority_support: "Priority Support",
        email_support: "Email Support",
        analytics_basic: "Basic Analytics",
        analytics_advanced: "Advanced Analytics",
        everything_in_agency: "Everything in Agency",
        custom_ai_models: "Custom AI Models",
        dedicated_support: "Dedicated Support",
        sla: "SLA",
        on_premise_deployment: "On-premise Deployment",
        sso_saml: "SSO/SAML",
        audit_logs: "Audit Logs",
        compliance_reports: "Compliance Reports",
        custom_contracts: "Custom Contracts",
        account_manager: "Account Manager",
        training_sessions: "Training Sessions",
        unlimited_leads: "Unlimited Leads",
      };
      return featureMap[f] || f;
    });

    card.innerHTML = `
      <h3>${p.name.toUpperCase()}</h3>
      <p class="price">${monthlyPrice}</p>
      <p class="price-annual">${annualPrice} (annual)</p>
      <p class="description">${p.description || ''}</p>
      <ul>
        ${featureDisplay.map(f => `<li>${f}</li>`).join("")}
      </ul>
      <button class="subscribePlanBtn" data-plan="${p.id}">Subscribe</button>
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

      // Show plan selection modal (monthly vs annual)
      const isAnnual = confirm("Would you like to subscribe annually? (Click Cancel for monthly)");
      
      // Visual feedback
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Processing...";

      try {
        const res = await fetch(`${API_URL}/api/subscription/create-checkout-session`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ 
            plan: selectedPlan, 
            isAnnual: isAnnual,
            email: userEmail 
          })
        });

        const data = await res.json();

        if (data.url) {
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

// ============================================================
// Load dashboard overview and render plans
// ============================================================

(async () => {
  // Fetch pricing from backend first
  let plans = [];
  try {
    plans = await fetchPricing();
  } catch (err) {
    console.warn("Using fallback plans:", err);
    plans = getFallbackPlans();
  }

  if (!token) {
    console.warn("No token found, rendering plans as 'free' user.");
    renderPlanCards("free", null, plans);
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/dashboard/full`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) throw new Error("Failed to fetch dashboard");
    
    const data = await res.json();
    
    // Pass current plan, expiry, and plans from backend
    renderPlanCards(data.plan || "free", data.plan_expires, plans);

  } catch (err) {
    console.error("Initial load error:", err);
    // Fallback: Show all plans
    renderPlanCards("free", null, plans);
  }
})();