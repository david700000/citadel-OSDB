// src/db/seed.js
require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    console.log("🌱 Seeding database...");

    // ── Default form fields ──────────────────────────────────────────────────
    await client.query(`
      INSERT INTO form_fields (form_type, field_key, label, type, options, required, worker_only, sort_order)
      VALUES
        ('first_timer','full_name','Full Name','text','[]',true,false,1),
        ('first_timer','email','Email Address','text','[]',true,false,2),
        ('first_timer','phone','Phone Number','text','[]',true,false,3),
        ('first_timer','how_heard','How did you hear about us?','dropdown','["Friend","Social Media","Walk-in","Online Search"]',false,false,4),
        ('member_worker','full_name','Full Name','text','[]',true,false,1),
        ('member_worker','email','Email Address','text','[]',true,false,2),
        ('member_worker','phone','Phone Number','text','[]',true,false,3),
        ('member_worker','role_type','I am a','dropdown','["Member","Worker"]',true,false,4),
        ('member_worker','department','Department','dropdown','["Media","Ushering","Security","Choir"]',true,true,5)
      ON CONFLICT (form_type, field_key) DO NOTHING;
    `);

    // ── Default reminders ───────────────────────────────────────────────────
    const sundayMsg = `🙏 Reminder: Join us tomorrow for Sunday Service at ${process.env.SUNDAY_SERVICE_TIME || "9:00 AM"}. We look forward to worshipping with you at ${process.env.CHURCH_NAME || "our church"}! God bless you.`;
    const wednesdayMsg = `🙏 Reminder: Join us tomorrow for Wednesday Service at ${process.env.WEDNESDAY_SERVICE_TIME || "6:00 PM"}. We look forward to seeing you at ${process.env.CHURCH_NAME || "our church"}! God bless you.`;

    await client.query(`
      INSERT INTO reminders (name, day, time, targets, message, channels, active)
      VALUES
        ('Sunday Service Reminder', 'saturday', '10:00:00', ARRAY['first_timer','member'], $1, ARRAY['whatsapp','email','sms'], true),
        ('Wednesday Service Reminder', 'tuesday', '18:00:00', ARRAY['first_timer','member'], $2, ARRAY['whatsapp','email','sms'], true)
      ON CONFLICT DO NOTHING;
    `, [sundayMsg, wednesdayMsg]);

    console.log("✅ Seed complete.");
  } catch (err) {
    console.error("❌ Seed failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
