const mongoose = require('mongoose');

const FinancialSectionSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('FinancialSection', FinancialSectionSchema);
