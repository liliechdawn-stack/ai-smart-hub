/**
 * Test script for jobs.js - Real-Time Follow-up Tool Validation
 * Works with Cloudflare-powered backend (AI responses generated in chat.js/server.js)
 * Tests enrichment + scheduled email follow-up
 */

const { scheduleFollowUp } = require('./jobs.js');
require("dotenv").config();

// --- TEST CONFIGURATION ---
const testLead = {
    email: "test-recipient@example.com", // Change this to your own email to see the result
    name: "John Doe",
    summary: "Inquiring about enterprise AI integration and pricing"
};

console.log("🚀 Starting Real-Time Tool Validation...");

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ ERROR: Email credentials missing in .env file.");
    process.exit(1);
}

// We wrap the logic to trigger immediately for the test
const runInstantTest = async () => {
    console.log(`🔍 Testing Enrichment & Email for: ${testLead.email}`);
    
    try {
        // This calls your actual logic from jobs.js
        // Note: For the test, we trigger the logic inside scheduleFollowUp 
        // but you can temporarily change the timeout in jobs.js to 1000ms for testing.
        scheduleFollowUp(testLead.email, testLead.name, testLead.summary);
        
        console.log("✅ Tool trigger sent. Check your terminal logs for Enrichment results.");
        console.log("📧 If credentials are correct, you will receive an email shortly.");
    } catch (err) {
        console.error("❌ Test Failed:", err.message);
    }
};

runInstantTest();