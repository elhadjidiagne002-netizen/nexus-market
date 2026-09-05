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
import { isBotEnabled } from './_lib/bots-config.js';

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const provided = url.searchParams.get('secret') || '';
  if (!env.WA_WEBHOOK_SECRET || provided !== env.WA_WEBHOOK_SECRET) {
    return new Response('Non autorisé', { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return new Response('OK', { status: 200 }); }

  const { phone, text } = extractIncoming(body);
  if (!phone || !text) return new Response('OK', { status: 200 }); // événement non pertinent (accusé de réception, changement de statut...)

  // [DÉSINSCRIPTION — 2026-09-05] Un « STOP » doit sortir la personne de TOUTES
  // les campagnes, immédiatement et sans condition. Traité AVANT le coupe-circuit
  // du bot : même bot désactivé, un désabonnement doit être enregistré, sinon on
  // continuerait d'écrire à quelqu'un qui a demandé l'arrêt. Voir
  // functions/cron/wa-campaign.js, qui lit wa_opt_outs à chaque lot.
  if (isOptOut(text)) {
    await recordOptOut(env, phone).catch(() => {});
    await sendWhatsAppDirect(env, {
      phone,
      message: "C'est noté : vous ne recevrez plus de messages de NEXUS Market. Bonne journée !",
    }).catch(() => {});
    return new Response('OK', { status: 200 });
  }

  // Coupure admin : le webhook reste enregistré (accusé 200) mais ne répond plus.
  if (!(await isBotEnabled(env, 'whatsapp'))) return new Response('OK', { status: 200 });

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

// Désinscription : le mot-clé doit constituer L'ESSENTIEL du message, pas y
// apparaître au détour d'une phrase. Un simple `^(stop|arrêt…)` désinscrivait
// « arrêtez-vous au marché ? » — quelqu'un d'intéressé, perdu par erreur
// (vérifié en test). On accepte donc le mot-clé seul, éventuellement suivi
// d'une formule de politesse, et rien d'autre.
const OPT_OUT_WORD = /^(stop|stopp?ez|arr[eê]t|arr[eê]te[zr]?|d[eé]sabonn?e[rz]?|d[eé]sabonnement|unsubscribe|ne\s+plus\s+(m['\s]?[eé]crire|me\s+contacter|me\s+d[eé]ranger))$/i;
// Mots tolérés autour du mot-clé sans changer le sens.
const POLITESSE = /^(svp|s'?il\s+vous\s+pla[iî]t|merci|please|pls|bonjour|salut|ok|d'?accord)$/i;

function isOptOut(text) {
  const clean = String(text || '')
    .replace(/[.!?,;:]+/g, ' ')      // ponctuation → séparateur
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || clean.length > 40) return false;  // un vrai « stop » est court
  // On teste le message entier, puis le message privé de ses mots de politesse.
  if (OPT_OUT_WORD.test(clean)) return true;
  const reste = clean.split(' ').filter(w => !POLITESSE.test(w)).join(' ');
  return !!reste && OPT_OUT_WORD.test(reste);
}

async function recordOptOut(env, phone) {
  const { supabase } = await import('./_lib/utils.js');
  const sb = supabase(env);
  // upsert : un second « STOP » ne doit pas faire échouer la requête.
  await sb.from('wa_opt_outs').upsert({ phone, reason: 'stop_whatsapp' }, 'phone');
  // Marque aussi les cibles encore en attente, pour que le cron n'ait même pas
  // à les considérer (la table wa_opt_outs reste la source de vérité).
  await sb.from('wa_campaign_targets')
    .update({ status: 'opted_out' }, `phone=eq.${encodeURIComponent(phone)}&status=eq.pending`)
    .catch(() => {});
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
