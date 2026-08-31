// functions/api/admin/logs.js → GET /api/admin/logs?limit=&offset=&action=&level=
// Journal admin unifié : agrège email_logs, whatsapp_logs, notification_outbox,
// payment_events, maintenance_log (RPC admin_logs_feed). Réservé admin.
// Alimente le panneau "Journal activité" (AdminLogsViewer) déjà présent dans le
// frontend depuis un moment, mais jusqu'ici privé de backend (404 silencieux).
import { requireAdmin, err, json, options } from '../_lib/utils.js';
import { fetchLogsFeed } from '../_lib/logs.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  const action = url.searchParams.get('action');
  const level = url.searchParams.get('level');

  try {
    const logs = await fetchLogsFeed(env, { limit, offset, action, level });
    return json({ logs });
  } catch (e) {
    // [FIX] 502 est intercepté par Cloudflare (page d'erreur HTML générique
    // à la place du JSON) — 500 laisse passer le vrai message d'erreur.
    return err('Erreur journal: ' + e.message, 500);
  }
}
