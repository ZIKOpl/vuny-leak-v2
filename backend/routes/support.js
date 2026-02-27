const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const Notification = require('../models/Notification');
const { protect, adminOnly, roleLevel } = require('../middleware/auth');
const { createLog } = require('../utils/logger');
const Settings = require('../models/Settings');

// ── Discord embed for new support ticket ──────────────
async function sendSupportTicketWebhook({ username, avatar, discordId, title, description, ticketId }) {
  try {
    const setting = await Settings.findOne({ key: 'discord_webhook' });
    if (!setting?.value?.url) return;
    const { url, events = [] } = setting.value;
    if (events.length && !events.includes('support_ticket_created')) return;

    const avatarUrl = avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const timestamp = new Date().toISOString();

    const body = {
      username: 'Vuny Support',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
      embeds: [{
        color: 0x5865F2,
        author: {
          name: username,
          icon_url: avatarUrl,
        },
        title: 'Nouveau ticket support',
        fields: [
          { name: 'Sujet', value: title, inline: false },
          { name: 'Description', value: description.length > 1024 ? description.slice(0, 1021) + '...' : description, inline: false },
        ],
        footer: { text: 'Ticket #' + ticketId },
        timestamp,
      }]
    };

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[SupportWebhook]', e.message);
  }
}

// SSE subscribers
const supportSubs = new Map(); // ticketId -> Set<res>

function broadcastSupport(ticketId, payload) {
  const subs = supportSubs.get(String(ticketId));
  if (!subs) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  subs.forEach(r => { try { r.write(data); } catch {} });
}

// Admin SSE: broadcast new ticket to all admin listeners
const adminSupportSubs = new Set();
function broadcastAdminNewTicket(ticket) {
  const data = `data: ${JSON.stringify({ type: 'new_ticket', ticket })}\n\n`;
  adminSupportSubs.forEach(r => { try { r.write(data); } catch {} });
}

// POST /api/support — create ticket
router.post('/', protect, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim() || !description?.trim())
      return res.status(400).json({ message: 'Titre et description requis' });

    const ticket = await SupportTicket.create({
      user: req.user._id,
      title: title.trim(),
      description: description.trim(),
      messages: [{
        sender: req.user._id,
        content: `Nouveau ticket · ${title.trim()}\n\n${description.trim()}`,
      }],
    });

    // Notify admins
    try {
      const User = require('../models/User');
      const admins = await User.find({ role: { $in: ['admin', 'owner', 'developer'] } }).select('_id');
      await Notification.insertMany(admins.map(a => ({
        user: a._id, type: 'admin_message',
        message: `🎫 Nouveau ticket support de ${req.user.username} — "${title.trim()}"`,
      })));
    } catch (_) {}

    const populated = await SupportTicket.findById(ticket._id)
      .populate('user', 'username avatar role discordId')
      .populate('messages.sender', 'username avatar role');

    await createLog('support_ticket_created', `Nouveau ticket support de ${req.user.username} — "${title}"`, req.user, title);

    // Send rich Discord embed for ticket opening
    sendSupportTicketWebhook({
      username: req.user.username,
      avatar: req.user.avatar,
      discordId: req.user.discordId,
      title: title.trim(),
      description: description.trim(),
      ticketId: ticket._id.toString().slice(-6).toUpperCase(),
    });
    // Broadcast new ticket to admins
    broadcastAdminNewTicket(populated);

    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/support/my — user's own tickets
router.get('/my', protect, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select('title status createdAt');
    res.json(tickets);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/support — all tickets (admin)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const q = status ? { status } : {};
    const tickets = await SupportTicket.find(q)
      .sort({ createdAt: -1 })
      .populate('user', 'username avatar role discordId');
    res.json(tickets);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/support/count-open
router.get('/count-open', protect, adminOnly, async (req, res) => {
  try {
    const count = await SupportTicket.countDocuments({ status: 'open' });
    res.json({ count });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/support/admin-events — SSE for admins (new tickets)
router.get('/admin-events', async (req, res) => {
  const jwt = require('jsonwebtoken');
  const User = require('../models/User');
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
  adminSupportSubs.add(res);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); adminSupportSubs.delete(res); });
});

// GET /api/support/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('user', 'username avatar role discordId')
      .populate('messages.sender', 'username avatar role');
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    const isAdmin = roleLevel(req.user.role) >= 1;
    if (!isAdmin && ticket.user._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Accès refusé' });
    res.json(ticket);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/support/:id/message
router.post('/:id/message', protect, async (req, res) => {
  try {
    const { content, imageUrl } = req.body;
    if (!content && !imageUrl) return res.status(400).json({ message: 'Message vide' });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    if (ticket.status !== 'open') return res.status(400).json({ message: 'Ticket fermé' });
    const isAdmin = roleLevel(req.user.role) >= 1;
    if (!isAdmin && ticket.user.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Accès refusé' });

    const msg = { sender: req.user._id, content: content || '', imageUrl: imageUrl || null, createdAt: new Date() };
    ticket.messages.push(msg);
    await ticket.save();

    const senderUser = await require('../models/User').findById(req.user._id).select('username avatar role');
    const msgOut = { ...msg, _id: ticket.messages[ticket.messages.length - 1]._id, sender: senderUser };
    broadcastSupport(ticket._id, { type: 'message', message: msgOut });

    // Notify other party
    if (isAdmin) {
      await Notification.create({ user: ticket.user, type: 'admin_message', message: `💬 Réponse à votre ticket support "${ticket.title}"` });
    }
    res.json(msgOut);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/support/:id/close
router.patch('/:id/close', protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    // Only admin or ticket owner can close
    const isAdmin = roleLevel(req.user.role) >= 1;
    const isOwner = ticket.user.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) return res.status(403).json({ message: 'Accès refusé' });
    if (ticket.status !== 'open') return res.status(400).json({ message: 'Déjà fermé' });
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closedBy = req.user._id;
    ticket.closeReason = reason || null;
    await ticket.save();
    broadcastSupport(ticket._id, { type: 'status', status: 'closed', reason });
    if (isAdmin) {
      try {
        await Notification.create({ user: ticket.user, type: 'admin_message', message: `❌ Votre ticket "${ticket.title}" a été fermé${reason ? ' — ' + reason : ''}.` });
      } catch (_) {}
    }
    await createLog('support_ticket_closed', `Ticket support fermé — "${ticket.title}"${reason ? ' · ' + reason : ''}`, req.user, ticket.title);
    res.json({ message: 'Ticket fermé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/support/:id/events — SSE per ticket
router.get('/:id/events', async (req, res) => {
  const jwt = require('jsonwebtoken');
  const User = require('../models/User');
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).end();
  } catch { return res.status(401).end(); }
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).end();
    const isAdmin = roleLevel(req.user.role) >= 1;
    if (!isAdmin && ticket.user.toString() !== req.user._id.toString())
      return res.status(403).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('data: {"type":"connected"}\n\n');
    const tid = String(ticket._id);
    if (!supportSubs.has(tid)) supportSubs.set(tid, new Set());
    supportSubs.get(tid).add(res);
    const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(hb); supportSubs.get(tid)?.delete(res); });
  } catch (err) { res.status(500).end(); }
});

// DELETE /api/support/:id — supprimer définitivement (admin)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    await SupportTicket.deleteOne({ _id: ticket._id });
    await createLog('support_ticket_closed', `Ticket support supprimé définitivement — "${ticket.title}"`, req.user, ticket.title);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;