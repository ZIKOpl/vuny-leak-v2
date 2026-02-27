const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/announcements — public, annonces actives
router.get('/', async (req, res) => {
  try {
    const items = await Announcement.find({ active: true }).sort({ order: 1, createdAt: -1 });
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/announcements/all — admin, toutes les annonces
router.get('/all', protect, adminOnly, async (req, res) => {
  try {
    const items = await Announcement.find().sort({ order: 1, createdAt: -1 }).populate('createdBy', 'username');
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/announcements — créer
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { title, description, imageUrl, titleColor, descColor } = req.body;
    if (!title) return res.status(400).json({ message: 'Titre requis' });
    const count = await Announcement.countDocuments();
    const item = await Announcement.create({
      title, description, imageUrl, titleColor, descColor,
      order: count, createdBy: req.user._id,
    });
    res.status(201).json(item);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/announcements/:id — modifier
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const item = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ message: 'Annonce introuvable' });
    res.json(item);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/announcements/:id — supprimer
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const item = await Announcement.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Annonce introuvable' });
    res.json({ message: 'Supprimée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
