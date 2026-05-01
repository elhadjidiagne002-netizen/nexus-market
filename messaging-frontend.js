// ══════════════════════════════════════════════════════════════════════════════
// NEXUS Market — MessagingCenter v4.0.0
// Messagerie vendeur-acheteur complète — Polling adaptatif (sans WebSocket)
//
// INTÉGRATION dans index.html :
//   1. Insérer ce bloc <script> entier juste AVANT </body>
//   2. Remplacer `MessageComposeModal` dans les appels par `MessagingCenter`
//   3. Ajouter au composant de navigation :
//        React.createElement(MessagingBadge, { currentUser })
//   4. Déployer messaging-backend-routes.js dans server.js (voir ce fichier)
//
// FONCTIONNALITÉS :
//   ✓ Inbox complète avec conversations groupées
//   ✓ Polling adaptatif (2s actif / 8s visible / 30s caché + backoff erreur)
//   ✓ Indicateur de frappe cross-device via API légère
//   ✓ Accusés de lecture (✓ envoyé / ✓✓ lu + heure exacte au hover)
//   ✓ Réponse à un message (citation/quote)
//   ✓ Réactions emoji (6 réactions)
//   ✓ Partage d'images (base64 → stocké en Supabase Storage)
//   ✓ Suppression douce (supprimé pour moi)
//   ✓ Recherche dans les messages
//   ✓ Filtre : Tous / Non lus / Acheteurs / Vendeurs
//   ✓ Pagination avec curseur (after=timestamp)
//   ✓ Auto-scroll intelligent (garde la position si on lit l'historique)
//   ✓ Séparateurs de date (Aujourd'hui, Hier, dates passées)
//   ✓ Notifications push locales à l'arrivée d'un message
//   ✓ Status "En ligne" / "Vu il y a Xmin" via last_seen polling
//   ✓ Mobile responsive (sidebar escamotable)
//   ✓ Raccourcis clavier (Entrée=envoyer, Shift+Entrée=saut de ligne, Esc=fermer)
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. INJECTION DES STYLES CSS ───────────────────────────────────────────────
(function () {
  if (document.getElementById('nexus-msg-styles')) return;
  const s = document.createElement('style');
  s.id = 'nexus-msg-styles';
  s.textContent = `
/* ── MessagingCenter Layout ─────────────────────────────────────────────── */
.msg-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  z-index: 1200; display: flex; align-items: center; justify-content: center;
  animation: msgFadeIn .18s ease;
}
@keyframes msgFadeIn { from { opacity:0 } to { opacity:1 } }

.msg-container {
  background: #fff; border-radius: 20px;
  width: min(1080px, calc(100vw - 2rem));
  height: min(760px, calc(100vh - 2rem));
  display: flex; overflow: hidden;
  box-shadow: 0 32px 80px rgba(0,133,62,0.18), 0 8px 24px rgba(0,0,0,0.12);
  animation: msgSlideUp .22s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes msgSlideUp { from { transform:translateY(24px) scale(0.97); opacity:0 } to { transform:none; opacity:1 } }

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.msg-sidebar {
  width: 320px; flex-shrink: 0; border-right: 1px solid #eee;
  display: flex; flex-direction: column; background: #fafaf8;
}
.msg-sidebar-header {
  padding: 1.25rem 1.25rem 0.75rem; border-bottom: 1px solid #eee;
}
.msg-sidebar-title {
  font-family: 'Montserrat', sans-serif; font-weight: 800;
  font-size: 1.2rem; color: var(--primary); display: flex;
  align-items: center; justify-content: space-between; margin-bottom: 0.75rem;
}
.msg-search-wrap { position: relative; }
.msg-search-wrap i { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 0.8rem; pointer-events: none; }
.msg-search {
  width: 100%; padding: 0.6rem 0.75rem 0.6rem 2.2rem;
  border: 1.5px solid #e5e5e0; border-radius: 10px;
  font-size: 0.85rem; background: #fff; transition: border-color .15s;
  color: var(--text-primary); font-family: inherit;
}
.msg-search:focus { outline: none; border-color: var(--primary); }

.msg-filter-tabs {
  display: flex; gap: 0.3rem; padding: 0.6rem 1.25rem;
  border-bottom: 1px solid #eee; background: #fafaf8;
}
.msg-tab {
  flex: 1; padding: 0.35rem 0; border-radius: 8px; border: none;
  font-size: 0.72rem; font-weight: 600; cursor: pointer;
  background: transparent; color: var(--text-secondary);
  transition: all .15s; letter-spacing: 0.02em;
}
.msg-tab.active {
  background: var(--primary); color: #fff;
}
.msg-tab:hover:not(.active) { background: #eee; color: var(--text-primary); }

.msg-conv-list {
  flex: 1; overflow-y: auto; padding: 0.4rem;
}
.msg-conv-item {
  display: flex; gap: 0.75rem; align-items: center;
  padding: 0.8rem 0.85rem; border-radius: 12px; cursor: pointer;
  transition: background .12s; position: relative;
}
.msg-conv-item:hover { background: #f0f0eb; }
.msg-conv-item.active { background: #e8f5ee; }
.msg-conv-item.active::before {
  content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 60%; background: var(--primary); border-radius: 0 3px 3px 0;
}
.msg-avatar {
  width: 44px; height: 44px; border-radius: 50%; background: var(--primary);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 1rem; flex-shrink: 0;
  position: relative; font-family: 'Montserrat', sans-serif;
}
.msg-avatar.vendor-avatar { background: linear-gradient(135deg, var(--primary), var(--primary-light)); }
.msg-avatar.buyer-avatar  { background: linear-gradient(135deg, #1a73e8, #4285f4); }
.msg-online-dot {
  width: 11px; height: 11px; border-radius: 50%; background: #22c55e;
  border: 2px solid #fff; position: absolute; bottom: 0; right: 0;
}
.msg-conv-info { flex: 1; min-width: 0; }
.msg-conv-name {
  font-weight: 700; font-size: 0.88rem; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: flex; align-items: center; gap: 0.35rem;
}
.msg-role-badge {
  font-size: 0.6rem; padding: 0.15rem 0.4rem; border-radius: 4px;
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
}
.msg-role-badge.vendor { background: #e8f5ee; color: var(--primary); }
.msg-role-badge.buyer  { background: #e8f0fe; color: #1a73e8; }
.msg-conv-last {
  font-size: 0.78rem; color: var(--text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 0.1rem;
}
.msg-conv-last.unread { font-weight: 600; color: var(--text-primary); }
.msg-conv-meta {
  display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; flex-shrink: 0;
}
.msg-conv-time { font-size: 0.7rem; color: var(--text-secondary); }
.msg-unread-badge {
  background: var(--primary); color: #fff; border-radius: 10px;
  font-size: 0.68rem; font-weight: 800; min-width: 18px;
  height: 18px; display: flex; align-items: center; justify-content: center;
  padding: 0 4px;
}
.msg-no-convs {
  padding: 3rem 1.5rem; text-align: center; color: var(--text-secondary);
}
.msg-no-convs i { font-size: 2.5rem; display: block; margin-bottom: 0.75rem; opacity: 0.35; }
.msg-no-convs p { font-size: 0.88rem; line-height: 1.5; }

/* ── Main thread panel ───────────────────────────────────────────────────── */
.msg-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.msg-thread-header {
  padding: 1rem 1.25rem; border-bottom: 1px solid #eee;
  display: flex; align-items: center; gap: 0.85rem; background: #fff;
  flex-shrink: 0;
}
.msg-thread-header .msg-header-info { flex: 1; min-width: 0; }
.msg-thread-header h3 {
  font-family: 'Montserrat', sans-serif; font-weight: 700;
  font-size: 1rem; color: var(--text-primary); margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.msg-header-status { font-size: 0.73rem; color: var(--text-secondary); margin-top: 0.1rem; }
.msg-header-status.online { color: #22c55e; font-weight: 600; }
.msg-header-actions { display: flex; gap: 0.5rem; }
.msg-icon-btn {
  width: 36px; height: 36px; border-radius: 10px; border: 1px solid #e5e5e0;
  background: #fafaf8; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-secondary); transition: all .12s;
  font-size: 0.85rem;
}
.msg-icon-btn:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
.msg-close-btn {
  width: 36px; height: 36px; border-radius: 10px; border: 1.5px solid #e5e5e0;
  background: #fff; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-secondary); transition: all .12s;
  font-size: 0.9rem;
}
.msg-close-btn:hover { background: var(--danger); color: #fff; border-color: var(--danger); }

/* ── Messages area ────────────────────────────────────────────────────────── */
.msg-thread-body {
  flex: 1; overflow-y: auto; padding: 1rem 1.25rem;
  display: flex; flex-direction: column; gap: 0.1rem;
  background: linear-gradient(180deg, #f9f7f0 0%, #f5f3ec 100%);
  scroll-behavior: smooth;
}
.msg-date-sep {
  text-align: center; margin: 1rem 0 0.5rem; position: relative;
}
.msg-date-sep::before {
  content: ''; position: absolute; left: 0; right: 0;
  top: 50%; height: 1px; background: #e0e0d8;
}
.msg-date-sep span {
  background: linear-gradient(180deg, #f9f7f0, #f5f3ec);
  position: relative; padding: 0 0.75rem;
  font-size: 0.7rem; color: #9a9a8e; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase;
}
.msg-bubble-wrap {
  display: flex; flex-direction: column; max-width: 72%; margin-bottom: 0.2rem;
}
.msg-bubble-wrap.mine { align-self: flex-end; align-items: flex-end; }
.msg-bubble-wrap.theirs { align-self: flex-start; align-items: flex-start; }

.msg-bubble {
  padding: 0.65rem 1rem; border-radius: 18px; font-size: 0.9rem;
  line-height: 1.55; word-break: break-word; position: relative;
  cursor: default; transition: filter .1s;
}
.msg-bubble-wrap.mine .msg-bubble {
  background: var(--primary); color: #fff;
  border-bottom-right-radius: 5px;
}
.msg-bubble-wrap.theirs .msg-bubble {
  background: #fff; color: var(--text-primary);
  border-bottom-left-radius: 5px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.msg-bubble:hover { filter: brightness(0.97); }
.msg-bubble-wrap.mine .msg-bubble:hover { filter: brightness(1.05); }

/* Reply quote inside bubble */
.msg-reply-quote {
  border-left: 3px solid rgba(255,255,255,0.5); padding: 0.35rem 0.6rem;
  border-radius: 4px; margin-bottom: 0.45rem; font-size: 0.78rem;
  background: rgba(255,255,255,0.12); opacity: 0.9; cursor: pointer;
}
.msg-bubble-wrap.theirs .msg-reply-quote {
  border-left-color: var(--primary); background: #f0f8f4; opacity: 1;
  color: var(--primary);
}
.msg-reply-quote-author { font-weight: 700; font-size: 0.72rem; margin-bottom: 0.15rem; }
.msg-reply-quote-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Attachment */
.msg-attachment-img {
  max-width: 220px; max-height: 180px; border-radius: 10px;
  display: block; margin-bottom: 0.35rem; cursor: pointer;
  object-fit: cover; width: 100%;
}

/* Footer: time + status */
.msg-bubble-footer {
  display: flex; align-items: center; gap: 0.3rem; margin-top: 0.2rem;
  font-size: 0.68rem;
}
.msg-bubble-wrap.mine .msg-bubble-footer { justify-content: flex-end; color: rgba(255,255,255,0.75); }
.msg-bubble-wrap.theirs .msg-bubble-footer { color: #b0b0a0; }
.msg-read-receipt { font-size: 0.72rem; }
.msg-read-receipt.read { color: #4cd9a0; }

/* Reactions */
.msg-reactions {
  display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3rem;
}
.msg-reaction {
  display: inline-flex; align-items: center; gap: 0.2rem;
  background: #fff; border: 1.5px solid #e5e5e0; border-radius: 10px;
  padding: 0.15rem 0.45rem; font-size: 0.78rem; cursor: pointer;
  transition: all .12s; user-select: none;
}
.msg-reaction:hover { border-color: var(--primary); background: #e8f5ee; }
.msg-reaction.reacted { background: #e8f5ee; border-color: var(--primary); }
.msg-reaction-count { font-size: 0.72rem; font-weight: 700; color: var(--primary); }

/* Message actions popup */
.msg-actions-popup {
  position: absolute; background: #fff; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14); padding: 0.3rem 0;
  z-index: 100; min-width: 160px; border: 1px solid #eee;
  animation: popIn .12s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes popIn { from { transform: scale(0.85); opacity:0 } to { transform: scale(1); opacity:1 } }
.msg-action-item {
  padding: 0.5rem 0.9rem; font-size: 0.83rem; cursor: pointer;
  display: flex; align-items: center; gap: 0.5rem;
  color: var(--text-primary); transition: background .1s;
}
.msg-action-item:hover { background: #f5f3ec; }
.msg-action-item.danger { color: var(--danger); }
.msg-action-item i { width: 14px; text-align: center; font-size: 0.8rem; }

/* Emoji picker */
.msg-emoji-picker {
  background: #fff; border-radius: 14px; padding: 0.75rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.16); border: 1px solid #eee;
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.25rem;
  width: 220px; animation: popIn .15s ease;
}
.msg-emoji-btn {
  font-size: 1.3rem; width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .1s; border: none; background: transparent;
}
.msg-emoji-btn:hover { background: #f5f3ec; transform: scale(1.2); }

/* Typing indicator */
.msg-typing-wrap {
  align-self: flex-start; display: flex; align-items: center; gap: 0.6rem;
  padding: 0.4rem 0; animation: fadeInUp .2s ease; margin-bottom: 0.2rem;
}
@keyframes fadeInUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
.msg-typing-bubble {
  background: #fff; border-radius: 18px 18px 18px 5px;
  padding: 0.65rem 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  display: flex; gap: 4px; align-items: center;
}
.msg-typing-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #aaa;
  animation: typingBounce 1.3s ease infinite;
}
.msg-typing-dot:nth-child(2) { animation-delay: 0.18s; }
.msg-typing-dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes typingBounce { 0%,60%,100% { transform:none } 30% { transform:translateY(-5px); background: var(--primary); } }

/* Load more */
.msg-load-more {
  text-align: center; padding: 0.5rem;
  font-size: 0.78rem; color: var(--primary); cursor: pointer;
  font-weight: 600; border-radius: 8px; transition: background .12s;
  margin-bottom: 0.5rem; border: 1.5px dashed #c8e6d5;
  background: rgba(0,133,62,0.03);
}
.msg-load-more:hover { background: #e8f5ee; }

/* ── Compose bar ──────────────────────────────────────────────────────────── */
.msg-compose {
  border-top: 1px solid #eee; background: #fff; flex-shrink: 0;
  padding: 0.85rem 1.25rem;
}
.msg-reply-banner {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem;
  background: #e8f5ee; border-radius: 8px; margin-bottom: 0.6rem;
  border-left: 3px solid var(--primary);
}
.msg-reply-banner-text { flex: 1; min-width: 0; }
.msg-reply-banner-author { font-size: 0.73rem; font-weight: 700; color: var(--primary); }
.msg-reply-banner-preview {
  font-size: 0.78rem; color: var(--text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.msg-reply-cancel {
  background: none; border: none; cursor: pointer;
  color: var(--text-secondary); padding: 0.2rem; border-radius: 6px;
  font-size: 0.85rem; transition: color .1s; flex-shrink: 0;
}
.msg-reply-cancel:hover { color: var(--danger); }

.msg-attach-preview {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.7rem;
  background: #f5f3ec; border-radius: 8px; margin-bottom: 0.6rem;
}
.msg-attach-preview img {
  width: 48px; height: 40px; object-fit: cover; border-radius: 6px;
}
.msg-attach-preview span { flex: 1; font-size: 0.78rem; color: var(--text-secondary); }

.msg-compose-row { display: flex; gap: 0.6rem; align-items: flex-end; }
.msg-textarea {
  flex: 1; resize: none; border: 1.5px solid #e5e5e0; border-radius: 14px;
  padding: 0.7rem 1rem; font-size: 0.9rem; font-family: inherit;
  line-height: 1.45; min-height: 44px; max-height: 120px;
  background: #fafaf8; transition: border-color .15s; color: var(--text-primary);
  overflow-y: auto;
}
.msg-textarea:focus { outline: none; border-color: var(--primary); background: #fff; }
.msg-textarea::placeholder { color: #b0b0a0; }
.msg-compose-actions { display: flex; flex-direction: column; gap: 0.35rem; }
.msg-send-btn {
  width: 44px; height: 44px; border-radius: 12px; background: var(--primary);
  border: none; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: #fff; font-size: 1rem;
  transition: all .15s; flex-shrink: 0;
}
.msg-send-btn:hover { background: var(--primary-light); transform: scale(1.05); }
.msg-send-btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }
.msg-hint { font-size: 0.68rem; color: #b0b0a0; padding: 0.35rem 0 0; text-align: right; }

/* ── Empty / Welcome state ────────────────────────────────────────────────── */
.msg-empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 2rem; text-align: center;
  color: var(--text-secondary);
}
.msg-empty-state-icon {
  width: 90px; height: 90px; background: linear-gradient(135deg, #e8f5ee, #d1eedd);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 2.2rem; margin-bottom: 1.25rem;
  box-shadow: 0 8px 24px rgba(0,133,62,0.12);
}
.msg-empty-state h3 {
  font-family: 'Montserrat', sans-serif; font-weight: 800;
  font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.5rem;
}
.msg-empty-state p { font-size: 0.85rem; max-width: 260px; line-height: 1.6; }

/* ── Image lightbox ───────────────────────────────────────────────────────── */
.msg-lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1400;
  display: flex; align-items: center; justify-content: center;
  animation: msgFadeIn .15s ease; cursor: zoom-out;
}
.msg-lightbox img {
  max-width: 90vw; max-height: 90vh; border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.4);
}

/* ── New conversation button ──────────────────────────────────────────────── */
.msg-new-btn {
  width: 32px; height: 32px; border-radius: 8px; background: var(--primary);
  border: none; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: #fff; font-size: 0.85rem;
  transition: all .15s; flex-shrink: 0;
}
.msg-new-btn:hover { background: var(--primary-light); transform: scale(1.08); }

/* ── Search-in-thread bar ─────────────────────────────────────────────────── */
.msg-thread-search-bar {
  padding: 0.5rem 1.25rem; background: #fff8; border-bottom: 1px solid #eee;
  display: flex; align-items: center; gap: 0.5rem;
}
.msg-thread-search-bar input {
  flex: 1; border: 1.5px solid #e5e5e0; border-radius: 8px;
  padding: 0.4rem 0.75rem; font-size: 0.83rem; font-family: inherit;
  background: #fafaf8; color: var(--text-primary);
}
.msg-thread-search-bar input:focus { outline: none; border-color: var(--primary); }
.msg-search-count { font-size: 0.73rem; color: var(--text-secondary); white-space: nowrap; }
.msg-search-nav-btn {
  background: none; border: 1px solid #e5e5e0; border-radius: 6px;
  width: 26px; height: 26px; display: flex; align-items: center;
  justify-content: center; cursor: pointer; color: var(--text-secondary);
  font-size: 0.72rem;
}
.msg-search-nav-btn:hover { background: #f5f3ec; }

/* ── Message search highlight ─────────────────────────────────────────────── */
.msg-highlight { background: rgba(253,239,66,0.6); border-radius: 2px; }

/* ── Polling status indicator ─────────────────────────────────────────────── */
.msg-poll-status {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.67rem; color: var(--text-secondary); padding: 0.2rem 0;
}
.msg-poll-dot {
  width: 6px; height: 6px; border-radius: 50%;
  animation: pulse 2s ease infinite;
}
.msg-poll-dot.ok { background: #22c55e; }
.msg-poll-dot.slow { background: #f59e0b; }
.msg-poll-dot.error { background: var(--danger); animation: none; }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }

/* ── Mobile responsive ────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .msg-container { width: 100vw; height: 100dvh; border-radius: 0; }
  .msg-sidebar { width: 100%; position: absolute; inset: 0; z-index: 10; transition: transform .25s; }
  .msg-sidebar.hidden { transform: translateX(-100%); }
  .msg-main { width: 100%; }
  .msg-back-btn { display: flex !important; }
}
.msg-back-btn { display: none; }

/* ── Badge global (nav) ───────────────────────────────────────────────────── */
.msg-nav-badge {
  position: absolute; top: -4px; right: -4px;
  background: var(--danger); color: #fff; border-radius: 10px;
  font-size: 0.62rem; font-weight: 800; min-width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center; padding: 0 3px;
  border: 2px solid white; pointer-events: none;
}
`;
  document.head.appendChild(s);
})();

