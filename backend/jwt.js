import jwt from "jsonwebtoken";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";

export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return res.status(401).json({ error: "Invalid token" });
      req.userId = decoded.id;
      next();
    });
  } catch (err) {
    console.error("❌ JWT error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
