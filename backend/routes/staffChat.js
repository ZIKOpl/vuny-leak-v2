const express = require('express');
const router = express.Router();
const StaffMessage = require('../models/StaffMessage');
const { protect, adminOnly } = require('../middleware/auth');

// SSE subscribers for staff chat
const staffChatSubs = new Set();

function broadcastStaff(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  staffChatSubs.forEach(r => { try { r.write(data); } catch {} });
}

// GET /api/staff-chat — get last 100 messages
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const msgs = await StaffMessage.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('sender', 'username avatar role');
    res.json(msgs.reverse());
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/staff-chat — send a message
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { content, imageUrl } = req.body;
    if (!content?.trim() && !imageUrl) return res.status(400).json({ message: 'Message vide' });
    const msg = await StaffMessage.create({
      sender: req.user._id,
      content: content?.trim() || '',
      imageUrl: imageUrl || null,
    });
    const populated = await StaffMessage.findById(msg._id).populate('sender', 'username avatar role');
    broadcastStaff({ type: 'message', message: populated });
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/staff-chat/clear — clear all messages (admin)
router.delete('/clear', protect, adminOnly, async (req, res) => {
  try {
    await StaffMessage.deleteMany({});
    broadcastStaff({ type: 'clear' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/staff-chat/events — SSE stream
router.get('/events', async (req, res) => {
  const jwt = require('jsonwebtoken');
  const User = require('../models/User');
  const { adminOnly: checkAdmin, roleLevel } = require('../middleware/auth');
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || roleLevel(user.role) < 1) return res.status(403).end();
  } catch { return res.status(401).end(); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');

  staffChatSubs.add(res);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); staffChatSubs.delete(res); });
});

module.exports = router;
