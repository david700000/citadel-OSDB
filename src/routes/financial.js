const express = require("express");
const FinancialLog = require("../models/FinancialLog");
const Admin = require("../models/Admin");
const { requireRole, requireAuth } = require("../middleware/auth");
const { sendEmail } = require("../services/messaging");

const router = express.Router();

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

    // Send notifications to all active leaders
    const leaders = await Admin.find({ role: "leader", status: "active" });
    const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const leader of leaders) {
      try {
        await sendEmail({
          to: leader.email,
          name: leader.name,
          subject: `New Financial Update - ${churchName}`,
          message: `Hi ${leader.name},\n\nA new financial transaction has been logged:\n\nType: ${type.toUpperCase()}\nCategory: ${category}\nAmount: $${amount}\nDescription: ${description || "N/A"}\nLogged By: ${req.user.name || "Financial Admin"}\n\nPlease log in to your CitadelCMS dashboard to review and acknowledge this financial update:\n${appUrl}\n\nThank you!`
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

module.exports = router;
