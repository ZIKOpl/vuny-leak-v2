// ============================================================
// CONFIG
// ============================================================
var API_BASE = `${location.protocol}//${location.host}/api`;

// ============================================================
// STATE
// ============================================================
const App = {
  user: null,
  token: null,
  categories: [],
};

// ============================================================
// API
// ============================================================
async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (App.token) headers['Authorization'] = `Bearer ${App.token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
  return data;
}

// ============================================================
// AUTH
// ============================================================
async function loadAppCategories() {
  try {
    const cats = await apiFetch('/categories');
    App.categories = cats.map(c => c.name);
  } catch { App.categories = ['Armes','Autres','Bases','Bundles','Dumps','MLO','Pack Graphique','Scripts','Template Discord','Vehicles','Vêtements']; }
}

async function initAuth() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    localStorage.setItem('vuny_token', token);
    window.history.replaceState({}, '', window.location.pathname);
  }
  const error = params.get('error');
  if (error === 'banned') {
    showToast('Votre compte est banni : ' + (params.get('reason') || ''), 'error');
  }
  App.token = localStorage.getItem('vuny_token');
  if (App.token) {
    try {
      App.user = await apiFetch('/auth/me');
    } catch (err) {
      if (err.message && (err.message.includes('401') || err.message.includes('403') || err.message.includes('invalide') || err.message.includes('Token'))) {
        App.token = null; App.user = null;
        localStorage.removeItem('vuny_token');
      }
    }
  }
}

function logout() {
  apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('vuny_token');
  App.token = null; App.user = null;
  window.location.href = 'index.html';
}

function requireAuth(redirectPage) {
  if (!App.user) { window.location.href = `${redirectPage || 'index.html'}?error=auth_required`; return false; }
  return true;
}

function requireAdmin() {
  const lvl = roleLevel(App.user?.role);
  if (!App.user || lvl < 1) { window.location.href = 'index.html'; return false; }
  return true;
}

function roleLevel(role) {
  const map = { user: 0, vip: 0, admin: 1, owner: 2, developer: 3 };
  return map[role] ?? 0;
}

function isVip(role) {
  return role === 'vip' || roleLevel(role) >= 1;
}

// ============================================================
// FOLLOW SYSTEM
// ============================================================
async function followUser(userId, btn) {
  if (!App.user) { showToast('Connectez-vous pour suivre', 'error'); return; }
  if (App.user._id === userId) return;
  try {
    btn.disabled = true;
    const isFollowing = btn.dataset.following === 'true';
    const method = isFollowing ? 'DELETE' : 'POST';
    const data = await apiFetch(`/users/${userId}/follow`, { method });
    btn.dataset.following = (!isFollowing).toString();
    btn.innerHTML = renderFollowBtnInner(!isFollowing);
    // update count display if present
    const countEl = document.getElementById(`followersCount_${userId}`);
    if (countEl) countEl.textContent = data.followersCount ?? countEl.textContent;
    showToast(isFollowing ? 'Abonnement retiré' : 'Abonné !', 'success');
  } catch(e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; }
}

function renderFollowBtnInner(isFollowing) {
  return isFollowing
    ? `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Abonné`
    : `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Suivre`;
}

function makeFollowBtn(userId, isFollowing) {
  return `<button
    class="btn btn-sm ${isFollowing ? 'btn-success' : 'btn-outline'} follow-btn"
    data-following="${isFollowing}"
    onclick="followUser('${userId}', this)"
    style="gap:5px;padding:5px 12px;font-size:0.78rem"
  >${renderFollowBtnInner(isFollowing)}</button>`;
}

// ============================================================
// NAVBAR
// ============================================================
function renderNavbar(activePage) {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const isAdmin = App.user && roleLevel(App.user.role) >= 1;

  navbar.innerHTML = `
    <div class="navbar-left">
      <a href="index.html" class="navbar-logo">
        <img src="assets/logo.png" alt="Logo">
      </a>
      <nav class="navbar-links">
        <a href="index.html" class="${activePage === 'home' ? 'active' : ''}">Accueil</a>
        <a href="shop.html" class="${activePage === 'shop' ? 'active' : ''}">Boutique</a>
        <a href="vip.html"
           class="nav-vip-btn ${activePage === 'vip' ? 'active' : ''} ${App.user && isVip(App.user.role) ? 'vip-unlocked' : 'vip-locked'}"
           onclick="handleVipClick(event)"
           title="${App.user && isVip(App.user.role) ? 'Zone VIP' : 'Accès VIP requis'}">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" class="vip-lock-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          VIP
        </a>
        <a href="about.html" class="${activePage === 'about' ? 'active' : ''}">À propos</a>
        ${App.user ? `<a href="#" class="nav-support-btn ${activePage === 'support' ? 'active' : ''}" onclick="openSupportModal(event)">Support</a>` : ''}
      </nav>
    </div>
    <div class="navbar-right">
      <div id="createBtnArea"></div>
      <div class="search-wrap">
        <svg class="search-icon" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input class="search-input" type="text" placeholder="Rechercher..." id="globalSearch"
          onkeydown="if(event.key==='Enter')doSearch(this.value)">
      </div>
      <div id="authArea"></div>
      <button class="nav-burger" onclick="toggleMobileNav()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;

  renderAuthArea();
}

