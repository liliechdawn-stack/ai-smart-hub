// ============================================================
// backend/services/email-service.js - Email Service
// ============================================================

const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const config = require("../config");

let resend = null;
if (config.RESEND_API_KEY) {
  resend = new Resend(config.RESEND_API_KEY);
  console.log("📧 Resend configured for reliable email delivery");
} else {
  console.warn("⚠️ RESEND_API_KEY not found. Using nodemailer fallback.");
}

// Nodemailer fallback
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

/**
 * Send email with Resend first, fallback to Nodemailer
 * @param {string} to - Recipient email
 * @param {string} fromName - Sender name
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 * @param {string} text - Plain text content (optional)
 * @returns {Promise<{success: boolean, method: string, error?: string}>}
 */
async function sendEmailWithFallback(to, fromName, subject, html, text = "") {
  // Try Resend first
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: config.EMAIL_FROM || `"${fromName}" <noreply@aismarthub.website>`,
        to: [to],
        subject: subject,
        html: html,
        text: text || html.replace(/<[^>]*>/g, ""),
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log(`📧 Resend email sent to: ${to}`);
      return { success: true, method: "resend" };
    } catch (err) {
      console.error(`⚠️ Resend failed for ${to}:`, err.message);
    }
  }

  // Fallback to nodemailer
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${config.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    });
    console.log(`📧 Nodemailer email sent to: ${to}`);
    return { success: true, method: "nodemailer" };
  } catch (err) {
    console.error(`⚠️ Both email methods failed for ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a simple email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 * @param {string} fromName - Sender name (optional)
 * @returns {Promise<{success: boolean, method: string}>}
 */
async function sendEmail(to, subject, html, fromName = "AI Smart Hub") {
  return sendEmailWithFallback(to, fromName, subject, html);
}

module.exports = {
  sendEmail,
  sendEmailWithFallback,
};