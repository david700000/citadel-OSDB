const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event_name: { type: String, required: true },
    status: { 
        type: String, 
        required: true, 
        enum: ['present', 'absent'] 
    },
    marked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    date: { type: Date, required: true }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

// Compound unique index to prevent duplicate marking
AttendanceSchema.index({ user_id: 1, date: 1, event_name: 1 }, { unique: true });
AttendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
