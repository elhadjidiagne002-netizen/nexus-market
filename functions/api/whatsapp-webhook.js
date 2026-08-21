/**
 * NEXUS Market — /api/whatsapp-webhook
 * Réception des messages WhatsApp ENTRANTS (Green API ou WAHA) et réponse
 * automatique via le cerveau partagé (bot-brain.js). Complète functions/api/whatsapp.js
 * qui ne gère que l'envoi SORTANT.
 *
 * À configurer côté fournisseur :
 *   Green API : Dashboard instance → Settings → Webhook URL
 *     = https://nexusmarket.sn/api/whatsapp-webhook?secret=<WA_WEBHOOK_SECRET>
 *     (activer "Incoming message received")
 *   WAHA      : variable d'env WAHA / config session → webhook URL identique
 *     (même query param ?secret=)
 *
 * Variable d'environnement Cloudflare requise : WA_WEBHOOK_SECRET (secret au choix,
 * partagé uniquement avec l'URL configurée côté fournisseur — ni Green API ni WAHA
 * ne signent leurs payloads webhook, donc ce secret dans l'URL est la seule protection
 * contre un tiers qui devinerait l'endpoint).
 */
import { generateBotReply } from './_lib/bot-brain.js';
import { sendWhatsAppDirect } from './_lib/wa-send.js';

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const provided = url.searchParams.get('secret') || '';
  console.log('[wa-webhook-debug]', { hasSecret: !!env.WA_WEBHOOK_SECRET, secretLen: (env.WA_WEBHOOK_SECRET || '').length, providedLen: provided.length, match: provided === env.WA_WEBHOOK_SECRET });
  if (!env.WA_WEBHOOK_SECRET || provided !== env.WA_WEBHOOK_SECRET) {
    return new Response('Non autorisé', { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return new Response('OK', { status: 200 }); }

  const { phone, text } = extractIncoming(body);
  if (!phone || !text) return new Response('OK', { status: 200 }); // événement non pertinent (accusé de réception, changement de statut...)

  const origin = env.SITE_URL || 'https://nexusmarket.sn';
  const reply = await generateBotReply(env, { text, origin });
  // Best-effort : on répond "OK" au fournisseur même si l'envoi de la réponse échoue,
  // pour éviter que Green API/WAHA ne renvoie le même webhook en boucle.
  await sendWhatsAppDirect(env, { phone, message: reply }).catch(() => {});

  return new Response('OK', { status: 200 });
}

export async function onRequestGet() {
  return new Response('NEXUS WhatsApp inbound webhook — POST only.', { status: 200 });
}

// Green API : { typeWebhook:'incomingMessageReceived', senderData:{ sender }, messageData:{ typeMessage, textMessageData:{ textMessage }, extendedTextMessageData:{ text } } }
// WAHA      : { event:'message', payload:{ from, body, fromMe } }
function extractIncoming(body) {
  if (!body || typeof body !== 'object') return {};

  // Green API
  if (body.typeWebhook === 'incomingMessageReceived') {
    const sender = body.senderData && body.senderData.sender; // "221771234567@c.us"
    const md = body.messageData || {};
    const text = (md.textMessageData && md.textMessageData.textMessage)
      || (md.extendedTextMessageData && md.extendedTextMessageData.text)
      || '';
    return { phone: sender ? sender.split('@')[0] : null, text };
  }

  // WAHA
  if (body.event === 'message' && body.payload) {
    const p = body.payload;
    if (p.fromMe) return {}; // ignore nos propres messages sortants renvoyés en écho
    const from = p.from || ''; // "221771234567@c.us"
    return { phone: from ? from.split('@')[0] : null, text: p.body || '' };
  }

  return {};
}
