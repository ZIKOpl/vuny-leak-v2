const mongoose = require('mongoose');

const vipMediaSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  url: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], default: 'image' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('VipMedia', vipMediaSchema);
