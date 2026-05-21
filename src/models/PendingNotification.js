const mongoose = require('mongoose');

const PendingNotificationSchema = new mongoose.Schema({
    type: { type: String, required: true, enum: ['financial_update'], default: 'financial_update' },
    status: { type: String, required: true, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    send_at: { type: Date, required: true },
    error: { type: String, default: null }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Add indexes for efficient querying in cron jobs
PendingNotificationSchema.index({ type: 1, status: 1 });
PendingNotificationSchema.index({ status: 1, send_at: 1 });

module.exports = mongoose.model('PendingNotification', PendingNotificationSchema);
