/**
 * functions/_middleware.js
 * Middleware global pour Cloudflare Pages – CORS & helpers
 */

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(context.request),
    });
  }

  context.data.cors = () => corsHeaders(context.request);
  context.data.json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(context.request),
      },
    });

  return context.next();
}

function corsHeaders(request) {
  const origin = request?.headers?.get("Origin");

  // [FIX] Access-Control-Allow-Credentials: true est incompatible avec
  // Access-Control-Allow-Origin: * selon la spec CORS — les navigateurs
  // rejettent la combinaison. On ne renvoie Credentials que lorsqu'on
  // connaît l'origine exacte de la requête.
  if (origin) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    };
  }

  // Pas d'Origin (ex : curl, appel serveur-à-serveur) → pas de credentials
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
