require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function checkUsers() {
    await mongoose.connect(process.env.MONGODB_URI);
    const users = await User.find().sort({ created_at: -1 }).limit(5);
    console.log("Latest users:", users);
    process.exit(0);
}
checkUsers();
