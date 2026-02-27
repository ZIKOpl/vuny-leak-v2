const mongoose = require('mongoose');

const shopCategorySchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true },
  icon:        { type: String, default: '📦' },
  description: { type: String, default: '' },
  order:       { type: Number, default: 0 },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('ShopCategory', shopCategorySchema);
