/**
 * functions/_middleware.js
 * ──────────────────────────────────────────────────────────────────────────
 * Middleware Cloudflare Pages partagé par toutes les Functions.
 * Injecte les helpers CORS dans `context.data` pour éviter la duplication.
 *
 * Cloudflare Pages exécute automatiquement ce fichier avant chaque Function
 * du répertoire /functions/.
 */

export async function onRequest(context) {
  // ── Répondre immédiatement aux pre-flight OPTIONS ───────────────────────
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(context.request),
    });
  }

  // ── Injecter les helpers dans context.data ──────────────────────────────
  context.data.cors    = () => corsHeaders(context.request);
  context.data.json    = (status, body) => jsonResponse(status, body, context.request);
  context.data.noCache = { "Cache-Control": "no-store, no-cache" };

  return context.next();
}

// ── Helpers exportés (utilisables directement dans les Functions) ───────────

export function corsHeaders(request) {
  const origin = request?.headers?.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin":      origin,
    "Access-Control-Allow-Methods":     "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary":                             "Origin",
  };
}

export function jsonResponse(status, body, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
}
