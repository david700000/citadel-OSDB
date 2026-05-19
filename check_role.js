require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');

async function checkAdmins() {
    await mongoose.connect(process.env.MONGODB_URI);
    const admins = await Admin.find({});
    console.log("All Admins:");
    admins.forEach(a => {
        console.log(`Email: ${a.email}, Role: ${a.role}, Status: ${a.status}`);
    });
    process.exit(0);
}
checkAdmins();
