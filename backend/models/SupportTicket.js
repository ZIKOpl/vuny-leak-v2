const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, default: '' },
  imageUrl:  { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const supportTicketSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true, maxlength: 200 },
  description: { type: String, required: true },
  status:      { type: String, enum: ['open', 'closed'], default: 'open' },
  closedAt:    { type: Date, default: null },
  closedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closeReason: { type: String, default: null },
  messages:    [messageSchema],
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
