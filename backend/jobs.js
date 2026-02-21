const nodemailer = require('nodemailer');
require("dotenv").config();

// Setup your "Business" email sender
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, 
    },
    tls: {
        rejectUnauthorized: false
    }
});

/**
 * NEW: LEAD ENRICHMENT (Operational Tool)
 * Fetches professional data about the lead before the follow-up.
 */
const enrichLeadData = async (email) => {
    if (!process.env.APOLLO_API_KEY) return null;
    
    try {
        const response = await fetch("https://api.apollo.io/v1/people/match", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache"
            },
            body: JSON.stringify({
                api_key: process.env.APOLLO_API_KEY,
                email: email
            })
        });
        const data = await response.json();
        return data.person || null;
    } catch (err) {
        console.error("❌ Enrichment Tool Error:", err.message);
        return null;
    }
};

/**
 * Schedules a follow-up email with Enrichment and Smart Logic
 * (AI-powered content generation happens elsewhere — this is just scheduling + email)
 */
const scheduleFollowUp = (leadEmail, leadName, chatSummary) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("❌ Follow-up skipped: Credentials missing.");
        return;
    }

    console.log(`⏱️ Scheduling follow-up for ${leadEmail} in 5 minutes...`);
    
    setTimeout(async () => {
        // 1. RUN ENRICHMENT TOOL
        const profile = await enrichLeadData(leadEmail);
        const companyName = profile?.organization?.name || "your company";
        const jobTitle = profile?.title ? `as a ${profile.title}` : "";

        // 2. CONSTRUCT SMART EMAIL CONTENT
        const mailOptions = {
            from: `"AI Smart Hub" <${process.env.EMAIL_USER}>`,
            to: leadEmail,
            subject: `Quick follow up for ${leadName}`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;">
                    <h2 style="color: #2c3e50;">Hello ${leadName},</h2>
                    <p>I hope your day at <strong>${companyName}</strong> is going well ${jobTitle}.</p>
                    <p>I’m following up on our recent chat regarding: <em>"${chatSummary}"</em>.</p>
                    <p>Since you were interested in this, I've prepared some additional resources that might help your team at ${companyName}.</p>
                    <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #d4af37; margin: 20px 0;">
                        <strong>Next Step:</strong> Reply to this email or book a direct demo to see how we can solve this for you.
                    </div>
                    <p>Best regards,<br><strong>The AI Strategy Team</strong></p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Real-time follow-up sent to ${leadEmail} with enriched data.`);
        } catch (error) {
            console.error("❌ Email Tool failed:", error.message);
        }
    }, 5 * 60 * 1000); 
};

module.exports = { scheduleFollowUp };