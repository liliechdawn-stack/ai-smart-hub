/**
 * login.js - AI Smart Hub Authentication
 * Features: Login, Signup, Email Verification, Resend Code, Terms Agreement
 */

const API_URL = window.BACKEND_URL || 'https://ai-smart-hub.onrender.com';

// DOM Elements
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const subscribeBtn = document.getElementById("subscribeBtn");
const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginTabBtn = document.querySelector('[onclick="switchTab(\'login\')"]');
const signupTabBtn = document.querySelector('[onclick="switchTab(\'signup\')"]');
const verifyContainer = document.getElementById("verifyContainer");
const authContainer = document.getElementById("authContainer");
const verifyCodeInput = document.getElementById("verifyCode");
const verifyBtn = document.getElementById("confirmVerifyBtn");
const resendBtn = document.getElementById("resendBtn");
const userEmailDisplay = document.getElementById("userEmailDisplay");
const verifyError = document.getElementById("verifyError");
const verifySuccess = document.getElementById("verifySuccess");
const signupError = document.getElementById("signupError");
const signupSuccess = document.getElementById("signupSuccess");
const loginError = document.getElementById("loginError");
const termsCheckbox = document.getElementById("termsCheckbox");
const marketingCheckbox = document.getElementById("marketingCheckbox");

// State
let currentEmail = '';
let resendTimer = null;
let timerInterval = null;

// ========== UTILITY FUNCTIONS ==========

/**
 * Show error message
 */
function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

/**
 * Show success message
 */
function showSuccess(element, message) {
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

/**
 * Save authentication data to localStorage
 */
function saveAuth(token, plan, name, email, businessId = '') {
    localStorage.setItem("token", token);
    localStorage.setItem("widget_key", token ? token.substring(0, 8) : ""); 
    localStorage.setItem("plan", plan || "free");
    localStorage.setItem("email", email);
    localStorage.setItem("business_id", businessId || "");
    localStorage.setItem("businessName", name || "Business");
    console.log("[AUTH] Saved for:", email);
}

/**
 * Show verification UI
 */
function showVerifyUI(email) {
    currentEmail = email;
    if (authContainer) authContainer.style.display = 'none';
    if (verifyContainer) {
        verifyContainer.classList.remove("hidden");
        if (userEmailDisplay) userEmailDisplay.textContent = email;
        if (verifyCodeInput) verifyCodeInput.value = '';
    }
    startResendTimer();
}

/**
 * Back to auth from verification
 */
function backToAuth() {
    if (authContainer) authContainer.style.display = 'block';
    if (verifyContainer) verifyContainer.classList.add("hidden");
    clearInterval(timerInterval);
}

/**
 * Start resend timer (60 seconds)
 */
function startResendTimer() {
    const timerText = document.getElementById("timerText");
    if (!timerText) return;
    
    let timeLeft = 60;
    
    if (resendBtn) {
        resendBtn.style.opacity = '0.5';
        resendBtn.style.pointerEvents = 'none';
    }
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        timerText.textContent = `You can request a new code in ${timeLeft} seconds`;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerText.textContent = '';
            if (resendBtn) {
                resendBtn.style.opacity = '1';
                resendBtn.style.pointerEvents = 'auto';
            }
        }
    }, 1000);
}

/**
 * Switch between login and signup tabs
 */
window.switchTab = function(tab) {
    if (!loginTab || !signupTab || !loginTabBtn || !signupTabBtn) return;
    
    if (tab === 'login') {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginTabBtn.classList.add('active');
        signupTabBtn.classList.remove('active');
    } else {
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        signupTabBtn.classList.add('active');
        loginTabBtn.classList.remove('active');
    }
};

/**
 * Toggle password visibility
 */
window.togglePassword = function(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const icon = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
};

/**
 * Back to auth from verification
 */
window.backToAuth = backToAuth;

/**
 * Show terms modal
 */
window.showTerms = function() {
    const modal = document.getElementById('termsModal');
    if (modal) modal.classList.add('active');
};

