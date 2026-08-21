/**
 * NEXUS Market — /api/telegram-webhook
 * Bot Telegram : réponse automatique aux messages reçus via le cerveau partagé
 * (bot-brain.js).
 *
 * Mise en place :
 *   1. Créer le bot via @BotFather sur Telegram → récupérer le token.
 *   2. Cloudflare Pages → variables d'env :
 *        TELEGRAM_BOT_TOKEN  = 123456:ABC-DEF... (token @BotFather, SECRET)
 *        TELEGRAM_WEBHOOK_SECRET = un secret au choix
 *   3. Enregistrer le webhook (une seule fois, depuis un terminal) :
 *        curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://nexusmarket.sn/api/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 *      Telegram renverra alors l'en-tête X-Telegram-Bot-Api-Secret-Token sur chaque
 *      requête, vérifié ci-dessous (protection native, pas de HMAC à recalculer).
 */
import { generateBotReply } from './_lib/bot-brain.js';
import { isBotEnabled } from './_lib/bots-config.js';

const TELEGRAM_API = 'https://api.telegram.org';

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_BOT_TOKEN) return new Response('Bot Telegram non configuré', { status: 503 });

  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (provided !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('Non autorisé', { status: 401 });
  }

  let update;
  try { update = await request.json(); } catch { return new Response('OK', { status: 200 }); }

  const msg = update && (update.message || update.edited_message);
  const chatId = msg && msg.chat && msg.chat.id;
  const text = msg && msg.text;
  if (!chatId || !text) return new Response('OK', { status: 200 }); // événement non textuel (photo, sticker, join...)

  if (!(await isBotEnabled(env, 'telegram'))) return new Response('OK', { status: 200 });

  const origin = env.SITE_URL || 'https://nexusmarket.sn';
  const reply = await generateBotReply(env, { text, origin });

  await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: reply }),
  }).catch((e) => console.error('[telegram-webhook] envoi KO:', e && e.message));

  return new Response('OK', { status: 200 });
}

export async function onRequestGet() {
  return new Response('NEXUS Telegram bot webhook — POST only.', { status: 200 });
}
