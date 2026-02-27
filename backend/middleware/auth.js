const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Role hierarchy: developer > owner > admin > vip > user
const ROLE_LEVEL = { user: 0, vip: 0, admin: 1, owner: 2, developer: 3 };
const roleLevel = (role) => ROLE_LEVEL[role] ?? 0;

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ message: 'Non autorisé, token manquant' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-__v');
    if (!req.user) return res.status(401).json({ message: 'Utilisateur non trouvé' });
    if (req.user.isBanned) return res.status(403).json({ message: 'Votre compte est banni', reason: req.user.banReason });
    req.user.lastSeen = new Date();
    await req.user.save();
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide' });
  }
};

// admin+ (admin, owner, developer)
const adminOnly = (req, res, next) => {
  if (!req.user || roleLevel(req.user.role) < 1) {
    return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
  }
  next();
};

// owner+ (owner, developer)
const ownerOnly = (req, res, next) => {
  if (!req.user || roleLevel(req.user.role) < 2) {
    return res.status(403).json({ message: 'Accès réservé aux owners' });
  }
  next();
};

// developer only
const developerOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'developer') {
    return res.status(403).json({ message: 'Accès réservé au développeur' });
  }
  next();
};

// Legacy alias
const superAdminOnly = ownerOnly;

module.exports = { protect, adminOnly, ownerOnly, developerOnly, superAdminOnly, roleLevel };
