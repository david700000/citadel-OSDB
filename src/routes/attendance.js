const express = require("express");
const Attendance = require("../models/Attendance");
const Admin = require("../models/Admin");
const FormField = require("../models/FormField");
const { requireRole, requireAuth, requireCMS } = require("../middleware/auth");
const bcrypt = require("bcryptjs");

const router = express.Router();

// ─── GET /attendance ──────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { date, event_name, user_id } = req.query;
    const query = {};
    if (date) query.date = new Date(date);
    if (event_name) query.event_name = new RegExp(event_name, 'i');
    if (user_id) query.user_id = user_id;

    const attendance = await Attendance.find(query)
      .populate('user_id', 'full_name tag department')
      .sort({ date: -1 });
      
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /attendance ─────────────────────────────────────────────────────────
router.post("/", requireRole("usher_admin"), async (req, res) => {
  try {
    const { user_id, event_name, status, date } = req.body;
    if (!user_id || !event_name || !status || !date) 
      return res.status(400).json({ error: "user_id, event_name, status, date required" });
    
    if (!["present","absent"].includes(status)) 
      return res.status(400).json({ error: "status must be present or absent" });

    const attendance = await Attendance.findOneAndUpdate(
      { user_id, date: new Date(date), event_name },
      { status, marked_by: req.user.id },
      { upsert: true, new: true }
    );
    
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /attendance/:id ────────────────────────────────────────────────────
router.patch("/:id", requireRole("usher_admin"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["present","absent"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    
    const attendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!attendance) return res.status(404).json({ error: "Record not found" });
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /attendance/stats/summary ────────────────────────────────────────────
router.get("/stats/summary", requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const match = {};
    if (date) match.date = new Date(date);

    const stats = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
          total: { $sum: 1 }
        }
      }
    ]);
    res.json(stats[0] || { present: 0, absent: 0, total: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMINS ROUTER ────────────────────────────────────────────────────────────
const adminsRouter = express.Router();

adminsRouter.get("/", requireCMS, async (req, res) => {
  try {
    const admins = await Admin.find().sort({ created_at: -1 });
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminsRouter.patch("/:id/toggle", requireCMS, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    
    admin.status = admin.status === 'active' ? 'disabled' : 'active';
    await admin.save();
    res.json(admin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminsRouter.patch("/:id", requireCMS, async (req, res) => {
  try {
    const { name, role, status } = req.body;
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { $set: { name, role, status } },
      { new: true }
    );
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    res.json(admin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminsRouter.delete("/:id", requireCMS, async (req, res) => {
  try {
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FORM FIELDS ROUTER ───────────────────────────────────────────────────────
const formFieldsRouter = express.Router();

formFieldsRouter.get("/", async (req, res) => {
  try {
    const { form_type } = req.query;
    const query = {};
    if (form_type) query.form_type = form_type;
    
    const fields = await FormField.find(query).sort({ sort_order: 1 });
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

formFieldsRouter.post("/", requireCMS, async (req, res) => {
  try {
    const { form_type, field_key, label, type, options, required, worker_only, sort_order } = req.body;
    if (!form_type || !field_key || !label || !type) 
      return res.status(400).json({ error: "form_type, field_key, label, type required" });

    const field = await FormField.create({
      form_type, field_key, label, type, options, required, worker_only, sort_order
    });
    res.status(201).json(field);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

formFieldsRouter.patch("/:id/toggle", requireCMS, async (req, res) => {
  try {
    const field = await FormField.findById(req.params.id);
    if (!field) return res.status(404).json({ error: "Field not found" });
    
    field.active = !field.active;
    await field.save();
    res.json(field);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

formFieldsRouter.patch("/:id", requireCMS, async (req, res) => {
  try {
    const field = await FormField.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!field) return res.status(404).json({ error: "Field not found" });
    res.json(field);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

formFieldsRouter.delete("/:id", requireCMS, async (req, res) => {
  try {
    await FormField.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.adminsRouter = adminsRouter;
module.exports.formFieldsRouter = formFieldsRouter;
