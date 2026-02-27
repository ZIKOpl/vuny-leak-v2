require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();
app.set('trust proxy', 1); // Fix: trust Render's reverse proxy (express-rate-limit)
connectDB().then(() => { seedCategories(); seedBadges(); });

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/users', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/vip', require('./routes/vip'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/support', require('./routes/support'));
app.use('/api/badges', require('./routes/badges'));
app.use('/api/staff-chat', require('./routes/staffChat'));
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// Seed default categories if none exist
async function seedCategories() {
  try {
    const Category = require('./models/Category');
    const count = await Category.countDocuments();
    if (count === 0) {
      const defaults = [
        { name: 'Armes', icon: '⚔️', order: 1 },
        { name: 'Autres', icon: '📦', order: 2 },
        { name: 'Bases', icon: '🏠', order: 3 },
        { name: 'Bundles', icon: '🎁', order: 4 },
        { name: 'Dumps', icon: '💾', order: 5 },
        { name: 'MLO', icon: '🗺️', order: 6 },
        { name: 'Pack Graphique', icon: '🎨', order: 7 },
        { name: 'Scripts', icon: '📜', order: 8 },
        { name: 'Template Discord', icon: '💬', order: 9 },
        { name: 'Vehicles', icon: '🚗', order: 10 },
        { name: 'Vetements', icon: '👕', order: 11 },
      ];
      await Category.insertMany(defaults);
      console.log('  Categories par defaut creees');
    }
  } catch(e) { console.error('[Seed]', e.message); }
}

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces))
    for (const iface of ifaces[name])
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
  return 'localhost';
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  const r='\x1b[0m', g='\x1b[32m', c='\x1b[36m', y='\x1b[33m', b='\x1b[1m', d='\x1b[2m';
  console.log(`\n${g}${b}  ██╗   ██╗██╗   ██╗███╗   ██╗██╗   ██╗${r}`);
  console.log(`${g}${b}  ╚██╗ ██╔╝██║   ██║██╔██╗ ██║  ██╔╝ ${r}`);
  console.log(`${g}${b}   ╚████╔╝  ╚██████╔╝██║ ╚████║   ██║   LEAK V2${r}\n`);
  console.log(`  ${b}LOCAL   ${r}${c}http://localhost:${PORT}${r}`);
  console.log(`  ${b}RESEAU  ${r}${c}http://${ip}:${PORT}${r}  ${d}<-- ouvre ce lien${r}`);
  console.log(`\n  ${y}FRONTEND_URL=${process.env.FRONTEND_URL || 'non défini'}${r}\n`);
});

async function seedBadges() {
  try {
    const Badge = require('./models/Badge');
    const count = await Badge.countDocuments();
    if (count === 0) {
      await Badge.insertMany([
        { key: 'developer',   name: 'Développeur',       description: 'Badge réservé au développeur de la plateforme', emoji: '⚙️',  type: 'role',        role: 'developer', color: '#9b59b6', order: 1 },
        { key: 'owner',       name: 'Owner',             description: 'Badge réservé aux propriétaires',               emoji: '👑',  type: 'role',        role: 'owner',     color: '#f1c40f', order: 2 },
        { key: 'admin',       name: 'Admin',             description: 'Badge réservé aux administrateurs',             emoji: '🔐',  type: 'role',        role: 'admin',     color: '#e74c3c', order: 3 },
        { key: 'vip',         name: 'VIP',               description: 'Membre VIP — accès aux contenus exclusifs',     emoji: '🐪',  type: 'role',        role: 'vip',       color: '#e67e22', order: 4 },
        { key: 'top10',       name: 'Fondateur',         description: 'Parmi les 10 premiers membres inscrits',        emoji: '🥇',  type: 'auto_first_n', threshold: 10,   color: '#f1c40f', order: 5 },
        { key: 'top50',       name: 'Pionnier',          description: 'Parmi les 50 premiers membres inscrits',        emoji: '🥈',  type: 'auto_first_n', threshold: 50,   color: '#95a5a6', order: 6 },
        { key: 'top100',      name: 'Early Member',      description: 'Parmi les 100 premiers membres inscrits',       emoji: '🥉',  type: 'auto_first_n', threshold: 100,  color: '#cd7f32', order: 7 },
      ]);
      console.log('  Badges par defaut crees');
    }
  } catch(e) { console.error('[SeedBadges]', e.message); }
}
