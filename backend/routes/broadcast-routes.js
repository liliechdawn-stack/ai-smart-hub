// ============================================================
// backend/routes/broadcast-routes.js - Broadcast Routes
// ============================================================

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../database-supabase.js");
const { getUserById, saveBroadcast, getBroadcastsByUser, getBroadcastStats } = require("../database-supabase.js");
const { sendEmailWithFallback } = require("../services/email-service");
const { logActivity } = require("../database-supabase.js");

// Send broadcast to all leads
router.post("/send", async (req, res) => {
  const { subject, content, target } = req.body;
  const userId = req.user.id;

  if (!subject || !content) {
    return res.status(400).json({ error: "Subject and content are required" });
  }

  try {
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("name, email")
      .eq("user_id", userId);

    if (leadsError) throw leadsError;

    if (!leads || leads.length === 0) {
      return res.status(400).json({ error: "No leads found to send emails to" });
    }

    let recipients = leads;
    const batchSize = 10;
    const results = { sent: 0, failed: 0 };

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const promises = batch.map((lead) => {
        const personalizedContent = content.replace(/{{name}}/g, lead.name || "Valued Customer");
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"></head>
          <body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
            <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">✨ ${user.business_name || "AI Smart Hub"}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Customer Update</p>
              </div>
              <div style="padding: 30px; background: white;">
                ${personalizedContent.replace(/\n/g, "<br>")}
              </div>
              <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                <p style="color: #666; font-size: 14px; margin: 0;">
                  You're receiving this because you're a valued customer of ${user.business_name || "AI Smart Hub"}.
                </p>
                <p style="color: #999; font-size: 12px; margin: 10px 0 0;">
                  <a href="#" style="color: #d4af37; text-decoration: none;">Unsubscribe</a>
                </p>
              </div>
            </div>
          </body>
          </html>
        `;

        return sendEmailWithFallback(
          lead.email,
          user.business_name || "AI Smart Hub",
          subject,
          emailHtml
        );
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach((r) => (r.success ? results.sent++ : results.failed++));

      if (i + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const broadcastId = uuidv4();
    await saveBroadcast(broadcastId, userId, subject, recipients.length, results.sent, results.failed);
    await logActivity(userId, "broadcast_sent", `Broadcast sent to ${results.sent} leads`, "email");

    res.json({
      success: true,
      message: `📧 Broadcast sent to ${results.sent} recipients${results.failed > 0 ? `, ${results.failed} failed` : ""}`,
      stats: results,
    });
  } catch (err) {
    console.error("Broadcast error:", err);
    res.status(500).json({ error: "Failed to send broadcast: " + err.message });
  }
});

// Send test email
router.post("/test", async (req, res) => {
  const { subject, content } = req.body;
  const userId = req.user.id;

  if (!subject || !content) {
    return res.status(400).json({ error: "Subject and content are required" });
  }

  try {
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    console.log(`📧 Sending test email to: ${user.email}`);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: #f8f9fa; padding: 15px; text-align: center; border-bottom: 2px solid #d4af37;">
            <span style="background: #d4af37; color: white; padding: 5px 15px; border-radius: 20px; font-size: 14px; font-weight: bold;">🧪 TEST MODE</span>
          </div>
          <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">✨ ${user.business_name || "AI Smart Hub"}</h1>
          </div>
          <div style="padding: 30px;">
            ${content.replace(/\n/g, "<br>")}
          </div>
          <div style="background: #fff3cd; padding: 20px; text-align: center; border-top: 2px solid #ffc107;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              🧪 This was a test email from your AI Smart Hub dashboard. 
              <strong>No customers received this message.</strong>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendEmailWithFallback(
      user.email,
      user.business_name || "AI Smart Hub",
      `[TEST] ${subject}`,
      emailHtml
    );

    if (result.success) {
      res.json({ success: true, message: `📧 Test email sent via ${result.method}! Check your inbox.` });
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error("Test email error:", err);
    res.status(500).json({
      error: "Failed to send test email: " + err.message,
      tip: "Sign up for Resend at https://resend.com for reliable delivery",
    });
  }
});

// Get broadcast history
router.get("/history", async (req, res) => {
  const userId = req.user.id;
  try {
    const history = await getBroadcastsByUser(userId);
    res.json(history);
  } catch (err) {
    console.error("Broadcast history error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Get broadcast stats
router.get("/stats", async (req, res) => {
  const userId = req.user.id;
  try {
    const stats = await getBroadcastStats(userId);
    res.json(stats);
  } catch (err) {
    console.error("Broadcast stats error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;