/**
 * functions/_middleware.js
 * Middleware global pour Cloudflare Pages – CORS & helpers
 */

export async function onRequest(context) {
  // Répondre immédiatement aux pré-vols OPTIONS
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(context.request),
    });
  }

  // Injecter des helpers dans context.data
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
  const origin = request?.headers?.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}