/**
 * Show privacy modal
 */
window.showPrivacy = function() {
    const modal = document.getElementById('privacyModal');
    if (modal) modal.classList.add('active');
};

/**
 * Close terms modal
 */
window.closeModal = function() {
    const modal = document.getElementById('termsModal');
    if (modal) modal.classList.remove('active');
};

/**
 * Close privacy modal
 */
window.closePrivacyModal = function() {
    const modal = document.getElementById('privacyModal');
    if (modal) modal.classList.remove('active');
};

/**
 * Show forgot password modal
 */
window.showForgotPassword = function() {
    const modal = document.getElementById('forgotModal');
    if (modal) modal.classList.add('active');
};

/**
 * Close forgot password modal
 */
window.closeForgotModal = function() {
    const modal = document.getElementById('forgotModal');
    if (modal) modal.classList.remove('active');
};

/**
 * Send password reset link
 */
window.sendResetLink = async function() {
    const email = document.getElementById('resetEmail')?.value;
    const resetError = document.getElementById('resetError');
    const resetSuccess = document.getElementById('resetSuccess');
    const resetBtn = document.querySelector('#forgotModal .btn');
    
    if (!email) {
        showError(resetError, 'Please enter your email');
        return;
    }

    if (resetBtn) {
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<span class="loading-spinner"></span> Sending...';
    }

    try {
        const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (res.ok) {
            showSuccess(resetSuccess, '✅ Reset link sent! Check your email.');
            setTimeout(window.closeForgotModal, 2000);
        } else {
            showError(resetError, data.error || 'Failed to send reset link');
        }
    } catch (err) {
        console.error("[FORGOT] Error:", err);
        showError(resetError, 'Server error');
    } finally {
        if (resetBtn) {
            resetBtn.disabled = false;
            resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
        }
    }
};

// ========== LOGIN ==========
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;
        const loginBtn = document.getElementById("loginBtn");

        if (!email || !password) {
            showError(loginError, "Email and password required");
            return;
        }

        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="loading-spinner"></span> Logging in...';
        }

        try {
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (res.status === 403) {
                // Account not verified
                showVerifyUI(email);
                showError(verifyError, "Account not verified. Please check your email for the verification code.");
            } else if (res.ok) {
                // Successful login
                const displayName = data.business_name || data.name || "Business";
                saveAuth(data.token, data.plan, displayName, email, data.business_id);
                
                // Redirect to dashboard
                window.location.href = "dashboard.html";
            } else {
                showError(loginError, data.error || "Login failed");
            }
        } catch (err) {
            console.error("[LOGIN] Error:", err);
            showError(loginError, "Server error - please try again later");
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login to Dashboard';
            }
        }
    });
}

