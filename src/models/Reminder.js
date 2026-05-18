const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    day: { type: String, required: true },
    time: { type: String, required: true },
    targets: [{ type: String }],
    message: { type: String, required: true },
    channels: [{ type: String }],
    active: { type: Boolean, default: true },
    last_sent_at: { type: Date }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.model('Reminder', ReminderSchema);
