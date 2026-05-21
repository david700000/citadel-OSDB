const cron = require("node-cron");
const PendingNotification = require("../models/PendingNotification");
const Admin = require("../models/Admin");
const { sendEmail } = require("../services/messaging");

/**
 * Checks for and processes any pending notifications whose scheduled send time has arrived.
 */
async function processPendingNotifications() {
  try {
    const now = new Date();
    // Find all pending notifications that are due or overdue
    const pending = await PendingNotification.find({
      type: "financial_update",
      status: "pending",
      send_at: { $lte: now }
    });

    if (pending.length === 0) return;

    console.log(`[NotificationQueue] Found ${pending.length} pending notification(s) due.`);

    for (const notif of pending) {
      try {
        // Update status to 'sent' immediately to avoid race conditions or double sending
        notif.status = "sent";
        await notif.save();

        const leaders = await Admin.find({ role: "leader", status: "active" });
        const churchName = process.env.CHURCH_NAME || "Citadel of Truth and Mercy Assembly";
        const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

        console.log(`[NotificationQueue] Sending secure batched alert email to ${leaders.length} leaders.`);

        for (const leader of leaders) {
          try {
            await sendEmail({
              to: leader.email,
              name: leader.name,
              subject: `New Financial Updates - ${churchName}`,
              message: `Hi ${leader.name},\n\nNew financial transactions and/or salary updates have been logged in the system in the last 30 minutes.\n\nFor security and confidentiality, the full details are not included in this email. Please log in to the CMS dashboard to review and acknowledge these updates:\n${appUrl}\n\nThank you!`
            });
          } catch (err) {
            console.error(`[NotificationQueue] Failed to send email to leader ${leader.email}:`, err.message);
          }
        }
      } catch (err) {
        console.error(`[NotificationQueue] Error processing notification ${notif._id}:`, err);
        notif.status = "failed";
        notif.error = err.message;
        await notif.save();
      }
    }
  } catch (err) {
    console.error(`[NotificationQueue] Global error in queue processing:`, err);
  }
}

/**
 * Initializes the background cron job to process the notification queue every minute.
 */
function initNotificationQueue() {
  cron.schedule("* * * * *", processPendingNotifications);
  console.log("[NotificationQueue] Cron scheduler successfully initialized (running every minute).");
}

module.exports = {
  initNotificationQueue,
  processPendingNotifications
};
