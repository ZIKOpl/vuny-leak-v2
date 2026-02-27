const express = require('express');
const router = express.Router();
const Badge = require('../models/Badge');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { createLog } = require('../utils/logger');

// GET /api/badges — all active badges (public)
router.get('/', async (req, res) => {
  try {
    const badges = await Badge.find({ active: true }).sort({ order: 1, createdAt: 1 });
    res.json(badges);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/badges/all — all badges including inactive (admin)
router.get('/all', protect, adminOnly, async (req, res) => {
  try {
    const badges = await Badge.find().sort({ order: 1, createdAt: 1 });
    res.json(badges);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/badges/user/:id — compute badges for a user
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('role createdAt discordId disabledBadges _id');
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const badges = await Badge.find({ active: true }).sort({ order: 1 });

    // Count users registered before this one
    const registerOrder = await User.countDocuments({ createdAt: { $lte: user.createdAt } });

    // Role badges
    const roleBadges = badges.filter(b => b.type === 'role' && b.role === user.role);

    // auto_first_n: best qualifying position badge
    const positionBadges = badges.filter(b => b.type === 'auto_first_n' && b.threshold);
    const qualifyingPositionBadges = positionBadges
      .filter(b => registerOrder <= b.threshold)
      .sort((a, b) => a.threshold - b.threshold);
    const bestPositionBadge = qualifyingPositionBadges.length > 0 ? [qualifyingPositionBadges[0]] : [];

    // auto_top5: check if this user has any resource in top 5
    const top5Badges = badges.filter(b => b.type === 'auto_top5');
    let top5Earned = [];
    if (top5Badges.length > 0) {
      const Resource = require('../models/Resource');
      const top5 = await Resource.find({ status: 'approved', vipOnly: { $ne: true } })
        .sort({ downloads: -1 })
        .limit(5)
        .select('author');
      const isInTop5 = top5.some(r => r.author?.toString() === user._id.toString());
      if (isInTop5) top5Earned = top5Badges;
    }

    let earned = [...roleBadges, ...bestPositionBadge, ...top5Earned];

    // Filter out disabled badges (user has chosen to hide them)
    const disabled = user.disabledBadges || [];
    if (disabled.length > 0) {
      earned = earned.filter(b => !disabled.includes(b.key));
    }

    res.json(earned);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/badges/user/:id/all — all earned badges (with visibility flag), for settings
router.get('/user/:id/all', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('role createdAt _id disabledBadges');
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const badges = await Badge.find({ active: true }).sort({ order: 1 });
    const registerOrder = await User.countDocuments({ createdAt: { $lte: user.createdAt } });
    const roleBadges = badges.filter(b => b.type === 'role' && b.role === user.role);
    const positionBadges = badges.filter(b => b.type === 'auto_first_n' && b.threshold);
    const qualifyingPositionBadges = positionBadges.filter(b => registerOrder <= b.threshold).sort((a, b) => a.threshold - b.threshold);
    const bestPositionBadge = qualifyingPositionBadges.length > 0 ? [qualifyingPositionBadges[0]] : [];
    const top5Badges = badges.filter(b => b.type === 'auto_top5');
    let top5Earned = [];
    if (top5Badges.length > 0) {
      const Resource = require('../models/Resource');
      const top5 = await Resource.find({ status: 'approved', vipOnly: { $ne: true } }).sort({ downloads: -1 }).limit(5).select('author');
      if (top5.some(r => r.author?.toString() === user._id.toString())) top5Earned = top5Badges;
    }
    const earned = [...roleBadges, ...bestPositionBadge, ...top5Earned];
    const disabled = user.disabledBadges || [];
    res.json(earned.map(b => ({ ...b.toObject(), visible: !disabled.includes(b.key) })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/badges — create badge (admin)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { key, name, description, emoji, type, threshold, role, color, order } = req.body;
    if (!key?.trim() || !name?.trim()) return res.status(400).json({ message: 'Clé et nom requis' });
    const badge = await Badge.create({ key: key.trim(), name: name.trim(), description, emoji: emoji || '🏅', type: type || 'manual', threshold: threshold || null, role: role || null, color: color || '#e74c3c', order: order || 0 });
    await createLog('badge_created', `Badge créé — "${name}"`, req.user, name);
    res.status(201).json(badge);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Cette clé de badge existe déjà' });
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/badges/:id — update badge (admin)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const badge = await Badge.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!badge) return res.status(404).json({ message: 'Badge introuvable' });
    res.json(badge);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/badges/:id — delete badge (admin)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const badge = await Badge.findByIdAndDelete(req.params.id);
    if (!badge) return res.status(404).json({ message: 'Badge introuvable' });
    await createLog('badge_deleted', `Badge supprimé — "${badge.name}"`, req.user, badge.name);
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});


// PATCH /api/badges/user/me/disabled — toggle badge visibility
router.patch('/user/me/disabled', protect, async (req, res) => {
  try {
    const { key, visible } = req.body;
    if (!key) return res.status(400).json({ message: 'Key required' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    if (!user.disabledBadges) user.disabledBadges = [];
    if (visible) {
      user.disabledBadges = user.disabledBadges.filter(k => k !== key);
    } else {
      if (!user.disabledBadges.includes(key)) user.disabledBadges.push(key);
    }
    await user.save();
    res.json({ disabledBadges: user.disabledBadges });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
