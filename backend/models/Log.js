const mongoose = require('mongoose');
const logSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'resource_approved','resource_rejected','resource_deleted','resource_submitted',
      'user_banned','user_unbanned','user_restricted','user_promoted',
      'category_created','category_deleted','category_updated',
      'admin_login','webhook_updated',
      'vip_granted','vip_revoked','vip_media_added','vip_media_deleted',
      // Shop
      'shop_product_created','shop_product_deleted','shop_product_updated',
      'shop_category_created','shop_category_deleted','shop_category_updated',
      'shop_ticket_created','shop_ticket_sold','shop_ticket_closed',
      // Support
      'support_ticket_created','support_ticket_closed',
      // Badges
      'badge_created','badge_deleted',
    ],
    required: true
  },
  message: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: { type: String, default: 'Système' },
  target: { type: String, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
module.exports = mongoose.model('Log', logSchema);
