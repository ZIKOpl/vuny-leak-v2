const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const https = require('https');

// Helper: Discord token exchange using native https (bypasses node-fetch Cloudflare issues)
function discordTokenExchange(params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const options = {
      hostname: 'discord.com',
      path: '/api/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
        'User-Agent': 'DiscordBot (https://vuny-leak-v2.onrender.com, 1.0)',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Helper: build base URL from request (works on any IP/host) ──
function getBaseUrl(req) {
  // Always prefer the explicit public URL — never use internal IPs
  if (process.env.FRONTEND_URL) {
    const url = process.env.FRONTEND_URL.replace(/\/$/, '');
    // Reject private/internal IPs (Render sets FRONTEND_URL to internal IP sometimes)
    if (!url.match(/https?:\/\/(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/)) {
      return url;
    }
  }
  // Fallback: reconstruct from forwarded headers (works locally and on Render)
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || `localhost:${process.env.PORT || 5000}`;
  return `${proto}://${host}`;
}

// GET /api/auth/discord
router.get('/discord', (req, res) => {
  const base = getBaseUrl(req);
  // Use explicit env var if set, otherwise reconstruct (avoid mismatches)
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${base}/api/auth/discord/callback`;

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify email',
  });
  console.log('[Auth] Redirect URI:', redirectUri);
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// GET /api/auth/discord/callback
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  const base = getBaseUrl(req);
  // MUST match exactly what was sent in /discord — use same env var
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${base}/api/auth/discord/callback`;
  const frontendUrl = process.env.FRONTEND_URL || base;

  console.log('[Auth] Callback, base:', base);

  if (!code) return res.redirect(`${frontendUrl}/index.html?error=no_code`);

  try {
    console.log('[Auth] CLIENT_ID présent:', !!process.env.DISCORD_CLIENT_ID);
    console.log('[Auth] CLIENT_SECRET présent:', !!process.env.DISCORD_CLIENT_SECRET);
    console.log('[Auth] redirect_uri utilisé:', redirectUri);

    const tokenResult = await discordTokenExchange({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    console.log('[Auth] Discord token status:', tokenResult.status);
    console.log('[Auth] Discord token raw response:', tokenResult.body.substring(0, 500));

    let tokenData;
    try { tokenData = JSON.parse(tokenResult.body); }
    catch(e) {
      if (tokenResult.status === 429) throw new Error('Rate limit Cloudflare — IP Render bloquée temporairement');
      throw new Error(`Discord erreur ${tokenResult.status} — réponse non-JSON`);
    }

    if (!tokenData.access_token) {
      console.error('[Auth] Token error:', JSON.stringify(tokenData));
      throw new Error(tokenData.error_description || tokenData.error || 'Token Discord invalide');
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    console.log('[Auth] Connecté:', discordUser.username, discordUser.id);

    if (!discordUser.id) throw new Error('Profil Discord invalide');

    // Avatar
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${discordUser.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) % 5n)}.png`;

    // Banner
    const bannerHash = discordUser.banner || null;

    // Auto-migrate legacy roles from DB
    await require('../models/User').collection.updateMany(
      { role: { $in: ['superadmin'] } },
      { $set: { role: 'developer' } }
    );
    // NOTE: Ne jamais réinitialiser les rôles VIP ici

    let user = await User.findOne({ discordId: discordUser.id });
    if (!user) {
      user = await User.create({
        discordId: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator || '0',
        avatar: avatarUrl,
        banner: bannerHash,
        email: discordUser.email || null,
      });
      console.log('[Auth] Nouvel utilisateur créé:', user.username);
    } else {
      user.username = discordUser.username;
      user.discriminator = discordUser.discriminator || '0';
      user.avatar = avatarUrl;
      user.banner = bannerHash;
      user.lastSeen = new Date();
      await user.save();
    }

    if (user.isBanned) {
      return res.redirect(`${frontendUrl}/index.html?error=banned&reason=${encodeURIComponent(user.banReason || 'Banni')}`);
    }

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`${frontendUrl}/index.html?token=${jwtToken}`);
  } catch (err) {
    console.error('[Auth] Erreur OAuth:', err.message);
    res.redirect(`${frontendUrl}/index.html?error=oauth_failed&msg=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Déconnecté' });
});

module.exports = router;