function toggleMobileNav() {
  document.getElementById('mobileNav')?.classList.toggle('open');
}

function openVipModal(e) {
  e.preventDefault();
  if (App.user && isVip(App.user.role)) { window.location.href = 'vip.html'; return; }
  let modal = document.getElementById('vipModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'vipModal';
    modal.className = 'vip-modal-overlay';
    modal.innerHTML = `
      <div class="vip-modal">
        <button class="vip-modal-close" onclick="closeVipModal()" aria-label="Fermer">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="vip-modal-icon">
          <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div class="vip-modal-title">Accès VIP requis</div>
        <div class="vip-modal-desc">
          Cette zone est réservée aux membres VIP.<br>
          Pour obtenir l'accès, achetez le rôle VIP directement sur notre serveur Discord via un ticket.
        </div>
        <div class="vip-modal-steps">
          <div class="vip-step"><span class="vip-step-num">1</span><span>Rejoignez le serveur Discord</span></div>
          <div class="vip-step"><span class="vip-step-num">2</span><span>Ouvrez un ticket dans le canal prévu</span></div>
          <div class="vip-step"><span class="vip-step-num">3</span><span>Achetez l'accès VIP et connectez-vous ici</span></div>
        </div>
        <a href="https://discord.gg/VOTRE_INVITE" target="_blank" class="vip-modal-btn">
          ${DISCORD_SVG} Rejoindre le serveur Discord
        </a>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeVipModal(); });
  }
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeVipModal() {
  const modal = document.getElementById('vipModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function handleVipClick(e) {
  if (App.user && isVip(App.user.role)) return;
  e.preventDefault();
  openVipModal(e);
}

function renderAuthArea() {
  const area = document.getElementById('authArea');
  const createArea = document.getElementById('createBtnArea');
  if (!area) return;

  if (!App.user) {
    if (createArea) createArea.innerHTML = '';
    area.innerHTML = `
      <a href="${API_BASE}/auth/discord" class="btn-discord-login">
        ${DISCORD_SVG} Se connecter
      </a>
    `;
    return;
  }

  if (createArea) {
    createArea.innerHTML = `
      <a href="submit.html" class="btn-nav-create">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Créer
      </a>
    `;
  }

  area.innerHTML = `
    <div class="nav-auth-group">
      <div class="notif-wrap" id="notifWrap">
        <button class="notif-btn" onclick="toggleNotifs()" title="Notifications">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span class="notif-badge" id="notifBadge"></span>
        </button>
        <div class="notif-dropdown" id="notifDropdown">
          <div class="notif-head">
            <span>Notifications</span>
            <button class="notif-read-all" onclick="clearNotifs()">Tout supprimer</button>
          </div>
          <div id="notifList"><div class="loading"><div class="spinner"></div></div></div>
        </div>
      </div>
      <div class="user-menu" id="userMenuWrap">
        <div class="user-trigger" onclick="toggleUserMenu()">
          <img src="${App.user.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="">
          <span class="uname">${App.user.username}</span>
          <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="user-dropdown" id="userDropdown">
          <div class="dropdown-header">
            <div class="dh-name">${App.user.username}</div>
            <div class="dh-role">${roleLabel(App.user.role)}</div>
          </div>
          <a href="profile.html?id=${App.user._id}" class="dropdown-item" onclick="closeMenus()">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Mon profil
          </a>
          <a href="settings.html" class="dropdown-item" onclick="closeMenus()">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Paramètres
          </a>
          ${roleLevel(App.user.role) >= 1 ? `
          <a href="admin.html" class="dropdown-item" onclick="closeMenus()">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Administration
          </a>` : ''}
          <div class="dropdown-sep"></div>
          <button class="dropdown-item danger" onclick="logout()">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  `;
  loadNotifications();
}

function toggleUserMenu() {
  document.getElementById('userDropdown')?.classList.toggle('open');
  document.getElementById('notifDropdown')?.classList.remove('open');
}
function toggleNotifs() {
  document.getElementById('notifDropdown')?.classList.toggle('open');
  document.getElementById('userDropdown')?.classList.remove('open');
}
function closeMenus() {
  document.getElementById('userDropdown')?.classList.remove('open');
  document.getElementById('notifDropdown')?.classList.remove('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#userMenuWrap') && !e.target.closest('#notifWrap')) closeMenus();
});

async function loadNotifications() {
  try {
    const notifs = await apiFetch('/users/me/notifications');
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('notifBadge');
    if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!notifs.length) { list.innerHTML = '<div class="notif-empty">Aucune notification</div>'; return; }
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-text">${n.message}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
    `).join('');
  } catch {}
}

async function markAllRead() {
  try { await apiFetch('/users/me/notifications/read-all', { method: 'PATCH' }); } catch {}
  loadNotifications();
}

async function clearNotifs() {
  try {
    await apiFetch('/users/me/notifications', { method: 'DELETE' });
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
    const list = document.getElementById('notifList');
    if (list) list.innerHTML = '<div class="notif-empty">Aucune notification</div>';
  } catch(err) { showToast('Erreur', 'error'); }
}

