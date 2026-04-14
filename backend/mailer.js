// ================================================
// MAILER.JS - ENTERPRISE EMAIL SERVICE
// Supports: SendGrid (primary), Nodemailer (fallback)
// Features: Verification emails, Workflow notifications,
//           Marketing emails, Password reset, Invoice emails
// ================================================

const nodemailer = require("nodemailer");

// ================================================
// EMAIL PROVIDER CONFIGURATION
// ================================================

// Primary: SendGrid (recommended for production)
let sendGridMail = null;
if (process.env.SENDGRID_API_KEY) {
    try {
        sendGridMail = require('@sendgrid/mail');
        sendGridMail.setApiKey(process.env.SENDGRID_API_KEY);
        console.log("✅ SendGrid configured successfully");
    } catch (error) {
        console.error("❌ SendGrid configuration error:", error.message);
    }
}

// Fallback: Nodemailer (SMTP)
const nodemailerTransporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Default from address
const FROM_EMAIL = process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@workflowstudio.com";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Workflow Studio Pro";

// ================================================
// CORE EMAIL SENDING FUNCTION
// ================================================

/**
 * Send email using available provider (SendGrid preferred, Nodemailer fallback)
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @param {string} options.templateId - SendGrid template ID (optional)
 * @param {Object} options.templateData - Dynamic template data (optional)
 * @param {Array} options.attachments - File attachments (optional)
 * @param {string} options.replyTo - Reply-to address (optional)
 * @param {Array} options.cc - CC recipients (optional)
 * @param {Array} options.bcc - BCC recipients (optional)
 */
async function sendEmail(options) {
    const { 
        to, 
        subject, 
        html, 
        text, 
        templateId, 
        templateData,
        attachments,
        replyTo,
        cc,
        bcc
    } = options;

    console.log(`📧 [EMAIL] Sending to: ${to}, subject: ${subject}`);

    // Validate required fields
    if (!to || !subject) {
        throw new Error("Missing required fields: 'to' and 'subject' are required");
    }

    // Try SendGrid first (if available)
    if (sendGridMail) {
        try {
            const msg = {
                to: to,
                from: FROM_EMAIL,
                fromName: FROM_NAME,
                subject: subject,
                html: html,
                text: text || html?.replace(/<[^>]*>/g, ''),
                trackingSettings: {
                    clickTracking: { enable: true },
                    openTracking: { enable: true }
                }
            };

            if (replyTo) msg.replyTo = replyTo;
            if (cc) msg.cc = cc;
            if (bcc) msg.bcc = bcc;
            if (attachments) msg.attachments = attachments;

            if (templateId && sendGridMail) {
                msg.templateId = templateId;
                msg.dynamicTemplateData = templateData;
            }

            await sendGridMail.send(msg);
            console.log(`✅ [EMAIL] Sent via SendGrid to ${to}`);
            return { success: true, provider: 'sendgrid', to, subject };
        } catch (error) {
            console.error(`❌ [EMAIL] SendGrid error:`, error.message);
            // Fall through to Nodemailer
        }
    }

    // Fallback to Nodemailer
    try {
        const mailOptions = {
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: to,
            subject: subject,
            html: html,
            text: text || html?.replace(/<[^>]*>/g, '')
        };

        if (replyTo) mailOptions.replyTo = replyTo;
        if (cc) mailOptions.cc = cc;
        if (bcc) mailOptions.bcc = bcc;
        if (attachments) mailOptions.attachments = attachments;

        await nodemailerTransporter.sendMail(mailOptions);
        console.log(`✅ [EMAIL] Sent via Nodemailer to ${to}`);
        return { success: true, provider: 'nodemailer', to, subject };
    } catch (error) {
        console.error(`❌ [EMAIL] Nodemailer error:`, error.message);
        throw error;
    }
}

// ================================================
// VERIFICATION EMAIL
// ================================================

/**
 * Sends a verification email to a new user
 * @param {string} email - Recipient email
 * @param {string} token - The unique verification token from the database
 * @param {string} name - The user's name
 * @param {string} baseUrl - Base URL for verification link (optional)
 */
