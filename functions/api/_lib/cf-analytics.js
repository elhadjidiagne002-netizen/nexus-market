// functions/api/_lib/cf-analytics.js
// Requêtes HTTP réelles servies par le CDN Cloudflare (visites/jour), via la
// GraphQL Analytics API. Extrait de platform-usage.js pour être réutilisé par
// growth-stats.js sans dupliquer la requête GraphQL. Fail-open : si
// CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID ne sont pas configurés, retourne
// configured:false plutôt que d'échouer (même philosophie que OSRM_BASE_URL).
export async function fetchCloudflareDailyRequests(env, days = 30) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    return {
      configured: false,
      note: 'CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID non configurés (variables Cloudflare Pages).',
    };
  }
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const query = `query ($zoneTag: String!, $since: Date!, $until: Date!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(limit: 100, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
          dimensions { date }
          sum { requests bytes cachedRequests cachedBytes threats }
        }
      }
    }
  }`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { zoneTag: zoneId, since, until } }),
    });
    clearTimeout(t);
    const data = await res.json();
    if (!res.ok || data.errors) {
      return { configured: true, ok: false, error: (data.errors || []).map((e) => e.message).join('; ') || `HTTP ${res.status}` };
    }
    const groups = data?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    return {
      configured: true,
      ok: true,
      daily: groups.map((g) => ({
        date: g.dimensions?.date,
        requests: g.sum?.requests || 0,
        bytes: g.sum?.bytes || 0,
        cachedRequests: g.sum?.cachedRequests || 0,
        cachedBytes: g.sum?.cachedBytes || 0,
        threats: g.sum?.threats || 0,
      })),
    };
  } catch (e) {
    return { configured: true, ok: false, error: e.message };
  }
}
