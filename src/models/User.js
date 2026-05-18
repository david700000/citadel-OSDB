const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    full_name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String },
    tag: { 
        type: String, 
        required: true, 
        enum: ['first_timer', 'member', 'worker'] 
    },
    department: { type: String },
    fcm_tokens: [{ type: String }],
    extra_fields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

// Index for frequent lookups by tag
UserSchema.index({ tag: 1 });

module.exports = mongoose.model('User', UserSchema);
