const fetch = require("node-fetch");

async function testGemini() {
    console.log("🚀 Testing Gemini Vision Fix...");

    const testPayload = {
        message: "What is in this image?",
        // A tiny 1x1 transparent pixel base64 to test API connectivity
        image_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        widget_key: "YOUR_WIDGET_KEY_HERE", // Replace with a key from your DB
        client_name: "Tester",
        session_id: "test_session_123"
    };

    try {
        const response = await fetch("http://localhost:5000/api/public/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testPayload)
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ SUCCESS: Gemini responded without a 404!");
            console.log("🤖 AI Reply:", data.reply);
        } else {
            console.error("❌ FAILED:", data.error);
        }
    } catch (err) {
        console.error("❌ Connection Error:", err.message);
    }
}

testGemini();