const cron = require("node-cron");
const Reminder = require("../models/Reminder");
const User = require("../models/User");
const Message = require("../models/Message");
const { sendViaChannels } = require("../services/messaging");

// Map day names to cron day-of-week numbers (0=Sun, 1=Mon, ... 6=Sat)
const DAY_MAP = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

// Store active cron jobs so we can cancel/restart them
const activeJobs = new Map();

// ─── FIRE A SINGLE REMINDER ───────────────────────────────────────────────────
async function fireReminder(reminder) {
  try {
    console.log(`[Reminder] Firing: "${reminder.name}"`);

    // Fetch users for target groups
    const users = await User.find({ tag: { $in: reminder.targets } }).select('full_name email phone fcm_tokens');

    if (users.length === 0) {
      console.log(`[Reminder] No users found for targets: ${reminder.targets.join(", ")}`);
      return;
    }

    console.log(`[Reminder] Sending to ${users.length} users via [${reminder.channels.join(", ")}]`);

    // Send to each user individually
    let successCount = 0;
    for (const user of users) {
      try {
        await sendViaChannels({
          user,
          subject: reminder.name,
          message: reminder.message,
          channels: reminder.channels,
        });
        successCount++;
      } catch (err) {
        console.error(`[Reminder] Failed for user ${user.full_name}:`, err.message);
      }
    }

    // Log to messages collection
    await Message.create({
      sender_id: 'system',
      sender_name: 'Automated Reminder',
      target_type: 'reminder',
      target_group: reminder.targets.join(","),
      channels: reminder.channels,
      message: reminder.message,
      type: 'reminder',
      status: 'sent'
    });

    // Update last_sent_at
    await Reminder.findByIdAndUpdate(reminder._id, { last_sent_at: new Date() });

    console.log(`[Reminder] Done. Sent: ${successCount}/${users.length}`);
  } catch (err) {
    console.error(`[Reminder] Error firing "${reminder.name}":`, err);
  }
}

// ─── BUILD CRON EXPRESSION ────────────────────────────────────────────────────
function buildCronExpr(reminder) {
  const [hour, minute] = reminder.time.split(":");
  const dayNum = DAY_MAP[reminder.day.toLowerCase()];
  if (dayNum === undefined) throw new Error(`Unknown day: ${reminder.day}`);
  return `${minute} ${hour} * * ${dayNum}`;
}

// ─── SCHEDULE ONE REMINDER ────────────────────────────────────────────────────
function scheduleReminder(reminder) {
  const id = reminder._id.toString();
  
  if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }

  if (!reminder.active) {
    console.log(`[Scheduler] Reminder "${reminder.name}" is inactive — skipped.`);
    return;
  }

  let expr;
  try {
    expr = buildCronExpr(reminder);
  } catch (err) {
    console.error(`[Scheduler] Invalid reminder config: ${err.message}`);
    return;
  }

  const job = cron.schedule(expr, () => fireReminder(reminder), {
    timezone: "Africa/Lagos", 
  });

  activeJobs.set(id, job);
  console.log(`[Scheduler] Scheduled "${reminder.name}" → cron: ${expr} (Africa/Lagos)`);
}

// ─── LOAD AND SCHEDULE ALL ACTIVE REMINDERS ───────────────────────────────────
async function initScheduler() {
  try {
    const reminders = await Reminder.find({ active: true });
    console.log(`[Scheduler] Initialising ${reminders.length} active reminder(s)...`);
    for (const reminder of reminders) {
      scheduleReminder(reminder);
    }
  } catch (err) {
    console.error("[Scheduler] Failed to initialise reminders:", err);
  }
}

// ─── REFRESH SCHEDULER (call after DB changes) ────────────────────────────────
async function refreshScheduler() {
  for (const [id, job] of activeJobs) {
    job.stop();
    activeJobs.delete(id);
  }
  await initScheduler();
}

module.exports = { initScheduler, refreshScheduler, scheduleReminder, fireReminder };
