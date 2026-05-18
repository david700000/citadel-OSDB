const express = require("express");
const User = require("../models/User");
const Message = require("../models/Message");
const { requireCMS, requireAuth } = require("../middleware/auth");
const { sendViaChannels, welcomeMessage } = require("../services/messaging");

const router = express.Router();

// ─── POST /users/register (Legacy/Base) ──────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { full_name, email, phone, tag, department, extra_fields } = req.body;
    if (!full_name) return res.status(400).json({ error: "Full name is required" });
    const validTags = ["first_timer", "member", "worker"];
    if (!validTags.includes(tag)) return res.status(400).json({ error: "Invalid tag" });
    
    const user = await User.create({
      full_name: full_name.trim(),
      email: email?.toLowerCase().trim() || undefined,
      phone: phone || undefined,
      tag,
      department: department || undefined,
      extra_fields: extra_fields || {}
    });

    if (tag === "first_timer") handleWelcome(user);
    res.status(201).json({ user, message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /users/register/first-timer ────────────────────────────────────────
router.post("/register/first-timer", async (req, res) => {
  try {
    const { full_name, email, phone, ...extra } = req.body;
    if (!full_name) return res.status(400).json({ error: "Full name is required" });

    const user = await User.create({
      full_name: full_name.trim(),
      email: email?.toLowerCase().trim() || undefined,
      phone: phone || undefined,
      tag: "first_timer",
      extra_fields: extra || {},
      fcm_tokens: req.body.fcm_token ? [req.body.fcm_token] : []
    });

    handleWelcome(user);
    res.status(201).json({ user, message: "Welcome! Registered as first-timer" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /users/register/member-worker ──────────────────────────────────────
router.post("/register/member-worker", async (req, res) => {
  try {
    const { full_name, email, phone, role_type, department, ...extra } = req.body;
    if (!full_name) return res.status(400).json({ error: "Full name is required" });

    const tag = role_type === "Worker" ? "worker" : "member";
    const user = await User.create({
      full_name: full_name.trim(),
      email: email?.toLowerCase().trim() || undefined,
      phone: phone || undefined,
      tag,
      department: tag === "worker" ? department : undefined,
      extra_fields: extra || {},
      fcm_tokens: req.body.fcm_token ? [req.body.fcm_token] : []
    });

    handleWelcome(user);
    res.status(201).json({ user, message: `Registered successfully as ${tag}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function handleWelcome(user) {
  const msg = welcomeMessage(user.full_name);
  const channels = ["push", "email", "sms"];
  try {
    await sendViaChannels({ user, subject: `Welcome to ${process.env.CHURCH_NAME || "our church"}!`, message: msg, channels });
    await Message.create({
      sender_id: 'system',
      sender_name: 'System (Auto)',
      target_type: 'welcome',
      target_user_id: user._id,
      target_user_name: user.full_name,
      channels,
      message: msg,
      type: 'welcome',
      status: 'sent'
    });
  } catch (err) {
    console.error("[Auto-Welcome] Failed:", err.message);
  }
}

// ─── GET /users/register (Discovery) ──────────────────────────────────────────
router.get("/register/first-timer", (req, res) => {
  res.send("<h1>This is an API endpoint.</h1><p>To register, please use the frontend application at <a href='http://localhost:5173/#/register/first-timer'>http://localhost:5173/#/register/first-timer</a></p>");
});

router.get("/register/member-worker", (req, res) => {
  res.send("<h1>This is an API endpoint.</h1><p>To register, please use the frontend application at <a href='http://localhost:5173/#/register/member-worker'>http://localhost:5173/#/register/member-worker</a></p>");
});

// ─── GET /users ───────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { tag, search, limit = 100, offset = 0 } = req.query;

    const query = {};
    if (tag) query.tag = tag;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ];
    }

    const users = await User.find(query)
      .sort({ created_at: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
      
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /users/:id ───────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /users/:id ────────────────────────────────────────────────────────
router.patch("/:id", requireCMS, async (req, res) => {
  try {
    const { full_name, email, phone, tag, department, extra_fields } = req.body;
    
    const update = {};
    if (full_name) update.full_name = full_name.trim();
    if (email) update.email = email.toLowerCase().trim();
    if (phone) update.phone = phone;
    if (tag) update.tag = tag;
    if (department !== undefined) update.department = department;
    if (extra_fields) update.extra_fields = extra_fields;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /users/:id ────────────────────────────────────────────────────────
router.delete("/:id", requireCMS, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /users/stats/summary ─────────────────────────────────────────────────
router.get("/stats/summary", requireAuth, async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          first_timers: { $sum: { $cond: [{ $eq: ["$tag", "first_timer"] }, 1, 0] } },
          members: { $sum: { $cond: [{ $eq: ["$tag", "member"] }, 1, 0] } },
          workers: { $sum: { $cond: [{ $eq: ["$tag", "worker"] }, 1, 0] } },
          total: { $sum: 1 }
        }
      }
    ]);
    res.json(stats[0] || { first_timers: 0, members: 0, workers: 0, total: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /users/fcm-token ────────────────────────────────────────────────────
router.post("/fcm-token", requireAuth, async (req, res) => {
  try {
    const { token, user_id } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    // Use user_id from body if provided, otherwise use current user
    const targetUserId = user_id || req.user.id;

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Add token if it doesn't exist
    if (!user.fcm_tokens.includes(token)) {
      user.fcm_tokens.push(token);
      await user.save();
    }

    res.json({ success: true, message: "Token registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
