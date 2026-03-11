const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto"); 
const { supabase } = require("./database-supabase");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const ADMIN_EMAIL = "ericchung992@gmail.com".trim().toLowerCase();

/* ================= AUTH MIDDLEWARE ================= */
async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get fresh user data from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(403).json({ error: "User not found" });
    }

    const isOwner = user.email.trim().toLowerCase() === ADMIN_EMAIL;
    
    // Bypass verification for the admin/owner
    if (!user.is_verified && req.path !== "/verify-email" && !isOwner) {
        return res.status(403).json({ error: "Please verify your email to continue." });
    }

    // Attach complete user data to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.business_name || user.name || "User",
      business_name: user.business_name,
      plan: user.plan || 'free',
      business_id: user.business_id,
      is_verified: user.is_verified,
      isAdmin: isOwner,
      organization_id: user.organization_id,
      messages_used: user.messages_used || 0,
      leads_used: user.leads_used || 0
    };
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

/* ================= ADMIN MIDDLEWARE ================= */
function isAdminMiddleware(req, res, next) {
  const userEmail = (req.user?.email || "").trim().toLowerCase();
  if (!req.user || userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

/* ================= SIGNUP ================= */
async function signup(req, res) {
  // Support both 'name' and 'business_name' from frontend body
  const { email, password, name, business_name } = req.body;
  const final_biz_name = business_name || name;

  if (!email || !password || !final_biz_name) {
    return res.status(400).json({ error: "Business name, email, and password required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const hashedPassword = bcrypt.hashSync(password, 10);
  const business_id = "biz_" + Math.random().toString(36).substring(2, 12);
  const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
  const userId = `usr_${crypto.randomBytes(16).toString('hex')}`;
  const organizationId = `org_${crypto.randomBytes(16).toString('hex')}`;
  const widgetKey = `widget_${crypto.randomBytes(16).toString('hex')}`;

  try {
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create organization first
    const { error: orgError } = await supabase
      .from('organizations')
      .insert({
        id: organizationId,
        name: final_biz_name,
        owner_id: userId,
        plan: 'free',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (orgError) {
      console.error("Organization creation error:", orgError);
      return res.status(500).json({ error: "Failed to create organization" });
    }

    // Create user
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: normalizedEmail,
        password: hashedPassword,
        business_id: business_id,
        business_name: final_biz_name,
        verification_token: verificationToken,
        organization_id: organizationId,
        widget_key: widgetKey,
        widget_color: '#d4af37',
        welcome_message: 'Hi! How can I help you today?',
        ai_tone: 'professional',
        voice_enabled: 1,
        voice_pitch: 1.1,
        voice_rate: 0.9,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (userError) {
      console.error("User creation error:", userError);
      return res.status(500).json({ error: "Failed to create user" });
    }

    // Initialize smart hub settings
    await supabase
      .from('smart_hub_settings')
      .insert({
        user_id: userId,
        brain_active: 1,
        created_at: new Date().toISOString()
      });

    // Initialize governance settings
    await supabase
      .from('governance_settings')
      .insert({
        user_id: userId,
        created_at: new Date().toISOString()
      });

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: userId,
        action: 'user_signed_up',
        details: 'New user registration',
        type: 'auth',
        timestamp: new Date().toISOString()
      });

    res.json({
      message: "Signup successful! Please check your email for your 6-digit code.",
      verificationRequired: true,
      email: normalizedEmail
    });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error during signup" });
  }
}

/* ================= LOGIN ================= */
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    const isOwner = normalizedEmail === ADMIN_EMAIL;
    
    if (!user.is_verified && !isOwner) {
      return res.status(403).json({ 
          error: "Email not verified.", 
          is_verified: false 
      });
    }

    // --- PLAN LOGIC: Force Agency for the Owner ---
    let userPlan = (user.plan || "free").toLowerCase().trim();
    if (isOwner) {
        userPlan = "agency"; // Global override to fix your dashboard display
    }

    const finalName = user.business_name || user.name || "My Business";

    // Update last login timestamp
    await supabase
      .from('users')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', user.id);

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: user.id,
        action: 'user_logged_in',
        details: 'Successful login',
        type: 'auth',
        timestamp: new Date().toISOString()
      });

    // Sign the token with normalized plan info
    const token = jwt.sign(
      {
        id: user.id,
        email: normalizedEmail,
        name: finalName, 
        business_name: finalName,
        plan: userPlan,
        business_id: user.business_id,
        is_verified: isOwner ? true : !!user.is_verified,
        isAdmin: isOwner,
        organization_id: user.organization_id
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Return JSON response for frontend storage
    res.json({
      token,
      business_id: user.business_id,
      name: finalName,
      business_name: finalName,
      email: user.email,
      plan: userPlan,
      isAdmin: isOwner,
      widget_key: user.widget_key,
      organization_id: user.organization_id
    });
  } catch (err) {
    console.error("Login server error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
}

/* ================= VERIFY EMAIL ================= */
async function handleVerifyEmail(req, res) {
  const { token } = req.query;

  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    // Find user with this verification token
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email')
      .eq('verification_token', token)
      .single();

    if (findError || !user) {
      return res.status(400).send("Invalid or expired verification token.");
    }

    // Update user as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        is_verified: 1, 
        verification_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error("Verification update error:", updateError);
      return res.status(500).send("Internal Server Error");
    }

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: user.id,
        action: 'email_verified',
        details: 'Email verification completed',
        type: 'auth',
        timestamp: new Date().toISOString()
      });

    res.redirect("/verification-success.html");
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).send("Internal Server Error");
  }
}

/* ================= VERIFY CODE (for 6-digit code) ================= */
async function verifyCode(req, res) {
  const { code, email } = req.body;

  if (!code || !email) {
    return res.status(400).json({ error: "Code and email required" });
  }

  try {
    // Find user with this verification token
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('verification_token', code)
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    // Update user as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        is_verified: 1, 
        verification_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error("Verification update error:", updateError);
      return res.status(500).json({ error: "Server error during verification" });
    }

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: user.id,
        action: 'email_verified',
        details: 'Email verification completed via code',
        type: 'auth',
        timestamp: new Date().toISOString()
      });

    const isOwner = user.email.toLowerCase().trim() === ADMIN_EMAIL;

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.business_name || user.name || "User",
        business_name: user.business_name,
        plan: isOwner ? 'agency' : (user.plan || 'free'),
        business_id: user.business_id,
        is_verified: 1,
        isAdmin: isOwner,
        organization_id: user.organization_id
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: "Email verified successfully!",
      token,
      plan: isOwner ? 'agency' : (user.plan || 'free'),
      email: user.email,
      business_name: user.business_name,
      widget_key: user.widget_key
    });

  } catch (err) {
    console.error("Code verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* ================= RESEND VERIFICATION CODE ================= */
async function resendVerificationCode(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Generate new code
    const vCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Update user with new verification token
    const { error } = await supabase
      .from('users')
      .update({ verification_token: vCode })
      .eq('email', normalizedEmail);

    if (error) {
      console.error("Resend code error:", error);
      return res.status(500).json({ error: "Failed to resend verification code" });
    }

    // In a real app, send email here
    console.log(`📧 New verification code for ${normalizedEmail}: ${vCode}`);

    res.json({
      success: true,
      message: `New verification code sent to ${normalizedEmail}`
    });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  auth,
  isAdminMiddleware,
  signup,
  login,
  handleVerifyEmail,
  verifyCode,
  resendVerificationCode
};