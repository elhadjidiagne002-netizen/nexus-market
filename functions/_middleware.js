/**
 * functions/_middleware.js
 * Middleware global pour Cloudflare Pages – CORS & helpers
 */
import { sbGetOne, proxyImg, esc } from "./_lib/seo.js";

export async function onRequest(context) {
  // Redirection canonique : www.nexusmarket.sn → nexusmarket.sn (301 permanent)
  const reqUrl = new URL(context.request.url);
  if (reqUrl.hostname === "www.nexusmarket.sn") {
    reqUrl.hostname = "nexusmarket.sn";
    return Response.redirect(reqUrl.toString(), 301);
  }

  // [PERF/LCP — audit AdSense 2026-08-26] La fiche produit servie par la SPA
  // (index.html + ?product=<id>) est un shell TOTALEMENT vide avant hydratation
  // React (~425 car. de HTML avant le premier <script>, juste l'écran de
  // démarrage) : image, prix, description n'existent qu'après téléchargement du
  // bundle + appel API. Risque de LCP tardif, surtout mobile/réseau lent au
  // Sénégal. La page /produit/:id (functions/produit/[id].js) a déjà ce contenu
  // pré-rendu — ELLE est indexée par Google (canonical, sitemap), donc ce
  // point n'est pas un vrai blocage AdSense. Mais pour l'expérience utilisateur
  // réelle (un visiteur qui clique "Voir le produit et commander" atterrit ici),
  // on injecte le même type de contenu directement dans #root : la même page
  // index.html, avec un aperçu produit visible AVANT que React ne s'exécute.
  // React (createRoot().render(), PAS hydrateRoot) remplace ce contenu
  // proprement dès l'hydratation — aucun risque de mismatch, juste un premier
  // affichage plus rapide. Fail-open : toute erreur retombe sur context.next()
  // (la page normale), rien ne casse si Supabase ou ASSETS.fetch échoue.
  if (context.request.method === "GET" && reqUrl.pathname === "/" && reqUrl.searchParams.has("product")) {
    const injected = await tryInjectProductPreview(context, reqUrl);
    if (injected) return injected;
  }

  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(context.request, context.env),
    });
  }

  context.data.cors = () => corsHeaders(context.request, context.env);
  context.data.json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(context.request, context.env),
      },
    });

  return context.next();
}

// [SEC #8] Liste blanche d'origines. L'ancienne version reflétait N'IMPORTE
// QUELLE origine AVEC Access-Control-Allow-Credentials: true → tout site tiers
// pouvait émettre des requêtes credentialed cross-origin. On ne renvoie
// désormais Credentials QUE pour une origine explicitement autorisée.
//   · ALLOWED_ORIGINS (env, séparées par des virgules) = origines exactes ;
//   · par défaut : *.pages.dev (déploiement Cloudflare) + localhost (dev).
function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }

  const list = String(env?.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return true;

  // Domaine prod explicite (si configuré) — comparaison par hostname.
  if (env?.SITE_URL) {
    try { if (new URL(env.SITE_URL).hostname === host) return true; } catch (_) {}
  }
  // Déploiements Cloudflare Pages + dev local.
  if (host.endsWith(".pages.dev")) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
}

function corsHeaders(request, env) {
  const origin = request?.headers?.get("Origin");

  // Origine autorisée → on reflète l'origine ET on autorise les credentials.
  if (origin && isAllowedOrigin(origin, env)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    };
  }

  // Origine inconnue ou appel serveur (sans Origin) → accès public en lecture
  // possible, mais JAMAIS de credentials cross-origin.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

// [PERF/LCP] Injecte un aperçu produit (image, prix, description) dans #root
// AVANT que React ne s'exécute, pour /?product=<id>. Voir le commentaire dans
// onRequest() ci-dessus pour le contexte. Retourne null au moindre problème
// (id invalide, produit introuvable, erreur réseau) → l'appelant retombe alors
// sur le comportement normal (context.next(), page servie telle quelle).
async function tryInjectProductPreview(context, reqUrl) {
  const id = reqUrl.searchParams.get("product");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const p = await sbGetOne(
      context.env,
      `products?select=id,name,description,image_url,price,category,stock&id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`
    );
    if (!p) return null;

    if (!context.env.ASSETS) return null;
    const res = await context.env.ASSETS.fetch(context.request);
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes('<div id="root"></div>')) return null; // structure inattendue → ne rien casser

    const origin = context.env.SITE_URL || reqUrl.origin;
    const EUR_TO_FCFA = 655.957;
    const priceFcfa = p.price ? Math.round(Number(p.price) * EUR_TO_FCFA) : 0;
    const img = proxyImg(p.image_url, origin);
    const desc = String(p.description || "").replace(/\s+/g, " ").trim().slice(0, 500);
    // [PHOTO GÉNÉRIQUE / AVERTISSEMENT IMMOBILIER] cf. functions/produit/[id].js —
    // même détection, mêmes avertissements (CGU articles 19-20).
    const isGenericPhoto = /\/generic-immobilier-location\//.test(p.image_url || "");
    const safetyNotice = p.category === "Immobilier"
      ? "NEXUS Market ne vérifie pas ce bien (titre, disponibilité, exactitude des informations) et n'est pas partie à la transaction. Vérifiez toujours directement avec l'agence ou le propriétaire avant tout versement."
      : null;

    const snippet = `<div style="max-width:760px;margin:2rem auto;padding:0 20px;font-family:Arial,Helvetica,sans-serif;color:#1F2937">
      <h1 style="font-size:1.4rem;margin:.4rem 0">${esc(p.name)}</h1>
      ${p.category ? `<div style="color:#6B7280;font-size:.85rem;margin-bottom:.5rem">${esc(p.category)}</div>` : ""}
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" style="max-width:100%;height:auto;border-radius:12px">` : ""}
      ${isGenericPhoto ? `<div style="display:flex;gap:.5rem;align-items:flex-start;background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;border-radius:8px;padding:.6rem .75rem;font-size:.8rem;line-height:1.4;margin-top:.4rem">ℹ️ Photo d’illustration générique — ce bien n’a pas encore de photo réelle. Contactez le vendeur pour des photos et informations à jour.</div>` : ""}
      ${safetyNotice ? `<div style="display:flex;gap:.5rem;align-items:flex-start;background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;border-radius:8px;padding:.6rem .75rem;font-size:.8rem;line-height:1.4;margin-top:.4rem">⚠️ ${esc(safetyNotice)}</div>` : ""}
      ${priceFcfa ? `<div style="color:#00853E;font-size:1.6rem;font-weight:800;margin:.6rem 0">${priceFcfa.toLocaleString("fr-FR")} FCFA</div>` : ""}
      ${desc ? `<p style="line-height:1.6">${esc(desc)}</p>` : ""}
    </div>`;

    return new Response(html.replace('<div id="root"></div>', `<div id="root">${snippet}</div>`), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (_) { return null; }
}