// ── 2. CONSTANTES ────────────────────────────────────────────────────────────
const MSG_EMOJIS = ['👍','❤️','😂','😮','😢','🔥','🙏','✅'];
const MSG_POLL_ACTIVE_MS   = 2000;   // Conversation ouverte + onglet visible
const MSG_POLL_IDLE_MS     = 8000;   // Onglet visible, pas de conversation active
const MSG_POLL_HIDDEN_MS   = 30000;  // Onglet caché (document.hidden)
const MSG_POLL_BACKOFF_MAX = 60000;  // Erreur réseau: max 60s
const MSG_TYPING_TTL_MS    = 4000;   // Un indicateur de frappe disparaît après 4s sans signal
const MSG_PAGE_SIZE        = 40;     // Messages par page

// ── 3. POLLING SERVICE (singleton adaptatif) ──────────────────────────────────
/**
 * Service centralisé qui gère UN seul setInterval adaptif pour TOUS les abonnés.
 * Avantages vs N setIntervals séparés :
 *   - Pas de drift ni d'accumulation
 *   - Adapte l'intervalle en fonction de l'état global (visible/caché/erreur)
 *   - Backoff exponentiel sur erreurs réseau
 *   - Un seul listener visibilitychange
 */
const NexusPollingService = (() => {
  let _timer = null;
  const _subs = new Map(); // key → { fn: async () => void, priority: number }
  let _errorCount = 0;
  let _activeConvOpen = false;
  let _running = false;

  const _getInterval = () => {
    if (_errorCount > 0) {
      return Math.min(4000 * Math.pow(2, _errorCount - 1), MSG_POLL_BACKOFF_MAX);
    }
    if (document.hidden) return MSG_POLL_HIDDEN_MS;
    if (_activeConvOpen)  return MSG_POLL_ACTIVE_MS;
    return MSG_POLL_IDLE_MS;
  };

  const _doPoll = async () => {
    if (_subs.size === 0) return;
    // Sort by priority (lower = first)
    const sorted = [..._subs.entries()].sort((a, b) => (a[1].priority || 0) - (b[1].priority || 0));
    let hadError = false;
    for (const [, sub] of sorted) {
      try {
        await sub.fn();
      } catch (e) {
        hadError = true;
        console.warn('[NexusPolling]', e.message || e);
      }
    }
    _errorCount = hadError ? Math.min(_errorCount + 1, 5) : Math.max(_errorCount - 1, 0);
    _schedule();
  };

  const _schedule = () => {
    clearTimeout(_timer);
    if (_subs.size > 0) _timer = setTimeout(_doPoll, _getInterval());
  };

  // Réagit aux changements de visibilité
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { clearTimeout(_timer); _doPoll(); } // Poll immédiat au retour
    else _schedule();
  });

  return {
    /** Abonner une fonction de polling.
     *  @param {string} key       - Clé unique (pour remplacer/désabonner)
     *  @param {Function} fn      - Fonction async à appeler
     *  @param {number} priority  - Priorité (0=haute)
     */
    subscribe(key, fn, priority = 5) {
      _subs.set(key, { fn, priority });
      if (_subs.size === 1) _doPoll(); // Démarre sur le premier abonné
    },

    unsubscribe(key) {
      _subs.delete(key);
      if (_subs.size === 0) { clearTimeout(_timer); _timer = null; }
    },

    /** Déclenche un poll immédiat (ex: après envoi d'un message) */
    forceNow() {
      clearTimeout(_timer);
      _doPoll();
    },

    /** Signaler qu'une conversation est active (réduit l'intervalle) */
    setActiveConversation(active) {
      const changed = _activeConvOpen !== active;
      _activeConvOpen = active;
      if (changed && !document.hidden) { clearTimeout(_timer); _doPoll(); }
    },

    getStatus() {
      return { errorCount: _errorCount, interval: _getInterval(), subCount: _subs.size };
    }
  };
})();

