const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
    user_id: { type: String, required: true }, // admin id or 'cms'
    role: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    expires_at: { type: Date, required: true },
    user_agent: { type: String },
    ip_address: { type: String }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

// Automatically expire documents (TTL index)
SessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', SessionSchema);
