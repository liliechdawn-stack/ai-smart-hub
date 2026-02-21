const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const db = require("./database");

// ===============================
// CREATE CHECKOUT SESSION
// ===============================
async function createCheckoutSession(req, res) {
  const user = req.user;

  if (user.subscription === "premium") {
    return res.status(400).json({ error: "Already premium" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "ngn",
            recurring: { interval: "month" },
            product_data: {
              name: "AI Chat Widget – Premium"
            },
            unit_amount: 1500000 // ₦15,000
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/index.html?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/index.html?canceled=true`,
      metadata: {
        user_id: user.id
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
}

// ===============================
// STRIPE WEBHOOK
// ===============================
async function stripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = Stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).send(`Webhook Error`);
  }

  // PAYMENT SUCCESS
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const user_id = session.metadata.user_id;

    await db.upgradeSubscription(user_id, "premium");
    console.log("✅ User upgraded to PREMIUM:", user_id);
  }

  res.json({ received: true });
}

module.exports = { createCheckoutSession, stripeWebhook };
