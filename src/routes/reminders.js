const express = require("express");
const Reminder = require("../models/Reminder");
const { requireRole, requireCMS, requireAuth } = require("../middleware/auth");
const { refreshScheduler, fireReminder } = require("../jobs/reminderScheduler");

const router = express.Router();

const VALID_DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const VALID_CHANNELS = ["push","email","sms"];
const VALID_TARGETS = ["first_timer","member","worker"];

// ─── GET /reminders ───────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ created_at: 1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /reminders ─────────────────────────────────────────────────────────
router.post("/", requireRole("media_admin"), async (req, res) => {
  try {
    const { name, day, time, targets, message, channels } = req.body;

    if (!name || !day || !time || !message) return res.status(400).json({ error: "name, day, time, message required" });
    if (!VALID_DAYS.includes(day)) return res.status(400).json({ error: "Invalid day" });
    if (!targets?.length || !targets.every(t => VALID_TARGETS.includes(t))) return res.status(400).json({ error: "Invalid targets" });
    if (!channels?.length || !channels.every(c => VALID_CHANNELS.includes(c))) return res.status(400).json({ error: "Invalid channels" });

    const reminder = await Reminder.create({
      name, day, time, targets, message, channels, active: true
    });

    await refreshScheduler();

    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /reminders/:id ─────────────────────────────────────────────────────
router.patch("/:id", requireRole("media_admin"), async (req, res) => {
  try {
    const { name, day, time, targets, message, channels, active } = req.body;

    const reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      { $set: { name, day, time, targets, message, channels, active } },
      { new: true }
    );
    
    if (!reminder) return res.status(404).json({ error: "Reminder not found" });

    await refreshScheduler();
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /reminders/:id/toggle ──────────────────────────────────────────────
router.patch("/:id/toggle", requireRole("media_admin"), async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ error: "Reminder not found" });
    
    reminder.active = !reminder.active;
    await reminder.save();
    
    await refreshScheduler();
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /reminders/:id ────────────────────────────────────────────────────
router.delete("/:id", requireRole("media_admin"), async (req, res) => {
  try {
    const reminder = await Reminder.findByIdAndDelete(req.params.id);
    if (!reminder) return res.status(404).json({ error: "Reminder not found" });
    
    await refreshScheduler();
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /reminders/:id/send-now (test fire) ─────────────────────────────────
router.post("/:id/send-now", requireCMS, async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ error: "Reminder not found" });
    
    setImmediate(() => fireReminder(reminder));
    res.json({ message: "Reminder firing now (background)" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
