require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const bcrypt = require('bcryptjs');

async function testAuth() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Generate a test admin
    const email = `test_invite_${Date.now()}@example.com`;
    const tempPassword = Math.random().toString(36).substring(2, 10);
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    
    await Admin.create({
      email: email,
      password_hash: passwordHash,
      name: 'Test',
      role: 'media_admin',
      status: 'active',
      must_change_password: true
    });
    
    console.log(`Created admin: ${email} with password: ${tempPassword}`);
    
    // Test login via HTTP request to the running server
    try {
        const res = await fetch('http://localhost:4000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: tempPassword })
        });
        const data = await res.json();
        console.log("Login HTTP Response:", res.status, data);
        
        // Also test bcrypt directly
        const adminFromDb = await Admin.findOne({ email });
        const valid = await bcrypt.compare(tempPassword, adminFromDb.password_hash);
        console.log("Direct bcrypt check:", valid);
    } catch(err) {
        console.error("HTTP Login failed:", err);
    }
    
    process.exit(0);
}

testAuth();
