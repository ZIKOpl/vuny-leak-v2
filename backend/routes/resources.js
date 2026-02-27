const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');
const Notification = require('../models/Notification');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/resources - List approved resources
router.get('/', async (req, res) => {
  try {
    const { category, search, sort = 'createdAt', page = 1, limit = 12, vipOnly } = req.query;
    const query = { status: 'approved' };
    if (category) query.category = category;
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
    // VIP filter: if vipOnly=true show only VIP resources, otherwise hide VIP resources
    if (vipOnly === 'true') {
      query.vipOnly = true;
    } else {
      query.vipOnly = { $ne: true };
    }

    const sortMap = {
      createdAt: { createdAt: -1 },
      views: { views: -1 },
      downloads: { downloads: -1 },
      rating: { averageRating: -1 },
    };

    const total = await Resource.countDocuments(query);
    const resources = await Resource.find(query)
      .sort(sortMap[sort] || { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'username avatar discordId');

    res.json({ resources, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resources/top5
router.get('/top5', async (req, res) => {
  try {
    const resources = await Resource.find({ status: 'approved', vipOnly: { $ne: true } })
      .sort({ downloads: -1 })
      .limit(5)
      .populate('author', 'username avatar');
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resources/stats
router.get('/stats', async (req, res) => {
  try {
    const matchFilter = { status: 'approved' };
    if (req.query.vipOnly === 'true') {
      matchFilter.vipOnly = true;
    } else {
      matchFilter.vipOnly = { $ne: true };
    }
    const byCategory = await Resource.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const total = await Resource.countDocuments(matchFilter);
    res.json({ byCategory, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resources/:id
router.get('/:id', async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('author', 'username avatar discordId role')
      .populate('comments.user', 'username avatar')
      .populate('reviews.user', 'username avatar');
    if (!resource) return res.status(404).json({ message: 'Ressource non trouvée' });
    if (resource.status !== 'approved') {
      return res.status(403).json({ message: 'Ressource non publiée' });
    }
    resource.views += 1;
    await resource.save();
    res.json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/resources - Submit a resource
router.post('/', protect, async (req, res) => {
  try {
    if (!req.user.canUpload) return res.status(403).json({ message: 'Vous ne pouvez pas publier de ressources' });
    const { title, description, category, images, thumbnail, files, videoUrl, resourceType, price, purchaseUrl, tags, vipOnly } = req.body;
    const { roleLevel } = require('../middleware/auth');
    const isAdmin = roleLevel(req.user.role) >= 1;
    const resource = await Resource.create({
      title, description, category,
      author: req.user._id,
      images: images || [],
      thumbnail: thumbnail || (images && images[0]) || null,
      files: files || [],
      videoUrl, resourceType,
      price: resourceType === 'paid' ? price : 0,
      purchaseUrl: resourceType === 'paid' ? purchaseUrl : null,
      tags: tags || [],
      vipOnly: isAdmin ? (vipOnly === true || vipOnly === 'true') : false,
      status: isAdmin ? 'approved' : 'pending',
    });
    req.user.totalPosts += 1;
    await req.user.save();
    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/resources/:id/download
router.post('/:id/download', protect, async (req, res) => {
  try {
    if (!req.user.canDownload) return res.status(403).json({ message: 'Vous ne pouvez pas télécharger' });
    const resource = await Resource.findById(req.params.id);
    if (!resource || resource.status !== 'approved') return res.status(404).json({ message: 'Ressource non trouvée' });
    resource.downloads += 1;
    await resource.save();
    req.user.totalDownloads += 1;
    await req.user.save();
    res.json({ files: resource.files });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/resources/:id/review
router.post('/:id/review', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const resource = await Resource.findById(req.params.id);
    if (!resource || resource.status !== 'approved') return res.status(404).json({ message: 'Ressource non trouvée' });
    const existing = resource.reviews.find(r => r.user.toString() === req.user._id.toString());
    if (existing) return res.status(400).json({ message: 'Vous avez déjà noté cette ressource' });
    resource.reviews.push({ user: req.user._id, rating, comment });
    resource.averageRating = resource.calculateAverageRating();
    await resource.save();
    res.json({ message: 'Avis ajouté', averageRating: resource.averageRating });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/resources/:id/comment
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { content } = req.body;
    const resource = await Resource.findById(req.params.id);
    if (!resource || resource.status !== 'approved') return res.status(404).json({ message: 'Ressource non trouvée' });
    resource.comments.push({ user: req.user._id, content });
    await resource.save();
    const populated = await Resource.findById(req.params.id).populate('comments.user', 'username avatar');
    res.json(populated.comments[populated.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/resources/:id/comment/:commentId (author or admin)
router.delete('/:id/comment/:commentId', protect, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Ressource non trouvée' });
    const comment = resource.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Commentaire non trouvé' });
    if (comment.user.toString() !== req.user._id.toString() && req.user.role === 'user') {
      return res.status(403).json({ message: 'Non autorisé' });
    }
    comment.deleteOne();
    await resource.save();
    res.json({ message: 'Commentaire supprimé' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
