/**
 * NEXUS Market — /api/messenger-webhook
 * Bot Messenger (page Facebook NEXUS Market) : réponse automatique via le
 * cerveau partagé (bot-brain.js).
 *
 * Mise en place (Meta for Developers → votre App → Messenger → Settings) :
 *   1. Créer une App Facebook + y attacher la Page NEXUS Market.
 *   2. Générer un Page Access Token (longue durée) → FB_PAGE_ACCESS_TOKEN.
 *   3. App Secret (Paramètres → Général) → FB_APP_SECRET.
 *   4. Choisir un Verify Token au hasard → FB_VERIFY_TOKEN.
 *   5. Configurer le Webhook : URL = https://nexusmarket.sn/api/messenger-webhook,
 *      Verify Token = la même valeur que FB_VERIFY_TOKEN, s'abonner au champ "messages".
 *   ⚠️ Sans App Review Meta, le bot ne répond qu'aux utilisateurs test/admin de l'App
 *      (mode développement) — la review Meta est nécessaire pour un usage public large.
 */
import { generateBotReply } from './_lib/bot-brain.js';
import { hmacSha256Hex, timingSafeEqual } from './_lib/webhook-utils.js';
import { isBotEnabled } from './_lib/bots-config.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && env.FB_VERIFY_TOKEN && token === env.FB_VERIFY_TOKEN) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Vérification échouée', { status: 403 });
}

export async function onRequestPost({ request, env }) {
  if (!env.FB_PAGE_ACCESS_TOKEN) return new Response('Bot Messenger non configuré', { status: 503 });

  const rawBody = await request.text();

  if (env.FB_APP_SECRET) {
    const sigHeader = request.headers.get('X-Hub-Signature-256') || '';
    const expected = 'sha256=' + await hmacSha256Hex(env.FB_APP_SECRET, rawBody);
    if (!timingSafeEqual(sigHeader, expected)) return new Response('Signature invalide', { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return new Response('EVENT_RECEIVED', { status: 200 }); }
  if (payload.object !== 'page') return new Response('EVENT_RECEIVED', { status: 200 });

  const origin = env.SITE_URL || 'https://nexusmarket.sn';
  const events = [];
  for (const entry of payload.entry || []) {
    for (const ev of entry.messaging || []) {
      if (ev.message && !ev.message.is_echo && ev.message.text && ev.sender && ev.sender.id) {
        events.push({ senderId: ev.sender.id, text: ev.message.text });
      }
    }
  }

  if (events.length && !(await isBotEnabled(env, 'messenger'))) return new Response('EVENT_RECEIVED', { status: 200 });

  // Traitement séquentiel simple (volume attendu faible) — évite de complexifier
  // avec une queue pour un premier lancement.
  for (const { senderId, text } of events) {
    const reply = await generateBotReply(env, { text, origin });
    await sendMessengerReply(env, senderId, reply).catch((e) => console.error('[messenger-webhook] envoi KO:', e && e.message));
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function sendMessengerReply(env, recipientId, text) {
  const r = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(env.FB_PAGE_ACCESS_TOKEN)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error('[messenger-webhook] Send API KO:', r.status, detail);
  }
}
