const Log = require('../models/Log');
const Settings = require('../models/Settings');

async function createLog(type, message, actor = null, target = null, meta = {}) {
  try {
    const actorName = actor?.username || 'Systeme';
    await Log.create({ type, message, actor: actor?._id || null, actorName, target, meta });
    await sendDiscordWebhook(type, message, actorName, target, actor, meta);
  } catch (e) {
    console.error('[Logger] Error:', e.message);
  }
}

// ── Couleurs par type (hex) ─────────────────────────────────
const LOG_COLORS = {
  resource_approved:      0x27ae60,
  resource_rejected:      0xe74c3c,
  resource_deleted:       0xe74c3c,
  resource_submitted:     0x3498db,
  user_banned:            0xe74c3c,
  user_unbanned:          0x27ae60,
  user_restricted:        0xe67e22,
  user_promoted:          0xf1c40f,
  category_created:       0x3498db,
  category_deleted:       0xe74c3c,
  category_updated:       0xe67e22,
  admin_login:            0x9b59b6,
  webhook_updated:        0x95a5a6,
  vip_granted:            0xf1c40f,
  vip_revoked:            0x95a5a6,
  vip_media_added:        0x3498db,
  vip_media_deleted:      0xe74c3c,
  shop_product_created:   0x27ae60,
  shop_product_deleted:   0xe74c3c,
  shop_product_updated:   0xe67e22,
  shop_category_created:  0x3498db,
  shop_category_deleted:  0xe74c3c,
  shop_category_updated:  0xe67e22,
  shop_ticket_created:    0x3498db,
  shop_ticket_sold:       0x27ae60,
  shop_ticket_closed:     0xe74c3c,
  support_ticket_created: 0x9b59b6,
  support_ticket_closed:  0x95a5a6,
  badge_created:          0xf1c40f,
  badge_deleted:          0xe74c3c,
};

// ── Labels lisibles (SANS emojis pour Discord) ──────────────
const LOG_LABELS = {
  resource_approved:      'Ressource approuvée',
  resource_rejected:      'Ressource refusée',
  resource_deleted:       'Ressource supprimée',
  resource_submitted:     'Ressource soumise',
  user_banned:            'Utilisateur banni',
  user_unbanned:          'Utilisateur débanni',
  user_restricted:        'Utilisateur restreint',
  user_promoted:          'Utilisateur promu',
  category_created:       'Catégorie créée',
  category_deleted:       'Catégorie supprimée',
  category_updated:       'Catégorie modifiée',
  admin_login:            'Connexion admin',
  webhook_updated:        'Webhook modifié',
  vip_granted:            'VIP accordé',
  vip_revoked:            'VIP révoqué',
  vip_media_added:        'Média VIP ajouté',
  vip_media_deleted:      'Média VIP supprimé',
  shop_product_created:   'Produit boutique créé',
  shop_product_deleted:   'Produit boutique supprimé',
  shop_product_updated:   'Produit boutique modifié',
  shop_category_created:  'Catégorie boutique créée',
  shop_category_deleted:  'Catégorie boutique supprimée',
  shop_category_updated:  'Catégorie boutique modifiée',
  shop_ticket_created:    'Ticket boutique ouvert',
  shop_ticket_sold:       'Vente finalisée',
  shop_ticket_closed:     'Ticket boutique fermé',
  support_ticket_created: 'Ticket support ouvert',
  support_ticket_closed:  'Ticket support fermé',
  badge_created:          'Badge créé',
  badge_deleted:          'Badge supprimé',
};

// ── Labels avec emojis pour le SITE ────────────────────────
const LOG_LABELS_EMOJI = {
  resource_approved:      '✅ Ressource approuvée',
  resource_rejected:      '❌ Ressource refusée',
  resource_deleted:       '🗑️ Ressource supprimée',
  resource_submitted:     '📤 Ressource soumise',
  user_banned:            '🔨 Utilisateur banni',
  user_unbanned:          '✅ Utilisateur débanni',
  user_restricted:        '⚠️ Utilisateur restreint',
  user_promoted:          '⭐ Utilisateur promu',
  category_created:       '📁 Catégorie créée',
  category_deleted:       '🗑️ Catégorie supprimée',
  category_updated:       '✏️ Catégorie modifiée',
  admin_login:            '🔐 Connexion admin',
  webhook_updated:        '🔧 Webhook modifié',
  vip_granted:            '👑 VIP accordé',
  vip_revoked:            '❌ VIP révoqué',
  vip_media_added:        '🎬 Média VIP ajouté',
  vip_media_deleted:      '🗑️ Média VIP supprimé',
  shop_product_created:   '🛍️ Produit créé',
  shop_product_deleted:   '🗑️ Produit supprimé',
  shop_product_updated:   '✏️ Produit modifié',
  shop_category_created:  '📦 Catégorie boutique créée',
  shop_category_deleted:  '🗑️ Catégorie boutique supprimée',
  shop_category_updated:  '✏️ Catégorie boutique modifiée',
  shop_ticket_created:    '🛒 Ticket boutique ouvert',
  shop_ticket_sold:       '✅ Vente finalisée',
  shop_ticket_closed:     '❌ Ticket boutique fermé',
  support_ticket_created: '🎫 Ticket support ouvert',
  support_ticket_closed:  '🔒 Ticket support fermé',
  badge_created:          '🏅 Badge créé',
  badge_deleted:          '🗑️ Badge supprimé',
};

// Export labels for frontend use
module.exports.LOG_LABELS_EMOJI = LOG_LABELS_EMOJI;

async function sendDiscordWebhook(type, message, actorName, target, actor, meta = {}) {
  try {
    const setting = await Settings.findOne({ key: 'discord_webhook' });
    if (!setting?.value?.url) return;
    const { url, events = [] } = setting.value;
    if (events.length && !events.includes(type)) return;

    const color = LOG_COLORS[type] || 0x95a5a6;
    // No emojis in Discord embeds — clean label
    const label = LOG_LABELS[type] || type.replace(/_/g, ' ');

    // Compact: only actor + target if present, no extra padding
    const desc = target ? `**${actorName}** → ${target}` : `**${actorName}**`;

    const body = {
      username: 'Vuny Logs',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
      embeds: [{
        color,
        title: label,
        description: desc,
        footer: { text: `${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` },
      }]
    };

    if (meta?.reason) {
      body.embeds[0].description += `\nRaison: ${meta.reason}`;
    }

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('[Webhook]', e.message);
  }
}

module.exports = { createLog, LOG_LABELS_EMOJI };
