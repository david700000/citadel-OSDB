const express = require("express");
const FinancialLog = require("../models/FinancialLog");
const FinancialSection = require("../models/FinancialSection");
const SalaryLog = require("../models/SalaryLog");
const FundRequest = require("../models/FundRequest");
const Admin = require("../models/Admin");
const User = require("../models/User");
const { requireRole, requireAuth, requireCMS } = require("../middleware/auth");
const { sendEmail } = require("../services/messaging");

const router = express.Router();

// ─── GENERAL LEDGER ROUTES ───────────────────────────────────────────────────

// GET /financial - Get all active (non-voided) transactions (finance admin, Leader)
router.get("/", requireRole("finance_admin", "leader"), async (req, res) => {
  try {
    const logs = await FinancialLog.find({ voided: { $ne: true } }).sort({ date: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /financial/all-logs - Full audit log including voided (CMS Root only)
router.get("/all-logs", requireCMS, async (req, res) => {
  try {
    const logs = await FinancialLog.find().sort({ date: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial - Log a transaction (finance admin)
router.post("/", requireRole("finance_admin"), async (req, res) => {
  try {
    const { type, category, amount, description, date } = req.body;
    if (!type || !category || !amount) {
      return res.status(400).json({ error: "Type, category, and amount are required" });
    }
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "Type must be income or expense" });
    }
    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    const log = await FinancialLog.create({
      type,
      category,
      amount: parseFloat(amount),
      description: description || "",
      date: date ? new Date(date) : new Date(),
      logged_by: req.user.id,
      logged_by_name: req.user.name || "finance admin"
    });

    // Notify all active leaders
    const leaders = await Admin.find({ role: "leader", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const leader of leaders) {
      try {
        await sendEmail({
          to: leader.email,
          name: leader.name,
          subject: `New Financial Update - ${churchName}`,
          message: `Hi ${leader.name},\n\nA new financial transaction has been logged:\n\nType: ${type.toUpperCase()}\nCategory: ${category}\nAmount: ₦${parseFloat(amount).toLocaleString()}\nDescription: ${description || "N/A"}\nLogged By: ${req.user.name || "finance admin"}\n\nLog in to review and acknowledge:\n${appUrl}\n\nThank you!`
        });
      } catch (err) {
        console.error(`Failed to send financial email to leader ${leader.email}:`, err.message);
      }
    }

    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /financial/:id/acknowledge - Acknowledge a transaction (Leader)
router.patch("/:id/acknowledge", requireRole("leader"), async (req, res) => {
  try {
    const log = await FinancialLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: "Financial record not found" });
    if (log.voided) return res.status(400).json({ error: "Cannot acknowledge a voided record" });

    const alreadyAcked = log.acknowledgements.some(ack => ack.leader_id === req.user.id);
    if (alreadyAcked) {
      return res.status(400).json({ error: "Already acknowledged by this leader" });
    }

    log.acknowledgements.push({
      leader_id: req.user.id,
      leader_name: req.user.name || "Leader",
      acknowledged_at: new Date()
    });

    await log.save();

    // Notify all finance admins that the transaction was acknowledged
    const financeAdmins = await Admin.find({ role: "finance_admin", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const admin of financeAdmins) {
      try {
        await sendEmail({
          to: admin.email,
          name: admin.name,
          subject: `Transaction Acknowledged - ${churchName}`,
          message: `Hi ${admin.name},\n\nA transaction has been acknowledged by a Leader (${req.user.name || "Leader"}).\n\nTransaction Details:\nType: ${log.type.toUpperCase()}\nCategory: ${log.category}\nAmount: ₦${log.amount.toLocaleString()}\nLogged By: ${log.logged_by_name}\n\nLog in to view the ledger:\n${appUrl}\n\nThank you!`
        });
      } catch (err) {
        console.error(`Failed to send ack email to finance admin ${admin.email}:`, err.message);
      }
    }

    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /financial/:id/void - Soft-delete (void) a transaction — requires reason (finance admin)
// Records are NEVER hard-deleted. This only marks them as voided for audit trail.
router.patch("/:id/void", requireRole("finance_admin"), async (req, res) => {
  try {
    const { void_reason } = req.body;
    if (!void_reason || !void_reason.trim()) {
      return res.status(400).json({ error: "A void reason is required" });
    }

    const log = await FinancialLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: "Financial record not found" });
    if (log.voided) return res.status(400).json({ error: "Record is already voided" });

    log.voided = true;
    log.void_reason = void_reason.trim();
    log.voided_by = req.user.id;
    log.voided_by_name = req.user.name || "finance admin";
    log.voided_at = new Date();
    await log.save();

    res.json({ success: true, message: "Record voided successfully", log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── FINANCIAL SECTIONS (DEPARTMENTS) ROUTES ────────────────────────────────

// GET /financial/sections
router.get("/sections", requireAuth, async (req, res) => {
  try {
    const sections = await FinancialSection.find().sort({ name: 1 });
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial/sections (CMS Root only)
router.post("/sections", requireCMS, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Section name required" });

    const exists = await FinancialSection.findOne({ name: name.trim() });
    if (exists) return res.status(400).json({ error: "Section already exists" });

    const section = await FinancialSection.create({ name: name.trim(), description: description || "" });
    res.status(201).json(section);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /financial/sections/:id (CMS Root only)
router.delete("/sections/:id", requireCMS, async (req, res) => {
  try {
    const deleted = await FinancialSection.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Section not found" });
    res.json({ success: true, message: "Section deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── SALARY ROUTES ───────────────────────────────────────────────────────────

// GET /financial/salaries - Active salary logs only
router.get("/salaries", requireRole("finance_admin", "leader"), async (req, res) => {
  try {
    const salaries = await SalaryLog.find({ voided: { $ne: true } }).sort({ createdAt: -1 });
    res.json(salaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /financial/salaries/all - Full audit including voided (CMS Root)
router.get("/salaries/all", requireCMS, async (req, res) => {
  try {
    const salaries = await SalaryLog.find().sort({ createdAt: -1 });
    res.json(salaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial/salaries - Log a salary payment
router.post("/salaries", requireRole("finance_admin"), async (req, res) => {
  try {
    const { staff_name, role, month, amount, status } = req.body;
    if (!staff_name || !role || !month || !amount) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const log = await SalaryLog.create({
      staff_name, role, month,
      amount: parseFloat(amount),
      status: status || "pending",
      payment_date: status === "paid" ? new Date() : null,
      logged_by: req.user.id,
      logged_by_name: req.user.name || "finance admin"
    });

    if (status === "paid") {
      await FinancialLog.create({
        type: "expense",
        category: "Salaries",
        amount: parseFloat(amount),
        description: `Salary payout to ${staff_name} (${role}) for ${month}`,
        date: new Date(),
        logged_by: req.user.id,
        logged_by_name: req.user.name || "finance admin"
      });
    }

    const leaders = await Admin.find({ role: "leader", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const leader of leaders) {
      try {
        await sendEmail({
          to: leader.email,
          name: leader.name,
          subject: `New Salary Logged - ${churchName}`,
          message: `Hi ${leader.name},\n\nA salary payment has been logged:\n\nStaff: ${staff_name}\nRole: ${role}\nMonth: ${month}\nAmount: ₦${parseFloat(amount).toLocaleString()}\nStatus: ${(status || "pending").toUpperCase()}\nLogged By: ${req.user.name || "finance admin"}\n\nReview on dashboard: ${appUrl}`
        });
      } catch (err) {
        console.error(`Failed to send salary email to leader ${leader.email}:`, err.message);
      }
    }

    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /financial/salaries/:id/acknowledge (Leader)
router.patch("/salaries/:id/acknowledge", requireRole("leader"), async (req, res) => {
  try {
    const log = await SalaryLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: "Salary log not found" });
    if (log.voided) return res.status(400).json({ error: "Cannot acknowledge a voided record" });

    const alreadyAcked = log.acknowledgements.some(ack => ack.leader_id === req.user.id);
    if (alreadyAcked) return res.status(400).json({ error: "Already acknowledged" });

    log.acknowledgements.push({
      leader_id: req.user.id,
      leader_name: req.user.name || "Leader",
      acknowledged_at: new Date()
    });
    await log.save();

    // Notify all finance admins
    const financeAdmins = await Admin.find({ role: "finance_admin", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const admin of financeAdmins) {
      try {
        await sendEmail({
          to: admin.email,
          name: admin.name,
          subject: `Salary Acknowledged - ${churchName}`,
          message: `Hi ${admin.name},\n\nA salary payment has been acknowledged by a Leader (${req.user.name || "Leader"}).\n\nSalary Details:\nStaff: ${log.staff_name}\nRole: ${log.role}\nMonth: ${log.month}\nAmount: ₦${log.amount.toLocaleString()}\n\nLog in to view the tracker:\n${appUrl}\n\nThank you!`
        });
      } catch (err) {
        console.error(`Failed to send ack email to finance admin ${admin.email}:`, err.message);
      }
    }

    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /financial/salaries/:id/void - Soft-delete salary log (finance admin)
router.patch("/salaries/:id/void", requireRole("finance_admin"), async (req, res) => {
  try {
    const { void_reason } = req.body;
    if (!void_reason || !void_reason.trim()) {
      return res.status(400).json({ error: "A void reason is required" });
    }

    const log = await SalaryLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: "Salary log not found" });
    if (log.voided) return res.status(400).json({ error: "Record is already voided" });

    log.voided = true;
    log.void_reason = void_reason.trim();
    log.voided_by = req.user.id;
    log.voided_by_name = req.user.name || "finance admin";
    log.voided_at = new Date();
    await log.save();

    res.json({ success: true, message: "Salary log voided", log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── FUND REQUEST ROUTES ─────────────────────────────────────────────────────

// GET /financial/fund-requests
router.get("/fund-requests", requireRole("finance_admin", "leader"), async (req, res) => {
  try {
    const requests = await FundRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial/fund-requests
router.post("/fund-requests", requireRole("finance_admin"), async (req, res) => {
  try {
    const { title, amount, description, department } = req.body;
    if (!title || !amount || !description || !department) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const request = await FundRequest.create({
      requester_id: req.user.id,
      requester_name: req.user.name || "finance admin",
      requester_role: req.user.role,
      title, amount: parseFloat(amount), description, department,
      status: "pending"
    });

    const leaders = await Admin.find({ role: "leader", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const leader of leaders) {
      try {
        await sendEmail({
          to: leader.email, name: leader.name,
          subject: `New Fund Request - ${churchName}`,
          message: `Hi ${leader.name},\n\nNew fund request requires review:\n\nProject: ${title}\nDepartment: ${department}\nAmount: ₦${parseFloat(amount).toLocaleString()}\nDescription: ${description}\nRequested By: ${req.user.name || "finance admin"}\n\nReview on dashboard: ${appUrl}`
        });
      } catch (err) {
        console.error(`Failed to send fund request email to ${leader.email}:`, err.message);
      }
    }

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /financial/fund-requests/:id/resolve (Leader)
router.patch("/fund-requests/:id/resolve", requireRole("leader"), async (req, res) => {
  try {
    const { status, rejection_reason } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be approved or rejected" });
    }

    const request = await FundRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Fund request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request is already resolved" });

    request.status = status;
    request.resolved_by = req.user.id;
    request.resolved_by_name = req.user.name || "Leader";
    request.resolved_at = new Date();
    if (status === "rejected") request.rejection_reason = rejection_reason || "No reason provided";

    await request.save();

    if (status === "approved") {
      await FinancialLog.create({
        type: "expense",
        category: "Projects",
        amount: request.amount,
        description: `Approved Fund Request: ${request.title} (${request.description})`,
        date: new Date(),
        logged_by: req.user.id,
        logged_by_name: req.user.name || "Leader"
      });
    }

    const requester = await Admin.findById(request.requester_id);
    if (requester) {
      const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
      try {
        await sendEmail({
          to: requester.email, name: requester.name,
          subject: `Fund Request Update - ${churchName}`,
          message: `Hi ${requester.name},\n\nYour fund request has been reviewed:\n\nProject: ${request.title}\nAmount: ₦${request.amount.toLocaleString()}\nStatus: ${status.toUpperCase()}\nReviewed By: ${req.user.name || "Leader"}\n${status === "rejected" ? `Reason: ${rejection_reason || "N/A"}` : ""}\n\nThank you!`
        });
      } catch (err) {
        console.error(`Failed to send fund request update email:`, err.message);
      }
    }

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
