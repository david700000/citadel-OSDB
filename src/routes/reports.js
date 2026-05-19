const express = require("express");
const { requireCMS } = require("../middleware/auth");
const FinancialLog = require("../models/FinancialLog");
const SalaryLog = require("../models/SalaryLog");
const FundRequest = require("../models/FundRequest");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Attendance = require("../models/Attendance");
const LoginAudit = require("../models/LoginAudit");

const router = express.Router();

/**
 * GET /reports/all
 * CMS Root only — fetches ALL data across every dashboard for printing.
 * Returns:
 *   - financialLogs: all ledger entries (including voided, flagged)
 *   - salaryLogs: all salary records (including voided)
 *   - fundRequests: all fund requests with resolution status
 *   - members: all registered users / church members
 *   - workers: users flagged as workers/volunteers
 *   - firstTimers: users who are first-timers (registered within last 30 days or flagged)
 *   - admins: all admin accounts with role/status
 *   - loginActivity: all login audit logs (last 500)
 *   - generatedAt: timestamp of report generation
 */
router.get("/all", requireCMS, async (req, res) => {
  try {
    const [
      financialLogs,
      salaryLogs,
      fundRequests,
      allUsers,
      admins,
      loginActivity
    ] = await Promise.all([
      FinancialLog.find().sort({ date: -1 }),
      SalaryLog.find().sort({ created_at: -1 }),
      FundRequest.find().sort({ createdAt: -1 }),
      User.find().sort({ createdAt: -1 }),
      Admin.find({}, { password_hash: 0, otp_hash: 0, otp_expires_at: 0 }).sort({ created_at: -1 }),
      LoginAudit.find().sort({ logged_at: -1 }).limit(500)
    ]);

    // Segment users by type
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const members = allUsers.filter(u => !u.is_first_timer);
    const firstTimers = allUsers.filter(u => u.is_first_timer || new Date(u.createdAt) > thirtyDaysAgo);
    const workers = allUsers.filter(u => u.is_worker || u.role === "worker" || (u.groups && u.groups.length > 0));

    // Financial summaries
    const activeFinancialLogs = financialLogs.filter(l => !l.voided);
    const totalIncome = activeFinancialLogs.filter(l => l.type === "income").reduce((s, l) => s + l.amount, 0);
    const totalExpense = activeFinancialLogs.filter(l => l.type === "expense").reduce((s, l) => s + l.amount, 0);
    const voidedLogs = financialLogs.filter(l => l.voided);

    res.json({
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.email,
      summary: {
        totalMembers: allUsers.length,
        totalWorkers: workers.length,
        totalFirstTimers: firstTimers.length,
        totalAdmins: admins.length,
        financialSummary: {
          totalIncome,
          totalExpense,
          netBalance: totalIncome - totalExpense,
          totalEntries: financialLogs.length,
          voidedEntries: voidedLogs.length
        },
        totalSalaryLogs: salaryLogs.length,
        totalFundRequests: fundRequests.length,
        loginActivityCount: loginActivity.length
      },
      financialLogs,
      salaryLogs,
      fundRequests,
      members,
      workers,
      firstTimers,
      admins,
      loginActivity
    });
  } catch (err) {
    console.error("Report generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /reports/financial — financial logs only (CMS Root)
 */
router.get("/financial", requireCMS, async (req, res) => {
  try {
    const logs = await FinancialLog.find().sort({ date: -1 });
    const salaries = await SalaryLog.find().sort({ created_at: -1 });
    const fundRequests = await FundRequest.find().sort({ createdAt: -1 });
    res.json({ logs, salaries, fundRequests, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /reports/members — all members, workers, first-timers (CMS Root)
 */
router.get("/members", requireCMS, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ users, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /reports/login-activity — login audit trail (CMS Root)
 */
router.get("/login-activity", requireCMS, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const logs = await LoginAudit.find().sort({ logged_at: -1 }).limit(limit);
    res.json({ logs, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
