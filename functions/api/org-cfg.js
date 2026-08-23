// functions/api/org-cfg.js → GET /api/org-cfg (public, lecture seule)
// Expose au bundle client la config org (email de contact + liens sociaux)
// éditée par l'admin dans app_config.nexus_org_cfg — permet à l'homepage de
// remplacer les URLs sociales hardcodées et l'email JSON-LD sans redéploiement.
// Un cache-control court (60s) évite de marteler Supabase à chaque page vue
// tout en propageant les changements admin en moins d'1 min.
import { getOrgCfg } from '../_lib/org-cfg.js';

export async function onRequestGet({ env }) {
  const cfg = await getOrgCfg(env);
  // Volontairement, on ne renvoie PAS legal_phone (numéro perso potentiel) au
  // client public : il ne sert qu'aux pages SSR (CGU/Confidentialité), pas au
  // bundle JS qui pourrait le journaliser dans des analytics/erreurs.
  const publicCfg = {
    legal_name: cfg.legal_name,
    contact_email: cfg.contact_email,
    facebook_url: cfg.facebook_url,
    facebook_page_id: cfg.facebook_page_id,
    instagram_url: cfg.instagram_url,
    tiktok_url: cfg.tiktok_url,
    twitter_url: cfg.twitter_url,
    linkedin_url: cfg.linkedin_url,
    youtube_url: cfg.youtube_url,
  };
  return new Response(JSON.stringify(publicCfg), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
