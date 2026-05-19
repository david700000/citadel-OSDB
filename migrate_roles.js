require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const Session = require('./src/models/Session');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    // Update Admins
    const adminRes = await Admin.updateMany(
      { role: 'financial_admin' },
      { $set: { role: 'finance_admin' } }
    );
    console.log(`Updated ${adminRes.modifiedCount} Admins from financial_admin to finance_admin.`);

    // Update Sessions
    const sessionRes = await Session.updateMany(
      { role: 'financial_admin' },
      { $set: { role: 'finance_admin' } }
    );
    console.log(`Updated ${sessionRes.modifiedCount} Sessions from financial_admin to finance_admin.`);

    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
