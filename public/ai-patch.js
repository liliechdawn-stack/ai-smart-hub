<script>
(function() {
    console.log('🧠 Applying AI Problem Solver patch...');
    
    // Enhanced AI Engine that works even without backend
    window._enhancedAiEngine = async function(query, context) {
        const lowerQuery = query.toLowerCase();
        const customers = context.customers || [];
        const problemStats = context.problemStats || {};
        const allChats = context.allChats || {};
        
        // Helper for risk calculation
        function calcRisk(chats) {
            if (!chats || chats.length === 0) return 0;
            const negatives = chats.filter(c => (c.sentiment || 'neutral').toLowerCase() === 'negative').length;
            const recency = Math.min(chats.length * 2, 30);
            const negativeWeight = Math.min(negatives * 15, 70);
            return Math.min(negativeWeight + recency, 100);
        }
        
        // ===== SMART PROBLEM ANALYSIS =====
        if (lowerQuery.includes('analyze') || lowerQuery.includes('analysis') || lowerQuery.includes('top problem')) {
            const problems = [];
            const problemTypes = ['delivery', 'quality', 'pricing', 'support', 'refund', 'ux'];
            
            problemTypes.forEach(function(type) {
                const count = problemStats[type] || 0;
                if (count > 0) {
                    problems.push({ type: type, count: count });
                }
            });
            
            problems.sort(function(a, b) { return b.count - a.count; });
            
            if (problems.length === 0) {
                return "📊 No significant problems detected in your customer conversations. Your customers seem satisfied! Keep up the good work. 🎉";
            }
            
            var response = "📊 **Customer Problem Analysis Report**\n\n";
            var totalMessages = 0;
            for (var key in allChats) {
                if (allChats.hasOwnProperty(key)) {
                    totalMessages += allChats[key].length;
                }
            }
            response += "I've analyzed " + customers.length + " customers with " + totalMessages + " total messages.\n\n";
            response += "**Top Issues:**\n";
            
            var emojis = { delivery: '🚚', quality: '⭐', pricing: '💰', support: '🎧', refund: '↩️', ux: '🎯' };
            var labels = { delivery: 'Delivery', quality: 'Quality', pricing: 'Pricing', support: 'Support', refund: 'Refunds', ux: 'UX' };
            
            for (var i = 0; i < Math.min(problems.length, 5); i++) {
                var p = problems[i];
                response += (i+1) + ". " + (emojis[p.type] || '📌') + " **" + (labels[p.type] || p.type) + "**: " + p.count + " mentions\n";
            }
            
            response += "\n**💡 Recommendations:**\n";
            var recs = {
                delivery: "• Implement real-time tracking updates\n• Offer compensation for delays\n• Set clearer delivery expectations",
                quality: "• Enhance quality control processes\n• Collect detailed product feedback\n• Offer hassle-free returns",
                pricing: "• Review pricing strategy\n• Add more pricing tiers\n• Highlight value proposition",
                support: "• Reduce response times\n• Add self-service options\n• Train support team",
                refund: "• Simplify refund process\n• Add satisfaction guarantees\n• Prevent issues proactively",
                ux: "• Improve navigation\n• Add tooltips and guides\n• Simplify checkout process"
            };
            for (var j = 0; j < Math.min(problems.length, 3); j++) {
                var p2 = problems[j];
                response += "\n**" + (labels[p2.type] || p2.type) + ":**\n" + (recs[p2.type] || '• Review and improve this area');
            }
            
            return response;
        }
        
        // ===== CHURN RISK ANALYSIS =====
        if (lowerQuery.includes('churn') || lowerQuery.includes('risk') || lowerQuery.includes('at-risk')) {
            var highRisk = [];
            for (var ci = 0; ci < customers.length; ci++) {
                var c = customers[ci];
                var chats = allChats[c.email] || [];
                var risk = calcRisk(chats);
                if (risk > 60) {
                    highRisk.push(c);
                }
            }
            
            if (highRisk.length === 0) {
                return "✅ **Great news!** No customers are currently at high churn risk. Your customer satisfaction is excellent!";
            }
            
            var response2 = "⚠️ **Churn Risk Analysis**\n\n";
            response2 += "I've identified " + highRisk.length + " customers at risk (" + Math.round(highRisk.length/customers.length*100) + "% of your customer base).\n\n";
            response2 += "**At-Risk Customers:**\n";
            
            for (var h = 0; h < Math.min(highRisk.length, 10); h++) {
                var hc = highRisk[h];
                var hChats = allChats[hc.email] || [];
                var hRisk = calcRisk(hChats);
                var lastMsg = hChats.length > 0 ? (hChats[hChats.length-1].message || '').substring(0, 50) : '';
                response2 += "• **" + (hc.name || 'Customer') + "** (" + hc.email + ") - " + hRisk + "% risk\n";
                if (lastMsg) {
                    response2 += "  Last message: \"" + lastMsg + "...\"\n";
                }
            }
            
            if (highRisk.length > 10) {
                response2 += "\n...and " + (highRisk.length - 10) + " more at-risk customers.";
            }
            
            response2 += "\n\n**💡 Retention Strategies:**\n";
            response2 += "• Reach out personally to at-risk customers\n• Offer loyalty discounts or perks\n• Schedule follow-up calls\n• Address their specific concerns promptly";
            
            return response2;
        }
        
        // ===== CUSTOMER SPECIFIC ANALYSIS =====
        var customerMatch = null;
        for (var ci2 = 0; ci2 < customers.length; ci2++) {
            var c2 = customers[ci2];
            if (!c2) continue;
            var email = c2.email || '';
            var name = c2.name || '';
            if (query.toLowerCase().includes(email.toLowerCase()) || query.toLowerCase().includes(name.toLowerCase())) {
                customerMatch = c2;
                break;
            }
        }
        
        if (customerMatch) {
            var cChats = allChats[customerMatch.email] || [];
            var cRisk = calcRisk(cChats);
            var negCount = 0;
            var posCount = 0;
            for (var mi = 0; mi < cChats.length; mi++) {
                var msg = cChats[mi];
                var sent = (msg.sentiment || 'neutral').toLowerCase();
                if (sent === 'negative') negCount++;
                else if (sent === 'positive') posCount++;
            }
            
            var response3 = "👤 **Customer Analysis: " + (customerMatch.name || 'Customer') + "**\n\n";
            response3 += "📧 Email: " + customerMatch.email + "\n";
            response3 += "💬 Messages: " + cChats.length + "\n";
            response3 += "😊 Positive: " + posCount + " | 😞 Negative: " + negCount + "\n";
            response3 += "📊 Churn Risk: " + cRisk + "%\n";
            
            if (cChats.length > 0) {
                response3 += "\n**Recent Conversations:**\n";
                var start = Math.max(0, cChats.length - 5);
                for (var ri = start; ri < cChats.length; ri++) {
                    var recent = cChats[ri];
                    var emoji = recent.sentiment === 'positive' ? '😊' : recent.sentiment === 'negative' ? '😞' : '😐';
                    var msgText = (recent.message || '').substring(0, 80);
                    response3 += "• " + emoji + " " + msgText + "\n";
                }
            }
            
            response3 += "\n**💡 Recommended Actions:**\n";
            if (cRisk > 70) {
                response3 += "• 🔴 **URGENT**: Contact this customer immediately\n• Offer personalized solutions to their concerns\n• Consider a satisfaction guarantee or discount";
            } else if (cRisk > 40) {
                response3 += "• 📊 Monitor this customer's interactions closely\n• Send a proactive check-in message\n• Address any recurring issues";
            } else {
                response3 += "• ✅ Customer appears satisfied\n• Maintain regular engagement\n• Consider requesting a testimonial";
            }
            
            return response3;
        }
        
        // ===== RESPONSE GENERATION =====
        if (lowerQuery.includes('response') || lowerQuery.includes('reply') || lowerQuery.includes('email') || lowerQuery.includes('template')) {
            var issueTypes = ['delivery', 'quality', 'refund', 'support', 'complaint'];
            var issueType = 'general';
            
            for (var it = 0; it < issueTypes.length; it++) {
                if (lowerQuery.includes(issueTypes[it])) {
                    issueType = issueTypes[it];
                    break;
                }
            }
            
            var templates = {
                delivery: "📧 **Email Response - Delivery Issue**\n\nDear [Customer Name],\n\nI understand your order hasn't arrived as expected, and I sincerely apologize for this delay. We're investigating with our shipping partner right now.\n\nHere's what I can do for you:\n• Provide a real-time tracking update within 2 hours\n• Offer a  credit for the inconvenience\n• Ensure priority handling of your next order\n\nPlease reply with your order number so I can assist you further.\n\nBest regards,\n[Your Name]\nCustomer Success Team",
                quality: "📧 **Email Response - Quality Concern**\n\nDear [Customer Name],\n\nI'm sorry to hear about the quality issue with your product. This definitely isn't the experience we want you to have.\n\nI've immediately:\n• Escalated this to our quality team\n• Initiated a replacement order\n• Added a 30% discount for your next purchase\n\nPlease confirm your shipping address and we'll send the replacement right away.\n\nSincerely,\n[Your Name]\nCustomer Support",
                refund: "📧 **Email Response - Refund Request**\n\nDear [Customer Name],\n\nI understand you'd like a refund, and I'll process this right away.\n\nRefund Details:\n• Amount: [Order Total]\n• Processing time: 3-5 business days\n• Method: Back to your original payment method\n\nI'm sorry this didn't work out. We value your business and hope to serve you better in the future.\n\nBest regards,\n[Your Name]\nCustomer Support Team",
                support: "📧 **Email Response - Support Request**\n\nDear [Customer Name],\n\nThank you for reaching out. I'm here to help with your question.\n\nI've reviewed your request and here's how I can assist:\n• [Specific solution based on issue]\n• Additional resources: [Link to FAQ or guides]\n• Direct contact: [Phone number or support hours]\n\nPlease let me know if you need any clarification.\n\nBest,\n[Your Name]\nSupport Team",
                complaint: "📧 **Email Response - Complaint Resolution**\n\nDear [Customer Name],\n\nI sincerely apologize for your experience. This is not the standard we aim for.\n\nI've taken immediate action:\n• [Specific action steps]\n• Added a goodwill gesture to your account\n• Ensured this won't happen again\n\nYour satisfaction matters to us. Please let me know if there's anything else I can do.\n\nRespectfully,\n[Your Name]\nCustomer Success"
            };
            
            var response4 = templates[issueType] || templates.complaint;
            
            if (lowerQuery.includes('short') || lowerQuery.includes('quick')) {
                var lines = response4.split('\n');
                response4 = lines.slice(0, 8).join('\n') + '\n\n[Shortened version for quick response]';
            }
            
            return response4;
        }
        
        // ===== SMART INSIGHTS =====
        if (lowerQuery.includes('insight') || lowerQuery.includes('suggestion') || lowerQuery.includes('improve')) {
            var totalMsgs = 0;
            for (var k in allChats) {
                if (allChats.hasOwnProperty(k)) {
                    totalMsgs += allChats[k].length;
                }
            }
            var avgMsgs = customers.length > 0 ? Math.round(totalMsgs / customers.length) : 0;
            var negRate = problemStats.total > 0 ? Math.round((problemStats.critical / problemStats.total) * 100) : 0;
            
            var response5 = "💡 **Business Insights & Recommendations**\n\n";
            response5 += "📊 **Current Metrics:**\n";
            response5 += "• " + customers.length + " total customers\n";
            response5 += "• " + totalMsgs + " total messages (avg " + avgMsgs + " per customer)\n";
            response5 += "• " + problemStats.total + " issues detected\n";
            response5 += "• " + negRate + "% negative sentiment rate\n\n";
            
            response5 += "**🎯 Key Recommendations:**\n";
            
            if (negRate > 30) {
                response5 += "• 🔴 **High negative sentiment detected!** \n  Implement a customer feedback loop and proactive outreach\n";
            }
            
            if (problemStats.delivery > problemStats.total * 0.3) {
                response5 += "• 🚚 **Delivery is your biggest pain point**\n  Consider upgrading shipping partners or adding real-time tracking\n";
            }
            
            if (problemStats.quality > problemStats.total * 0.2) {
                response5 += "• ⭐ **Quality concerns are significant**\n  Review your quality control processes and supplier relationships\n";
            }
            
            if (customers.length > 0 && avgMsgs < 2) {
                response5 += "• 📢 **Low engagement detected**\n  Launch a re-engagement campaign or loyalty program\n";
            }
            
            if (problemStats.total < 5) {
                response5 += "• 🎉 **Your customers are happy!**\n  Consider asking for testimonials and referrals\n";
            }
            
            response5 += "\n**📈 Growth Opportunities:**\n";
            response5 += "• Implement automated follow-up surveys\n• Create a knowledge base for common issues\n• Set up proactive alerts for negative sentiment";
            
            return response5;
        }
        
        // ===== GREETING / GENERAL =====
        if (lowerQuery.match(/^(hi|hello|hey|greetings|good morning|good afternoon|how are you)/)) {
            return "👋 **Hello! I'm your AI Business Consultant.**\n\nI'm here to help you with:\n• 📊 **Customer Analysis** - Deep insights into customer behavior\n• 🔍 **Problem Detection** - Identify and categorize issues\n• 💡 **Solution Generation** - Get actionable recommendations\n• 📈 **Churn Prevention** - Identify at-risk customers\n• ✉️ **Communication** - Generate professional responses\n\nWhat would you like me to help you with today? Try asking me:\n• 'Analyze our top customer problems'\n• 'Show customers at risk of churn'\n• 'Generate a response for delivery issue'\n• 'Give me business insights'";
        }
        
        // ===== FALLBACK =====
        return "🤖 **AI Business Consultant**\n\nI understand you're asking about: \"" + query + "\"\n\nHere's what I can help with:\n\n**🔍 Analysis:** Ask me to analyze customer problems or trends\n**⚠️ Risk Assessment:** Ask about churn risk or at-risk customers\n**✉️ Communications:** Request email templates or responses\n**💡 Insights:** Ask for business recommendations\n\nFor example, try:\n• \"Analyze our top customer problems\"\n• \"Show at-risk customers\"\n• \"Generate response for delivery complaint\"\n• \"Give me business insights\"\n\nI'm here to help make your business smarter! 🚀";
    };
    
    // Override the send function with enhanced version
    var originalSend = window._sendAiMessage;
    window._sendAiMessage = async function(autoQuery) {
        var input = document.getElementById('ai-input');
        var query = autoQuery || (input ? input.value.trim() : '');
        
        if (!query) return;
        
        var div = document.getElementById('ai-chat-messages');
        if (!div) return;
        
        // Add user message
        var userDiv = document.createElement('div');
        userDiv.className = 'message user';
        userDiv.innerHTML = '<strong>You:</strong> ' + (window.safeMarkupEscape ? window.safeMarkupEscape(query) : query);
        div.appendChild(userDiv);
        div.scrollTop = div.scrollHeight;
        
        if (input) input.value = '';
        
        // Show thinking
        var thinkingId = 'think-' + Date.now();
        var thinkingDiv = document.createElement('div');
        thinkingDiv.id = thinkingId;
        thinkingDiv.className = 'ai-typing';
        thinkingDiv.innerHTML = '<div class="loading-spinner" style="margin:0 auto;"></div>🤖 AI is analyzing your request...';
        div.appendChild(thinkingDiv);
        div.scrollTop = div.scrollHeight;
        
        try {
            // Try backend first
            var token = localStorage.getItem('token');
            var businessContext = {
                business_name: localStorage.getItem('business_name') || 'Your Business',
                total_customers: (window.AppState && window.AppState.customers) ? window.AppState.customers.length : 0,
                total_problems: (window.AppState && window.AppState.problemStats) ? window.AppState.problemStats.total : 0,
                top_issues: [],
                churn_risk: 0
            };
            
            var response = null;
            var fromBackend = false;
            
            // Try to use the backend if available
            if (window.CONFIG && window.CONFIG.BACKEND_URL && window.CONFIG.AI_CHAT_ENDPOINT) {
                try {
                    var res = await fetch(window.CONFIG.BACKEND_URL + window.CONFIG.AI_CHAT_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify({
                            query: query,
                            business_context: businessContext,
                            customers: (window.AppState && window.AppState.customers) ? window.AppState.customers.slice(0, 50) : [],
                            problem_stats: (window.AppState && window.AppState.problemStats) ? window.AppState.problemStats : {}
                        })
                    });
                    
                    if (res.ok) {
                        var data = await res.json();
                        if (data.reply && data.reply.length > 10) {
                            response = data.reply;
                            fromBackend = true;
                        }
                    }
                } catch (e) {
                    console.log('Backend AI unavailable, using local engine');
                }
            }
            
            // If backend failed or returned empty, use local AI engine
            if (!response) {
                console.log('🔄 Using local AI engine (backend unavailable or returned empty)');
                var context = {
                    customers: (window.AppState && window.AppState.customers) ? window.AppState.customers : [],
                    problemStats: (window.AppState && window.AppState.problemStats) ? window.AppState.problemStats : {},
                    allChats: (window.AppState && window.AppState.allChats) ? window.AppState.allChats : {}
                };
                response = await window._enhancedAiEngine(query, context);
            }
            
            var thinkingEl = document.getElementById(thinkingId);
            if (thinkingEl) {
                var msgDiv = document.createElement('div');
                msgDiv.className = 'message bot';
                var formattedResponse = response.replace(/\n/g, '<br>');
                if (window.safeMarkupEscape) {
                    formattedResponse = window.safeMarkupEscape(formattedResponse);
                }
                msgDiv.innerHTML = '<strong>🤖 AI Business Consultant:</strong><br>' + formattedResponse;
                
                if (fromBackend) {
                    msgDiv.innerHTML += '<br><br><span style="font-size:0.7rem; color:#888;">⚡ Powered by AI</span>';
                } else {
                    msgDiv.innerHTML += '<br><br><span style="font-size:0.7rem; color:#888;">🧠 Local AI Engine</span>';
                }
                
                thinkingEl.replaceWith(msgDiv);
                div.scrollTop = div.scrollHeight;
            }
            
        } catch (err) {
            console.error('AI error:', err);
            
            // Use local AI engine as final fallback
            try {
                var context2 = {
                    customers: (window.AppState && window.AppState.customers) ? window.AppState.customers : [],
                    problemStats: (window.AppState && window.AppState.problemStats) ? window.AppState.problemStats : {},
                    allChats: (window.AppState && window.AppState.allChats) ? window.AppState.allChats : {}
                };
                var fallbackResponse = await window._enhancedAiEngine(query, context2);
                
                var thinkingEl2 = document.getElementById(thinkingId);
                if (thinkingEl2) {
                    var msgDiv2 = document.createElement('div');
                    msgDiv2.className = 'message bot';
                    var formattedResponse2 = fallbackResponse.replace(/\n/g, '<br>');
                    if (window.safeMarkupEscape) {
                        formattedResponse2 = window.safeMarkupEscape(formattedResponse2);
                    }
                    msgDiv2.innerHTML = '<strong>🤖 AI Business Consultant:</strong><br>' + formattedResponse2 + '<br><br><span style="font-size:0.7rem; color:#888;">🧠 Local AI Engine (Fallback)</span>';
                    thinkingEl2.replaceWith(msgDiv2);
                    div.scrollTop = div.scrollHeight;
                }
            } catch (fallbackErr) {
                var thinkingEl3 = document.getElementById(thinkingId);
                if (thinkingEl3) {
                    var msgDiv3 = document.createElement('div');
                    msgDiv3.className = 'message bot';
                    msgDiv3.innerHTML = '<strong>🤖 AI Business Consultant:</strong><br>I\'m sorry, I encountered an error. Please try asking your question again or rephrase it.';
                    thinkingEl3.replaceWith(msgDiv3);
                    div.scrollTop = div.scrollHeight;
                }
            }
        }
    };
    
    console.log('✅ AI Problem Solver patch applied successfully!');
    console.log('🧠 Local AI Engine ready with real problem-solving capabilities');
})();
</script>
