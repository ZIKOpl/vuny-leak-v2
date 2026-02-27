const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Resource = require('../models/Resource');
const Notification = require('../models/Notification');
const { protect, roleLevel } = require('../middleware/auth');

// GET /api/users/:id/profile
router.get('/:id/profile', async (req, res) => {
  try {
    // Optional auth: get requesting user from token if provided
    let requestingUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        requestingUser = await User.findById(decoded.id).select('role _id');
      } catch {}
    }

    const user = await User.findById(req.params.id).select('-email');
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    // Determine if requester can see VIP resources
    const requesterRole = requestingUser?.role || 'user';
    const canSeeVip = requesterRole === 'vip' || roleLevel(requesterRole) >= 1;
    const isMe = requestingUser && requestingUser._id.toString() === user._id.toString();

    // Only show VIP resources to VIP/admin or profile owner
    const resourceFilter = { author: user._id, status: 'approved' };
    if (!canSeeVip && !isMe) {
      resourceFilter.vipOnly = { $ne: true };
    }

    const resources = await Resource.find(resourceFilter)
      .sort({ createdAt: -1 })
      .limit(10);

    const userObj = user.toObject();
    userObj.followersCount = (user.followers || []).length;
    userObj.followingCount = (user.following || []).length;
    // Don't expose full follower arrays
    delete userObj.followers;
    delete userObj.following;
    res.json({ user: userObj, resources });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/me/resources
router.get('/me/resources', protect, async (req, res) => {
  try {
    const resources = await Resource.find({ author: req.user._id })
      .sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/me/notifications
router.get('/me/notifications', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/users/me/notifications — supprimer toutes les notifications
router.delete('/me/notifications', protect, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res.json({ message: 'Notifications supprimées' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/users/me/notifications/read-all
router.patch('/me/notifications/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: 'Notifications marquées comme lues' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/users/me/profile
router.patch('/me/profile', protect, async (req, res) => {
  try {
    const { bio } = req.body;
    req.user.bio = bio || '';
    await req.user.save();
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── FOLLOW SYSTEM ──────────────────────────────────────────────

// Get follow status
router.get('/:id/follow-status', protect, async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select('followers following');
    if (!target) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const isFollowing = target.followers?.includes(req.user._id) || false;
    res.json({ isFollowing });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Follow
router.post('/:id/follow', protect, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'Impossible de se suivre soi-même' });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const me = await User.findById(req.user._id);
    if (!target.followers) target.followers = [];
    if (!me.following) me.following = [];
    if (!target.followers.includes(req.user._id)) {
      target.followers.push(req.user._id);
      me.following.push(target._id);
      await target.save();
      await me.save();
      // Notification
      try {
        const Notification = require('../models/Notification');
        await Notification.create({ user: target._id, message: `${me.username} s'est abonné à votre profil.` });
      } catch {}
    }
    res.json({ followersCount: target.followers.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Unfollow
router.delete('/:id/follow', protect, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const me = await User.findById(req.user._id);
    target.followers = (target.followers || []).filter(id => id.toString() !== req.user._id.toString());
    me.following = (me.following || []).filter(id => id.toString() !== target._id.toString());
    await target.save();
    await me.save();
    res.json({ followersCount: target.followers.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
