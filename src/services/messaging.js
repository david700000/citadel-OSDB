// src/services/messaging.js
require("dotenv").config();
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

// ─── NODEMAILER TRANSPORTER ───────────────────────────────────────────────────
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "2525"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── FIREBASE ADMIN SDK ───────────────────────────────────────────────────────
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log("[Firebase] Initialized successfully.");
  } catch (error) {
    console.error("[Firebase] Initialization failed:", error.message);
  }
} else {
  console.warn("[Firebase] Credentials not fully configured — Push disabled.");
}

// ─── TERMII (Nigerian SMS provider) ─────────────────────────────────────────
async function sendTermiiSMS(to, message) {
  const response = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      from: process.env.TERMII_SENDER_ID || "N-Alert",
      sms: message,
      type: "plain",
      channel: "generic",
      api_key: process.env.TERMII_API_KEY,
    }),
  });
  if (!response.ok) throw new Error(`Termii error: ${response.statusText}`);
  return response.json();
}

// ─── NORMALISE PHONE ──────────────────────────────────────────────────────────
// Accepts: 08012345678  →  +2348012345678
//          2348012345678  →  +2348012345678
//          +2348012345678  →  +2348012345678
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("234")) return "+" + digits;
  if (digits.startsWith("0")) return "+234" + digits.slice(1);
  if (digits.length >= 10) return "+" + digits;
  return "+" + digits;
}

// ─── SEND EMAIL ───────────────────────────────────────────────────────────────
async function sendEmail({ to, name, subject, message }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn("[Email] SMTP not configured — skipping.");
    return { skipped: true };
  }
  const churchName = process.env.CHURCH_NAME || "Our Church";
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
      <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <div style="background:#0B1F3B;padding:28px 32px;text-align:center;">
          <h1 style="color:#F4C430;margin:0;font-size:22px;font-weight:800;">${churchName}</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Hi <strong>${name || "Friend"}</strong>,</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">${message.replace(/\n/g, "<br>")}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            ${churchName} &bull; ${process.env.CHURCH_ADDRESS || ""}<br>
            <a href="${process.env.CHURCH_WEBSITE || "#"}" style="color:#0B1F3B;">${process.env.CHURCH_WEBSITE || ""}</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  try {
    const result = await emailTransporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || churchName}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject: subject || `Message from ${churchName}`,
      text: message,
      html,
    });
    console.log(`[Email] ✅ Sent to ${to} — MessageID: ${result.messageId}`);
    return result;
  } catch (err) {
    console.error(`[Email] ❌ Failed to send to ${to}:`, err.message);
    throw err;
  }
}

// ─── SEND PUSH (Firebase) ─────────────────────────────────────────────────────
async function sendPushNotification({ tokens, title, body, data = {} }) {
  if (!tokens || tokens.length === 0) {
    console.warn("[Push] No tokens provided — skipping.");
    return { skipped: true };
  }

  const message = {
    notification: { title, body },
    data,
    tokens,
    webpush: {
      headers: {
        Urgency: 'high'
      },
      notification: {
        title,
        body,
        icon: '/vite.svg',
        vibrate: [200, 100, 200]
      }
    }
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[Push] Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
    return response;
  } catch (error) {
    console.error("[Push] Error sending message:", error);
    return { error: error.message };
  }
}

// ─── SEND VIA CHANNELS ────────────────────────────────────────────────────────
// channels: array of "push" | "email" | "sms"
async function sendViaChannels({ user, subject, message, channels }) {
  const results = {};

  await Promise.allSettled(
    channels.map(async (ch) => {
      try {
        if (ch === "email" && user.email) {
          results.email = await sendEmail({ to: user.email, name: user.full_name, subject, message });
        } else if (ch === "push" && user.fcm_tokens && user.fcm_tokens.length > 0) {
          results.push = await sendPushNotification({ 
            tokens: user.fcm_tokens, 
            title: subject || process.env.CHURCH_NAME || "Church Update", 
            body: message 
          });
        } else if (ch === "sms" && user.phone) {
          // Fallback for SMS if provider is termii, otherwise skip as twilio is removed
          if (process.env.SMS_PROVIDER === "termii" && process.env.TERMII_API_KEY) {
            results.sms = await sendTermiiSMS(normalisePhone(user.phone), message);
            console.log(`[SMS/Termii] Sent to ${user.phone}`);
          } else {
            console.warn(`[SMS] Twilio removed and Termii not configured — skipping.`);
            results.sms = { skipped: true, reason: "Twilio removed" };
          }
        }
      } catch (err) {
        console.error(`[${ch}] Failed for ${user.email || user.phone}:`, err.message);
        results[ch] = { error: err.message };
      }
    })
  );

  return results;
}

// ─── SEND BULK ────────────────────────────────────────────────────────────────
async function sendBulk({ users, subject, message, channels }) {
  console.log(`[Bulk] Sending to ${users.length} users via [${channels.join(", ")}]`);
  const results = await Promise.allSettled(
    users.map((user) => sendViaChannels({ user, subject, message, channels }))
  );
  const success = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`[Bulk] Done. Success: ${success}, Failed: ${failed}`);
  return { success, failed, total: users.length };
}

// ─── WELCOME MESSAGE TEMPLATE ─────────────────────────────────────────────────
function welcomeMessage(name) {
  const church = process.env.CHURCH_NAME || "our church";
  return `Welcome to ${church}, ${name}! 🙏\n\nWe're so glad you joined us today. Our team will be in touch with you soon.\n\nIf you have any questions, feel free to reach us at ${process.env.CHURCH_PHONE || ""}.\n\nGod bless you! ✨`;
}

// ─── REMINDER MESSAGE TEMPLATE ────────────────────────────────────────────────
function sundayReminderMessage(name) {
  const church = process.env.CHURCH_NAME || "our church";
  const time = process.env.SUNDAY_SERVICE_TIME || "9:00 AM";
  return `🙏 Hi ${name || "Friend"},\n\nJust a reminder that Sunday Service is tomorrow at ${time}.\n\nWe look forward to worshipping with you at ${church}!\n\nGod bless you. 🌟`;
}

function wednesdayReminderMessage(name) {
  const church = process.env.CHURCH_NAME || "our church";
  const time = process.env.WEDNESDAY_SERVICE_TIME || "6:00 PM";
  return `🙏 Hi ${name || "Friend"},\n\nJust a reminder that Wednesday Service is tomorrow at ${time}.\n\nWe look forward to seeing you at ${church}!\n\nGod bless you. 🌟`;
}

module.exports = {
  sendEmail,
  sendPushNotification,
  sendViaChannels,
  sendBulk,
  welcomeMessage,
  sundayReminderMessage,
  wednesdayReminderMessage,
  normalisePhone,
};
