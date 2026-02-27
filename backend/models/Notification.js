const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['resource_approved', 'resource_rejected', 'new_comment', 'new_review', 'ban', 'unban', 'admin_message'],
    required: true
  },
  message: { type: String, required: true },
  resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', default: null },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', notificationSchema);
