const express = require('express');
const router = express.Router();
const User = require('../models/User');
const VipMedia = require('../models/VipMedia');
const { protect, adminOnly } = require('../middleware/auth');
const { createLog } = require('../utils/logger');

// Middleware: check VIP access
const vipOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Connexion requise' });
  const r = req.user.role;
  if (r === 'vip' || r === 'admin' || r === 'owner' || r === 'developer') return next();
  return res.status(403).json({ message: 'Accès VIP requis' });
};

// ─── GET /api/vip/media ─── (VIP members only)
router.get('/media', protect, vipOnly, async (req, res) => {
  try {
    const items = await VipMedia.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/vip/media ─── (admin only)
router.post('/media', protect, adminOnly, async (req, res) => {
  try {
    const { title, url, type } = req.body;
    if (!url) return res.status(400).json({ message: 'URL requise' });
    const item = await VipMedia.create({ title: title || '', url, type: type || 'image', uploadedBy: req.user._id });
    await createLog('vip_media_added', `Média VIP ajouté: "${title || url}"`, req.user, title || url);
    res.status(201).json(item);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DELETE /api/vip/media/:id ─── (admin only)
router.delete('/media/:id', protect, adminOnly, async (req, res) => {
  try {
    const item = await VipMedia.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Média non trouvé' });
    await createLog('vip_media_deleted', `Média VIP supprimé: "${item.title || item.url}"`, req.user, item.title);
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/vip/members ─── (admin only)
router.get('/members', protect, adminOnly, async (req, res) => {
  try {
    const members = await User.find({ isVip: true }).select('username avatar discordId isVip vipGrantedAt role').sort({ vipGrantedAt: -1 });
    res.json(members);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/vip/members/:id ─── Grant VIP (admin only)
router.post('/members/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    user.isVip = true;
    user.vipGrantedAt = new Date();
    user.vipGrantedBy = req.user._id;
    await user.save();
    await createLog('vip_granted', `VIP accordé à ${user.username}`, req.user, user.username);
    res.json({ message: 'VIP accordé', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DELETE /api/vip/members/:id ─── Revoke VIP (admin only)
router.delete('/members/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    user.isVip = false;
    user.vipGrantedAt = null;
    user.vipGrantedBy = null;
    await user.save();
    await createLog('vip_revoked', `VIP révoqué pour ${user.username}`, req.user, user.username);
    res.json({ message: 'VIP révoqué', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
