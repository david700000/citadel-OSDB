require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');

async function removeHardcodedLeader() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Remove any hardcoded leader - user will invite via the proper flow
    const result = await Admin.deleteMany({ role: 'leader' });
    console.log(`Removed ${result.deletedCount} leader account(s).`);
    
    const remaining = await Admin.find({});
    console.log("\nRemaining admins:");
    remaining.forEach(a => console.log(`  ${a.email} - ${a.role} - ${a.status}`));
    
    process.exit(0);
}
removeHardcodedLeader();