async function sendVerificationEmail(email, token, name, baseUrl = null) {
    const verificationLink = `${baseUrl || process.env.APP_URL || 'https://workflowstudio.ai'}/verify?token=${token}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .logo { font-size: 28px; font-weight: bold; color: #d4af37; }
                .content { background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .button { display: inline-block; background: linear-gradient(135deg, #d4af37, #b8962e); color: #1a1a2e; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">⚡ Workflow Studio Pro</div>
                </div>
                <div class="content">
                    <h2>Welcome to the family, ${name}! 🎉</h2>
                    <p>Thanks for signing up for Workflow Studio Pro. You're just one step away from unlocking powerful AI automation.</p>
                    <p>Click the button below to verify your email address and get started:</p>
                    <div style="text-align: center;">
                        <a href="${verificationLink}" class="button">Verify My Account</a>
                    </div>
                    <p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="font-size: 12px; color: #888; word-break: break-all;">${verificationLink}</p>
                </div>
                <div class="footer">
                    <p>If you didn't create an account with Workflow Studio Pro, you can safely ignore this email.</p>
                    <p>&copy; ${new Date().getFullYear()} Workflow Studio Pro. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const text = `Welcome to Workflow Studio Pro, ${name}!\n\nPlease verify your email by clicking this link: ${verificationLink}\n\nIf you didn't create an account, you can safely ignore this email.`;

    return sendEmail({
        to: email,
        subject: `Verify Your Account - Workflow Studio Pro`,
        html: html,
        text: text
    });
}

// ================================================
// PASSWORD RESET EMAIL
// ================================================

/**
 * Sends a password reset email
 * @param {string} email - Recipient email
 * @param {string} token - Reset token
 * @param {string} name - User's name
 */
async function sendPasswordResetEmail(email, token, name) {
    const resetLink = `${process.env.APP_URL || 'https://workflowstudio.ai'}/reset-password?token=${token}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .content { background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .button { display: inline-block; background: linear-gradient(135deg, #d4af37, #b8962e); color: #1a1a2e; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
                .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 12px; border-radius: 8px; margin: 20px 0; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content">
                    <h2>Reset Your Password 🔐</h2>
                    <p>Hello ${name},</p>
                    <p>We received a request to reset your password for your Workflow Studio Pro account.</p>
                    <div style="text-align: center;">
                        <a href="${resetLink}" class="button">Reset Password</a>
                    </div>
                    <div class="warning">
                        ⚠️ This link will expire in 1 hour. If you didn't request this, please ignore this email.
                    </div>
                    <p style="font-size: 12px; color: #888; word-break: break-all;">Or copy this link: ${resetLink}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to: email,
        subject: `Reset Your Password - Workflow Studio Pro`,
        html: html
    });
}

// ================================================
// WORKFLOW NOTIFICATION EMAIL
// ================================================

/**
 * Sends workflow execution notification
 * @param {string} email - Recipient email
 * @param {string} workflowName - Name of the workflow
 * @param {string} status - Execution status (success/failed)
 * @param {Object} details - Execution details
 */
async function sendWorkflowNotification(email, workflowName, status, details = {}) {
    const statusColor = status === 'success' ? '#10B981' : '#EF4444';
    const statusText = status === 'success' ? '✅ SUCCESS' : '❌ FAILED';
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .content { background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 12px; color: white; background: ${statusColor}; }
                .details { background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content">
                    <h2>Workflow Execution ${statusText}</h2>
                    <p><strong>Workflow:</strong> ${workflowName}</p>
                    <p><strong>Status:</strong> <span class="status">${status.toUpperCase()}</span></p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    ${details.duration ? `<p><strong>Duration:</strong> ${details.duration}ms</p>` : ''}
                    ${details.error ? `<div class="details"><strong>Error Details:</strong><br>${details.error}</div>` : ''}
                    <hr style="margin: 20px 0;">
                    <p style="font-size: 12px; color: #666;">View full execution details in your Workflow Studio Pro dashboard.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to: email,
        subject: `Workflow ${status === 'success' ? 'Completed' : 'Failed'}: ${workflowName}`,
        html: html
    });
}

// ================================================
// LEAD NOTIFICATION EMAIL
// ================================================

/**
 * Sends lead capture notification
 * @param {string} email - Recipient email (admin/sales team)
 * @param {Object} leadData - Lead information
 */
async function sendLeadNotification(email, leadData) {
    const scoreColor = leadData.lead_score >= 80 ? '#10B981' : leadData.lead_score >= 50 ? '#F59E0B' : '#EF4444';
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .content { background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .score { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; color: white; background: ${scoreColor}; }
                .lead-info { background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content">
                    <h2>🆕 New Lead Captured!</h2>
                    <div class="lead-info">
                        <p><strong>Name:</strong> ${leadData.name || 'N/A'}</p>
                        <p><strong>Email:</strong> ${leadData.email || 'N/A'}</p>
                        <p><strong>Phone:</strong> ${leadData.phone || 'N/A'}</p>
                        <p><strong>Company:</strong> ${leadData.company || 'N/A'}</p>
                        <p><strong>Lead Score:</strong> <span class="score">${leadData.lead_score || 'N/A'}/100</span></p>
                        <p><strong>Rating:</strong> ${leadData.rating || 'N/A'}</p>
                    </div>
                    <p><strong>Captured at:</strong> ${new Date().toLocaleString()}</p>
                    <hr style="margin: 20px 0;">
                    <p style="font-size: 12px; color: #666;">Follow up with this lead through your CRM dashboard.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to: email,
        subject: `New Lead: ${leadData.name || leadData.email || 'Unknown'}`,
        html: html
    });
}

// ================================================
// INVOICE EMAIL
// ================================================

/**
 * Sends invoice email
 * @param {string} email - Recipient email
 * @param {Object} invoiceData - Invoice information
 */
async function sendInvoiceEmail(email, invoiceData) {
    const itemsHtml = invoiceData.items.map(item => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.description}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.amount.toFixed(2)}</td>
        </tr>
    `).join('');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .content { background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .invoice-header { text-align: center; margin-bottom: 30px; }
                .invoice-total { font-size: 24px; font-weight: bold; color: #d4af37; text-align: right; margin-top: 20px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th { text-align: left; padding: 12px; background: #f8f9fa; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content">
                    <div class="invoice-header">
                        <h2>Invoice ${invoiceData.invoiceNumber}</h2>
                        <p>Date: ${new Date(invoiceData.date).toLocaleDateString()}</p>
                    </div>
                    <p><strong>Bill To:</strong><br>${invoiceData.customerName}<br>${invoiceData.customerEmail}</p>
                    <table>
                        <thead>
                            <tr><th>Description</th><th>Qty</th><th>Amount</th></tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                    <div class="invoice-total">
                        Total: $${invoiceData.total.toFixed(2)}
                    </div>
                    <hr style="margin: 20px 0;">
                    <p style="font-size: 12px; color: #666;">Thank you for your business!</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to: email,
        subject: `Invoice ${invoiceData.invoiceNumber} from Workflow Studio Pro`,
        html: html
    });
}

