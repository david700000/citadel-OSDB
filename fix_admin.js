require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const bcrypt = require('bcryptjs');

async function fixAdmin() {
    await mongoose.connect(process.env.MONGODB_URI);
    const admins = await Admin.find({ role: { $ne: 'cms' } }).sort({ created_at: -1 }).limit(1);
    if (admins.length > 0) {
        const admin = admins[0];
        console.log("Found admin:", admin.email);
        
        const newPass = "Admin123!";
        admin.password_hash = await bcrypt.hash(newPass, 12);
        await admin.save();
        
        console.log(`Password reset to: ${newPass}`);
    } else {
        console.log("No admins found.");
    }
    process.exit(0);
}
fixAdmin();
