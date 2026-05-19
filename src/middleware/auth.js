// src/middleware/auth.js
const Session = require("../models/Session");
const Admin = require("../models/Admin");

// ─── VERIFY ANY LOGGED-IN USER (CMS or Admin) ─────────────────────────────────
async function requireAuth(req, res, next) {
  let token = req.cookies.sessionId;
  
  // Fallback to Bearer token for older clients
  if (!token) {
    const header = req.headers.authorization || "";
    token = header.startsWith("Bearer ") ? header.slice(7) : null;
  }

  if (!token) return res.status(401).json({ error: "No active session" });

  try {
    const session = await Session.findOne({ token });
    if (!session || session.expires_at < new Date()) {
      if (session) await Session.deleteOne({ _id: session._id });
      res.clearCookie("sessionId");
      return res.status(401).json({ error: "Session expired or invalid" });
    }

    req.user = { id: session.user_id, role: session.role };
    
    if (session.role === 'cms') {
        req.user.name = "CMS Root";
        req.user.email = process.env.CMS_EMAIL;
    } else {
        const admin = await Admin.findById(session.user_id);
        if (admin) {
            req.user.name = admin.name;
            req.user.email = admin.email;
        }
    }

    next();
  } catch (err) {
    console.error("[Auth] Session verification failed:", err.message);
    return res.status(401).json({ error: "Invalid session" });
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
