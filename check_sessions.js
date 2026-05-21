const mongoose = require('mongoose');
require('dotenv').config();
const Session = require('./src/models/Session');

async function run() {
  console.log("Connecting to", process.env.MONGODB_URI);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected!");
  const sessions = await Session.find().sort({ created_at: -1 }).limit(10);
  console.log("Latest sessions in DB:", JSON.stringify(sessions, null, 2));
  mongoose.connection.close();
}

run().catch(console.error);
