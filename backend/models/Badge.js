const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  key:         { type: String, required: true, unique: true, trim: true },
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  emoji:       { type: String, default: '🏅' },
  type: {
    type: String,
    enum: ['manual', 'auto_first_n', 'role', 'auto_top5'],
    default: 'manual'
  },
  // For auto_first_n: auto-grant to users with registerOrder <= threshold
  threshold:   { type: Number, default: null },
  // For role: auto-grant based on role
  role:        { type: String, default: null },
  color:       { type: String, default: '#e74c3c' },
  order:       { type: Number, default: 0 },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Badge', badgeSchema);
