const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
    email: { type: String, required: true },
    role: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    status: { 
        type: String, 
        default: 'pending', 
        enum: ['pending', 'accepted', 'expired'] 
    },
    expires_at: { type: Date, required: true }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('Invite', InviteSchema);
