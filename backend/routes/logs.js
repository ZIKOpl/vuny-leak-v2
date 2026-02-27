const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const Settings = require('../models/Settings');
const { protect, adminOnly } = require('../middleware/auth');
const { createLog } = require('../utils/logger');

// GET /api/logs - Admin only, with filters
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { type, page = 1, limit = 50 } = req.query;
    const query = {};
    if (type) query.type = type;
    const total = await Log.countDocuments(query);
    const logs = await Log.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ logs, total, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/logs/clean - Superadmin: delete all logs
router.delete('/clean', protect, adminOnly, async (req, res) => {
  try {
    await Log.deleteMany({});
    await createLog('category_updated', 'Tous les logs ont ete supprimes', req.user);
    res.json({ message: 'Logs supprimes' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/logs/webhook - Get webhook settings
router.get('/webhook', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne({ key: 'discord_webhook' });
    res.json(s?.value || { url: '', events: [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/logs/webhook - Save webhook settings
router.post('/webhook', protect, adminOnly, async (req, res) => {
  try {
    const { url, events } = req.body;
    await Settings.findOneAndUpdate(
      { key: 'discord_webhook' },
      { value: { url: url || '', events: events || [] } },
      { upsert: true, new: true }
    );
    await createLog('webhook_updated', 'Webhook Discord mis a jour', req.user);
    res.json({ message: 'Webhook sauvegarde' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
