// functions/api/notifications.js
// POST /api/notifications — centre de notifications NEXUS (in-app + Web Push).
//
// CONTEXTE : DataService.addNotification (frontend) POSTe ici depuis toujours,
// mais cette function N'EXISTAIT PAS (404 silencieux) → aucune notification
// in-app cross-user n'était enregistrée, et aucun push n'était envoyé.
//
// Rôle :
//   1. INSERT dans `notifications` via la service key (bypasse le RLS qui
//      bloque légitimement les inserts cross-user côté client).
//   2. Web Push vers TOUS les appareils abonnés du destinataire (ordinateur,
//      smartphone, PWA/APK) via /push-send (X-Internal-Secret) — best-effort.
//
// Auth : X-Internal-Secret (webhooks/cron, serveur→serveur) OU JWT Supabase
// vérifié. Tout utilisateur connecté peut notifier un autre utilisateur (c'est
// l'architecture client-driven du site : acheteur → vendeur à la commande,
// etc.). Garde-fous anti-abus : type whitelist (contrainte DB), longueurs
// bornées, lien INTERNE uniquement (anti-phishing), rate limit 60/min/IP.
import { options, json, err, requireAuth, supabase, isInternalCall, internalSecret } from './_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';

// Contrainte CHECK de notifications.type — toute autre valeur ferait échouer l'INSERT.
const TYPES = new Set(['order', 'offer', 'message', 'return', 'vendor', 'system', 'dispute']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const internal = isInternalCall(request, env);
  if (!internal) {
    const [, authError] = await requireAuth(request, env);
    if (authError) return authError;
    const rl = await rateLimit(env, `notif:${clientIp(request)}`, 60, 60);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);
  }

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }

  const userId = String(body.userId || body.user_id || '').trim();
  // Ids non-UUID ("admin", "guest"…) : ignorés sans erreur — parité avec le
  // comportement historique du front (fallback localStorage, jamais bloquant).
  if (!UUID_RE.test(userId)) return json({ ok: true, skipped: 'invalid_user_id' });

  const type = TYPES.has(body.type) ? body.type : 'system';
  const title = String(body.title || '').trim().slice(0, 140);
  const message = String(body.message || '').trim().slice(0, 500);
  let link = typeof body.link === 'string' ? body.link : '/';
  if (!link.startsWith('/') || link.startsWith('//')) link = '/';
  if (!title) return err('title requis', 400);

  let row = null;
  try {
    const sb = supabase(env);
    const inserted = await sb.from('notifications').insert({
      user_id: userId, type, title, message, link, read: false,
    });
    row = Array.isArray(inserted) ? inserted[0] : inserted;
  } catch (e) {
    return err('Insertion impossible : ' + e.message, 500);
  }

  // Web Push (appareil fermé ou en arrière-plan) — ne retarde pas la réponse.
  try {
    const origin = new URL(request.url).origin;
    context.waitUntil(
      fetch(origin + '/push-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret(env) },
        body: JSON.stringify({ userId, title, body: message || title, url: link }),
      }).catch(() => {})
    );
  } catch (_) { /* best-effort */ }

  return json({ ok: true, id: (row && row.id) || null });
}
