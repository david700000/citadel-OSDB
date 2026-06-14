const express = require("express");
const { requireCMS } = require("../middleware/auth");
const FinancialLog = require("../models/FinancialLog");
const SalaryLog = require("../models/SalaryLog");
const FundRequest = require("../models/FundRequest");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Attendance = require("../models/Attendance");
const LoginAudit = require("../models/LoginAudit");
const Message = require("../models/Message");
const Reminder = require("../models/Reminder");
const Invite = require("../models/Invite");

const router = express.Router();

/**
 * DELETE /database/purge/:target
 * CMS Root only — permanently deletes data from the database.
 * Targets:
 * - 'finance': Deletes all FinancialLogs, SalaryLogs, FundRequests
 * - 'users': Deletes all Users
 * - 'attendance': Deletes all Attendance records
 * - 'admins': Deletes all Admins and Invites (does not affect CMS Root which is env-based)
 * - 'communications': Deletes all Messages and Reminders
 * - 'audits': Deletes all LoginAudits
 * - 'all': Deletes EVERYTHING listed above to start completely fresh.
 */
router.delete("/purge/:target", requireCMS, async (req, res) => {
  try {
    const { target } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== "I UNDERSTAND AND WISH TO PURGE DATA") {
      return res.status(400).json({ error: "Invalid confirmation phrase." });
    }

    const results = {};

    if (target === "finance" || target === "all") {
      await FinancialLog.deleteMany({});
      await SalaryLog.deleteMany({});
      await FundRequest.deleteMany({});
      results.finance = "Cleared";
    }
    
    if (target === "users" || target === "all") {
      await User.deleteMany({});
      results.users = "Cleared";
    }

    if (target === "attendance" || target === "all") {
      await Attendance.deleteMany({});
      results.attendance = "Cleared";
    }

    if (target === "admins" || target === "all") {
      await Admin.deleteMany({});
      await Invite.deleteMany({});
      results.admins = "Cleared";
    }

    if (target === "communications" || target === "all") {
      await Message.deleteMany({});
      await Reminder.deleteMany({});
      results.communications = "Cleared";
    }

    if (target === "audits" || target === "all") {
      await LoginAudit.deleteMany({});
      results.audits = "Cleared";
    }

    if (target === "service_reviews" || target === "all") {
      const ServiceReview = require("../models/ServiceReview");
      await ServiceReview.deleteMany({});
      results.service_reviews = "Cleared";
    }

    if (Object.keys(results).length === 0) {
      return res.status(400).json({ error: "Unknown target for purge." });
    }

    // Log this extremely destructive action
    await LoginAudit.create({ 
        email: req.user.email, 
        name: "CMS Root", 
        role: "cms", 
        success: true, 
        ip_address: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null, 
        user_agent: req.headers["user-agent"] || null,
        failure_reason: `PURGED DATABASE: ${target.toUpperCase()}` // Abusing failure_reason field to store audit context since it's a simple model
    }).catch(() => {});

    res.json({ success: true, message: `Successfully purged ${target}.`, results });
  } catch (err) {
    console.error("Purge error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
