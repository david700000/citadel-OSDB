const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken"); // Keep for any legacy endpoints if needed, otherwise optional
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const Admin = require("../models/Admin");
const Invite = require("../models/Invite");
const Session = require("../models/Session");
const User = require("../models/User");
const { requireCMS, requireAuth } = require("../middleware/auth");
const { sendEmail } = require("../services/messaging");

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

async function createSession(userId, role, res) {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await Session.create({
    user_id: userId,
    role,
    token,
    expires_at: expiresAt
  });

  res.cookie("sessionId", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return token; // Optional, just in case we still want to return it for mobile
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
      const token = await createSession("cms", "cms", res);
      return res.json({ token, role: "cms", name: "CMS Root", must_change_password: false });
    }

    // Admin account
    const admin = await Admin.findOne({ email: normalizedEmail, status: 'active' });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(normalizedPassword, admin.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = await createSession(admin._id, admin.role, res);
    
    // Only send must_change_password: true when the DB flag is actually set
    res.json({ token, role: admin.role, name: admin.name, id: admin._id, must_change_password: !!admin.must_change_password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /auth/invite ────────────────────────────────────────────────────────
router.post("/invite", requireCMS, async (req, res) => {
  try {
    const { email, role, name } = req.body;
    const validRoles = ["media_admin", "usher_admin", "leader", "financial_admin"];
    if (!email || !validRoles.includes(role))
      return res.status(400).json({ error: "Valid email and role required" });

    let adminName = name && name.trim() ? name.trim() : "";
    if (!adminName) {
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser && existingUser.full_name) {
        adminName = existingUser.full_name;
      } else {
        adminName = email.split("@")[0];
      }
    }
    console.log(`[Invite] 📧 Attempting to invite ${email} as ${role} (name: ${adminName})`);
    const tempPassword = Math.floor(10000000 + Math.random() * 90000000).toString();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

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

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      email: invite.email,
      password_hash: passwordHash,
      name: name || invite.email.split("@")[0],
      role: invite.role,
      status: 'active'
    });

    invite.status = 'accepted';
    await invite.save();

    const tokenStr = await createSession(admin._id, admin.role, res);
    res.json({ token: tokenStr, role: admin.role, name: admin.name, id: admin._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  res.json({ session: { type: req.user.role === 'cms' ? 'cms' : 'admin', admin: req.user.role === 'cms' ? null : req.user } });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies.sessionId;
    if (token) {
      await Session.deleteOne({ token });
    }
    res.clearCookie("sessionId");
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /auth/change-password ─────────────────────────────────────────────
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "New password required" });

    const passwordHash = await bcrypt.hash(password, 10);
    
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

// ─── POST /auth/forgot-password ──────────────────────────────────────────────
// Generates a 6-digit OTP and emails it to the registered admin address.
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase().trim();

    // CMS root cannot use OTP flow — they must remember their password
    if (normalizedEmail === (process.env.CMS_EMAIL || "").toLowerCase().trim()) {
      // Return generic success to prevent email enumeration
      return res.json({ message: "If this email is registered, an OTP has been sent." });
    }

    const admin = await Admin.findOne({ email: normalizedEmail, status: 'active' });
    // Always return success to prevent email enumeration
    if (!admin) {
      return res.json({ message: "If this email is registered, an OTP has been sent." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    admin.otp_hash = otpHash;
    admin.otp_expires_at = expiresAt;
    await admin.save();

    console.log(`[ForgotPassword] 📧 Sending OTP to ${normalizedEmail}`);

    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    try {
      await sendEmail({
        to: admin.email,
        name: admin.name || admin.email,
        subject: `Password Reset OTP - ${churchName}`,
        message: `Hi ${admin.name || 'Admin'},\n\nYou requested a password reset for your ChurchCMS account.\n\nYour one-time password (OTP) is:\n\n  ${otp}\n\nThis OTP is valid for 15 minutes. Do NOT share it with anyone.\n\nIf you did not request this, please ignore this email — your account remains secure.\n\n${churchName} Team`
      });
      console.log(`[ForgotPassword] ✅ OTP email sent to ${normalizedEmail}`);
    } catch (mailErr) {
      console.error(`[ForgotPassword] ❌ Failed to send OTP email:`, mailErr.message);
      return res.status(500).json({ error: "Failed to send OTP email. Please try again later." });
    }

    res.json({ message: "If this email is registered, an OTP has been sent." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /auth/reset-password-otp ───────────────────────────────────────────
// Verifies the OTP and sets a new password.
router.post("/reset-password-otp", async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password) {
      return res.status(400).json({ error: "Email, OTP, and new password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const admin = await Admin.findOne({ email: normalizedEmail, status: 'active' });
    if (!admin || !admin.otp_hash || !admin.otp_expires_at) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Check expiry
    if (new Date() > admin.otp_expires_at) {
      admin.otp_hash = null;
      admin.otp_expires_at = null;
      await admin.save();
      return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    // Verify OTP
    const otpValid = await bcrypt.compare(otp.trim(), admin.otp_hash);
    if (!otpValid) {
      return res.status(400).json({ error: "Invalid OTP. Please check and try again." });
    }

    // All good — update password
    admin.password_hash = await bcrypt.hash(password, 10);
    admin.must_change_password = false;
    admin.otp_hash = null;
    admin.otp_expires_at = null;
    await admin.save();

    console.log(`[ResetPassword] ✅ Password reset for ${normalizedEmail}`);
    res.json({ success: true, message: "Password reset successfully. You can now log in." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
