// src/middleware/auth.js
const jwt = require("jsonwebtoken");

// ─── VERIFY ANY LOGGED-IN USER (CMS or Admin) ─────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.error("[Auth] Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── CMS ONLY ─────────────────────────────────────────────────────────────────
function requireCMS(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "cms") return res.status(403).json({ error: "CMS access only" });
    next();
  });
}

// ─── SPECIFIC ROLE ────────────────────────────────────────────────────────────
function requireRole(...roles) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role) && req.user.role !== "cms") {
        return res.status(403).json({ error: `Access denied. Required: ${roles.join(" or ")}` });
      }
      next();
    });
  };
}

module.exports = { requireAuth, requireCMS, requireRole };
