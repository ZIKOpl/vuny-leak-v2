const mongoose = require('mongoose');

const shopProductSchema = new mongoose.Schema({
  title:       { type: String, required: true, maxlength: 180 },
  description: { type: String, required: true },
  category:    { type: String, required: true },
  thumbnail:   { type: String, default: null },
  price:       { type: Number, required: true, min: 0 },
  quantity:    { type: Number, required: true, default: 1, min: 0 },
  featured:    { type: Boolean, default: false },
  active:      { type: Boolean, default: true },
  author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt:   { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('ShopProduct', shopProductSchema);
