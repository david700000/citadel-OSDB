// src/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./db/mongo");

// Routes
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const messagesRouter = require("./routes/messages");
const remindersRouter = require("./routes/reminders");
const attendanceRouter = require("./routes/attendance");
const { adminsRouter, formFieldsRouter } = require("./routes/attendance");

// Scheduler
const { initScheduler } = require("./jobs/reminderScheduler");

const app = express();
const PORT = process.env.PORT || 4000;

// Connect to MongoDB
connectDB();

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use("/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many login attempts. Try again in 15 minutes." } }));
app.use("/users/register", rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  const mongoose = require("mongoose");
  const isConnected = mongoose.connection.readyState === 1;
  res.json({ 
    status: isConnected ? "ok" : "error", 
    db: isConnected ? "connected" : "disconnected", 
    time: new Date().toISOString() 
  });
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/auth",        authRouter);
app.use("/users",       usersRouter);
app.use("/messages",    messagesRouter);
app.use("/reminders",   remindersRouter);
app.use("/attendance",  attendanceRouter);
app.use("/admins",      adminsRouter);
app.use("/form-fields", formFieldsRouter);

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Church CMS Backend running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`   Database    : ${process.env.MONGODB_URI || process.env.DATABASE_URL ? "✅ configured (MongoDB)" : "❌ MONGODB_URI missing"}`);
  console.log(`   SMTP        : ${process.env.SMTP_HOST ? "✅ configured" : "⚠️  not configured (email disabled)"}`);
  console.log(`   Firebase    : ${process.env.FIREBASE_PROJECT_ID ? "✅ configured (Push Notifications enabled)" : "⚠️  not configured (Push disabled)"}`);
  console.log(`   SMS via     : ${process.env.SMS_PROVIDER === "termii" ? "✅ Termii" : "⚠️  disabled (Twilio removed)"}\n`);

  // Start reminder scheduler
  try {
    await initScheduler();
    console.log("⏰ Reminder scheduler started\n");
  } catch (err) {
    console.warn("⚠️  Scheduler failed to start (DB may not be ready):", err.message);
  }
});

module.exports = app;
