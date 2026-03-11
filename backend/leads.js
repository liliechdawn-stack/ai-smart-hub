const { supabase } = require('./database-supabase');
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../middleware/jwt.js";
import nodemailer from "nodemailer";

const router = express.Router();
const ADMIN_EMAIL = "ericchung992@gmail.com";

// ================= EMAIL TRANSPORTER SETUP =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "YOUR_EMAIL@gmail.com", 
    pass: process.env.EMAIL_PASS || "YOUR_APP_PASSWORD" 
  }
});

// Helper function to send email
const sendLeadEmail = (ownerEmail, leadData) => {
  const mailOptions = {
    from: '"AI Lead System" <noreply@aismarthub.website>',
    to: ownerEmail,
    subject: `🚀 New Lead Captured: ${leadData.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; border: 1px solid #d4af37; padding: 20px; border-radius: 10px;">
        <h2 style="color: #d4af37;">New Lead Details</h2>
        <p><strong>Name:</strong> ${leadData.name}</p>
        <p><strong>Email:</strong> ${leadData.email}</p>
        <p><strong>Phone:</strong> ${leadData.phone || 'Not provided'}</p>
        <hr>
        <p style="font-size: 12px; color: #666;">This is an automated notification from your AI Chat Widget.</p>
      </div>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("❌ Email Error:", error);
    else console.log("📧 Notification sent to:", ownerEmail);
  });
};

// Plan limits
const PLAN_LIMITS = {
  free: 10,
  basic: 500,
  pro: 3000,
  agency: Infinity,
  enterprise: Infinity
};

// ================= PUBLIC ROUTE: CAPTURE FROM AI WIDGET =================
router.post("/public", async (req, res) => {
  try {
    const { name, email, phone, widget_key } = req.body;

    if (!widget_key) return res.status(400).json({ error: "Widget key is required" });
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    // Get user by widget key
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('widget_key', widget_key)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "Invalid widget key" });
    }

    const userId = user.id;

    // --- DUPLICATE CHECK BY EMAIL ---
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('email', email)
      .single();

    if (existingLead) {
      console.log(`ℹ️ Duplicate lead ignored for ${email}`);
      // Return success true so the widget treats it as a success and lets the user chat
      return res.json({ success: true, message: "Lead already recognized" });
    }

    const userPlan = user.plan || "free";
    const leadsUsed = user.leads_used || 0;
    
    const limit = PLAN_LIMITS[userPlan] || 10;

    if (user.email !== ADMIN_EMAIL && userPlan !== "agency" && leadsUsed >= limit) {
      return res.status(402).json({ error: "Lead limit reached for this account." });
    }

    const leadId = uuidv4();
    const createdAt = new Date().toISOString();

    // Insert lead
    const { error: insertError } = await supabase
      .from('leads')
      .insert({
        id: leadId,
        user_id: userId,
        name,
        email,
        phone: phone || "",
        created_at: createdAt
      });

    if (insertError) {
      console.error("❌ Failed to save lead:", insertError);
      return res.status(500).json({ error: "Failed to save lead" });
    }

    // Update leads_used counter
    await supabase
      .from('users')
      .update({ leads_used: leadsUsed + 1 })
      .eq('id', userId);

    // --- TRIGGER EMAIL NOTIFICATION ---
    sendLeadEmail(user.email, { name, email, phone });

    // --- TRIGGER REAL-TIME SOCKET NOTIFICATION ---
    const io = req.app.get("socketio");
    if (io) {
      io.to(userId).emit("newLead", { name, email, createdAt });
    }

    console.log(`📩 Public Lead captured for user ${userId}: ${email}`);
    res.json({ success: true, message: "Lead captured successfully" });
  } catch (err) {
    console.error("❌ Public lead error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= PRIVATE ROUTE: CREATE NEW LEAD (DASHBOARD) =================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const userId = req.userId;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // --- DUPLICATE CHECK FOR MANUAL ADDITION ---
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('email', email)
      .single();

    if (existingLead) {
      return res.status(400).json({ error: "A lead with this email already exists in your list." });
    }

    // Get user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userPlan = user.plan || "free";
    const leadsUsed = user.leads_used || 0;
    const limit = PLAN_LIMITS[userPlan] || 10;

    if (user.email !== ADMIN_EMAIL && userPlan !== "agency" && leadsUsed >= limit) {
      return res.status(402).json({
        forceUpgrade: true,
        message: "Lead limit reached. Please upgrade to continue.",
        plan: userPlan,
        leadsUsed,
        leadsLimit: limit
      });
    }

    const leadId = uuidv4();
    const createdAt = new Date().toISOString();

    // Insert lead
    const { error: insertError } = await supabase
      .from('leads')
      .insert({
        id: leadId,
        user_id: userId,
        name,
        email,
        phone: phone || "",
        created_at: createdAt
      });

    if (insertError) {
      console.error("❌ Failed to save lead:", insertError);
      return res.status(500).json({ error: "Failed to save lead" });
    }

    // Update leads_used counter
    await supabase
      .from('users')
      .update({ leads_used: leadsUsed + 1 })
      .eq('id', userId);

    // Send email notification
    sendLeadEmail(user.email, { name, email, phone });

    // Socket notification
    const io = req.app.get("socketio");
    if (io) {
      io.to(userId).emit("newLead", { name, email, createdAt });
    }

    console.log(`📩 Lead saved for user ${userId}`, { name, email, phone });

    res.json({
      success: true,
      message: "Lead added successfully",
      lead: { id: leadId, name, email, phone, createdAt }
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= GET ALL LEADS (FOR DASHBOARD) =================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("❌ Failed to fetch leads:", error);
      return res.status(500).json({ error: "Failed to fetch leads" });
    }

    res.json(leads || []);
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= DELETE LEAD =================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const leadId = req.params.id;
    const userId = req.userId;

    // First check if lead exists and belongs to user
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // Delete the lead
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error("❌ Failed to delete lead:", deleteError);
      return res.status(500).json({ error: "Failed to delete lead" });
    }

    // Decrease leads_used counter
    await supabase
      .from('users')
      .update({ leads_used: supabase.raw('GREATEST(leads_used - 1, 0)') })
      .eq('id', userId);

    // Socket notification
    const io = req.app.get("socketio");
    if (io) {
      io.to(userId).emit("leadDeleted", { id: leadId });
    }

    res.json({ success: true, message: "Lead deleted successfully" });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= UPDATE LEAD =================
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const leadId = req.params.id;
    const userId = req.userId;
    const { name, email, phone, company, job_title } = req.body;

    // First check if lead exists and belongs to user
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // Check for duplicate email if email is being changed
    if (email && email !== lead.email) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('email', email)
        .single();

      if (existingLead) {
        return res.status(400).json({ error: "A lead with this email already exists" });
      }
    }

    // Update lead
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;
    if (job_title !== undefined) updates.job_title = job_title;

    const { error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .eq('user_id', userId);

    if (updateError) {
      console.error("❌ Failed to update lead:", updateError);
      return res.status(500).json({ error: "Failed to update lead" });
    }

    // Get updated lead
    const { data: updatedLead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    res.json({ 
      success: true, 
      message: "Lead updated successfully",
      lead: updatedLead 
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;