// ================================================
// MARKETING NEWSLETTER EMAIL
// ================================================

/**
 * Sends marketing newsletter email
 * @param {string} email - Recipient email
 * @param {string} subject - Email subject
 * @param {string} title - Newsletter title
 * @param {Array} articles - Array of article objects
 */
async function sendNewsletterEmail(email, subject, title, articles) {
    const articlesHtml = articles.map(article => `
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eee;">
            <h3 style="margin: 0 0 8px 0;"><a href="${article.url}" style="color: #d4af37; text-decoration: none;">${article.title}</a></h3>
            <p style="margin: 0; color: #666;">${article.description}</p>
        </div>
    `).join('');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .logo { font-size: 28px; font-weight: bold; color: #d4af37; }
                .content { background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">⚡ Workflow Studio Pro</div>
                </div>
                <div class="content">
                    <h2>${title}</h2>
                    ${articlesHtml}
                    <hr style="margin: 24px 0;">
                    <p style="font-size: 14px; color: #666;">Stay updated with the latest in AI automation!</p>
                </div>
                <div class="footer">
                    <p>You're receiving this because you subscribed to Workflow Studio Pro updates.</p>
                    <p><a href="${process.env.APP_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="color: #666;">Unsubscribe</a></p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to: email,
        subject: subject,
        html: html
    });
}

// ================================================
// BULK EMAIL (with rate limiting)
// ================================================

/**
 * Send bulk emails with rate limiting
 * @param {Array} recipients - Array of {email, name, data} objects
 * @param {string} subject - Email subject
 * @param {Function} templateFn - Function that returns HTML for each recipient
 * @param {number} delayMs - Delay between emails (ms)
 */
async function sendBulkEmails(recipients, subject, templateFn, delayMs = 1000) {
    const results = [];
    
    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
            const html = templateFn(recipient);
            const result = await sendEmail({
                to: recipient.email,
                subject: subject,
                html: html
            });
            results.push({ email: recipient.email, success: true, result });
            console.log(`✅ [BULK] Sent ${i + 1}/${recipients.length} to ${recipient.email}`);
        } catch (error) {
            results.push({ email: recipient.email, success: false, error: error.message });
            console.error(`❌ [BULK] Failed ${i + 1}/${recipients.length} to ${recipient.email}:`, error.message);
        }
        
        // Rate limiting delay
        if (i < recipients.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    return {
        total: recipients.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
    };
}

// ================================================
// EXPORTS
// ================================================

module.exports = {
    // Core
    sendEmail,
    
    // Specific email types
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendWorkflowNotification,
    sendLeadNotification,
    sendInvoiceEmail,
    sendNewsletterEmail,
    sendBulkEmails,
    
    // Configuration
    FROM_EMAIL,
    FROM_NAME
};