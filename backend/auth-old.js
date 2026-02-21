const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto"); 
const dbModule = require("./database.js");
const { getUserByEmail, createUser, verifyUser, db } = dbModule; 

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const ADMIN_EMAIL = "ericchung992@gmail.com".trim().toLowerCase();

/* ================= AUTH MIDDLEWARE ================= */
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    
    const isOwner = decoded.email.trim().toLowerCase() === ADMIN_EMAIL;
    
    // Bypass verification for the admin/owner
    if (!decoded.is_verified && req.path !== "/verify-email" && !isOwner) {
        return res.status(403).json({ error: "Please verify your email to continue." });
    }

    req.user = decoded;
    next();
  });
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
function signup(req, res) {
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

  createUser(normalizedEmail, hashedPassword, business_id, final_biz_name, verificationToken)
    .then((userId) => {
      res.json({
        message: "Signup successful! Please check your email for your 6-digit code.",
        verificationRequired: true
      });
    })
    .catch((err) => {
      console.error("Signup error:", err);
      return res.status(400).json({ error: "User already exists or database error" });
    });
}

/* ================= LOGIN ================= */
function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  getUserByEmail(normalizedEmail)
    .then((user) => {
      if (!user) {
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
          isAdmin: isOwner
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
        isAdmin: isOwner
      });
    })
    .catch((err) => {
        console.error("Login server error:", err);
        res.status(500).json({ error: "Server error" });
    });
}

/* ================= VERIFY EMAIL ================= */
function handleVerifyEmail(req, res) {
    const { token } = req.query;

    if (!token) return res.status(400).json({ error: "Missing token" });

    verifyUser(token)
        .then((success) => {
            if (success) {
                res.redirect("/verification-success.html");
            } else {
                res.status(400).send("Invalid or expired verification token.");
            }
        })
        .catch(() => res.status(500).send("Internal Server Error"));
}

module.exports = {
  auth,
  isAdminMiddleware,
  signup,
  login,
  handleVerifyEmail
};