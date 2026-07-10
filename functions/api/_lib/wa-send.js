// functions/api/_lib/wa-send.js
// Envoi WhatsApp direct (Green API + repli WAHA) — logique partagée entre
// l'endpoint HTTP /api/whatsapp (functions/api/whatsapp.js) et sendEventWhatsApp
// (notify.js), qui appelle l'envoi EN PROCESS (pas de fetch HTTP interne) depuis
// les autres functions serveur (webhooks paiement, payout, offres, stock...).
import { normalizePhone } from './validate.js';

export function toChatId(phone) {
  const raw = normalizePhone(phone);
  return (raw.startsWith('221') ? raw : raw.length === 9 ? '221' + raw : raw) + '@c.us';
}

// Envoi via Green API. Retour uniforme { ok, id?, error?, detail? }.
export async function sendViaGreenApi(env, { chatId, message }) {
  const instanceId = env.GREEN_API_INSTANCE_ID;
  const apiToken   = env.GREEN_API_TOKEN;
  const baseUrl    = env.GREEN_API_BASE_URL || 'https://api.greenapi.com';
  if (!instanceId || !apiToken) return { ok: false, error: 'Green API non configurée' };

  let res;
  try {
    res = await fetch(`${baseUrl}/waInstance${instanceId}/sendMessage/${apiToken}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chatId, message }),
    });
  } catch (err) {
    return { ok: false, error: 'Green API injoignable : ' + err.message };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 466 = quota mensuel du plan Developer (gratuit) Green API dépassé.
    const errorMsg = res.status === 466
      ? 'Quota mensuel Green API dépassé (plan Developer/gratuit)'
      : 'Green API ' + res.status;
    return { ok: false, error: errorMsg, detail: data, httpStatus: res.status };
  }
  return { ok: true, id: data.idMessage || null };
}

// Envoi via WAHA (fallback). Même contrat de retour que sendViaGreenApi.
export async function sendViaWaha(env, { chatId, message }) {
  const base    = (env.WAHA_BASE_URL || '').replace(/\/+$/, '');
  const apiKey  = env.WAHA_API_KEY;
  const session = env.WAHA_SESSION || 'default';
  if (!base || !apiKey) return { ok: false, error: 'WAHA non configurée', notConfigured: true };

  let res;
  try {
    res = await fetch(`${base}/api/sendText`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body:    JSON.stringify({ chatId, text: message, session }),
    });
  } catch (err) {
    return { ok: false, error: 'WAHA injoignable : ' + err.message };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: 'WAHA ' + res.status + (data && data.message ? ' : ' + data.message : ''), detail: data };
  }
  return { ok: true, id: (data && (data.id || data.messageId)) || null };
}

/**
 * Envoi direct (sans repasser par un fetch HTTP vers /api/whatsapp) : Green API
 * en priorité, repli automatique sur WAHA si Green API échoue et que WAHA est
 * configurée. Même comportement de bascule que POST /api/whatsapp.
 * Retour : { ok, id?, error?, provider, chatId }.
 */
export async function sendWhatsAppDirect(env, { phone, message }) {
  const greenConfigured = !!(env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN);
  const wahaConfigured  = !!(env.WAHA_BASE_URL && env.WAHA_API_KEY);
  if (!greenConfigured && !wahaConfigured) {
    return { ok: false, error: 'Aucun fournisseur WhatsApp configuré (Green API ni WAHA)' };
  }

  const chatId = toChatId(phone);
  let result = null;
  let providerUsed = null;

  if (greenConfigured) {
    result = await sendViaGreenApi(env, { chatId, message });
    providerUsed = 'green-api';
  }
  if ((!result || !result.ok) && wahaConfigured) {
    result = await sendViaWaha(env, { chatId, message });
    providerUsed = 'waha';
  }

  return { ...(result || { ok: false, error: 'Échec de l\'envoi WhatsApp' }), provider: providerUsed, chatId };
}
