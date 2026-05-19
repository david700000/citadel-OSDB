require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const bcrypt = require('bcryptjs');

async function fixAdmin() {
    await mongoose.connect(process.env.MONGODB_URI);
    const admins = await Admin.find({ role: { $ne: 'cms' } });
    for (const admin of admins) {
        console.log("Resetting admin:", admin.email);
        const newPass = "Admin123!";
        admin.password_hash = await bcrypt.hash(newPass, 12);
        await admin.save();
        console.log(`Password reset for ${admin.email} to: ${newPass}`);
    }
    process.exit(0);
}
fixAdmin();
