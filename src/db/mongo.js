const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.DATABASE_URL; // fallback if user hasn't updated .env yet
        if (!uri) {
            throw new Error('MONGODB_URI not found in environment variables');
        }
        
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ Connected to MongoDB Atlas');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.warn('⚠️  Server starting without Database. Some features will be unavailable.');
    }
};

module.exports = connectDB;
