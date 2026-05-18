const mongoose = require('mongoose');

const FormFieldSchema = new mongoose.Schema({
    form_type: { 
        type: String, 
        required: true, 
        enum: ['first_timer', 'member_worker'] 
    },
    field_key: { type: String, required: true },
    label: { type: String, required: true },
    type: { 
        type: String, 
        required: true, 
        enum: ['text', 'dropdown', 'date', 'number', 'file'] 
    },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    worker_only: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    sort_order: { type: Number, default: 0 }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

FormFieldSchema.index({ form_type: 1, field_key: 1 }, { unique: true });

module.exports = mongoose.model('FormField', FormFieldSchema);
