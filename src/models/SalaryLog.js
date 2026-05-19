const mongoose = require('mongoose');

const SalaryLogSchema = new mongoose.Schema({
    staff_name: { type: String, required: true },
    role: { type: String, required: true },
    month: { type: String, required: true }, // e.g. "May 2026"
    amount: { type: Number, required: true },
    status: { type: String, required: true, enum: ['paid', 'pending'], default: 'pending' },
    payment_date: { type: Date },
    logged_by: { type: String, required: true },
    logged_by_name: { type: String, required: true },
    acknowledgements: [{
        leader_id: { type: String, required: true },
        leader_name: { type: String, required: true },
        acknowledged_at: { type: Date, default: Date.now }
    }]
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('SalaryLog', SalaryLogSchema);
