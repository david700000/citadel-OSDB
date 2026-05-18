const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    name: { type: String },
    role: { 
        type: String, 
        required: true, 
        enum: ['media_admin', 'usher_admin', 'leader'] 
    },
    status: { 
        type: String, 
        default: 'active', 
        enum: ['invited', 'active', 'disabled'] 
    },
    must_change_password: { type: Boolean, default: false },
    created_by: { type: String, default: 'cms' }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('Admin', AdminSchema);
