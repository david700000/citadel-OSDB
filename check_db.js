require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./src/models/Message');
const Attendance = require('./src/models/Attendance');

async function checkDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    const messages = await Message.find().sort({ created_at: -1 }).limit(2);
    console.log("Latest messages:", messages);
    
    const attendance = await Attendance.find().sort({ date: -1 }).limit(2);
    console.log("Latest attendance:", attendance);
    process.exit(0);
}
checkDB();
