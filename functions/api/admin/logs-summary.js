// functions/api/admin/logs-summary.js → GET /api/admin/logs-summary?days=
// Résumé du journal admin unifié : compte par "action" (email:xxx, whatsapp:xxx,
// notify:xxx, payment:xxx, cron:xxx) sur les N derniers jours (RPC admin_logs_summary).
// Réservé admin.
// [NOTE] Pas /api/admin/logs/summary : .gitignore ligne 13 (`logs/`) ignore
// silencieusement TOUT dossier nommé "logs" — un fichier functions/api/admin/logs/summary.js
// ne serait jamais committé ni déployé. D'où le tiret plutôt qu'un sous-dossier.
import { requireAdmin, err, json, options } from '../_lib/utils.js';
import { fetchLogsSummary } from '../_lib/logs.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  const url = new URL(request.url);
  const sinceDays = url.searchParams.get('days');

  try {
    const summary = await fetchLogsSummary(env, { sinceDays });
    return json({ summary });
  } catch (e) {
    return err('Erreur résumé journal: ' + e.message, 502);
  }
}
