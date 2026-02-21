const nodemailer = require("nodemailer");

// Configure the email transporter
// Tip: For Gmail, you MUST use an "App Password", not your regular password.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Your email (e.g., info@your-saas.com)
    pass: process.env.EMAIL_PASS  // Your 16-character App Password
  }
});

/**
 * Sends a verification email to a new user
 * @param {string} email - Recipient email
 * @param {string} token - The unique verification token from the database
 * @param {string} name - The user's name
 */
async function sendVerificationEmail(email, token, name) {
  // Replace this with your actual production domain later
  const verificationLink = `http://localhost:3000/api/auth/verify?token=${token}`;

  const mailOptions = {
    from: `"AI SaaS Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify Your Account - AI SaaS",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
        <h2 style="color: #333;">Welcome to the family, ${name}!</h2>
        <p>Thanks for signing up. To get started with your AI widget, please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" 
             style="background-color: #d4af37; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Verify My Account
          </a>
        </div>
        <p style="font-size: 0.8rem; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="font-size: 0.8rem; color: #666;">${verificationLink}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;">
        <p style="font-size: 0.7rem; color: #999;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to: ${email}`);
    return true;
  } catch (error) {
    console.error("❌ Email failed to send:", error);
    return false;
  }
}

module.exports = { sendVerificationEmail };