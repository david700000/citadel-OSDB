const express = require("express");
const Message = require("../models/Message");
const User = require("../models/User");
const { requireRole, requireAuth } = require("../middleware/auth");
const { sendViaChannels, sendBulk } = require("../services/messaging");

const router = express.Router();

// ─── POST /messages/bulk ──────────────────────────────────────────────────────
router.post("/bulk", requireRole("media_admin"), async (req, res) => {
  try {
    const { message, channels, subject, target_group } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: "Message is required" });
    if (!channels?.length) return res.status(400).json({ error: "Select at least one channel" });
    if (!target_group) return res.status(400).json({ error: "target_group is required" });

    let query = {};
    if (target_group !== 'all') {
      query.tag = target_group;
    }

    const users = await User.find(query).select('id full_name email phone fcm_tokens');

    if (users.length === 0) return res.json({ sent: 0, message: `No users found for target group: ${target_group}` });

    const sendResults = await sendBulk({
      users,
      subject: subject || `Message from ${process.env.CHURCH_NAME || "Church"}`,
      message,
      channels,
    });

    const msg = await Message.create({
      sender_id: req.user.id,
      sender_name: req.user.name,
      target_type: 'bulk',
      target_group: target_group,
      channels,
      message,
      type: 'bulk',
      status: 'sent'
    });

    res.json({ message: msg, stats: sendResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /messages/individual ────────────────────────────────────────────────
router.post("/individual", requireRole("media_admin"), async (req, res) => {
  try {
    const { user_id, message, channels, subject } = req.body;

    if (!user_id || !message?.trim()) return res.status(400).json({ error: "user_id and message required" });
    if (!channels?.length) return res.status(400).json({ error: "Select at least one channel" });

    const user = await User.findById(user_id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.tag !== "first_timer") return res.status(403).json({ error: "Individual messages can only be sent to first-timers" });

    await sendViaChannels({
      user,
      subject: subject || `Message from ${process.env.CHURCH_NAME || "Church"}`,
      message,
      channels,
    });

    const msg = await Message.create({
      sender_id: req.user.id,
      sender_name: req.user.name,
      target_type: 'individual',
      target_user_id: user._id,
      target_user_name: user.full_name,
      channels,
      message,
      type: 'individual',
      status: 'sent'
    });

    res.json({ message: msg, sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /messages ────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;
    const query = {};

    if (req.user.role === "media_admin") {
      query.sender_id = req.user.id;
    }

    if (type) {
      query.type = type;
    }

    const messages = await Message.find(query)
      .sort({ created_at: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
      
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /messages/first-timers ───────────────────────────────────────────────
router.get("/first-timers/:userId", requireRole("media_admin"), async (req, res) => {
  try {
    const messages = await Message.find({ target_user_id: req.params.userId })
      .sort({ created_at: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
