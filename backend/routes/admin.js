const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Resource = require('../models/Resource');
const Notification = require('../models/Notification');
const { protect, adminOnly, ownerOnly, developerOnly, roleLevel } = require('../middleware/auth');
const { createLog } = require('../utils/logger');

// GET /api/admin/stats - PUBLIC
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalResources = await Resource.countDocuments({ status: 'approved' });
    const pendingResources = await Resource.countDocuments({ status: 'pending' });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const totalDownloads = await Resource.aggregate([{ $group: { _id: null, total: { $sum: '$downloads' } } }]);
    const totalViews = await Resource.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
    res.json({ totalUsers, totalResources, pendingResources, bannedUsers,
      totalDownloads: totalDownloads[0]?.total || 0,
      totalViews: totalViews[0]?.total || 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/discord-stats
router.get('/discord-stats', async (req, res) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) return res.status(404).json({ message: 'Non configuré' });

    // Fetch real stats from Discord Widget API (must enable Widget in server settings)
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`);
    if (!response.ok) {
      // Widget disabled or invalid Guild ID — return fallback instead of crashing the frontend
      return res.json({
        guildId,
        memberCount: '—',
        onlineCount: '—',
        widgetDisabled: true,
        message: 'Widget Discord désactivé. Activez-le dans Paramètres du serveur → Widget.'
      });
    }

    const data = await response.json();
    res.json({
      guildId,
      memberCount: data.presence_count ?? '—',   // online count from widget
      onlineCount: data.presence_count ?? '—',
      widgetDisabled: false
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// All routes below require at least admin
router.use(protect, adminOnly);

router.get('/pending', async (req, res) => {
  try {
    const resources = await Resource.find({ status: 'pending' })
      .populate('author', 'username avatar discordId').sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/resources/:id/approve', async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id).populate('author');
    if (!resource) return res.status(404).json({ message: 'Ressource non trouvée' });
    resource.status = 'approved'; resource.reviewedBy = req.user._id; resource.reviewedAt = new Date();
    await resource.save();
    await Notification.create({ user: resource.author._id, type: 'resource_approved',
      message: `Votre ressource "${resource.title}" a été approuvée !`, resource: resource._id });
    await createLog('resource_approved', `Ressource "${resource.title}" approuvée`, req.user, resource.title);
    res.json({ message: 'Approuvée', resource });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/resources/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const resource = await Resource.findById(req.params.id).populate('author');
    if (!resource) return res.status(404).json({ message: 'Ressource non trouvée' });
    resource.status = 'rejected';
    resource.rejectionReason = reason || 'Non conforme';
    resource.reviewedBy = req.user._id; resource.reviewedAt = new Date();
    await resource.save();
    await Notification.create({ user: resource.author._id, type: 'resource_rejected',
      message: `Votre ressource "${resource.title}" a été refusée. Raison: ${resource.rejectionReason}`,
      resource: resource._id });
    await createLog('resource_rejected', `Ressource "${resource.title}" refusée`, req.user, resource.title);
    res.json({ message: 'Refusée', resource });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/resources/:id', async (req, res) => {
  try {
    const resource = await Resource.findByIdAndDelete(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Ressource non trouvée' });
    await createLog('resource_deleted', `Ressource "${resource.title}" supprimée`, req.user, resource.title);
    res.json({ message: 'Supprimée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (search) query.$or = [{ username: { $regex: search, $options: 'i' } }, { discordId: { $regex: search, $options: 'i' } }];
    const total = await User.countDocuments(query);
    const users = await User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ users, total, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/users/:id/ban', async (req, res) => {
  try {
    const { reason, banUpload, banDownload } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    // Can't ban someone with equal or higher role
    if (roleLevel(user.role) >= roleLevel(req.user.role)) {
      return res.status(403).json({ message: 'Impossible de bannir un utilisateur de rang égal ou supérieur' });
    }
    user.isBanned = true; user.banReason = reason || 'Violation des règles';
    user.bannedBy = req.user._id; user.bannedAt = new Date();
    if (banUpload !== undefined) user.canUpload = !banUpload;
    if (banDownload !== undefined) user.canDownload = !banDownload;
    await user.save();
    await Notification.create({ user: user._id, type: 'ban', message: `Votre compte a été banni. Raison: ${user.banReason}` });
    await createLog('user_banned', `${user.username} banni. Raison: ${user.banReason}`, req.user, user.username);
    res.json({ message: 'Banni', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    user.isBanned = false; user.banReason = null; user.bannedBy = null; user.bannedAt = null;
    user.canUpload = true; user.canDownload = true;
    await user.save();
    await Notification.create({ user: user._id, type: 'unban', message: 'Votre compte a été débanni.' });
    await createLog('user_unbanned', `${user.username} débanni`, req.user, user.username);
    res.json({ message: 'Débanni', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/users/:id/restrict', async (req, res) => {
  try {
    const { canUpload, canDownload } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    if (canUpload !== undefined) user.canUpload = canUpload;
    if (canDownload !== undefined) user.canDownload = canDownload;
    await user.save();
    await createLog('user_restricted', `Restrictions mises à jour pour ${user.username}`, req.user, user.username);
    res.json({ message: 'Restrictions mises à jour', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PROMOTE — role-based permission:
// - admin can set user → admin
// - owner can set user/admin → owner  
// - developer can set user/admin/owner → anything
router.patch('/users/:id/promote', ownerOnly, async (req, res) => {
  try {
    const { role } = req.body;
    const allowedRoles = { owner: ['user', 'admin', 'owner'], developer: ['user', 'admin', 'owner'] };
    const allowed = allowedRoles[req.user.role] || [];
    if (!allowed.includes(role)) {
      return res.status(400).json({ message: `Vous ne pouvez pas attribuer le rôle "${role}"` });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    // Can't modify developer
    if (user.role === 'developer' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Impossible de modifier le rôle d\'un développeur' });
    }
    user.role = role;
    await user.save();
    await createLog('user_promoted', `${user.username} promu au rôle "${role}"`, req.user, user.username);
    res.json({ message: `Rôle mis à jour: ${role}`, user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin can also promote user→admin
router.patch('/users/:id/set-admin', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    if (user.role === 'developer') return res.status(403).json({ message: 'Impossible de modifier un développeur' });
    if (roleLevel(req.user.role) <= roleLevel(user.role)) {
      return res.status(403).json({ message: 'Rang insuffisant' });
    }
    const { role } = req.body;
    const maxRole = req.user.role === 'developer' ? 'owner' : req.user.role === 'owner' ? 'admin' : 'user';
    if (roleLevel(role) > roleLevel(maxRole)) {
      return res.status(403).json({ message: 'Rang insuffisant pour ce rôle' });
    }
    user.role = role;
    await user.save();
    await createLog('user_promoted', `${user.username} → rôle "${role}"`, req.user, user.username);
    res.json({ message: 'OK', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/all-resources', async (req, res) => {
  try {
    const { status, page = 1, limit = 20, vipOnly } = req.query;
    const query = {};
    if (status) query.status = status;
    if (vipOnly === 'true') query.vipOnly = true;
    const total = await Resource.countDocuments(query);
    const resources = await Resource.find(query).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(parseInt(limit)).populate('author', 'username avatar');
    res.json({ resources, total, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/recent-activity
router.get('/recent-activity', async (req, res) => {
  try {
    const Log = require('../models/Log');
    const logs = await Log.find().sort({ createdAt: -1 }).limit(10).populate('actor', 'username avatar role discordId');
    // Normalize fields for frontend compatibility
    const normalized = logs.map(l => ({
      _id: l._id,
      type: l.type,
      message: l.message,
      description: l.message,           // alias for legacy frontend
      user: l.actor || null,            // alias for legacy frontend
      actor: l.actor || null,
      actorName: l.actorName,
      target: l.target,
      createdAt: l.createdAt,
    }));
    res.json(normalized);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── VIP MANAGEMENT ──────────────────────────────────────────

// GET /api/admin/vip-users — list all users with vip role
router.get('/vip-users', async (req, res) => {
  try {
    const users = await User.find({ role: 'vip' }).sort({ updatedAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/admin/vip-users/:id — grant VIP
router.post('/vip-users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    // Bloquer seulement si la cible a un rôle staff supérieur à l'acteur
    if (roleLevel(user.role) >= 1 && roleLevel(user.role) > roleLevel(req.user.role)) {
      return res.status(400).json({ message: 'Impossible de modifier un membre avec un rôle supérieur' });
    }
    if (user.role === 'vip') return res.status(400).json({ message: 'Cet utilisateur est déjà VIP' });
    user.role = 'vip';
    user.vipGrantedAt = new Date();
    user.vipGrantedBy = req.user._id;
    await user.save();
    await createLog('vip_granted', `VIP accordé à ${user.username}`, req.user, user.username);
    res.json({ message: 'VIP accordé', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/admin/vip-users/:id — revoke VIP
router.delete('/vip-users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    if (user.role !== 'vip') return res.status(400).json({ message: "Pas VIP" });
    user.role = 'user';
    user.vipGrantedAt = null;
    user.vipGrantedBy = null;
    await user.save();
    await createLog('vip_revoked', `VIP retiré à ${user.username}`, req.user, user.username);
    res.json({ message: 'VIP retiré', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/search-user?q=username|discordId — search users for VIP grant
router.get('/search-user', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { discordId: { $regex: q, $options: 'i' } }
      ]
    }).limit(15).select('username avatar role discordId vipGrantedAt');
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/admin/notifications — supprimer toutes les notifications (admin)
router.delete('/notifications', async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const result = await Notification.deleteMany({});
    res.json({ message: `${result.deletedCount} notifications supprimées` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