// ========== SIGNUP ==========
if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("businessName")?.value.trim();
        const email = document.getElementById("signupEmail")?.value.trim();
        const password = document.getElementById("signupPassword")?.value;
        const termsChecked = termsCheckbox?.checked;
        const signupBtn = document.getElementById("signupBtn");

        if (!name || !email || !password) {
            showError(signupError, "All fields are required");
            return;
        }

        if (password.length < 6) {
            showError(signupError, "Password must be at least 6 characters");
            return;
        }

        if (!termsChecked) {
            showError(signupError, "You must agree to the Terms of Service and Privacy Policy");
            return;
        }

        if (signupBtn) {
            signupBtn.disabled = true;
            signupBtn.innerHTML = '<span class="loading-spinner"></span> Creating account...';
        }

        try {
            const res = await fetch(`${API_URL}/api/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    business_name: name,
                    email: email, 
                    password: password 
                }),
            });

            const data = await res.json();

            if (res.ok) {
                // Save marketing preference if checkbox exists
                if (marketingCheckbox?.checked) {
                    localStorage.setItem("marketing_opt_in", "true");
                }
                
                showSuccess(signupSuccess, "✅ Signup successful! Please check your email for verification code.");
                
                // Show verification UI
                setTimeout(() => {
                    showVerifyUI(email);
                }, 1500);
                
                // Reset form
                signupForm.reset();
            } else {
                showError(signupError, data.error || "Signup failed");
            }
        } catch (err) {
            console.error("[SIGNUP] Error:", err);
            showError(signupError, "Server error during signup - please try again");
        } finally {
            if (signupBtn) {
                signupBtn.disabled = false;
                signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up Free';
            }
        }
    });
}

// ========== VERIFY CODE ==========
if (verifyBtn) {
    verifyBtn.addEventListener("click", async () => {
        const code = verifyCodeInput?.value.trim();
        
        if (!code || code.length !== 6) {
            showError(verifyError, "Please enter the full 6-digit code");
            return;
        }

        verifyBtn.disabled = true;
        verifyBtn.innerHTML = '<span class="loading-spinner"></span> Verifying...';

        try {
            const res = await fetch(`${API_URL}/api/auth/verify-code`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, email: currentEmail })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                showSuccess(verifySuccess, "✅ Verification successful!");
                
                if (data.token) {
                    // Auto-login after verification
                    saveAuth(data.token, data.plan, data.business_name, data.email, data.business_id);
                    setTimeout(() => {
                        window.location.href = "dashboard.html";
                    }, 1500);
                } else {
                    setTimeout(() => {
                        backToAuth();
                    }, 2000);
                }
            } else {
                showError(verifyError, data.error || "Invalid or expired code");
            }
        } catch (err) { 
            console.error("[VERIFY] Error:", err);
            showError(verifyError, "Error verifying code");
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify Account';
        }
    });
}

// ========== RESEND CODE ==========
if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
        if (!currentEmail) return;
        
        resendBtn.style.opacity = '0.5';
        resendBtn.style.pointerEvents = 'none';

        try {
            const res = await fetch(`${API_URL}/api/auth/resend-verification`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: currentEmail })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                showSuccess(verifySuccess, "✅ New verification code sent!");
                startResendTimer();
            } else {
                showError(verifyError, data.error || "Failed to resend code");
                resendBtn.style.opacity = '1';
                resendBtn.style.pointerEvents = 'auto';
            }
        } catch (err) {
            console.error("[RESEND] Error:", err);
            showError(verifyError, "Error resending code");
            resendBtn.style.opacity = '1';
            resendBtn.style.pointerEvents = 'auto';
        }
    });
}

// ========== SUBSCRIBE BUTTON ==========
if (subscribeBtn) {
    subscribeBtn.addEventListener("click", async () => {
        const token = localStorage.getItem("token");
        const email = localStorage.getItem("email") || "customer@email.com";

        if (!token) {
            alert("Please login first");
            return;
        }

        const selectedPlan = prompt(
            "Enter plan to subscribe (basic/pro/agency):"
        )?.toLowerCase();

        if (!selectedPlan || !["basic", "pro", "agency"].includes(selectedPlan)) {
            alert("Invalid plan. Choose basic, pro, or agency");
            return;
        }

        subscribeBtn.disabled = true;
        subscribeBtn.innerHTML = '<span class="loading-spinner"></span> Processing...';

        try {
            const res = await fetch(`${API_URL}/api/subscription/create-checkout-session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ plan: selectedPlan, email }), 
            });

            const data = await res.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                alert(data.error || "Failed to create checkout session");
            }
        } catch (err) {
            console.error("[SUBSCRIBE] Error:", err);
            alert("Server error - please try again");
        } finally {
            subscribeBtn.disabled = false;
            subscribeBtn.innerHTML = 'Subscribe';
        }
    });
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOGIN] Initialized with API URL:", API_URL);
    
    // Check for verification parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const verifyEmail = urlParams.get('verify');
    if (verifyEmail) {
        showVerifyUI(verifyEmail);
    }
});

// ========== EXPORT FOR GLOBAL ACCESS ==========
window.saveAuth = saveAuth;
window.showVerifyUI = showVerifyUI;
window.backToAuth = backToAuth;