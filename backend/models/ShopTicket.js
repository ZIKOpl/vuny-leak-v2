const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, default: '' },
  imageUrl:  { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const shopTicketSchema = new mongoose.Schema({
  buyer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
  quantity:  { type: Number, required: true, default: 1 },
  totalPrice:{ type: Number, required: true },
  status:    { type: String, enum: ['open', 'sold', 'closed'], default: 'open' },
  closeReason: { type: String, default: null },
  messages:  [messageSchema],
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('ShopTicket', shopTicketSchema);
