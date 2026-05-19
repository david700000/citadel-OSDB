const mongoose = require('mongoose');

const FinancialLogSchema = new mongoose.Schema({
    type: { type: String, required: true, enum: ['income', 'expense'] },
    category: { type: String, required: true }, // e.g., 'tithe', 'offering', 'donation', 'salary', 'maintenance', 'rent', 'other'
    amount: { type: Number, required: true },
    description: { type: String },
    date: { type: Date, required: true, default: Date.now },
    logged_by: { type: String, required: true }, // admin id
    logged_by_name: { type: String, required: true }, // admin name
    acknowledgements: [{
        leader_id: { type: String, required: true },
        leader_name: { type: String, required: true },
        acknowledged_at: { type: Date, default: Date.now }
    }]
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('FinancialLog', FinancialLogSchema);
