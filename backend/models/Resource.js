const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: { type: String, default: 'Fichier' },
  url: { type: String, required: true },
  type: { type: String, enum: ['link', 'upload'], default: 'link' },
});
const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 180 },
  description: { type: String, required: true },
  category: { type: String, required: true }, // now dynamic, no enum
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  images: [{ type: String }],
  thumbnail: { type: String, default: null },
  files: [fileSchema],
  videoUrl: { type: String, default: null },
  resourceType: { type: String, enum: ['free', 'paid'], default: 'free' },
  vipOnly: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  purchaseUrl: { type: String, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason: { type: String, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  views: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  reviews: [reviewSchema],
  comments: [commentSchema],
  averageRating: { type: Number, default: 0 },
  tags: [{ type: String }],
}, { timestamps: true });

resourceSchema.methods.calculateAverageRating = function () {
  if (!this.reviews.length) return 0;
  return Math.round((this.reviews.reduce((a, r) => a + r.rating, 0) / this.reviews.length) * 10) / 10;
};

module.exports = mongoose.model('Resource', resourceSchema);
