// src/jobs/birthdayScheduler.js
const cron = require("node-cron");
const User = require("../models/User");
const Message = require("../models/Message");
const Setting = require("../models/Setting");
const { sendViaChannels } = require("../services/messaging");

const DEFAULT_BIRTHDAY_MESSAGE =
  `🎂 Happy Birthday, {name}!\n\n` +
  `On behalf of everyone at ${process.env.CHURCH_NAME || "Citadel"}, we want to wish you a truly blessed and joyful birthday. ` +
  `May this new year of your life be filled with God's grace, good health, and overflowing happiness.\n\n` +
  `We celebrate you today and always! 🎉🙏`;

// ─── LOAD TEMPLATE FROM DB ────────────────────────────────────────────────────
async function getBirthdayTemplate() {
  try {
    const setting = await Setting.findOne({ key: "birthday_message" });
    return (setting && setting.value) ? setting.value : DEFAULT_BIRTHDAY_MESSAGE;
  } catch (err) {
    console.error("[Birthday] Failed to load template from DB, using default:", err.message);
    return DEFAULT_BIRTHDAY_MESSAGE;
  }
}

// ─── FIRE BIRTHDAY GREETINGS ──────────────────────────────────────────────────
async function fireBirthdayGreetings() {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1; // 1-based
    const todayDay = now.getDate();

    console.log(`[Birthday] Checking birthdays for ${todayMonth}/${todayDay}/${currentYear}...`);

    // Find members and workers who have a date_of_birth set
    // and haven't been greeted this calendar year yet
    const allUsers = await User.find({
      tag: { $in: ["member", "worker"] },
      date_of_birth: { $exists: true, $ne: null },
      $or: [
        { birthday_greeted_year: { $exists: false } },
        { birthday_greeted_year: { $ne: currentYear } },
      ],
    }).select("full_name email phone fcm_tokens date_of_birth extra_fields birthday_greeted_year");

    // Filter by today's month+day — works regardless of year stored in DOB
    const birthdayUsers = allUsers.filter((u) => {
      // Check top-level date_of_birth first
      let dob = u.date_of_birth;
      // Fallback: check extra_fields.date_of_birth (from form builder)
      if (!dob && u.extra_fields) {
        const ef = u.extra_fields instanceof Map ? Object.fromEntries(u.extra_fields) : u.extra_fields;
        if (ef.date_of_birth) dob = new Date(ef.date_of_birth);
      }
      if (!dob) return false;
      const d = new Date(dob);
      return d.getMonth() + 1 === todayMonth && d.getDate() === todayDay;
    });

    if (birthdayUsers.length === 0) {
      console.log("[Birthday] No birthdays today.");
      return;
    }

    console.log(`[Birthday] Found ${birthdayUsers.length} birthday(s) today. Sending greetings...`);
    const template = await getBirthdayTemplate();

    let successCount = 0;
    for (const user of birthdayUsers) {
      try {
        const personalizedMessage = template.replace(/\{name\}/g, user.full_name.split(" ")[0]);

        await sendViaChannels({
          user,
          subject: `🎂 Happy Birthday, ${user.full_name.split(" ")[0]}!`,
          message: personalizedMessage,
          channels: ["push", "email"],
        });

        // Mark this user as greeted for the current year
        await User.findByIdAndUpdate(user._id, { birthday_greeted_year: currentYear });
        successCount++;
      } catch (err) {
        console.error(`[Birthday] Failed to greet ${user.full_name}:`, err.message);
      }
    }

    // Log one entry to Messages collection (summary)
    if (successCount > 0) {
      await Message.create({
        sender_id: "system",
        sender_name: "Birthday System",
        target_type: "birthday",
        target_group: "members,workers",
        channels: ["push", "email"],
        message: `Birthday greetings sent to ${successCount} member(s)/worker(s) on ${todayDay}/${todayMonth}/${currentYear}.`,
        type: "birthday",
        status: "sent",
      });
    }

    console.log(`[Birthday] Done. Greeted ${successCount}/${birthdayUsers.length} user(s).`);
  } catch (err) {
    console.error("[Birthday] Scheduler error:", err);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function initBirthdayScheduler() {
  // Every day at 08:00 WAT (Africa/Lagos)
  cron.schedule("0 8 * * *", fireBirthdayGreetings, { timezone: "Africa/Lagos" });
  console.log("[Birthday] Scheduler initialized — fires daily at 08:00 WAT.");
}

module.exports = { initBirthdayScheduler, fireBirthdayGreetings };
