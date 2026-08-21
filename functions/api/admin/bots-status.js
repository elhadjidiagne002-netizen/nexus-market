// functions/api/admin/bots-status.js — GET, admin-only
// État consolidé des 3 bots entrants pour le panneau admin : secrets configurés
// côté Cloudflare + interrupteur marche/arrêt (app_config) + état de connexion
// réel quand on peut l'obtenir sans coût (Green API/WAHA déjà interrogés par
// l'endpoint /api/whatsapp existant ; Messenger via l'API Graph si le token est là).
import { json, err, requireAdmin, options } from '../_lib/utils.js';
import { getBotsConfig } from '../_lib/bots-config.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  const cfg = await getBotsConfig(env);

  const whatsapp = {
    enabled: cfg.whatsapp,
    secretConfigured: !!env.WA_WEBHOOK_SECRET,
    providerConfigured: !!((env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN) || (env.WAHA_BASE_URL && env.WAHA_API_KEY)),
    webhookUrl: '/api/whatsapp-webhook',
  };

  const telegram = {
    enabled: cfg.telegram,
    tokenConfigured: !!env.TELEGRAM_BOT_TOKEN,
    secretConfigured: !!env.TELEGRAM_WEBHOOK_SECRET,
    webhookUrl: '/api/telegram-webhook',
  };

  const messenger = {
    enabled: cfg.messenger,
    tokenConfigured: !!env.FB_PAGE_ACCESS_TOKEN,
    appSecretConfigured: !!env.FB_APP_SECRET,
    verifyTokenConfigured: !!env.FB_VERIFY_TOKEN,
    webhookUrl: '/api/messenger-webhook',
    subscription: null,
  };

  // Best-effort : interroge l'API Graph pour savoir si l'abonnement webhook est
  // réellement actif (pas seulement les secrets présents). Silencieux en cas d'échec.
  if (env.FB_PAGE_ACCESS_TOKEN) {
    try {
      const r = await fetch(`https://graph.facebook.com/v19.0/me/subscribed_apps?access_token=${encodeURIComponent(env.FB_PAGE_ACCESS_TOKEN)}`);
      const data = await r.json().catch(() => null);
      messenger.subscription = r.ok ? (data && data.data) || [] : { error: (data && data.error && data.error.message) || `HTTP ${r.status}` };
    } catch (e) {
      messenger.subscription = { error: e.message };
    }
  }

  return json({ whatsapp, telegram, messenger, time: new Date().toISOString() });
}
