const mongoose = require('mongoose');
const FormField = require('../models/FormField');
const Reminder = require('../models/Reminder');
require('dotenv').config();

const connectDB = require('./mongo');

async function seed() {
    await connectDB();
    console.log("🌱 Seeding MongoDB...");

    try {
        // ── Default form fields ──────────────────────────────────────────────────
        const fields = [
            { form_type: 'first_timer', field_key: 'full_name', label: 'Full Name', type: 'text', options: [], required: true, worker_only: false, sort_order: 1 },
            { form_type: 'first_timer', field_key: 'email', label: 'Email Address', type: 'text', options: [], required: true, worker_only: false, sort_order: 2 },
            { form_type: 'first_timer', field_key: 'phone', label: 'Phone Number', type: 'text', options: [], required: true, worker_only: false, sort_order: 3 },
            { form_type: 'first_timer', field_key: 'how_heard', label: 'How did you hear about us?', type: 'dropdown', options: ["Friend", "Social Media", "Walk-in", "Online Search"], required: false, worker_only: false, sort_order: 4 },
            { form_type: 'member_worker', field_key: 'full_name', label: 'Full Name', type: 'text', options: [], required: true, worker_only: false, sort_order: 1 },
            { form_type: 'member_worker', field_key: 'email', label: 'Email Address', type: 'text', options: [], required: true, worker_only: false, sort_order: 2 },
            { form_type: 'member_worker', field_key: 'phone', label: 'Phone Number', type: 'text', options: [], required: true, worker_only: false, sort_order: 3 },
            { form_type: 'member_worker', field_key: 'role_type', label: 'I am a', type: 'dropdown', options: ["Member", "Worker"], required: true, worker_only: false, sort_order: 4 },
            { form_type: 'member_worker', field_key: 'department', label: 'Department', type: 'dropdown', options: ["Media", "Ushering", "Security", "Choir"], required: true, worker_only: true, sort_order: 5 }
        ];

        for (const f of fields) {
            await FormField.findOneAndUpdate(
                { form_type: f.form_type, field_key: f.field_key },
                f,
                { upsert: true }
            );
        }
        console.log("✅ Form fields seeded");

        // ── Default reminders ───────────────────────────────────────────────────
        const sundayMsg = `🙏 Reminder: Join us tomorrow for Sunday Service at ${process.env.SUNDAY_SERVICE_TIME || "9:00 AM"}. We look forward to worshipping with you at ${process.env.CHURCH_NAME || "our church"}! God bless you.`;
        const wednesdayMsg = `🙏 Reminder: Join us tomorrow for Wednesday Service at ${process.env.WEDNESDAY_SERVICE_TIME || "6:00 PM"}. We look forward to seeing you at ${process.env.CHURCH_NAME || "our church"}! God bless you.`;

        const reminders = [
            { name: 'Sunday Service Reminder', day: 'saturday', time: '10:00', targets: ['first_timer', 'member'], message: sundayMsg, channels: ['whatsapp', 'email', 'sms'], active: true },
            { name: 'Wednesday Service Reminder', day: 'tuesday', time: '18:00', targets: ['first_timer', 'member'], message: wednesdayMsg, channels: ['whatsapp', 'email', 'sms'], active: true }
        ];

        for (const r of reminders) {
            await Reminder.findOneAndUpdate(
                { name: r.name },
                r,
                { upsert: true }
            );
        }
        console.log("✅ Reminders seeded");

        console.log("🏁 MongoDB Seed complete.");
    } catch (err) {
        console.error("❌ Seed failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

seed();
