// functions/api/admin/growth-stats.js → GET /api/admin/growth-stats?days=30
// Panneau admin "Statistiques de croissance" : inscriptions/commandes/
// installations PWA par jour (RPC admin_growth_stats, sql migration
// 2026_08_29) + visites/jour réelles (requêtes HTTP Cloudflare, cf-analytics.js).
// Réservé admin (requireAdmin). Chaque source dégrade indépendamment (fail-open) :
// si Cloudflare n'est pas configuré ou Supabase indisponible, les autres
// sections restent utilisables.
import { requireAdmin, supabase, json, err, options } from '../_lib/utils.js';
import { fetchCloudflareDailyRequests } from '../_lib/cf-analytics.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  const days = Math.min(90, Math.max(7, parseInt(new URL(request.url).searchParams.get('days'), 10) || 30));

  const [growth, visits] = await Promise.all([
    (async () => {
      try {
        const sb = supabase(env);
        const rows = await sb.rpc('admin_growth_stats', { days });
        const row = Array.isArray(rows) ? rows[0] : rows;
        // Selon le driver PostgREST, la RPC scalaire jsonb revient soit en objet
        // direct, soit enveloppée dans une clé du nom de la fonction.
        return { ok: true, data: row?.admin_growth_stats ?? row };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })(),
    fetchCloudflareDailyRequests(env, days),
  ]);

  return json({
    time: new Date().toISOString(),
    days,
    growth,
    visits,
  });
}