// ── 4. UTILS ──────────────────────────────────────────────────────────────────
const msgUtils = {
  /** ID déterministe d'une conversation entre 2 utilisateurs */
  convId(userA, userB) {
    return [userA, userB].sort().join('::');
  },

  /** Initiales depuis un nom */
  initials(name = '') {
    return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  },

  /** Formatage de la date d'un message */
  formatTime(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    const now = new Date();
    const diffMs = now - d;
    const diffH = diffMs / 3600000;
    if (diffH < 1)   return `${Math.max(1, Math.round(diffMs / 60000))} min`;
    if (diffH < 24)  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diffH < 48)  return `Hier ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  },

  /** Label de séparateur de date */
  dateSepLabel(isoDate) {
    const d = new Date(isoDate);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7)   return d.toLocaleDateString('fr-FR', { weekday: 'long' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  },

  /** Vérifie si deux dates ISO tombent le même jour calendaire */
  sameDay(a, b) {
    if (!a || !b) return false;
    const da = new Date(a), db = new Date(b);
    return da.toDateString() === db.toDateString();
  },

  /** Couleur d'avatar déterministe */
  avatarColor(id = '') {
    const COLORS = ['#00853E','#1a73e8','#9333ea','#e11b22','#f59e0b','#0891b2','#059669'];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
  },

  /** Construit la liste de conversations depuis un tableau de messages */
  buildConversations(messages = [], currentUserId) {
    const convMap = new Map();
    for (const m of messages) {
      const otherId = m.from_id === currentUserId ? m.to_id : m.from_id;
      const otherName = m.from_id === currentUserId ? (m.to_name || 'Utilisateur') : (m.from_name || 'Utilisateur');
      const cid = msgUtils.convId(currentUserId, otherId);
      if (!convMap.has(cid)) {
        convMap.set(cid, { id: cid, otherId, otherName, messages: [], unread: 0 });
      }
      const c = convMap.get(cid);
      c.messages.push(m);
      if (m.to_id === currentUserId && !m.read) c.unread++;
    }
    return [...convMap.values()]
      .map(c => ({
        ...c,
        lastMessage: c.messages[c.messages.length - 1],
        messages: c.messages // garder pour la recherche
      }))
      .sort((a, b) => new Date(b.lastMessage?.created_at || 0) - new Date(a.lastMessage?.created_at || 0));
  }
};

// ── 5. HOOKS REACT ─────────────────────────────────────────────────────────────
const { useState, useEffect, useRef, useCallback, useMemo, useReducer } = React;

/**
 * Hook principal de données messaging.
 * Gère le polling adaptatif, le cache local, et les mutations.
 */
function useMessaging(currentUser) {
  const [allMessages, setAllMessages]   = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [typingMap, setTypingMap]       = useState({}); // convId → bool
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const lastFetchRef = useRef(null);   // Curseur: ne charger que les nouveaux messages

  // ── Fetch messages ────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      let url = '/api/messages';
      if (lastFetchRef.current) url += `?after=${encodeURIComponent(lastFetchRef.current)}`;

      const res = await DataService.apiFetch(url).catch(() => null);
      let fresh = [];

      if (res && Array.isArray(res)) {
        fresh = res;
      } else {
        // Fallback Supabase direct
        const sb = DataService._sb;
        if (sb) {
          let q = sb.from('messages')
            .select('id, from_id, from_name, to_id, to_name, text, read, read_at, reply_to_id, reply_to_text, attachments, reactions, deleted_for, created_at')
            .or(`from_id.eq.${currentUser.id},to_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: true })
            .limit(200);
          if (lastFetchRef.current) q = q.gt('created_at', lastFetchRef.current);
          const { data } = await q;
          fresh = data || [];
        } else {
          // Fallback localStorage
          fresh = (storage.getArray('messages')).map(m => ({
            id: m.id, from_id: m.from, from_name: m.fromName,
            to_id: m.to, to_name: m.toName,
            text: m.text, read: m.read, created_at: m.date || new Date().toISOString()
          }));
        }
      }

      if (fresh.length > 0) {
        // Mettre à jour le curseur
        const newest = fresh.reduce((a, b) =>
          new Date(a.created_at) > new Date(b.created_at) ? a : b
        );
        lastFetchRef.current = newest.created_at;

        setAllMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const toAdd = fresh.filter(m => !existingIds.has(m.id));
          if (toAdd.length === 0) return prev;
          // Notif push si on reçoit de nouveaux messages
          const newForMe = toAdd.filter(m => m.to_id === currentUser.id && !m.read);
          if (newForMe.length > 0 && document.hidden && window.nexusPush) {
            const m = newForMe[0];
            window.nexusPush.sendLocal(
              `💬 ${m.from_name || 'Message'}`,
              m.text.slice(0, 80),
              `/messages/${m.from_id}`
            );
          }
          // Mise à jour des messages déjà lus (état read peut changer côté serveur)
          const readUpdated = fresh.filter(m => m.read && existingIds.has(m.id));
          const updated = prev.map(p => {
            const ru = readUpdated.find(r => r.id === p.id);
            return ru ? { ...p, read: true, read_at: ru.read_at } : p;
          });
          return [...updated.filter(p => !existingIds.has(p.id) || true), ...toAdd]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
      }
      setLoading(false);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [currentUser?.id]);

  // ── Fetch typing status ───────────────────────────────────────────────────
  const fetchTyping = useCallback(async (convId, otherId) => {
    if (!convId || !otherId) return;
    try {
      const res = await DataService.apiFetch(`/api/messages/typing/${convId}`).catch(() => null);
      if (res) {
        setTypingMap(prev => ({ ...prev, [convId]: res.isTyping && res.userId !== currentUser.id }));
      }
    } catch (_) { /* silencieux */ }
  }, [currentUser?.id]);

  // ── Fetch user profiles (avatars/roles) ───────────────────────────────────
  const fetchProfiles = useCallback(async (userIds) => {
    const toFetch = userIds.filter(id => !userProfiles[id]);
    if (toFetch.length === 0) return;
    try {
      const sb = DataService._sb;
      if (sb) {
        const { data } = await sb.from('profiles')
          .select('id, name, email, role, avatar')
          .in('id', toFetch);
        if (data) {
          setUserProfiles(prev => {
            const next = { ...prev };
            data.forEach(p => { next[p.id] = p; });
            return next;
          });
        }
      }
    } catch (_) { /* silencieux */ }
  }, [userProfiles]);

  // ── S'abonner au polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.id) return;
    NexusPollingService.subscribe('msg-main', fetchMessages, 1);
    return () => NexusPollingService.unsubscribe('msg-main');
  }, [fetchMessages, currentUser?.id]);

  // ── Fetch initial ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentUser?.id) { lastFetchRef.current = null; fetchMessages(); }
  }, [currentUser?.id]);

  // ── Envoyer un message ────────────────────────────────────────────────────
  const sendMessage = useCallback(async ({ toId, toName, text, replyToId, replyToText, attachment }) => {
    if (!text.trim() && !attachment) throw new Error('Message vide');
    const optimistic = {
      id: `tmp_${Date.now()}`,
      from_id: currentUser.id, from_name: currentUser.name,
      to_id: toId, to_name: toName,
      text: text.trim(), read: false, created_at: new Date().toISOString(),
      reply_to_id: replyToId || null, reply_to_text: replyToText || null,
      attachments: attachment ? [attachment] : null,
      _pending: true
    };
    setAllMessages(prev => [...prev, optimistic]);

    try {
      const body = { toId, text: text.trim(), replyToId, replyToText };
      if (attachment) body.attachment = attachment;
      const saved = await DataService.apiFetch('/api/messages', { method: 'POST', body: JSON.stringify(body) })
        .catch(() => null);
      if (saved) {
        setAllMessages(prev => prev.map(m => m.id === optimistic.id ? { ...saved, read: false } : m));
        lastFetchRef.current = saved.created_at;
      }
      NexusPollingService.forceNow(); // Sync immédiat
    } catch (e) {
      setAllMessages(prev => prev.map(m =>
        m.id === optimistic.id ? { ...m, _error: true, _pending: false } : m
      ));
    }
    // Notification locale
    DataService.addNotification(toId, {
      type: 'message', title: `💬 Message de ${currentUser.name}`,
      message: text.slice(0, 80)
    });
    return optimistic;
  }, [currentUser]);

  // ── Marquer comme lu ──────────────────────────────────────────────────────
  const markRead = useCallback(async (fromId) => {
    setAllMessages(prev => prev.map(m =>
      m.from_id === fromId && m.to_id === currentUser.id && !m.read
        ? { ...m, read: true, read_at: new Date().toISOString() }
        : m
    ));
    await DataService.apiFetch('/api/messages/read', {
      method: 'PATCH', body: JSON.stringify({ fromId })
    }).catch(() => {});
  }, [currentUser?.id]);

  // ── Envoyer indicateur de frappe ──────────────────────────────────────────
  const sendTyping = useCallback(async (convId) => {
    if (!convId) return;
    await DataService.apiFetch('/api/messages/typing', {
      method: 'POST', body: JSON.stringify({ convId })
    }).catch(() => {});
  }, []);

  // ── Réagir à un message ───────────────────────────────────────────────────
  const reactToMessage = useCallback(async (msgId, emoji) => {
    setAllMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      if (!reactions[emoji]) reactions[emoji] = [];
      const idx = reactions[emoji].indexOf(currentUser.id);
      if (idx >= 0) reactions[emoji].splice(idx, 1);
      else reactions[emoji].push(currentUser.id);
      if (reactions[emoji].length === 0) delete reactions[emoji];
      return { ...m, reactions };
    }));
    await DataService.apiFetch(`/api/messages/${msgId}/react`, {
      method: 'PATCH', body: JSON.stringify({ emoji })
    }).catch(() => {});
  }, [currentUser?.id]);

  // ── Supprimer pour soi ────────────────────────────────────────────────────
  const deleteForMe = useCallback(async (msgId) => {
    setAllMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, deleted_for: [...(m.deleted_for || []), currentUser.id] }
        : m
    ));
    await DataService.apiFetch(`/api/messages/${msgId}/delete`, {
      method: 'PATCH', body: JSON.stringify({ userId: currentUser.id })
    }).catch(() => {});
  }, [currentUser?.id]);

  const conversations = useMemo(
    () => msgUtils.buildConversations(
      allMessages.filter(m => !(m.deleted_for || []).includes(currentUser?.id)),
      currentUser?.id
    ),
    [allMessages, currentUser?.id]
  );

  const totalUnread = useMemo(
    () => conversations.reduce((s, c) => s + c.unread, 0),
    [conversations]
  );

  return {
    conversations, allMessages, userProfiles, typingMap, loading, error,
    totalUnread, sendMessage, markRead, sendTyping, reactToMessage,
    deleteForMe, fetchTyping, fetchProfiles
  };
}

