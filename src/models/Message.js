const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender_id: { type: String },
    sender_name: { type: String },
    target_type: { 
        type: String, 
        required: true, 
        enum: ['bulk', 'individual', 'reminder', 'welcome'] 
    },
    target_group: { type: String },
    target_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    target_user_name: { type: String },
    channels: [{ type: String }],
    message: { type: String, required: true },
    type: { type: String, default: 'manual' },
    status: { type: String, default: 'sent' }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

MessageSchema.index({ sender_id: 1 });
MessageSchema.index({ target_user_id: 1 });

module.exports = mongoose.model('Message', MessageSchema);
