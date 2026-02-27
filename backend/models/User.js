const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  discriminator: { type: String, default: '0' },
  avatar: { type: String, default: null },
  banner: { type: String, default: null },
  email: { type: String, default: null },
  bio: { type: String, default: '' },
  role: {
    type: String,
    enum: ['user', 'vip', 'admin', 'owner', 'developer'],
    default: 'user'
  },
  isBanned: { type: Boolean, default: false },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  banReason: { type: String, default: null },
  bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  bannedAt: { type: Date, default: null },
  canUpload: { type: Boolean, default: true },
  canDownload: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  totalDownloads: { type: Number, default: 0 },
  totalPosts: { type: Number, default: 0 },
  vipGrantedAt: { type: Date, default: null },
  vipGrantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  disabledBadges: [{ type: String }],   // badge keys the user has hidden
  prefs: { type: Object, default: {} }, // notification prefs
}, { timestamps: true });

// Auto-migrate legacy roles on every find
userSchema.post(['find', 'findOne', 'findOneAndUpdate'], function(docs) {
  const migrate = (doc) => {
    if (!doc) return;
    if (doc.role === 'superadmin') doc.role = 'developer';
  };
  if (Array.isArray(docs)) docs.forEach(migrate);
  else migrate(docs);
});

module.exports = mongoose.model('User', userSchema);
