const express = require("express");
const FinancialLog = require("../models/FinancialLog");
const FinancialSection = require("../models/FinancialSection");
const SalaryLog = require("../models/SalaryLog");
const FundRequest = require("../models/FundRequest");
const Admin = require("../models/Admin");
const { requireRole, requireAuth, requireCMS } = require("../middleware/auth");
const { sendEmail } = require("../services/messaging");

const router = express.Router();

// ─── GENERAL LEDGER ROUTES ───────────────────────────────────────────────────

// GET /financial - Get all transactions (Financial Admin, Leader, CMS Root)
router.get("/", requireRole("financial_admin", "leader"), async (req, res) => {
  try {
    const logs = await FinancialLog.find().sort({ date: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial - Log a transaction (Financial Admin)
router.post("/", requireRole("financial_admin"), async (req, res) => {
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
      logged_by_name: req.user.name || "Financial Admin"
    });

    // Send notifications to all active leaders (using Naira symbol)
    const leaders = await Admin.find({ role: "leader", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const leader of leaders) {
      try {
        await sendEmail({
          to: leader.email,
          name: leader.name,
          subject: `New Financial Update - ${churchName}`,
          message: `Hi ${leader.name},\n\nA new financial transaction has been logged:\n\nType: ${type.toUpperCase()}\nCategory: ${category}\nAmount: ₦${parseFloat(amount).toLocaleString()}\nDescription: ${description || "N/A"}\nLogged By: ${req.user.name || "Financial Admin"}\n\nPlease log in to your CitadelCMS dashboard to review and acknowledge this financial update:\n${appUrl}\n\nThank you!`
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
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /financial/:id - Delete a transaction (Financial Admin)
router.delete("/:id", requireRole("financial_admin"), async (req, res) => {
  try {
    const deleted = await FinancialLog.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Financial record not found" });
    res.json({ success: true, message: "Financial record deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── FINANCIAL SECTIONS (DEPARTMENTS) ROUTES ───────────────────────────────

// GET /financial/sections - Get all sections
router.get("/sections", requireAuth, async (req, res) => {
  try {
    const sections = await FinancialSection.find().sort({ name: 1 });
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial/sections - Create a new section (CMS Root only)
router.post("/sections", requireCMS, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Section name required" });

    const exists = await FinancialSection.findOne({ name: name.trim() });
    if (exists) return res.status(400).json({ error: "Section already exists" });

    const section = await FinancialSection.create({
      name: name.trim(),
      description: description || ""
    });
    res.status(201).json(section);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /financial/sections/:id - Delete a section (CMS Root only)
router.delete("/sections/:id", requireCMS, async (req, res) => {
  try {
    const deleted = await FinancialSection.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Section not found" });
    res.json({ success: true, message: "Section deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── SALARY ROUTES ──────────────────────────────────────────────────────────

// GET /financial/salaries - Get all salary logs
router.get("/salaries", requireRole("financial_admin", "leader"), async (req, res) => {
  try {
    const salaries = await SalaryLog.find().sort({ createdAt: -1 });
    res.json(salaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial/salaries - Log a salary payment
router.post("/salaries", requireRole("financial_admin"), async (req, res) => {
  try {
    const { staff_name, role, month, amount, status } = req.body;
    if (!staff_name || !role || !month || !amount) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const log = await SalaryLog.create({
      staff_name,
      role,
      month,
      amount: parseFloat(amount),
      status: status || "pending",
      payment_date: status === "paid" ? new Date() : null,
      logged_by: req.user.id,
      logged_by_name: req.user.name || "Financial Admin"
    });

    // If paid, auto-create expense log
    if (status === "paid") {
      await FinancialLog.create({
        type: "expense",
        category: "Salaries",
        amount: parseFloat(amount),
        description: `Salary payout to ${staff_name} (${role}) for ${month}`,
        date: new Date(),
        logged_by: req.user.id,
        logged_by_name: req.user.name || "Financial Admin"
      });
    }

    // Send notifications to all active leaders
    const leaders = await Admin.find({ role: "leader", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const leader of leaders) {
      try {
        await sendEmail({
          to: leader.email,
          name: leader.name,
          subject: `New Salary Logged - ${churchName}`,
          message: `Hi ${leader.name},\n\nA new salary payment has been logged:\n\nStaff Name: ${staff_name}\nRole: ${role}\nMonth: ${month}\nAmount: ₦${parseFloat(amount).toLocaleString()}\nStatus: ${(status || "pending").toUpperCase()}\nLogged By: ${req.user.name || "Financial Admin"}\n\nPlease log in to your CitadelCMS dashboard to review and acknowledge this salary payout:\n${appUrl}\n\nThank you!`
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

// PATCH /financial/salaries/:id/acknowledge - Acknowledge a salary log (Leader)
router.patch("/salaries/:id/acknowledge", requireRole("leader"), async (req, res) => {
  try {
    const log = await SalaryLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: "Salary log not found" });

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
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /financial/salaries/:id - Delete a salary log (Financial Admin)
router.delete("/salaries/:id", requireRole("financial_admin"), async (req, res) => {
  try {
    const deleted = await SalaryLog.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Salary log not found" });
    res.json({ success: true, message: "Salary log deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── FUND REQUEST ROUTES ─────────────────────────────────────────────────────

// GET /financial/fund-requests - Get all fund requests
router.get("/fund-requests", requireRole("financial_admin", "leader"), async (req, res) => {
  try {
    const requests = await FundRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /financial/fund-requests - Create a fund request (Financial Admin)
router.post("/fund-requests", requireRole("financial_admin"), async (req, res) => {
  try {
    const { title, amount, description, department } = req.body;
    if (!title || !amount || !description || !department) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const request = await FundRequest.create({
      requester_id: req.user.id,
      requester_name: req.user.name || "Financial Admin",
      requester_role: req.user.role,
      title,
      amount: parseFloat(amount),
      description,
      department,
      status: "pending"
    });

    // Notify leaders of the new request
    const leaders = await Admin.find({ role: "leader", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const leader of leaders) {
      try {
        await sendEmail({
          to: leader.email,
          name: leader.name,
          subject: `New Fund Request - ${churchName}`,
          message: `Hi ${leader.name},\n\nA new fund request requires your review:\n\nProject: ${title}\nDepartment: ${department}\nAmount: ₦${parseFloat(amount).toLocaleString()}\nDescription: ${description}\nRequested By: ${req.user.name || "Financial Admin"}\n\nPlease review and action this request on your dashboard:\n${appUrl}\n\nThank you!`
        });
      } catch (err) {
        console.error(`Failed to send fund request email to leader ${leader.email}:`, err.message);
      }
    }

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /financial/fund-requests/:id/resolve - Approve or reject request (Leader)
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
    if (status === "rejected") {
      request.rejection_reason = rejection_reason || "No reason provided";
    }

    await request.save();

    // If approved, automatically create a general ledger expense log!
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

    // Notify the requester of the result
    const requester = await Admin.findById(request.requester_id);
    if (requester) {
      const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
      try {
        await sendEmail({
          to: requester.email,
          name: requester.name,
          subject: `Fund Request Update - ${churchName}`,
          message: `Hi ${requester.name},\n\nYour fund request has been reviewed:\n\nProject: ${request.title}\nAmount: ₦${request.amount.toLocaleString()}\nStatus: ${status.toUpperCase()}\nReviewed By: ${req.user.name || "Leader"}\n${status === "rejected" ? `Reason: ${rejection_reason || "N/A"}` : ""}\n\nThank you!`
        });
      } catch (err) {
        console.error(`Failed to send fund request update email to requester ${requester.email}:`, err.message);
      }
    }

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
