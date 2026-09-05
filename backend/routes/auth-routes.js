// ============================================================
// backend/routes/auth-routes.js - Authentication Routes
// ============================================================

const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const config = require("../config");
const { supabase, getUserByEmail, createUser, setWidgetKey, verifyUser } = require("../database-supabase.js");
const { sendEmailWithFallback } = require("../services/email-service");
const { login } = require("../auth");

// Signup
router.post("/signup", bodyParser.json(), async (req, res) => {
  const { email, password, business_name } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing fields" });

  const normalizedEmail = email.trim().toLowerCase();
  const vCode = Math.floor(100000 + Math.random() * 900000).toString();
  const hashed = await bcrypt.hash(password, 10);
  const business_id = "biz_" + Math.random().toString(36).substring(2, 12);

  try {
    const existing = await getUserByEmail(normalizedEmail);
    if (existing) return res.status(400).json({ error: "User already exists" });

    const userId = await createUser(
      normalizedEmail,
      hashed,
      business_id,
      business_name,
      vCode
    );

    const widgetKey = uuidv4();
    await setWidgetKey(userId, widgetKey);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">✨ Welcome to AI Smart Hub</h1>
          </div>
          <div style="padding: 40px;">
            <h2 style="color: #333;">Verify Your Email</h2>
            <p style="color: #666; margin-bottom: 20px;">Your verification code is:</p>
            <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="font-size: 48px; letter-spacing: 8px; color: #d4af37; margin: 0;">${vCode}</h1>
            </div>
            <p style="color: #666;">Enter this code on the website to verify your account.</p>
            <p style="color: #999; font-size: 14px;">This code will expire in 24 hours.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmailWithFallback(
      normalizedEmail,
      "AI Smart Hub Support",
      "Your Verification Code",
      emailHtml
    );

    res.json({
      success: true,
      message:
        "Signup successful. Please check your email for your 6-digit verification code.",
      email: normalizedEmail,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Verify via URL token
router.get("/verify/:token", async (req, res) => {
  const success = await verifyUser(req.params.token);
  if (success) {
    res.send(
      "<h1>Email Verified!</h1><p>Your account is now active. You can now log in to your dashboard.</p>"
    );
  } else {
    res.status(400).send("Invalid or expired verification code.");
  }
});

// Verify via code
router.post("/verify-code", bodyParser.json(), async (req, res) => {
  const { code, email } = req.body;

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("verification_token", code)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    const success = await verifyUser(code);

    if (success) {
      const token = jwt.sign(
        { id: user.id, email: user.email, plan: user.plan },
        config.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        success: true,
        message: "Account verified successfully!",
        token,
        plan: user.plan,
        email: user.email,
        business_name: user.business_name,
      });
    } else {
      res.status(400).json({ error: "Invalid verification code." });
    }
  } catch (err) {
    console.error("Verify code error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login
router.post("/login", bodyParser.json(), (req, res, next) => {
  const { email } = req.body;
  if (email && email.toLowerCase().trim() === config.ADMIN_EMAIL) {
    supabase
      .from("users")
      .update({
        is_verified: 1,
        plan: "agency",
        plan_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("email", config.ADMIN_EMAIL)
      .then(() => {
        login(req, res, next);
      })
      .catch((err) => {
        console.error("Admin update error:", err);
        login(req, res, next);
      });
  } else {
    login(req, res, next);
  }
});

// Resend verification
router.post("/resend-verification", bodyParser.json(), async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const vCode = Math.floor(100000 + Math.random() * 900000).toString();

    const { error } = await supabase
      .from("users")
      .update({ verification_token: vCode })
      .eq("email", normalizedEmail);

    if (error) {
      console.error("Update verification token error:", error);
      return res.status(500).json({ error: "Database error" });
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">✨ AI Smart Hub</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">New Verification Code</p>
          </div>
          <div style="padding: 40px;">
            <h2 style="color: #333; margin-bottom: 20px;">Your New Verification Code</h2>
            <p style="color: #666; margin-bottom: 20px;">You requested a new verification code for your account.</p>
            <div style="background: #f8f9fa; padding: 30px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="font-size: 48px; letter-spacing: 8px; color: #d4af37; margin: 0;">${vCode}</h1>
            </div>
            <p style="color: #666;">Enter this code on the website to verify your account.</p>
            <p style="color: #999; font-size: 14px; margin-top: 20px;">This code will expire in 24 hours.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendEmailWithFallback(
      normalizedEmail,
      "AI Smart Hub Support",
      "Your New Verification Code",
      emailHtml
    );

    if (result.success) {
      res.json({
        success: true,
        message: `New verification code sent to ${normalizedEmail} via ${result.method}`,
      });
    } else {
      res.status(500).json({ error: "Failed to send verification email" });
    }
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;