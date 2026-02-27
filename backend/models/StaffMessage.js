const mongoose = require('mongoose');

const staffMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  imageUrl: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('StaffMessage', staffMessageSchema);
