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
const settingsRouter = require("./routes/settings");
const financialRouter = require("./routes/financial");
const reportsRouter = require("./routes/reports");
const databaseRouter = require("./routes/database");

// Scheduler
const { initScheduler } = require("./jobs/reminderScheduler");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 4000;

// Connect to MongoDB
connectDB();

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
const cookieParser = require("cookie-parser");
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
}));
app.use(cookieParser());
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
app.use("/settings",    settingsRouter);
app.use("/financial",   financialRouter);
app.use("/reports",     reportsRouter);
app.use("/database",    databaseRouter);

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Citadel CMS Backend running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`   Database    : ${process.env.MONGODB_URI || process.env.DATABASE_URL ? "✅ configured (MongoDB)" : "❌ MONGODB_URI missing"}`);
  console.log(`   SMTP        : ${process.env.SMTP_HOST ? "✅ configured" : "⚠️  not configured (email disabled)"}`);
  console.log(`   Firebase    : ${process.env.FIREBASE_PROJECT_ID ? "✅ configured (Push Notifications enabled)" : "⚠️  not configured (Push disabled)"}`);
  console.log(`   SMS via     : ${process.env.SMS_PROVIDER === "termii" ? "✅ Termii" : "⚠️  disabled (Twilio removed)"}\n`);

  // Start reminder scheduler
  try {
    await initScheduler();
    console.log("⏰ Reminder scheduler started");
  } catch (err) {
    console.warn("⚠️  Scheduler failed to start (DB may not be ready):", err.message);
  }

  // Seed default financial sections
  try {
    const FinancialSection = require("./models/FinancialSection");
    const count = await FinancialSection.countDocuments();
    if (count === 0) {
      await FinancialSection.insertMany([
        { name: "General", description: "General church operations and revenue" },
        { name: "Salaries", description: "Staff salary and allowance payments" },
        { name: "Missions", description: "Outreaches, evangelism, and community work" },
        { name: "Welfare", description: "Charity, member support, and benevolence" },
        { name: "Building", description: "Church construction and facility expansion" },
        { name: "Youth", description: "Youth department events and programs" }
      ]);
      console.log("✅ Seeded default financial sections\n");
    }
  } catch (err) {
    console.error("⚠️ Failed to seed default financial sections:", err.message);
  }
});

module.exports = app;
