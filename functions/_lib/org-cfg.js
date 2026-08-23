// functions/_lib/org-cfg.js
// Coordonnées légales + emails de contact + liens sociaux, éditables depuis
// l'admin (app_config.nexus_org_cfg). Un SEUL point de vérité, lu par CGU,
// Politique de confidentialité, page Contact, page À propos, JSON-LD de
// l'homepage et helper commun.
//
// Historique : ces valeurs étaient éparpillées en dur dans 6+ fichiers, avec
// l'email personnel et le téléphone perso de l'admin exposés publiquement
// dans les CGU (risque RGPD + doxxing). Cette factorisation supprime les
// données perso du bundle et rend tout ajustable sans redéploiement.
//
// Fail-open : si Supabase est injoignable ou la clé absente, on renvoie les
// valeurs par défaut (nx@nexusmarket.sn, Dakar, Sénégal) — le site continue
// de fonctionner, on n'affiche jamais de placeholder brut du type {{email}}.

const DEFAULTS = Object.freeze({
  legal_name: 'NEXUS Market',
  legal_email: 'nx@nexusmarket.sn',    // pro (nexusmarket.sn), pas perso
  legal_phone: '',                      // vide par défaut = ne pas afficher
  legal_address: 'Dakar, Sénégal',
  contact_email: 'nx@nexusmarket.sn',
  rgpd_email: 'nx@nexusmarket.sn',
  facebook_url: 'https://www.facebook.com/1233022656551601',
  facebook_page_id: '1233022656551601',
  instagram_url: '',
  tiktok_url: '',
  twitter_url: '',
  linkedin_url: '',
  youtube_url: '',
});

const CACHE_KEY = 'nexus_org_cfg_cached';
let _memCache = null;
let _memCacheAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 min — suffisant pour lisser les rafales, immédiat côté admin

export async function getOrgCfg(env) {
  const now = Date.now();
  if (_memCache && (now - _memCacheAt) < CACHE_TTL_MS) return _memCache;

  const url = env && env.SUPABASE_URL;
  const key = env && (env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY);
  if (!url || !key) { _memCache = { ...DEFAULTS }; _memCacheAt = now; return _memCache; }

  try {
    const r = await fetch(`${url}/rest/v1/app_config?select=value&key=eq.nexus_org_cfg&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) { _memCache = { ...DEFAULTS }; _memCacheAt = now; return _memCache; }
    const rows = await r.json();
    const value = Array.isArray(rows) && rows[0] && rows[0].value;
    _memCache = { ...DEFAULTS, ...(value && typeof value === 'object' ? value : {}) };
    _memCacheAt = now;
    return _memCache;
  } catch (_) {
    _memCache = { ...DEFAULTS };
    _memCacheAt = now;
    return _memCache;
  }
}

// Construit le tableau JSON-LD sameAs à partir de la config (URLs non vides).
export function sameAs(cfg) {
  return [cfg.facebook_url, cfg.instagram_url, cfg.tiktok_url, cfg.twitter_url, cfg.linkedin_url, cfg.youtube_url]
    .map((s) => (s || '').trim()).filter(Boolean);
}
