const mongoose = require('mongoose');

/**
 * LoginAudit — records every login attempt (success or failure)
 * Used for the CMS Root "Print Reports" → Login Activity log
 */
const LoginAuditSchema = new mongoose.Schema({
    email: { type: String, required: true },
    name: { type: String, default: null },
    role: { type: String, default: null },
    success: { type: Boolean, required: true },
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
    failure_reason: { type: String, default: null } // e.g. "wrong password", "account disabled"
}, {
    timestamps: { createdAt: 'logged_at', updatedAt: false }
});

module.exports = mongoose.model('LoginAudit', LoginAuditSchema);
