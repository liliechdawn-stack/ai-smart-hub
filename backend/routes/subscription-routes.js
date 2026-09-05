// ============================================================
// backend/routes/subscription-routes.js - Subscription Routes
// ============================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const config = require("../config");
const { supabase } = require("../database-supabase.js");
const { auth } = require("../auth");

// ============================================================
// IMPORT PLAN HELPERS - Single Source of Truth (from config)
// ============================================================
const {
  getPlan,
  getPlanPrice,
  getPlanPriceNGN,
  getAllPlans,
  isValidPlan,
  getAllPlanIds,
} = require("../config");

// ============================================================
// ROUTES
// ============================================================

// Get pricing information (public)
router.get("/pricing", (req, res) => {
  const plans = getAllPlans().map(plan => ({
    id: plan.id,
    name: plan.name,
    price_usd: plan.price_usd,
    price_usd_annual: plan.price_usd_annual,
    features: plan.features.map(f => {
      // Convert feature keys to display names
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
    }),
    description: plan.description,
  }));

  res.json({
    currency: "USD",
    plans: plans,
    conversion_rate_ngn: config.USD_TO_NGN_RATE || 1500,
  });
});

// Create checkout session
router.post("/create-checkout-session", auth, bodyParser.json(), async (req, res) => {
  const { plan, isAnnual } = req.body;

  // Validate plan using centralized source
  if (!isValidPlan(plan)) {
    return res.status(400).json({ error: "Invalid plan selected" });
  }

  const planData = getPlan(plan);
  const amountInNGN = getPlanPriceNGN(plan, isAnnual, config.USD_TO_NGN_RATE || 1500);
  const planDisplay = isAnnual ? `${plan}_annual` : plan;

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: req.user.email,
        amount: amountInNGN * 100, // Paystack uses kobo (NGN * 100)
        currency: "NGN",
        metadata: {
          userId: req.user.id,
          plan: planDisplay,
          isAnnual: isAnnual || false,
        },
      }),
    });

    const data = await response.json();
    if (!data.status) return res.status(400).json({ error: data.message });

    res.json({
      url: data.data.authorization_url,
      plan: planDisplay,
      amount_usd: isAnnual ? planData.price_usd_annual : planData.price_usd,
      amount_ngn: amountInNGN,
    });
  } catch (err) {
    console.error("Paystack error:", err);
    res.status(500).json({ error: "Payment server error" });
  }
});

// Payment webhook
router.post("/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  const hash = crypto
    .createHmac("sha512", config.PAYSTACK_SECRET_KEY)
    .update(req.body)
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(req.body);

  if (event.event === "charge.success") {
    const { userId, plan, isAnnual } = event.data.metadata;

    // Determine expiration
    const durationDays = isAnnual === 'true' || isAnnual === true ? 365 : 30;
    const planExpires = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    // Validate plan before updating
    const validPlan = isValidPlan(plan) ? plan : "free";

    supabase
      .from("users")
      .update({
        plan: validPlan,
        plan_expires: planExpires,
        messages_used: 0,
        leads_used: 0,
        subscription_type: isAnnual === 'true' || isAnnual === true ? 'annual' : 'monthly',
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .then(() => {
        supabase
          .from("payments")
          .insert({
            id: uuidv4(),
            user_id: userId,
            plan: validPlan,
            amount: event.data.amount / 100,
            currency: "NGN",
            reference: event.data.reference,
            status: "success",
            is_annual: isAnnual === 'true' || isAnnual === true,
            created_at: new Date().toISOString(),
          })
          .then(() => {});
      });
  }
  res.sendStatus(200);
});

module.exports = router;