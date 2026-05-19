const mongoose = require('mongoose');

const FinancialLogSchema = new mongoose.Schema({
    type: { type: String, required: true, enum: ['income', 'expense'] },
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String },
    date: { type: Date, required: true, default: Date.now },
    logged_by: { type: String, required: true },
    logged_by_name: { type: String, required: true },
    acknowledgements: [{
        leader_id: { type: String, required: true },
        leader_name: { type: String, required: true },
        acknowledged_at: { type: Date, default: Date.now }
    }],
    // Soft-delete fields (records are NEVER hard-deleted)
    voided: { type: Boolean, default: false },
    void_reason: { type: String, default: null },
    voided_by: { type: String, default: null },
    voided_by_name: { type: String, default: null },
    voided_at: { type: Date, default: null }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('FinancialLog', FinancialLogSchema);
