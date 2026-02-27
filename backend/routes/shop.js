const express = require('express');
const router = express.Router();
const ShopProduct = require('../models/ShopProduct');
const ShopTicket  = require('../models/ShopTicket');
const ShopCategory = require('../models/ShopCategory');
const Notification = require('../models/Notification');
const { protect, adminOnly, roleLevel } = require('../middleware/auth');

// ─── SSE subscribers for real-time chat ─────────────────────
const ticketSubs = new Map(); // ticketId -> Set of res objects

// ─── SHOP CATEGORIES ─────────────────────────────────────────

// GET /api/shop/cats — public
router.get('/cats', async (req, res) => {
  try {
    const cats = await ShopCategory.find().sort({ order: 1, name: 1 });
    res.json(cats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/shop/cats — admin only
router.post('/cats', protect, adminOnly, async (req, res) => {
  try {
    const { name, icon, description, order } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Nom requis' });
    const cat = await ShopCategory.create({
      name: name.trim(),
      icon: icon || '📦',
      description: description || '',
      order: order || 0,
      createdBy: req.user._id,
    });
    const { createLog } = require('../utils/logger');
    await createLog('shop_category_created', `Catégorie boutique créée — "${name}"`, req.user, name);
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Cette catégorie existe déjà' });
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/shop/cats/:id — admin only
router.patch('/cats/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, icon, description, order } = req.body;
    const cat = await ShopCategory.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name }), ...(icon && { icon }), ...(description !== undefined && { description }), ...(order !== undefined && { order }) },
      { new: true }
    );
    if (!cat) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(cat);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/shop/cats/:id — admin only
router.delete('/cats/:id', protect, adminOnly, async (req, res) => {
  try {
    const cat = await ShopCategory.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Catégorie introuvable' });
    const { createLog } = require('../utils/logger');
    await createLog('shop_category_deleted', `Catégorie boutique supprimée — "${cat.name}"`, req.user, cat.name);
    res.json({ message: 'Supprimée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

function broadcastTicket(ticketId, payload) {
  const subs = ticketSubs.get(String(ticketId));
  if (!subs) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  subs.forEach(res => { try { res.write(data); } catch {} });
}

// ─── PRODUCTS ────────────────────────────────────────────────

// GET /api/shop/products
router.get('/products', async (req, res) => {
  try {
    const { category, featured, page = 1, limit = 12 } = req.query;
    const q = { active: true };
    if (category) q.category = category;
    if (featured === 'true') q.featured = true;
    const total = await ShopProduct.countDocuments(q);
    const products = await ShopProduct.find(q)
      .sort({ featured: -1, createdAt: -1 })
      .skip((page - 1) * limit).limit(parseInt(limit))
      .populate('author', 'username avatar');
    res.json({ products, total, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/products/featured
router.get('/products/featured', async (req, res) => {
  try {
    const products = await ShopProduct.find({ active: true, featured: true })
      .sort({ createdAt: -1 }).limit(5).populate('author', 'username avatar');
    res.json(products);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/products/:id
router.get('/products/:id', async (req, res) => {
  try {
    const p = await ShopProduct.findById(req.params.id).populate('author', 'username avatar discordId');
    if (!p || !p.active) return res.status(404).json({ message: 'Produit introuvable' });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/shop/products — admin only
router.post('/products', protect, adminOnly, async (req, res) => {
  try {
    const { title, description, category, thumbnail, price, quantity, featured } = req.body;
    if (!title || !description || !category || price === undefined || quantity === undefined)
      return res.status(400).json({ message: 'Champs requis manquants' });
    const product = await ShopProduct.create({
      title, description, category,
      thumbnail: thumbnail || null,
      price: parseFloat(price),
      quantity: parseInt(quantity),
      featured: featured === true || featured === 'true',
      author: req.user._id,
    });
    const { createLog } = require('../utils/logger');
    await createLog('shop_product_created', `Produit créé — "${title}" dans ${category} à ${parseFloat(price).toFixed(2)} €`, req.user, title);
    res.status(201).json(product);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/shop/products/:id — admin only
router.patch('/products/:id', protect, adminOnly, async (req, res) => {
  try {
    const p = await ShopProduct.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!p) return res.status(404).json({ message: 'Produit introuvable' });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/shop/products/:id — admin only
router.delete('/products/:id', protect, adminOnly, async (req, res) => {
  try {
    const p = await ShopProduct.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Produit introuvable' });
    p.active = false;
    await p.save();
    const { createLog } = require('../utils/logger');
    await createLog('shop_product_deleted', `Produit retiré — "${p.title}"`, req.user, p.title);
    res.json({ message: 'Produit retiré' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/categories — liste des catégories boutique avec comptage (inclut les catégories vides)
router.get('/categories', async (req, res) => {
  try {
    // Get all categories from DB (including those with 0 products)
    const allCats = await ShopCategory.find().sort({ order: 1, name: 1 });

    // Get product counts per category name
    const counts = await ShopProduct.aggregate([
      { $match: { active: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id] = c.count; });

    // Merge: all DB categories + their product counts
    const result = allCats.map(cat => ({
      _id: cat.name,
      name: cat.name,
      icon: cat.icon || '📦',
      description: cat.description,
      count: countMap[cat.name] || 0,
    }));

    // Also add categories that exist in products but not in ShopCategory collection
    const knownNames = new Set(allCats.map(c => c.name));
    counts.forEach(c => {
      if (!knownNames.has(c._id)) {
        result.push({ _id: c._id, name: c._id, icon: '📦', description: '', count: c.count });
      }
    });

    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── TICKETS ─────────────────────────────────────────────────

// POST /api/shop/tickets — ouvrir un ticket
router.post('/tickets', protect, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const qty = parseInt(quantity) || 1;
    const product = await ShopProduct.findById(productId);
    if (!product || !product.active) return res.status(404).json({ message: 'Produit introuvable' });
    if (product.quantity < qty) return res.status(400).json({ message: 'Stock insuffisant' });

    // Check if user already has an open ticket for this product
    const existing = await ShopTicket.findOne({ buyer: req.user._id, product: productId, status: 'open' });
    if (existing) {
      const populated = await ShopTicket.findById(existing._id)
        .populate('product')
        .populate('buyer', 'username avatar role discordId');
      return res.json(populated);
    }

    const ticket = await ShopTicket.create({
      buyer: req.user._id,
      product: productId,
      quantity: qty,
      totalPrice: product.price * qty,
      messages: [{
        sender: req.user._id,
        content: `📦 Nouvelle commande\n\n**Produit :** ${product.title}\n**Quantité :** ${qty}x\n**Prix total :** ${(product.price * qty).toFixed(2)} €\n\nBonjour, je souhaite acheter ce produit.`,
      }],
    });

    // Notify admins (non-bloquant)
    try {
    const User = require('../models/User');
    const admins = await User.find({ role: { $in: ['admin', 'owner', 'developer'] } }).select('_id');
    const notifMsg = `🛒 Nouveau ticket boutique de ${req.user.username} — ${product.title} x${qty}`;
    await Notification.insertMany(admins.map(a => ({ user: a._id, type: 'admin_message', message: notifMsg })));
    } catch (_) { /* notifications non bloquantes */ }

    const populated = await ShopTicket.findById(ticket._id).populate('product').populate('buyer', 'username avatar role discordId');
    const { createLog: createLog2 } = require('../utils/logger');
    await createLog2('shop_ticket_created', `Nouveau ticket de ${req.user.username} — ${product.title} x${qty} (${(product.price*qty).toFixed(2)} €)`, req.user, product.title, { ticketId: ticket._id });
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/tickets/my — tickets de l'utilisateur
router.get('/tickets/my', protect, async (req, res) => {
  try {
    const tickets = await ShopTicket.find({ buyer: req.user._id })
      .sort({ createdAt: -1 }).populate('product', 'title thumbnail price');
    res.json(tickets);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/tickets — tous les tickets (admin)
router.get('/tickets', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const q = status ? { status } : {};
    const tickets = await ShopTicket.find(q)
      .sort({ createdAt: -1 })
      .populate('product', 'title thumbnail price category')
      .populate('buyer', 'username avatar role discordId');
    res.json(tickets);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/tickets/count-open — badge admin
router.get('/tickets/count-open', protect, adminOnly, async (req, res) => {
  try {
    const count = await ShopTicket.countDocuments({ status: 'open' });
    res.json({ count });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/tickets/:id
router.get('/tickets/:id', protect, async (req, res) => {
  try {
    const ticket = await ShopTicket.findById(req.params.id)
      .populate('product')
      .populate('buyer', 'username avatar role discordId')
      .populate('messages.sender', 'username avatar role');
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    const isAdmin = roleLevel(req.user.role) >= 1;
    if (!isAdmin && ticket.buyer._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Accès refusé' });
    res.json(ticket);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/shop/tickets/:id/message — envoyer un message
router.post('/tickets/:id/message', protect, async (req, res) => {
  try {
    if (!req.params.id || req.params.id === 'undefined') return res.status(400).json({ message: 'ID ticket invalide' });
    const { content, imageUrl } = req.body;
    if (!content && !imageUrl) return res.status(400).json({ message: 'Message vide' });
    const ticket = await ShopTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    if (ticket.status !== 'open') return res.status(400).json({ message: 'Ticket fermé' });
    const isAdmin = roleLevel(req.user.role) >= 1;
    if (!isAdmin && ticket.buyer.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Accès refusé' });

    const msg = { sender: req.user._id, content: content || '', imageUrl: imageUrl || null, createdAt: new Date() };
    ticket.messages.push(msg);
    await ticket.save();

    // Populate sender for response
    const senderUser = await require('../models/User').findById(req.user._id).select('username avatar role');
    const msgOut = { ...msg, _id: ticket.messages[ticket.messages.length - 1]._id, sender: senderUser };

    broadcastTicket(ticket._id, { type: 'message', message: msgOut });

    // Notify the other party
    const targetId = isAdmin ? ticket.buyer : null;
    if (targetId) {
      await Notification.create({ user: targetId, type: 'admin_message', message: `💬 Nouveau message dans votre ticket boutique` });
    }

    res.json(msgOut);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/shop/tickets/:id/sold — marquer comme vendu
router.patch('/tickets/:id/sold', protect, adminOnly, async (req, res) => {
  try {
    const ticket = await ShopTicket.findById(req.params.id).populate('product');
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    if (ticket.status !== 'open') return res.status(400).json({ message: 'Ticket déjà fermé' });

    // Deduct stock
    const product = await ShopProduct.findById(ticket.product._id);
    if (product) {
      product.quantity = Math.max(0, product.quantity - ticket.quantity);
      await product.save();
    }

    // Notify buyer before delete
    try { await Notification.create({ user: ticket.buyer, type: 'admin_message', message: `✅ Votre commande de "${ticket.product.title}" a été validée ! Merci pour votre achat.` }); } catch(_) {}

    // Log
    const { createLog } = require('../utils/logger');
    await createLog('shop_ticket_sold', `Ticket vendu — ${ticket.product.title} x${ticket.quantity} (${ticket.totalPrice.toFixed(2)} €)`, req.user, ticket.product.title, { ticketId: ticket._id, buyer: ticket.buyer });

    // Broadcast then delete
    broadcastTicket(ticket._id, { type: 'status', status: 'sold' });
    await ticket.deleteOne();
    res.json({ status: 'sold', message: 'Vente finalisée et ticket supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/shop/tickets/:id/close — fermer le ticket (admin ou propriétaire)
router.patch('/tickets/:id/close', protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const ticket = await ShopTicket.findById(req.params.id).populate('product');
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    const isAdmin = roleLevel(req.user.role) >= 1;
    const isOwner = ticket.buyer.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) return res.status(403).json({ message: 'Accès refusé' });
    const msg = reason
      ? `❌ Votre ticket boutique pour "${ticket.product?.title}" a été fermé. Raison : ${reason}`
      : `❌ Votre ticket boutique pour "${ticket.product?.title}" a été fermé.`;
    if (isAdmin) {
      try { await Notification.create({ user: ticket.buyer, type: 'admin_message', message: msg }); } catch(_) {}
    }
    const { createLog } = require('../utils/logger');
    await createLog('shop_ticket_closed', `Ticket fermé — ${ticket.product?.title}${reason ? ' · Raison: '+reason : ''}`, req.user, ticket.product?.title, { ticketId: ticket._id, buyer: ticket.buyer, reason });
    broadcastTicket(ticket._id, { type: 'status', status: 'closed', reason });
    await ticket.deleteOne();
    res.json({ status: 'closed', message: 'Ticket fermé et supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/shop/tickets/:id/events — SSE stream (token via query param for EventSource)
router.get('/tickets/:id/events', async (req, res) => {
  // Manual token auth since EventSource doesn't support custom headers
  const jwt = require('jsonwebtoken');
  const User = require('../models/User');
  const token = req.query.token || req.headers.authorization?.replace('Bearer ','');
  if (!token) return res.status(401).end();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).end();
  } catch { return res.status(401).end(); }
  try {
    const ticket = await ShopTicket.findById(req.params.id);
    if (!ticket) return res.status(404).end();
    const isAdmin = roleLevel(req.user.role) >= 1;
    if (!isAdmin && ticket.buyer.toString() !== req.user._id.toString())
      return res.status(403).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('data: {"type":"connected"}\n\n');

    const tid = String(ticket._id);
    if (!ticketSubs.has(tid)) ticketSubs.set(tid, new Set());
    ticketSubs.get(tid).add(res);

    // Heartbeat
    const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 25000);

    req.on('close', () => {
      clearInterval(hb);
      ticketSubs.get(tid)?.delete(res);
    });
  } catch (err) { res.status(500).end(); }
});

module.exports = router;
