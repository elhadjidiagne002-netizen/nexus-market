/**
 * functions/_middleware.js
 * Middleware global pour Cloudflare Pages – CORS & helpers
 */

export async function onRequest(context) {
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
