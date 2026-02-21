const plans = require("../config/plans");
const db = require("../database"); // your DB connection

module.exports = async function planLimit(req, res, next) {
  try {
    const businessId = req.business?.id || req.body.business_id;

    if (!businessId) {
      return res.status(401).json({ error: "Business not identified" });
    }

    const business = await db.getBusinessById(businessId);

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const plan = business.plan || "free";
    const limits = plans[plan];

    if (!limits) {
      return res.status(403).json({ error: "Invalid plan" });
    }

    if (business.messages_used >= limits.messages) {
      return res.status(403).json({
        error: "Message limit reached. Upgrade your plan.",
        upgradeRequired: true,
      });
    }

    // attach for later use
    req.plan = plan;
    req.business = business;

    next();
  } catch (err) {
    console.error("Plan limit error:", err);
    res.status(500).json({ error: "Server plan check failed" });
  }
};