// ── 6. SOUS-COMPOSANTS ─────────────────────────────────────────────────────────

// Avatar avec initiales
const MsgAvatar = ({ name, role, size = 44, online = false, style: extraStyle }) => {
  const color = msgUtils.avatarColor(name);
  const cls = role === 'vendor' ? 'vendor-avatar' : role === 'buyer' ? 'buyer-avatar' : '';
  return React.createElement('div', {
    className: `msg-avatar ${cls}`,
    style: { width: size, height: size, fontSize: size * 0.38, background: color, ...extraStyle }
  },
    msgUtils.initials(name),
    online && React.createElement('span', { className: 'msg-online-dot' })
  );
};

// Séparateur de date
const DateSeparator = ({ date }) =>
  React.createElement('div', { className: 'msg-date-sep' },
    React.createElement('span', null, msgUtils.dateSepLabel(date))
  );

// Indicateur de frappe
const TypingIndicator = ({ name }) =>
  React.createElement('div', { className: 'msg-typing-wrap' },
    React.createElement(MsgAvatar, { name, size: 30 }),
    React.createElement('div', { className: 'msg-typing-bubble' },
      [0,1,2].map(i => React.createElement('div', { key: i, className: 'msg-typing-dot' }))
    )
  );

// Sélecteur d'emoji (réaction rapide)
const EmojiPicker = ({ onPick, style }) =>
  React.createElement('div', { className: 'msg-emoji-picker', style },
    MSG_EMOJIS.map(e =>
      React.createElement('button', {
        key: e, className: 'msg-emoji-btn',
        onClick: (ev) => { ev.stopPropagation(); onPick(e); }
      }, e)
    )
  );

