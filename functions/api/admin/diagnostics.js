// functions/api/admin/diagnostics.js → GET /api/admin/diagnostics
// Diagnostic agrégé de TOUTES les intégrations, pour le tableau de bord admin.
// Réservé admin (requireAdmin). Combine présence de configuration + quelques
// vérifs live peu coûteuses (ping Imagor, compteurs outbox).
import { requireAdmin, supabase, json, err, options } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  const out = {
    time: new Date().toISOString(),
    runtime: 'cloudflare-pages-functions',
    supabase: { configured: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) },
    paytech: { configured: !!(env.PAYTECH_API_KEY && (env.PAYTECH_API_SECRET || env.PAYTECH_SECRET_KEY)) },
    email: { resend: !!env.RESEND_API_KEY, brevo: !!env.BREVO_API_KEY },
    whatsapp: {
      greenApi: !!(env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN),
      waha: !!(env.WAHA_BASE_URL && env.WAHA_API_KEY),
    },
    sms: { httpsms: !!(env.HTTPSMS_API_KEY && env.HTTPSMS_FROM) },
    imageProxy: { imagorConfigured: !!env.IMAGOR_BASE_URL, imagorUp: null },
    push: { vapid: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) },
  };

  // Ping Imagor (live, timeout court) — up/down réel.
  if (env.IMAGOR_BASE_URL) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch(env.IMAGOR_BASE_URL.replace(/\/+$/, ''), { signal: ctrl.signal });
      clearTimeout(t);
      out.imageProxy.imagorUp = !!(r && r.status && r.status < 500);
    } catch (_) { out.imageProxy.imagorUp = false; }
  }

  // Compteurs de la file de notifications (retry).
  try {
    const sb = supabase(env);
    const [pend, fail] = await Promise.all([
      sb.from('notification_outbox').select('id', 'status=eq.pending&limit=1000'),
      sb.from('notification_outbox').select('id', 'status=eq.failed&limit=1000'),
    ]);
    out.notificationOutbox = {
      pending: Array.isArray(pend) ? pend.length : 0,
      failed: Array.isArray(fail) ? fail.length : 0,
    };
  } catch (e) {
    out.notificationOutbox = { error: e.message };
  }

  return json(out);
}
