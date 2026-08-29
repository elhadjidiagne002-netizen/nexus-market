// functions/api/admin/platform-usage.js → GET /api/admin/platform-usage
// Dashboard admin « Utilisation plateformes » : vue globale de la consommation
// sur les services externes utilisés par NEXUS Market, pour ne pas dépasser les
// quotas gratuits. Réservé admin (requireAdmin).
//
// Ce qui est RÉELLEMENT mesurable en direct (et pourquoi) :
//  - Supabase DB size + Storage size : calculables en SQL (pg_database_size,
//    storage.objects), via la RPC admin_supabase_usage() (sql/2026_08_25_...).
//    L'API Management Supabase n'expose PAS d'endpoint /usage — vérifié
//    2026-08-25 (aucune route usage/billing/stats dans son OpenAPI, seulement
//    /billing/addons pour changer d'offre). L'égress Supabase n'est donc PAS
//    récupérable par API : lien direct vers le dashboard à la place.
//  - Cloudflare zone (bande passante + requêtes) : GraphQL Analytics API, SI
//    CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_ZONE_ID sont
//    configurés (token à créer dans le dashboard Cloudflare avec la permission
//    "Zone > Analytics > Read" sur nexusmarket.sn). Sans ça : configured:false,
//    section grisée côté front — ne bloque rien (même filosophie que
//    OSRM_BASE_URL/VAPID : fonctionnalité optionnelle, fail-open).
//  - Tout le reste (WhatsApp Green API/WAHA, Groq, Resend/Brevo, Firecrawl,
//    Brave Search, Apify, PayTech) n'a pas d'API "usage" simple et uniforme :
//    on donne des liens directs vers chaque dashboard plutôt que d'inventer un
//    scraping fragile.
import { requireAdmin, supabase, json, err, options } from '../_lib/utils.js';
import { fetchCloudflareDailyRequests } from '../_lib/cf-analytics.js';

const SUPABASE_FREE_LIMITS = {
  db_size_bytes: 500 * 1024 * 1024, // 500 MB
  storage_size_bytes: 1 * 1024 * 1024 * 1024, // 1 GB
};

const EXTERNAL_LINKS = [
  { key: 'supabase_billing', name: 'Supabase — Facturation & usage', url: 'https://supabase.com/dashboard/project/pqcqbstbdujzaclsiosv/settings/billing/usage', note: 'Égress, invocations Edge Functions, MAU — pas d’API publique.' },
  { key: 'cloudflare_dashboard', name: 'Cloudflare — Analytics', url: 'https://dash.cloudflare.com/', note: 'Pages, Workers, DNS, cache.' },
  { key: 'green_api', name: 'Green API (WhatsApp sortant)', url: 'https://console.green-api.com/', note: 'Quota mensuel du plan gratuit (466 = dépassé).' },
  { key: 'waha', name: 'WAHA (WhatsApp secours)', url: 'https://dashboard.render.com/', note: 'Instance Render — vérifier heures/mois du plan Starter.' },
  { key: 'groq', name: 'Groq (IA — bots, assistant)', url: 'https://console.groq.com/settings/billing', note: 'Tokens IA utilisés par le chatbot et l’assistant produit.' },
  { key: 'resend', name: 'Resend (email primaire)', url: 'https://resend.com/emails', note: '3 000 emails/mois gratuits.' },
  { key: 'brevo', name: 'Brevo (email secours)', url: 'https://app.brevo.com/', note: '300 emails/jour gratuits.' },
  { key: 'firecrawl', name: 'Firecrawl (prospection catalogue)', url: 'https://www.firecrawl.dev/app', note: '500 crédits/mois gratuits.' },
  { key: 'brave_search', name: 'Brave Search API', url: 'https://api-dashboard.search.brave.com/app/dashboard', note: 'Limite personnalisée déjà activée (cf. Usage limits).' },
  { key: 'apify', name: 'Apify (scraping ponctuel)', url: 'https://console.apify.com/billing/current-period', note: 'Plafonné à $5/mois (limite native du plan gratuit).' },
  { key: 'paytech', name: 'PayTech (paiements mobile money)', url: 'https://paytech.sn/', note: 'Transactions, pas un quota de données.' },
];

function pct(used, limit) {
  if (!limit) return null;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}

async function fetchSupabaseUsage(env) {
  try {
    const sb = supabase(env);
    const rows = await sb.rpc('admin_supabase_usage', {});
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error('réponse vide');
    const db = Number(row.db_size_bytes) || 0;
    const storage = Number(row.storage_size_bytes) || 0;
    return {
      ok: true,
      db_size_bytes: db,
      db_limit_bytes: SUPABASE_FREE_LIMITS.db_size_bytes,
      db_pct: pct(db, SUPABASE_FREE_LIMITS.db_size_bytes),
      storage_size_bytes: storage,
      storage_limit_bytes: SUPABASE_FREE_LIMITS.storage_size_bytes,
      storage_pct: pct(storage, SUPABASE_FREE_LIMITS.storage_size_bytes),
      storage_object_count: Number(row.storage_object_count) || 0,
      egress: { available: false, note: 'Non exposé par l’API Supabase — voir le dashboard.' },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchCloudflareUsage(env) {
  const res = await fetchCloudflareDailyRequests(env, 30);
  if (!res.configured || !res.ok) return res;
  const until = new Date().toISOString().slice(0, 10);
  const totals = res.daily.reduce(
    (acc, g) => ({
      requests: acc.requests + (g.requests || 0),
      bytes: acc.bytes + (g.bytes || 0),
      cachedRequests: acc.cachedRequests + (g.cachedRequests || 0),
      cachedBytes: acc.cachedBytes + (g.cachedBytes || 0),
      threats: acc.threats + (g.threats || 0),
    }),
    { requests: 0, bytes: 0, cachedRequests: 0, cachedBytes: 0, threats: 0 }
  );
  const today = res.daily.find((g) => g.date === until);
  return {
    configured: true,
    ok: true,
    period_days: res.daily.length,
    last_30d: totals,
    today: today || null,
    daily: res.daily,
  };
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  const [, errResp] = await requireAdmin(request, env);
  if (errResp) return errResp;

  const [supabaseUsage, cloudflareUsage] = await Promise.all([
    fetchSupabaseUsage(env),
    fetchCloudflareUsage(env),
  ]);

  return json({
    time: new Date().toISOString(),
    supabase: supabaseUsage,
    cloudflare: cloudflareUsage,
    external_links: EXTERNAL_LINKS,
  });
}