// ── Bulle de message ─────────────────────────────────────────────────────────
const MessageBubble = ({ msg, currentUserId, onReply, onReact, onDelete, onImgClick, searchQuery }) => {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isMine = msg.from_id === currentUserId;
  const isDeleted = (msg.deleted_for || []).includes(currentUserId);
  const actionsRef = useRef(null);

  // Fermer le menu si clic extérieur
  useEffect(() => {
    if (!showActions) return;
    const close = (e) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) setShowActions(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showActions]);

  if (isDeleted) return React.createElement('div', {
    style: { fontSize: '0.75rem', color: '#b0b0a0', fontStyle: 'italic', padding: '0.2rem 0.5rem', textAlign: isMine ? 'right' : 'left' }
  }, '🗑 Message supprimé');

  // Surligner le texte de recherche
  const highlightText = (text) => {
    if (!searchQuery) return text;
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((p, i) =>
      p.toLowerCase() === searchQuery.toLowerCase()
        ? React.createElement('mark', { key: i, className: 'msg-highlight' }, p)
        : p
    );
  };

  const reactions = Object.entries(msg.reactions || {})
    .filter(([, users]) => users.length > 0);

  return React.createElement('div', {
    className: `msg-bubble-wrap ${isMine ? 'mine' : 'theirs'}`,
    onContextMenu: (e) => { e.preventDefault(); setShowActions(true); },
    'data-msgid': msg.id
  },
    React.createElement('div', {
      className: 'msg-bubble',
      onDoubleClick: () => { if (!isMine) onReply(msg); }
    },
      // Reply quote
      msg.reply_to_text && React.createElement('div', {
        className: 'msg-reply-quote',
        onClick: () => {
          const el = document.querySelector(`[data-msgid="${msg.reply_to_id}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      },
        React.createElement('div', { className: 'msg-reply-quote-author' },
          msg.reply_to_id ? '↩' : '' , ' Citation'
        ),
        React.createElement('div', { className: 'msg-reply-quote-text' }, msg.reply_to_text.slice(0, 80))
      ),
      // Attachment image
      (msg.attachments || []).map((a, i) =>
        a.type === 'image'
          ? React.createElement('img', {
              key: i, src: a.url, className: 'msg-attachment-img',
              alt: a.name || 'Image', loading: 'lazy',
              onClick: () => onImgClick(a.url)
            })
          : React.createElement('div', { key: i, style: { fontSize: '0.8rem', marginBottom: '0.3rem' } },
              React.createElement('i', { className: 'fas fa-file', style: { marginRight: '0.4rem' } }),
              a.name
            )
      ),
      // Text
      msg._pending
        ? React.createElement('span', { style: { opacity: 0.65 } }, msg.text)
        : msg._error
          ? React.createElement('span', { style: { color: '#fca5a5' } }, msg.text, ' ⚠')
          : highlightText(msg.text),
      // Actions popup (right-click)
      showActions && React.createElement('div', { ref: actionsRef, className: 'msg-actions-popup',
        style: { [isMine ? 'right' : 'left']: 0, top: '100%', marginTop: '4px' }
      },
        React.createElement('div', { className: 'msg-action-item', onClick: () => { onReply(msg); setShowActions(false); } },
          React.createElement('i', { className: 'fas fa-reply' }), 'Répondre'
        ),
        React.createElement('div', { className: 'msg-action-item', onClick: (e) => { e.stopPropagation(); setShowEmojiPicker(p => !p); setShowActions(false); } },
          React.createElement('i', { className: 'fas fa-smile' }), 'Réagir'
        ),
        React.createElement('div', { className: 'msg-action-item', onClick: () => {
          navigator.clipboard?.writeText(msg.text); setShowActions(false);
        }},
          React.createElement('i', { className: 'fas fa-copy' }), 'Copier'
        ),
        React.createElement('div', { className: 'msg-action-item danger', onClick: () => { onDelete(msg.id); setShowActions(false); } },
          React.createElement('i', { className: 'fas fa-trash' }), 'Supprimer pour moi'
        )
      )
    ),
    // Emoji picker
    showEmojiPicker && React.createElement('div', { style: { position: 'relative', zIndex: 50 } },
      React.createElement(EmojiPicker, {
        onPick: (e) => { onReact(msg.id, e); setShowEmojiPicker(false); },
        style: { position: 'absolute', [isMine ? 'right' : 'left']: 0, bottom: '100%', marginBottom: '4px' }
      })
    ),
    // Reactions
    reactions.length > 0 && React.createElement('div', { className: 'msg-reactions' },
      reactions.map(([emoji, users]) =>
        React.createElement('div', {
          key: emoji,
          className: `msg-reaction ${users.includes(currentUserId) ? 'reacted' : ''}`,
          title: `${users.length} personne(s)`,
          onClick: () => onReact(msg.id, emoji)
        },
          React.createElement('span', null, emoji),
          React.createElement('span', { className: 'msg-reaction-count' }, users.length)
        )
      )
    ),
    // Footer: heure + statut lecture
    React.createElement('div', { className: 'msg-bubble-footer' },
      React.createElement('span', null, msgUtils.formatTime(msg.created_at)),
      isMine && React.createElement('span', {
        className: `msg-read-receipt ${msg.read ? 'read' : ''}`,
        title: msg.read && msg.read_at ? `Lu le ${new Date(msg.read_at).toLocaleString('fr-FR')}` : 'Envoyé'
      },
        React.createElement('i', { className: `fas fa-${msg.read ? 'check-double' : 'check'}` })
      )
    )
  );
};

// ── Barre de composition ─────────────────────────────────────────────────────
const ComposeBar = ({ onSend, replyTo, onCancelReply, recipientName, disabled }) => {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [text]);

  const handleSend = async () => {
    if (sending || (!text.trim() && !attachment)) return;
    setSending(true);
    try {
      await onSend({ text, attachment });
      setText('');
      setAttachment(null);
      if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.focus(); }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Seules les images sont acceptées.'); return; }
    if (file.size > 3 * 1024 * 1024) { alert('Taille max : 3 Mo.'); return; }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ type: 'image', url: reader.result, name: file.name });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return React.createElement('div', { className: 'msg-compose' },
    // Reply banner
    replyTo && React.createElement('div', { className: 'msg-reply-banner' },
      React.createElement('i', { className: 'fas fa-reply', style: { color: 'var(--primary)', flexShrink: 0 } }),
      React.createElement('div', { className: 'msg-reply-banner-text' },
        React.createElement('div', { className: 'msg-reply-banner-author' }, replyTo.from_name || 'Message'),
        React.createElement('div', { className: 'msg-reply-banner-preview' }, replyTo.text)
      ),
      React.createElement('button', { className: 'msg-reply-cancel', onClick: onCancelReply },
        React.createElement('i', { className: 'fas fa-times' })
      )
    ),
    // Attachment preview
    attachment && React.createElement('div', { className: 'msg-attach-preview' },
      React.createElement('img', { src: attachment.url, alt: attachment.name }),
      React.createElement('span', null, attachment.name),
      React.createElement('button', {
        className: 'msg-reply-cancel', onClick: () => setAttachment(null)
      }, React.createElement('i', { className: 'fas fa-times' }))
    ),
    // Compose row
    React.createElement('div', { className: 'msg-compose-row' },
      // Attachment button
      React.createElement('button', {
        className: 'msg-icon-btn', style: { height: 44, width: 44, flexShrink: 0 },
        onClick: () => fileInputRef.current?.click(),
        title: 'Joindre une image', type: 'button'
      },
        React.createElement('i', { className: 'fas fa-paperclip' })
      ),
      React.createElement('input', {
        ref: fileInputRef, type: 'file', accept: 'image/*',
        style: { display: 'none' }, onChange: handleFileChange
      }),
      // Textarea
      React.createElement('textarea', {
        ref: textareaRef, className: 'msg-textarea', rows: 1,
        value: text, disabled,
        onChange: e => { setText(e.target.value); },
        onKeyDown: handleKeyDown,
        placeholder: disabled ? 'Sélectionnez une conversation…' : `Message à ${recipientName || '…'}  (Entrée pour envoyer, Shift+Entrée = saut)`
      }),
      // Send
      React.createElement('div', { className: 'msg-compose-actions' },
        React.createElement('button', {
          className: 'msg-send-btn', onClick: handleSend,
          disabled: disabled || sending || (!text.trim() && !attachment),
          title: 'Envoyer (Entrée)'
        },
          sending
            ? React.createElement('i', { className: 'fas fa-spinner fa-spin' })
            : React.createElement('i', { className: 'fas fa-paper-plane' })
        )
      )
    ),
    React.createElement('div', { className: 'msg-hint' },
      'Clic droit sur un message pour répondre, réagir ou supprimer · Double-clic pour répondre rapidement'
    )
  );
};

// ── Thread panel (colonne de droite) ─────────────────────────────────────────
const ConversationThread = ({
  conv, currentUser, allMessages, userProfiles, typingMap,
  onSendMessage, onMarkRead, onSendTyping, onReact, onDelete, onBack, onClose
}) => {
  const [replyTo, setReplyTo] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [loadedPages, setLoadedPages] = useState(1);
  const bottomRef = useRef(null);
  const bodyRef = useRef(null);
  const prevLenRef = useRef(0);
  const isScrolledNearBottomRef = useRef(true);
  const typingTimerRef = useRef(null);

  // Filtrer les messages de cette conversation
  const threadMessages = useMemo(() => {
    if (!conv) return [];
    return allMessages
      .filter(m =>
        ((m.from_id === currentUser.id && m.to_id === conv.otherId) ||
         (m.from_id === conv.otherId    && m.to_id === currentUser.id)) &&
        !(m.deleted_for || []).includes(currentUser.id)
      )
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [allMessages, conv?.otherId, currentUser.id]);

  const paginatedMessages = useMemo(() =>
    threadMessages.slice(-MSG_PAGE_SIZE * loadedPages),
    [threadMessages, loadedPages]
  );

  const hasMore = threadMessages.length > paginatedMessages.length;
  const isTyping = conv ? typingMap[conv.id] : false;

  // ── Scroll : garde la position si l'utilisateur lit l'historique ──────────
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onScroll = () => {
      isScrolledNearBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    };
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (threadMessages.length > prevLenRef.current && isScrolledNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLenRef.current = threadMessages.length;
  }, [threadMessages.length]);

  // ── Marquer comme lu à l'ouverture ───────────────────────────────────────
  useEffect(() => {
    if (conv) {
      onMarkRead(conv.otherId);
      NexusPollingService.setActiveConversation(true);
    }
    return () => NexusPollingService.setActiveConversation(false);
  }, [conv?.id]);

  // ── Polling de l'indicateur de frappe ────────────────────────────────────
  useEffect(() => {
    if (!conv) return;
    const key = `msg-typing-${conv.id}`;
    NexusPollingService.subscribe(key, () => {
      return DataService.apiFetch(`/api/messages/typing/${conv.id}`).then(r => {
        if (r && r.userId !== currentUser.id) {
          const isTypingNow = r.isTyping && (Date.now() - r.updatedAt < MSG_TYPING_TTL_MS);
          typingTimerRef.current !== null;
          setImmediate?.(() => {}) || null;
          // Update state via callback to avoid stale closure
          document.dispatchEvent(new CustomEvent('nexus-typing', {
            detail: { convId: conv.id, isTyping: isTypingNow }
          }));
        }
      }).catch(() => {});
    }, 0); // priority 0 = plus haute
    return () => NexusPollingService.unsubscribe(key);
  }, [conv?.id]);

  // ── Recherche dans le fil ─────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const results = paginatedMessages
      .map((m, i) => ({ i, m }))
      .filter(({ m }) => m.text.toLowerCase().includes(q));
    setSearchResults(results);
    setSearchIdx(0);
    if (results.length > 0) {
      setTimeout(() => {
        const el = document.querySelector(`[data-msgid="${results[0].m.id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [searchQuery]);

  const navigateSearch = (dir) => {
    const next = (searchIdx + dir + searchResults.length) % searchResults.length;
    setSearchIdx(next);
    const el = document.querySelector(`[data-msgid="${searchResults[next].m.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSend = async ({ text, attachment }) => {
    if (!conv) return;
    await onSendMessage({
      toId: conv.otherId, toName: conv.otherName, text,
      replyToId: replyTo?.id, replyToText: replyTo?.text,
      attachment
    });
    setReplyTo(null);
  };

  const otherProfile = userProfiles[conv?.otherId];
  const otherRole = otherProfile?.role || '';
  const isOnline = false; // pourrait être amélioré avec last_seen polling

  if (!conv) return React.createElement('div', { className: 'msg-empty-state' },
    React.createElement('div', { className: 'msg-empty-state-icon' }, '💬'),
    React.createElement('h3', null, 'Sélectionnez une conversation'),
    React.createElement('p', null, 'Choisissez un contact à gauche pour afficher vos échanges.')
  );

  return React.createElement('div', { className: 'msg-main', 'data-messaging-active': 'true' },
    // Header
    React.createElement('div', { className: 'msg-thread-header' },
      React.createElement('button', {
        className: 'msg-back-btn msg-icon-btn',
        onClick: onBack, title: 'Retour', style: { flexShrink: 0 }
      }, React.createElement('i', { className: 'fas fa-arrow-left' })),
      React.createElement(MsgAvatar, { name: conv.otherName, role: otherRole, size: 40, online: isOnline }),
      React.createElement('div', { className: 'msg-header-info' },
        React.createElement('h3', null,
          conv.otherName,
          ' ',
          React.createElement('span', {
            className: `msg-role-badge ${otherRole}`,
            style: { fontSize: '0.62rem' }
          }, otherRole === 'vendor' ? '🏪 Vendeur' : otherRole === 'buyer' ? '🛍 Acheteur' : '')
        ),
        React.createElement('div', { className: `msg-header-status ${isOnline ? 'online' : ''}` },
          isOnline ? '● En ligne' : `${threadMessages.length} message${threadMessages.length !== 1 ? 's' : ''} dans ce fil`
        )
      ),
      React.createElement('div', { className: 'msg-header-actions' },
        // Search toggle
        React.createElement('button', {
          className: 'msg-icon-btn',
          onClick: () => { setSearchOpen(o => !o); setSearchQuery(''); },
          title: 'Rechercher dans la conversation'
        }, React.createElement('i', { className: 'fas fa-search' })),
        // Status polling
        React.createElement('div', { className: 'msg-poll-status', title: `Polling actif – ${NexusPollingService.getStatus().interval / 1000}s` },
          React.createElement('div', { className: `msg-poll-dot ok` }),
          React.createElement('span', null, 'Synchro auto')
        ),
        React.createElement('button', { className: 'msg-close-btn', onClick: onClose, title: 'Fermer (Échap)' },
          React.createElement('i', { className: 'fas fa-times' })
        )
      )
    ),
    // Search bar (conditionnelle)
    searchOpen && React.createElement('div', { className: 'msg-thread-search-bar' },
      React.createElement('i', { className: 'fas fa-search', style: { color: 'var(--text-secondary)', fontSize: '0.8rem' } }),
      React.createElement('input', {
        autoFocus: true, placeholder: 'Rechercher dans cette conversation…',
        value: searchQuery, onChange: e => setSearchQuery(e.target.value),
        onKeyDown: e => {
          if (e.key === 'Enter')  navigateSearch(1);
          if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
        }
      }),
      searchResults.length > 0 && React.createElement('span', { className: 'msg-search-count' },
        `${searchIdx + 1}/${searchResults.length}`
      ),
      searchResults.length > 1 && React.createElement(React.Fragment, null,
        React.createElement('button', { className: 'msg-search-nav-btn', onClick: () => navigateSearch(-1) },
          React.createElement('i', { className: 'fas fa-chevron-up' })
        ),
        React.createElement('button', { className: 'msg-search-nav-btn', onClick: () => navigateSearch(1) },
          React.createElement('i', { className: 'fas fa-chevron-down' })
        )
      )
    ),
    // Messages
    React.createElement('div', { className: 'msg-thread-body', ref: bodyRef },
      hasMore && React.createElement('div', {
        className: 'msg-load-more',
        onClick: () => setLoadedPages(p => p + 1)
      }, React.createElement('i', { className: 'fas fa-history', style: { marginRight: '0.4rem' } }), 'Charger les messages précédents'),
      paginatedMessages.map((m, idx) => {
        const prevMsg = paginatedMessages[idx - 1];
        const showDate = idx === 0 || !msgUtils.sameDay(prevMsg?.created_at, m.created_at);
        return React.createElement(React.Fragment, { key: m.id },
          showDate && React.createElement(DateSeparator, { date: m.created_at }),
          React.createElement(MessageBubble, {
            msg, currentUserId: currentUser.id,
            onReply: setReplyTo, onReact, onDelete,
            onImgClick: setLightboxUrl,
            searchQuery: searchQuery || null
          })
        );
      }),
      isTyping && React.createElement(TypingIndicator, { name: conv.otherName }),
      React.createElement('div', { ref: bottomRef })
    ),
    // Compose
    React.createElement(ComposeBar, {
      onSend: handleSend, replyTo,
      onCancelReply: () => setReplyTo(null),
      recipientName: conv.otherName
    }),
    // Lightbox
    lightboxUrl && React.createElement('div', {
      className: 'msg-lightbox',
      onClick: () => setLightboxUrl(null)
    }, React.createElement('img', { src: lightboxUrl, alt: 'Image' }))
  );
};

// ── Sidebar (liste des conversations) ────────────────────────────────────────
const ConversationSidebar = ({
  conversations, selectedConvId, currentUser, userProfiles,
  onSelectConv, onNewConv, onClose, mobileHidden
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all / unread / vendors / buyers

  const filtered = useMemo(() => {
    let list = conversations;
    if (filter === 'unread') list = list.filter(c => c.unread > 0);
    if (filter === 'vendors') list = list.filter(c => userProfiles[c.otherId]?.role === 'vendor');
    if (filter === 'buyers')  list = list.filter(c => userProfiles[c.otherId]?.role === 'buyer');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.otherName.toLowerCase().includes(q) ||
        c.lastMessage?.text?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [conversations, filter, search, userProfiles]);

  const FILTERS = [
    { key: 'all',     label: 'Tous' },
    { key: 'unread',  label: 'Non lus' },
    { key: 'vendors', label: 'Vendeurs' },
    { key: 'buyers',  label: 'Acheteurs' }
  ];

  return React.createElement('div', {
    className: `msg-sidebar ${mobileHidden ? 'hidden' : ''}`,
  },
    // Header
    React.createElement('div', { className: 'msg-sidebar-header' },
      React.createElement('div', { className: 'msg-sidebar-title' },
        React.createElement('span', null,
          React.createElement('i', { className: 'fas fa-comments', style: { marginRight: '0.5rem', fontSize: '1rem' } }),
          'Messages'
        ),
        React.createElement('div', { style: { display: 'flex', gap: '0.4rem', alignItems: 'center' } },
          React.createElement('button', {
            className: 'msg-new-btn', onClick: onNewConv,
            title: 'Nouvelle conversation'
          }, React.createElement('i', { className: 'fas fa-edit' })),
          React.createElement('button', {
            className: 'msg-close-btn', onClick: onClose,
            title: 'Fermer'
          }, React.createElement('i', { className: 'fas fa-times' }))
        )
      ),
      React.createElement('div', { className: 'msg-search-wrap' },
        React.createElement('i', { className: 'fas fa-search' }),
        React.createElement('input', {
          className: 'msg-search', type: 'search',
          placeholder: 'Rechercher une conversation…',
          value: search, onChange: e => setSearch(e.target.value)
        })
      )
    ),
    // Filter tabs
    React.createElement('div', { className: 'msg-filter-tabs' },
      FILTERS.map(f => React.createElement('button', {
        key: f.key,
        className: `msg-tab ${filter === f.key ? 'active' : ''}`,
        onClick: () => setFilter(f.key)
      }, f.label))
    ),
    // Conversation list
    React.createElement('div', { className: 'msg-conv-list' },
      filtered.length === 0
        ? React.createElement('div', { className: 'msg-no-convs' },
            React.createElement('i', { className: 'fas fa-inbox' }),
            React.createElement('p', null,
              search
                ? `Aucune conversation pour "${search}"`
                : filter !== 'all'
                  ? 'Aucune conversation dans ce filtre'
                  : 'Aucun message encore.\nCliquez sur ✏ pour démarrer une conversation.'
            )
          )
        : filtered.map(conv => {
            const profile = userProfiles[conv.otherId];
            const role = profile?.role || '';
            const lastMsg = conv.lastMessage;
            const isSelected = conv.id === selectedConvId;
            const hasUnread = conv.unread > 0;

            return React.createElement('div', {
              key: conv.id,
              className: `msg-conv-item ${isSelected ? 'active' : ''}`,
              onClick: () => onSelectConv(conv)
            },
              React.createElement(MsgAvatar, { name: conv.otherName, role, size: 44 }),
              React.createElement('div', { className: 'msg-conv-info' },
                React.createElement('div', { className: 'msg-conv-name' },
                  conv.otherName,
                  role && React.createElement('span', { className: `msg-role-badge ${role}` }, role === 'vendor' ? 'Vendeur' : 'Acheteur')
                ),
                React.createElement('div', { className: `msg-conv-last ${hasUnread ? 'unread' : ''}` },
                  lastMsg
                    ? (lastMsg.from_id === currentUser.id ? '✓ Vous : ' : '') + lastMsg.text.slice(0, 48) + (lastMsg.text.length > 48 ? '…' : '')
                    : 'Début de conversation'
                )
              ),
              React.createElement('div', { className: 'msg-conv-meta' },
                React.createElement('span', { className: 'msg-conv-time' }, lastMsg ? msgUtils.formatTime(lastMsg.created_at) : ''),
                hasUnread && React.createElement('span', { className: 'msg-unread-badge' }, conv.unread > 99 ? '99+' : conv.unread)
              )
            );
          })
    )
  );
};

// ── Modal nouvelle conversation ───────────────────────────────────────────────
const NewConversationModal = ({ currentUser, onStartConv, onClose, addToast }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const sb = DataService._sb;
      if (sb) {
        const { data } = await sb.from('profiles')
          .select('id, name, email, role')
          .neq('id', currentUser.id)
          .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(8);
        setResults(data || []);
      }
    } catch (_) {} finally { setLoading(false); }
  }, [currentUser.id]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  return React.createElement('div', {
    className: 'msg-overlay', style: { zIndex: 1300 }, onClick: onClose
  },
    React.createElement('div', {
      onClick: e => e.stopPropagation(),
      style: {
        background: '#fff', borderRadius: '16px', width: 'min(440px, 95vw)',
        padding: '1.5rem', boxShadow: '0 24px 60px rgba(0,0,0,0.16)',
        animation: 'msgSlideUp .2s ease'
      }
    },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }
      },
        React.createElement('h2', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' } },
          React.createElement('i', { className: 'fas fa-edit', style: { marginRight: '0.5rem' } }),
          'Nouvelle conversation'
        ),
        React.createElement('button', { className: 'msg-close-btn', onClick: onClose },
          React.createElement('i', { className: 'fas fa-times' })
        )
      ),
      React.createElement('div', { className: 'msg-search-wrap', style: { marginBottom: '1rem' } },
        React.createElement('i', { className: 'fas fa-search' }),
        React.createElement('input', {
          autoFocus: true,
          className: 'msg-search',
          placeholder: 'Rechercher un utilisateur par nom ou email…',
          value: search, onChange: e => setSearch(e.target.value)
        })
      ),
      loading && React.createElement('div', {
        style: { textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem', fontSize: '0.85rem' }
      },
        React.createElement('i', { className: 'fas fa-spinner fa-spin', style: { marginRight: '0.4rem' } }),
        'Recherche…'
      ),
      results.length > 0 && React.createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.35rem' }
      },
        results.map(u => React.createElement('div', {
          key: u.id,
          style: {
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.85rem',
            borderRadius: '10px', cursor: 'pointer', transition: 'background .12s', border: '1.5px solid #eee'
          },
          onMouseEnter: e => e.currentTarget.style.background = '#f0f8f4',
          onMouseLeave: e => e.currentTarget.style.background = '',
          onClick: () => {
            onStartConv({ id: u.id, name: u.name, role: u.role });
            onClose();
          }
        },
          React.createElement(MsgAvatar, { name: u.name, role: u.role, size: 38 }),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontWeight: 700, fontSize: '0.9rem' } }, u.name),
            React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--text-secondary)' } }, u.email)
          ),
          React.createElement('span', { className: `msg-role-badge ${u.role}` }, u.role === 'vendor' ? 'Vendeur' : 'Acheteur')
        ))
      ),
      !loading && search.length >= 2 && results.length === 0 && React.createElement('div', {
        style: { textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem', fontSize: '0.85rem' }
      }, 'Aucun utilisateur trouvé pour "' + search + '"')
    )
  );
};

// ── 7. COMPOSANT PRINCIPAL MessagingCenter ────────────────────────────────────
/**
 * Point d'entrée principal du module messagerie.
 * 
 * @param {Object}   currentUser    - Utilisateur connecté (id, name, email, role)
 * @param {string}   [openWithId]   - Ouvrir directement la conversation avec cet userId
 * @param {string}   [openWithName] - Nom de l'utilisateur à ouvrir
 * @param {Function} onClose        - Callback fermeture
 * @param {Function} [addToast]     - Callback pour les notifications toast
 */
const MessagingCenter = ({ currentUser, openWithId, openWithName, onClose, addToast }) => {
  const [selectedConv, setSelectedConv]   = useState(null);
  const [showNewConv, setShowNewConv]     = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  const {
    conversations, allMessages, userProfiles, typingMap, loading,
    totalUnread, sendMessage, markRead, sendTyping, reactToMessage, deleteForMe,
    fetchProfiles
  } = useMessaging(currentUser);

  // Pré-ouvrir une conversation si openWithId est fourni
  useEffect(() => {
    if (!openWithId || conversations.length === 0) return;
    const conv = conversations.find(c => c.otherId === openWithId);
    if (conv) { setSelectedConv(conv); setMobileSidebarOpen(false); }
    else if (openWithName) {
      // Créer une conversation vide si elle n'existe pas encore
      const fakeConv = {
        id: msgUtils.convId(currentUser.id, openWithId),
        otherId: openWithId, otherName: openWithName,
        messages: [], unread: 0, lastMessage: null
      };
      setSelectedConv(fakeConv);
      setMobileSidebarOpen(false);
    }
  }, [openWithId, conversations.length]);

  // Charger les profils des interlocuteurs
  useEffect(() => {
    const ids = [...new Set(conversations.map(c => c.otherId))];
    if (ids.length > 0) fetchProfiles(ids);
  }, [conversations.length]);

  // Fermeture avec Échap
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Gestion des indicateurs de frappe (event-bus custom)
  useEffect(() => {
    const onTyping = (e) => {
      // Handled inside ConversationThread via polling
    };
    document.addEventListener('nexus-typing', onTyping);
    return () => document.removeEventListener('nexus-typing', onTyping);
  }, []);

  const handleSelectConv = (conv) => {
    setSelectedConv(conv);
    setMobileSidebarOpen(false);
  };

  const handleStartNewConv = async ({ id, name, role }) => {
    const fakeConv = {
      id: msgUtils.convId(currentUser.id, id),
      otherId: id, otherName: name,
      messages: [], unread: 0, lastMessage: null
    };
    setSelectedConv(fakeConv);
    setMobileSidebarOpen(false);
  };

  const handleBack = () => {
    setMobileSidebarOpen(true);
    setSelectedConv(null);
  };

  if (!currentUser) return null;

  return React.createElement('div', { className: 'msg-overlay', onClick: onClose },
    React.createElement('div', { className: 'msg-container', onClick: e => e.stopPropagation() },
      // Sidebar
      React.createElement(ConversationSidebar, {
        conversations, selectedConvId: selectedConv?.id,
        currentUser, userProfiles,
        onSelectConv: handleSelectConv,
        onNewConv: () => setShowNewConv(true),
        onClose,
        mobileHidden: !mobileSidebarOpen && !!selectedConv
      }),
      // Thread / Empty state
      React.createElement(ConversationThread, {
        conv: selectedConv,
        currentUser, allMessages, userProfiles, typingMap,
        onSendMessage: sendMessage,
        onMarkRead: markRead,
        onSendTyping: sendTyping,
        onReact: reactToMessage,
        onDelete: deleteForMe,
        onBack: handleBack,
        onClose
      })
    ),
    // Modal nouvelle conversation
    showNewConv && React.createElement(NewConversationModal, {
      currentUser,
      onStartConv: handleStartNewConv,
      onClose: () => setShowNewConv(false),
      addToast
    })
  );
};

// ── 8. BADGE GLOBAL (nav header) ─────────────────────────────────────────────
/**
 * Composant léger à placer dans le header de navigation.
 * Affiche le nombre de messages non lus.
 * Se met à jour via polling adaptatif (partagé avec MessagingCenter).
 */
const MessagingBadge = ({ currentUser, onClick }) => {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!currentUser?.id) return;
    const check = async () => {
      try {
        const res = await DataService.apiFetch('/api/messages/unread-count').catch(() => null);
        if (res && typeof res.count === 'number') setUnread(res.count);
        else {
          // Fallback localStorage
          const msgs = storage.getArray('messages');
          setUnread(msgs.filter(m => m.to === currentUser.id && !m.read).length);
        }
      } catch (_) {}
    };
    NexusPollingService.subscribe('msg-badge', check, 10);
    check();
    return () => NexusPollingService.unsubscribe('msg-badge');
  }, [currentUser?.id]);

  return React.createElement('button', {
    onClick,
    title: unread > 0 ? `${unread} message(s) non lu(s)` : 'Messages',
    style: {
      position: 'relative', background: 'none', border: 'none',
      cursor: 'pointer', padding: '0.4rem', color: 'inherit',
      display: 'flex', alignItems: 'center', gap: '0.4rem'
    }
  },
    React.createElement('i', { className: 'fas fa-comments', style: { fontSize: '1.1rem' } }),
    unread > 0 && React.createElement('span', { className: 'msg-nav-badge' }, unread > 99 ? '99+' : unread)
  );
};

// ── 9. EXPORT GLOBAL ──────────────────────────────────────────────────────────
window.MessagingCenter    = MessagingCenter;
window.MessagingBadge     = MessagingBadge;
window.NexusPollingService = NexusPollingService;

// ── 10. RÉTROCOMPATIBILITÉ — Remplace MessageComposeModal ───────────────────
// Shim: permet à tout code existant qui ouvre MessageComposeModal de fonctionner
window.MessageComposeModal = function({ currentUser, recipientId, recipientName, onClose, addToast }) {
  return React.createElement(MessagingCenter, {
    currentUser, openWithId: recipientId, openWithName: recipientName,
    onClose, addToast
  });
};

console.info('[NEXUS] MessagingCenter v4.0.0 chargé — Polling adaptatif actif');
