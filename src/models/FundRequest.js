const mongoose = require('mongoose');

const FundRequestSchema = new mongoose.Schema({
    requester_id: { type: String, required: true },
    requester_name: { type: String, required: true },
    requester_role: { type: String, required: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    department: { type: String, required: true }, // custom section / department
    status: { type: String, required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    resolved_by: { type: String },
    resolved_by_name: { type: String },
    resolved_at: { type: Date },
    rejection_reason: { type: String }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('FundRequest', FundRequestSchema);
