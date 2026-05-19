const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const Admin = require("../models/Admin");
const Invite = require("../models/Invite");
const { requireCMS, requireAuth } = require("../middleware/auth");
const { sendEmail } = require("../services/messaging");

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPassword = password.trim();

    // CMS root account
    if (
      normalizedEmail === (process.env.CMS_EMAIL || "").toLowerCase().trim() &&
      normalizedPassword === (process.env.CMS_PASSWORD || "").trim()
    ) {
      const token = signToken({ id: "cms", role: "cms", email });
      return res.json({ token, role: "cms", name: "CMS Root" });
    }

    // Admin account
    const admin = await Admin.findOne({ email: normalizedEmail, status: 'active' });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(normalizedPassword, admin.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ id: admin._id, role: admin.role, email: admin.email, name: admin.name });
    res.json({ token, role: admin.role, name: admin.name, id: admin._id, must_change_password: admin.must_change_password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /auth/invite ────────────────────────────────────────────────────────
router.post("/invite", requireCMS, async (req, res) => {
  try {
    const { email, role, name } = req.body;
    const validRoles = ["media_admin", "usher_admin", "leader"];
    if (!email || !validRoles.includes(role))
      return res.status(400).json({ error: "Valid email and role required" });

    const adminName = name && name.trim() ? name.trim() : email.split("@")[0];
    console.log(`[Invite] 📧 Attempting to invite ${email} as ${role} (name: ${adminName})`);
    const tempPassword = Math.floor(10000000 + Math.random() * 90000000).toString();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const admin = await Admin.create({
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name: adminName,
      role,
      status: 'active',
      must_change_password: true
    });
    console.log(`[Invite] 👤 Admin record created for ${email}`);

    // Send Invitation Email
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const loginUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/`;
    
    try {
      await sendEmail({
        to: email,
        name: adminName,
        subject: `Admin Invitation - ${churchName}`,
        message: `Hi ${adminName},\n\nYou have been invited as a ${role.replace(/_/g, " ")} at ${churchName}.\n\nYour temporary login credentials are:\nEmail: ${email}\nPassword: ${tempPassword}\n\nPlease login at ${loginUrl} and change your password immediately after logging in.\n\nIf you did not expect this email, please ignore it.`
      });
      console.log(`[Invite] ✅ Email sent successfully to ${email}`);
    } catch (mailErr) {
      console.error(`[Invite] ❌ Failed to send email to ${email}:`, mailErr.message);
    }

    res.status(201).json({ admin, message: "Admin account created and email sent with temporary password" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /auth/invites ────────────────────────────────────────────────────────
router.get("/invites", requireCMS, async (req, res) => {
  try {
    const invites = await Invite.find().sort({ created_at: -1 });
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /auth/accept-invite ─────────────────────────────────────────────────
router.post("/accept-invite", async (req, res) => {
  try {
    const { token, password, name } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password required" });

    const invite = await Invite.findOne({ 
      token: token.toUpperCase(), 
      status: 'pending', 
      expires_at: { $gt: new Date() } 
    });
    
    if (!invite) return res.status(404).json({ error: "Invalid or expired invite token" });

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await Admin.create({
      email: invite.email,
      password_hash: passwordHash,
      name: name || invite.email.split("@")[0],
      role: invite.role,
      status: 'active'
    });

    invite.status = 'accepted';
    await invite.save();

    const jwtToken = signToken({ id: admin._id, role: admin.role, email: admin.email, name: admin.name });
    res.json({ token: jwtToken, role: admin.role, name: admin.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// ─── POST /auth/change-password ─────────────────────────────────────────────
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "New password required" });

    const passwordHash = await bcrypt.hash(password, 12);
    
    // Check if it's the CMS root (env-based) or a DB admin
    if (req.user.id === "cms") {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.resolve(__dirname, '../../.env');
      
      if (fs.existsSync(envPath)) {
        let envFile = fs.readFileSync(envPath, 'utf8');
        if (envFile.includes('CMS_PASSWORD=')) {
          envFile = envFile.replace(/CMS_PASSWORD=.*/, `CMS_PASSWORD=${password}`);
        } else {
          envFile += `\nCMS_PASSWORD=${password}\n`;
        }
        fs.writeFileSync(envPath, envFile);
      }
      // Also update process.env so it works without restarting immediately for subsequent logins in the same session
      process.env.CMS_PASSWORD = password;

      return res.json({ success: true, message: "CMS Password updated successfully" });
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    admin.password_hash = passwordHash;
    admin.must_change_password = false;
    await admin.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
