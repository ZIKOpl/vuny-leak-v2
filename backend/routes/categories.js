const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { protect, adminOnly } = require('../middleware/auth');
const { createLog } = require('../utils/logger');

// GET /api/categories - Public
router.get('/', async (req, res) => {
  try {
    const cats = await Category.find().sort({ order: 1, name: 1 });
    res.json(cats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/categories - Admin only
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, icon, order } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Nom requis' });
    const cat = await Category.create({ name: name.trim(), icon: icon || '📦', order: order || 0, createdBy: req.user._id });
    await createLog('category_created', `Categorie "${cat.name}" creee`, req.user, cat.name);
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Cette categorie existe deja' });
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/categories/:id - Admin only
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, icon, order } = req.body;
    const cat = await Category.findByIdAndUpdate(req.params.id, { name, icon, order }, { new: true });
    if (!cat) return res.status(404).json({ message: 'Categorie non trouvee' });
    await createLog('category_updated', `Categorie renommee en "${cat.name}"`, req.user, cat.name);
    res.json(cat);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/categories/:id - Admin only
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const cat = await Category.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Categorie non trouvee' });
    await createLog('category_deleted', `Categorie "${cat.name}" supprimee`, req.user, cat.name);
    res.json({ message: 'Supprimee' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