// ============================================================
// FOOTER
// ============================================================
function renderFooter() {
  const footer = document.getElementById('footer');
  if (!footer) return;
  footer.innerHTML = `
    <div>
      <div class="footer-brand">
        <img src="assets/logo.png" alt="">
        VUNY LEAK <span style="color:var(--red)">V2</span>
      </div>
      <div class="footer-copy">© 2026 Vuny Leak V2. Tous droits réservés.</div>
    </div>
    <div class="footer-links">
      <a href="index.html">Accueil</a>
      <a href="submit.html">Soumettre</a>
      <a href="about.html">À propos</a>
    </div>
    <div class="footer-right">
      <span class="footer-badge">Données chiffrées</span>
      <span class="footer-badge">Discord OAuth2</span>
    </div>
  `;
}

// ============================================================
// CARDS — avec auteur cliquable + follow
// ============================================================
function renderStars(rating, showCount = true) {
  const r = Math.round(rating || 0);
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="star ${i < r ? 'on' : ''}">&#9733;</span>`
  ).join('');
  return `<div class="stars">${stars}${showCount ? `<span class="stars-count">${(rating || 0).toFixed(1)}</span>` : ''}</div>`;
}

function resourceCard(r, rank) {
  const thumb = r.thumbnail
    ? `<img class="card-thumb" src="${r.thumbnail}" alt="" onerror="this.parentElement.innerHTML='<div class=card-thumb-empty><svg fill=none stroke=currentColor stroke-width=1.5 viewBox=0 0 24 24><rect x=3 y=3 width=18 height=18 rx=2/><circle cx=8.5 cy=8.5 r=1.5/><path d=M21 15l-5-5L5 21/></svg></div>'">`
    : `<div class="card-thumb-empty"><svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;

  const authorId = r.author?._id || r.author;
  const authorName = r.author?.username || 'Inconnu';
  const authorAvatar = r.author?.avatar;
  const isVipRes = r.vipOnly;

  return `
    <div class="card ${isVipRes ? 'card-vip' : ''}" onclick="openResource('${r._id}')">
      ${thumb}
      ${isVipRes ? '<div class="card-vip-badge"><svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> VIP</div>' : ''}
      <div class="card-body">
        ${rank !== undefined ? `<div class="card-rank">#${rank + 1}</div>` : ''}
        <div class="card-title">${r.title}</div>
        <div class="card-author-row" onclick="event.stopPropagation()">
          ${authorAvatar ? `<img src="${authorAvatar}" class="card-author-ava" alt="" onerror="this.style.display='none'">` : ''}
          <a href="profile.html?id=${authorId}" class="card-author-link">Par <span>${authorName}</span></a>
        </div>
        ${renderStars(r.averageRating)}
        <div class="card-meta">
          <span><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${r.downloads}</span>
          <span><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${r.views}</span>
        </div>
        <div class="card-footer">
          <span class="badge-cat">${r.category}</span>
          <span class="${r.resourceType === 'free' ? 'badge-free' : 'badge-paid'}">${r.resourceType === 'free' ? 'GRATUIT' : `${r.price}€`}</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// RESOURCE MODAL — auteur cliquable + follow
// ============================================================
function openResource(id) {
  const overlay = document.getElementById('resourceOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.getElementById('modalTitle').textContent = 'Chargement...';
  document.getElementById('modalBody').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  apiFetch(`/resources/${id}`).then(async r => {
    document.getElementById('modalTitle').textContent = r.title;
    const thumb = r.thumbnail ? `<img style="width:100%;border-radius:8px;max-height:300px;object-fit:cover;margin-bottom:1.2rem" src="${r.thumbnail}" alt="">` : '';

    const authorId = r.author?._id || r.author;
    const authorName = r.author?.username || 'Inconnu';
    const authorAvatar = r.author?.avatar;

    // Check if we follow this author
    let isFollowing = false;
    if (App.user && authorId && App.user._id !== authorId) {
      try {
        const status = await apiFetch(`/users/${authorId}/follow-status`);
        isFollowing = status.isFollowing;
      } catch {}
    }

    const authorBlock = authorId ? `
      <div class="modal-author-block" onclick="event.stopPropagation()">
        ${authorAvatar ? `<img src="${authorAvatar}" class="modal-author-ava" alt="" onerror="this.style.display='none'">` : `<div class="modal-author-ava-placeholder"></div>`}
        <div class="modal-author-info">
          <a href="profile.html?id=${authorId}" class="modal-author-name">${authorName}</a>
          <div class="modal-author-sub">Publiée par cet auteur</div>
        </div>
        ${App.user && App.user._id !== authorId ? makeFollowBtn(authorId, isFollowing) : ''}
      </div>
    ` : '';

    const downloadBtn = r.resourceType === 'paid'
      ? `<a href="${r.purchaseUrl}" target="_blank" class="btn btn-primary btn-lg" style="margin-bottom:1rem;display:inline-flex">Acheter (${r.price} €)</a>`
      : App.user
        ? `<button class="btn btn-primary btn-lg" style="margin-bottom:1rem" onclick="doDownload('${r._id}', this)">
             <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
             Télécharger
           </button>`
        : `<a href="${API_BASE}/auth/discord" class="btn btn-discord-login" style="margin-bottom:1rem;display:inline-flex;text-decoration:none">${DISCORD_SVG} Connexion requise</a>`;

    document.getElementById('modalBody').innerHTML = `
      ${thumb}
      ${authorBlock}
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:1rem">
        <span class="status status-approved" style="font-size:0.72rem">${r.category}</span>
        ${r.vipOnly ? `<span class="vip-badge"><span class="vip-crown">★</span> VIP</span>` : ''}
        <span style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:3px 10px;font-size:0.75rem;color:var(--text-muted)">${r.downloads} téléchargements</span>
        <span style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:3px 10px;font-size:0.75rem;color:var(--text-muted)">${r.views} vues</span>
        <span class="${r.resourceType === 'free' ? 'badge-free' : 'badge-paid'}">${r.resourceType === 'free' ? 'GRATUIT' : `${r.price} €`}</span>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:1rem">
        ${renderStars(r.averageRating)}
        <span style="font-size:0.8rem;color:var(--text-muted)">${r.reviews?.length || 0} avis</span>
      </div>
      <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.7;margin-bottom:1.2rem">${r.description}</p>
      ${r.videoUrl ? `<div style="margin-bottom:1rem"><a href="${r.videoUrl}" target="_blank" class="btn btn-outline btn-sm">Voir la vidéo de présentation</a></div>` : ''}
      ${downloadBtn}
      ${App.user ? `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:1rem;margin:1.2rem 0">
          <div style="font-weight:600;font-size:0.85rem;margin-bottom:.8rem">Donner une note</div>
          <div id="ratingRow" style="display:flex;gap:4px;margin-bottom:.7rem">
            ${[1,2,3,4,5].map(i => `<button onclick="setRating(${i})" data-v="${i}" style="background:none;font-size:1.4rem;color:var(--border2);border:none;cursor:pointer;transition:color 0.15s" class="rstar">&#9733;</button>`).join('')}
          </div>
          <textarea class="form-input" id="reviewTxt" placeholder="Votre commentaire (optionnel)..." style="min-height:60px;margin-bottom:.6rem"></textarea>
          <button class="btn btn-outline btn-sm" onclick="submitReview('${r._id}')">Envoyer</button>
        </div>
        <div style="margin-top:1.5rem">
          <div style="font-weight:600;font-size:0.85rem;margin-bottom:1rem">Commentaires (${r.comments?.length || 0})</div>
          <div style="display:flex;gap:10px;margin-bottom:1rem">
            <img src="${App.user.avatar || ''}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="">
            <div style="flex:1">
              <textarea class="form-input" id="commentTxt" placeholder="Écrire un commentaire..." style="min-height:55px"></textarea>
              <button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="postComment('${r._id}')">Publier</button>
            </div>
          </div>
          ${(r.comments || []).map(c => `
            <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
              <a href="profile.html?id=${c.user?._id}" onclick="event.stopPropagation()">
                <img src="${c.user?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="">
              </a>
              <div style="min-width:0">
                <a href="profile.html?id=${c.user?._id}" onclick="event.stopPropagation()" style="font-weight:600;font-size:0.78rem;color:var(--white);text-decoration:none">${c.user?.username || 'Inconnu'}</a>
                <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;word-break:break-word">${c.content}</div>
                <div style="font-size:0.7rem;color:var(--text-dim);margin-top:3px">${timeAgo(c.createdAt)}</div>
              </div>
            </div>
          `).join('') || '<p style="font-size:0.82rem;color:var(--text-dim)">Aucun commentaire.</p>'}
        </div>
      ` : `<p style="font-size:0.82rem;color:var(--text-muted);margin-top:1rem">Connectez-vous pour commenter et noter.</p>`}
    `;

    let selectedRating = 0;
    document.querySelectorAll('.rstar').forEach(btn => {
      btn.addEventListener('mouseover', () => {
        const v = +btn.dataset.v;
        document.querySelectorAll('.rstar').forEach(b => { b.style.color = +b.dataset.v <= v ? '#e0a020' : 'var(--border2)'; });
      });
      btn.addEventListener('mouseout', () => {
        document.querySelectorAll('.rstar').forEach(b => { b.style.color = +b.dataset.v <= selectedRating ? '#e0a020' : 'var(--border2)'; });
      });
      btn.addEventListener('click', () => { selectedRating = +btn.dataset.v; window._selectedRating = selectedRating; });
    });
  }).catch(err => {
    document.getElementById('modalBody').innerHTML = `<div class="empty"><p>${err.message}</p></div>`;
  });
}

function closeResourceModal() {
  document.getElementById('resourceOverlay')?.classList.remove('open');
}

async function doDownload(id, btn) {
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Chargement...'; }
    const data = await apiFetch(`/resources/${id}/download`, { method: 'POST' });
    if (data.files?.length) {
      data.files.forEach(f => {
        const a = document.createElement('a');
        a.href = f.url; a.target = '_blank'; a.download = f.name || 'fichier';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      });
      showToast('Téléchargement démarré', 'success');
    } else { showToast('Aucun fichier disponible', 'error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Télécharger'; }
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Télécharger'; }
  }
}

async function submitReview(rid) {
  const rating = window._selectedRating;
  if (!rating) return showToast('Sélectionnez une note', 'error');
  const comment = document.getElementById('reviewTxt')?.value || '';
  try {
    await apiFetch(`/resources/${rid}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) });
    showToast('Avis publié', 'success');
    openResource(rid);
  } catch (err) { showToast(err.message, 'error'); }
}

async function postComment(rid) {
  const content = document.getElementById('commentTxt')?.value?.trim();
  if (!content) return showToast('Entrez un commentaire', 'error');
  try {
    await apiFetch(`/resources/${rid}/comment`, { method: 'POST', body: JSON.stringify({ content }) });
    showToast('Commentaire publié', 'success');
    openResource(rid);
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
// SEARCH
// ============================================================
function doSearch(q) {
  if (!q.trim()) return;
  if (window.location.pathname.includes('index') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
    if (window.performSearch) window.performSearch(q.trim());
  } else {
    window.location.href = `index.html?search=${encodeURIComponent(q.trim())}`;
  }
}

// ============================================================
// UTILS
// ============================================================
const DISCORD_SVG = `<svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M13.545 2.907a13.227 13.227 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.19 12.19 0 0 0-3.658 0 8.258 8.258 0 0 0-.412-.833.051.051 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.041.041 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.276 13.276 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a8.875 8.875 0 0 1-1.248-.595.05.05 0 0 1-.02-.066.051.051 0 0 1 .015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.052.052 0 0 1 .053.007q.121.1.248.195a.051.051 0 0 1-.004.085 8.254 8.254 0 0 1-1.249.594.05.05 0 0 0-.03.03.052.052 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.235 13.235 0 0 0 4.001-2.02.049.049 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.034.034 0 0 0-.02-.019Zm-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612Zm5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612Z"/></svg>`;

function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function timeAgo(date) {
  if (!date) return '';
  const diff = (Date.now() - new Date(date)) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 2592000) return `il y a ${Math.floor(diff / 86400)} j`;
  return new Date(date).toLocaleDateString('fr-FR');
}

function roleLabel(role) {
  if (role === 'developer') return 'Développeur';
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Administrateur';
  if (role === 'vip') return 'VIP';
  return 'Membre';
}

function roleColor(role) {
  if (role === 'developer') return '#7c3aed';
  if (role === 'owner') return '#e0a020';
  if (role === 'admin') return 'var(--red)';
  if (role === 'vip') return '#e2e8f0';
  return 'var(--text-muted)';
}

function roleBadge(role) {
  const colors = {
    developer: { bg: 'rgba(124,58,237,.15)', border: 'rgba(124,58,237,.35)', text: '#a78bfa' },
    owner: { bg: 'rgba(224,160,32,.12)', border: 'rgba(224,160,32,.35)', text: '#e0a020' },
    admin: { bg: 'var(--red-dim)', border: 'var(--red-border)', text: 'var(--red)' },
    vip: { bg: 'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.15)', text: '#e2e8f0' },
    user: { bg: 'var(--bg3)', border: 'var(--border)', text: 'var(--text-muted)' },
  };
  const c = colors[role] || colors.user;
  return `<span style="display:inline-block;font-size:0.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:2px 9px;border-radius:20px;background:${c.bg};border:1px solid ${c.border};color:${c.text}">${roleLabel(role)}</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
});

// ════════════════════════════════════════════════
// SUPPORT TICKET SYSTEM — Centered modal
// ════════════════════════════════════════════════
// ── CONFLICT MODAL (support ↔ boutique) ─────────────────────────────────────
// Retourne une Promise<true> (fermer l'ancien), <false> (annuler la création), <null> (annuler)
function _showConflictModal(titre, message, typeOld, typeNew) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('_conflictOverlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = '_conflictOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px)';

    const svgShop = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
    const svgSupport = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.51 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.4a16 16 0 0 0 6 6l.79-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
    const svgArrow = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

    const iconOld = typeOld === 'shop' ? svgShop : svgSupport;
    const iconNew = typeNew === 'shop' ? svgShop : svgSupport;

    overlay.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:16px;max-width:400px;width:100%;padding:28px">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;color:var(--red)">
          <div style="background:var(--red-dim);border:1px solid var(--red-border);border-radius:10px;padding:10px;display:flex;align-items:center;justify-content:center">${iconOld}</div>
          <div style="color:var(--text-dim)">${svgArrow}</div>
          <div style="background:var(--red-dim);border:1px solid var(--red-border);border-radius:10px;padding:10px;display:flex;align-items:center;justify-content:center">${iconNew}</div>
        </div>
        <div style="font-family:var(--font-display);font-size:1rem;font-weight:700;text-align:center;margin-bottom:8px">${titre}</div>
        <div style="font-size:.83rem;color:var(--text-muted);line-height:1.6;text-align:center;margin-bottom:22px">${message}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button id="_conflictYes" class="btn btn-danger" style="justify-content:center">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Oui, fermer l'ancien ticket et continuer
          </button>
          <button id="_conflictNo" class="btn btn-outline" style="justify-content:center">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Non, garder mon ticket actuel
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('_conflictYes').onclick = () => { overlay.remove(); resolve(true); };
    document.getElementById('_conflictNo').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
  });
}

// Exposer globalement pour shop.html
window._showConflictModal = _showConflictModal;

const _supportState = {
  ticketId: null,
  open: false,
  evtSource: null,
  imgBase64: null,
  imgSelected: false,
};
window._supportState = _supportState;
// Track all active tickets (support + boutique) for tab switching
const _chatTabs = []; // {id, title, type:'boutique'|'support'}
let _activeChatType = null; // 'boutique' or 'support'

async function openSupportModal(e) {
  if (e) e.preventDefault();
  if (!App.user) { showToast('Connectez-vous pour ouvrir un ticket', 'error'); return; }
  _injectSupportUI();

  if (_supportState.ticketId) {
    // Already has an open ticket -> show chat directly
    _openSupportChatModal();
  } else {
    // Show create ticket form
    _showSupportCreateForm();
  }
}

function _injectSupportUI() {
  if (document.getElementById('supportChatOverlay')) return;

  // ── CHAT OVERLAY (centered) ──
  const overlay = document.createElement('div');
  overlay.className = 'chat-modal-overlay';
  overlay.id = 'supportChatOverlay';
  overlay.innerHTML = `
    <div class="chat-modal-box" id="supportChatBox">
      <div class="chat-modal-head">
        <div class="chat-modal-icon" style="background:var(--red-dim);border:1px solid var(--red-border)">
          <svg width="18" height="18" fill="none" stroke="var(--red)" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.51 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.4a16 16 0 0 0 6 6l.79-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </div>
        <div class="chat-modal-info">
          <div class="chat-modal-title" id="supportChatTitle">Support</div>
          <div class="chat-modal-sub" id="supportChatSub">Chat avec l'équipe</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <div id="chatTabsWrap" style="display:none;gap:4px;display:flex"></div>
          <button class="chat-modal-close" onclick="_closeSupportChatModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="chat-modal-messages" id="supportChatMessages"></div>
      <div id="supportChatStatus" style="display:none" class="chat-modal-status"></div>
      <div id="supportChatImgPreview" class="img-send-preview">
        <img id="supportChatImgThumb" src="" alt="">
        <span id="supportChatImgName" style="font-size:.75rem;color:var(--text-muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis"></span>
        <button class="img-send-preview-remove" onclick="_clearSupportImg()">✕</button>
      </div>
      <div class="chat-modal-input-area" id="supportChatInputArea">
        <input type="file" id="supportChatImgInput" accept="image/*" style="display:none" onchange="_onSupportImgSelect(event)">
        <textarea class="chat-modal-input" id="supportChatInput" placeholder="Votre message..." rows="1"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_sendSupportMsg();}"></textarea>
        <button class="chat-modal-img-btn" id="supportChatImgBtn" onclick="document.getElementById('supportChatImgInput').click()" title="Joindre une image">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </button>
        <button class="chat-modal-send-btn" onclick="_sendSupportMsg()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeSupportChatModal(); });
  document.body.appendChild(overlay);

  // ── CREATE FORM OVERLAY ──
  const formOverlay = document.createElement('div');
  formOverlay.className = 'chat-modal-overlay';
  formOverlay.id = 'supportFormOverlay';
  formOverlay.innerHTML = `
    <div class="support-create-modal">
      <div class="chat-modal-head">
        <div class="chat-modal-icon" style="background:var(--red-dim);border:1px solid var(--red-border)">
          <svg width="18" height="18" fill="none" stroke="var(--red)" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.51 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.4a16 16 0 0 0 6 6l.79-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </div>
        <div class="chat-modal-info">
          <div class="chat-modal-title">Contacter le support</div>
          <div class="chat-modal-sub">Un staff vous répondra dès que possible</div>
        </div>
        <button class="chat-modal-close" onclick="_closeSupportForm()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div style="padding:24px">
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:20px">
          <div style="font-size:.8rem;font-weight:700;color:var(--white);margin-bottom:4px;display:flex;align-items:center;gap:6px">
            <svg width="14" height="14" fill="none" stroke="var(--red)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Règles du support
          </div>
          <div style="font-size:.78rem;color:var(--text-muted);line-height:1.6">
            • Soyez précis et respectueux<br>
            • Un seul ticket à la fois est autorisé<br>
            • Un staff prendra en charge votre demande sous 24h<br>
            • Ne spammez pas — les abus seront sanctionnés
          </div>
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Sujet du ticket <span class="req">*</span></label>
          <input class="form-input" id="supportFormSubject" placeholder="Ex : Problème de téléchargement, question VIP...">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-outline" onclick="_closeSupportForm()">Annuler</button>
          <button class="btn btn-primary" onclick="_submitSupportTicket()">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Créer le ticket
          </button>
        </div>
      </div>
    </div>`;
  formOverlay.addEventListener('click', e => { if (e.target === formOverlay) _closeSupportForm(); });
  document.body.appendChild(formOverlay);
}

function _showSupportCreateForm() {
  const o = document.getElementById('supportFormOverlay');
  if (o) { o.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function _closeSupportForm() {
  const o = document.getElementById('supportFormOverlay');
  if (o) { o.classList.remove('open'); document.body.style.overflow = ''; }
}
function _openSupportChatModal() {
  const o = document.getElementById('supportChatOverlay');
  if (o) { o.classList.add('open'); document.body.style.overflow = 'hidden'; }
  if (_supportState.ticketId) {
    _refreshSupportMessages(_supportState.ticketId);
  }
  _refreshChatTabs();
}
function _closeSupportChatModal() {
  const o = document.getElementById('supportChatOverlay');
  if (o) { o.classList.remove('open'); }
  document.body.style.overflow = '';
}

async function _submitSupportTicket() {
  const subject = document.getElementById('supportFormSubject')?.value.trim();
  if (!subject) { showToast('Entrez un sujet', 'error'); return; }

  // Vérif ticket boutique ouvert
  const shopState = typeof chatState !== 'undefined' ? chatState : null;
  if (shopState && shopState.ticketId) {
    _closeSupportForm();
    const confirmed = await _showConflictModal(
      'Ticket boutique ouvert',
      'Vous avez déjà un ticket boutique ouvert. Voulez-vous le fermer pour créer un ticket support ?',
      'shop', 'support'
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/shop/tickets/${shopState.ticketId}/close`, { method: 'PATCH', body: JSON.stringify({ reason: 'Fermé pour créer un ticket support' }) });
      shopState.ticketId = null;
      const bubble = document.getElementById('chatBubble');
      if (bubble) bubble.style.display = 'none';
      const panel = document.getElementById('chatPanel');
      if (panel) panel.classList.remove('open');
    } catch(e2) { showToast('Impossible de fermer le ticket boutique : ' + e2.message, 'error'); return; }
    // Réouvrir le formulaire après la modale
    _showSupportCreateForm();
    setTimeout(() => {
      const inp = document.getElementById('supportFormSubject');
      if (inp) inp.value = subject;
    }, 50);
    return;
  }

  try {
    const ticket = await apiFetch('/support', { method: 'POST', body: JSON.stringify({ title: subject, description: subject }) });
    _closeSupportForm();
    _supportState.ticketId = ticket._id;
    _startSupportSSE(ticket._id);
    // Show the chat
    document.getElementById('supportChatTitle').textContent = ticket.title;
    document.getElementById('supportChatSub').textContent = "Un staff vous répondra dès que possible";
    _addChatTab(ticket._id, ticket.title, 'support');
    _openSupportChatModal();
    // Show FAB
    _showSupportFab();
    showToast('Ticket créé ! Un staff va prendre en charge votre demande.', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

function _showSupportFab() {
  let fab = document.getElementById('supportFab');
  if (!fab) {
    fab = document.createElement('div');
    fab.className = 'chat-fab';
    fab.id = 'supportFab';
    fab.innerHTML = `
      <button class="chat-fab-btn" onclick="openSupportModal(null)" title="Mon ticket support" style="background:var(--red)">
        <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.51 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.4a16 16 0 0 0 6 6l.79-.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span class="chat-fab-badge" id="supportFabBadge"></span>
      </button>`;
    document.body.appendChild(fab);
  }
  fab.style.display = 'block';
}

async function _refreshSupportMessages(ticketId) {
  try {
    const ticket = await apiFetch(`/support/${ticketId}`);
    const msgEl = document.getElementById('supportChatMessages');
    const statusEl = document.getElementById('supportChatStatus');
    const inputArea = document.getElementById('supportChatInputArea');
    const sub = document.getElementById('supportChatSub');
    const titleEl = document.getElementById('supportChatTitle');

    if (titleEl) titleEl.textContent = ticket.title || 'Support';

    if (ticket.status !== 'open') {
      if (inputArea) inputArea.style.display = 'none';
      if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = `<span style="color:var(--text-muted)">🔒 Ticket fermé${ticket.closeReason ? ' — ' + ticket.closeReason : ''}</span>`; }
      if (sub) sub.textContent = 'Ticket fermé';
    } else {
      if (inputArea) inputArea.style.display = 'flex';
      if (statusEl) statusEl.style.display = 'none';
      if (sub) sub.textContent = 'Un staff vous répondra dès que possible';
    }

    if (msgEl) {
      msgEl.innerHTML = '';
      (ticket.messages || []).forEach(m => _appendSupportMsg(m));
      msgEl.scrollTop = msgEl.scrollHeight;
    }
  } catch {}
}

function _appendSupportMsg(m) {
  const msgEl = document.getElementById('supportChatMessages');
  if (!msgEl) return;
  if (m._id && msgEl.querySelector(`[data-mid="${m._id}"]`)) return;
  const isMe = m.sender?._id === App.user?._id || m.sender === App.user?._id;
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${isMe ? 'mine' : ''}`;
  if (m._id) wrap.dataset.mid = m._id;
  const ava = m.sender?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const name = m.sender?.username || '?';
  const imgHtml = m.imageUrl ? `<img src="${m.imageUrl}" class="chat-msg-img" alt="" style="cursor:pointer;max-width:220px" onclick="window.open('${m.imageUrl}','_blank')">` : '';
  const rawText = m.content ? m.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>') : '';
  wrap.innerHTML = `
    <img src="${ava}" class="chat-msg-ava" alt="" title="${name}">
    <div>
      ${!isMe ? `<div style="font-size:.68rem;color:var(--text-dim);margin-bottom:2px">${name}</div>` : ''}
      <div class="chat-msg-bubble">${rawText}${imgHtml}</div>
      <div class="chat-msg-time">${timeAgo(m.createdAt)}</div>
    </div>`;
  msgEl.appendChild(wrap);
}

function _startSupportSSE(ticketId) {
  if (_supportState.evtSource) _supportState.evtSource.close();
  if (!App.token) return;
  const src = new EventSource(`${API_BASE}/support/${ticketId}/events?token=${App.token}`);
  _supportState.evtSource = src;
  src.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'message') {
      _appendSupportMsg(data.message);
      const msgEl = document.getElementById('supportChatMessages');
      if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
      const isMe = data.message?.sender?._id === App.user?._id;
      if (!isMe) {
        playMemberSound();
        const o = document.getElementById('supportChatOverlay');
        if (!o?.classList.contains('open')) {
          const badge = document.getElementById('supportFabBadge');
          if (badge) { badge.style.display='flex'; badge.textContent=(parseInt(badge.textContent)||0)+1; }
        }
      }
    } else if (data.type === 'status') {
      _refreshSupportMessages(ticketId);
    }
  };
  src.onerror = () => {};
}

function _onSupportImgSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    _supportState.imgBase64 = e.target.result;
    _supportState.imgSelected = true;
    const preview = document.getElementById('supportChatImgPreview');
    const thumb = document.getElementById('supportChatImgThumb');
    const nameEl = document.getElementById('supportChatImgName');
    const btn = document.getElementById('supportChatImgBtn');
    if (preview) preview.classList.add('show');
    if (thumb) thumb.src = e.target.result;
    if (nameEl) nameEl.textContent = file.name;
    if (btn) btn.classList.add('selected');
  };
  reader.readAsDataURL(file);
}
function _clearSupportImg() {
  _supportState.imgBase64 = null;
  _supportState.imgSelected = false;
  const preview = document.getElementById('supportChatImgPreview');
  const btn = document.getElementById('supportChatImgBtn');
  const fi = document.getElementById('supportChatImgInput');
  if (preview) preview.classList.remove('show');
  if (btn) btn.classList.remove('selected');
  if (fi) fi.value = '';
}

async function _sendSupportMsg() {
  const input = document.getElementById('supportChatInput');
  const content = input?.value.trim();
  if (!content && !_supportState.imgBase64) return;
  if (!_supportState.ticketId) return;
  input.value = ''; input.style.height = 'auto';
  const imgData = _supportState.imgBase64;
  _clearSupportImg();
  try {
    await apiFetch(`/support/${_supportState.ticketId}/message`, { method: 'POST', body: JSON.stringify({ content, imageUrl: imgData || null }) });
  } catch(e) { showToast(e.message, 'error'); if (input) input.value = content; }
}

// ── MULTI-TAB SYSTEM ──
function _addChatTab(id, title, type) {
  if (!_chatTabs.find(t => t.id === id)) {
    _chatTabs.push({ id, title, type });
  }
  _refreshChatTabs();
}
function _removeChatTab(id) {
  const i = _chatTabs.findIndex(t => t.id === id);
  if (i !== -1) _chatTabs.splice(i, 1);
  _refreshChatTabs();
}
function _refreshChatTabs() {
  const wrap = document.getElementById('chatTabsWrap');
  if (!wrap) return;
  if (_chatTabs.length <= 1) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = _chatTabs.map(t => `
    <button onclick="_switchChatTab('${t.id}')" title="${t.title}"
      style="padding:4px 10px;border-radius:8px;border:1px solid ${t.id===_supportState.ticketId?'var(--red-border)':'var(--border)'};background:${t.id===_supportState.ticketId?'var(--red-dim)':'var(--bg4)'};color:${t.id===_supportState.ticketId?'var(--red)':'var(--text-dim)'};font-size:.72rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s">
      ${t.type==='boutique'?'🛒':'🎫'} ${t.title.substring(0,12)}${t.title.length>12?'…':''}
    </button>`).join('');
}
function _switchChatTab(ticketId) {
  const tab = _chatTabs.find(t => t.id === ticketId);
  if (!tab) return;
  if (tab.type === 'support') {
    _supportState.ticketId = ticketId;
    document.getElementById('supportChatTitle').textContent = tab.title;
    _refreshSupportMessages(ticketId);
  } else if (tab.type === 'boutique') {
    // Show boutique chat (if on shop page, call global openChatPanel)
    if (typeof openChatPanel === 'function') openChatPanel(ticketId, tab.title);
  }
  _refreshChatTabs();
}

// Legacy compatibility (called from shop.html)
function openSupportChatPanel(ticketId, title) {
  _injectSupportUI();
  _supportState.ticketId = ticketId;
  _addChatTab(ticketId, title || 'Support', 'support');
  _startSupportSSE(ticketId);
  _openSupportChatModal();
  _showSupportFab();
}

// Legacy toggleSupportChatPanel (may be called from old code)
function toggleSupportChatPanel() { openSupportModal(null); }

// Play a soft notification sound for member
function playMemberSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}
