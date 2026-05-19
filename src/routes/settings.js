const express = require("express");
const Setting = require("../models/Setting");
const { requireCMS } = require("../middleware/auth");

const router = express.Router();

// GET /settings
router.get("/", async (req, res) => {
  try {
    const settings = await Setting.find({});
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    
    // Provide a default if welcome_message is not set in DB
    if (!settingsMap.welcome_message) {
      const church = process.env.CHURCH_NAME || "our church";
      settingsMap.welcome_message = `Welcome to ${church}, {name}! 🙏\n\nWe're so glad you joined us today. Our team will be in touch with you soon.\n\nIf you have any questions, feel free to reach us at ${process.env.CHURCH_PHONE || ""}.\n\nGod bless you! ✨`;
    }
    
    res.json(settingsMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /settings
router.post("/", requireCMS, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "Key is required" });

    const setting = await Setting.findOneAndUpdate(
      { key },
      { value },
      { new: true, upsert: true }
    );
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
