/**
 * functions/push-vapid-key.js
 * ──────────────────────────────────────────────────────────────────────────
 * GET /push-vapid-key → Retourne la clé publique VAPID au client
 *
 * Adaptation Netlify → Cloudflare :
 *   • exports.handler() → export async function onRequestGet(context)
 *   • process.env       → env
 *   • Pas de Node.js ni de dépendances → fichier très léger
 *
 * Variables d'environnement Cloudflare :
 *   VAPID_PUBLIC_KEY — Clé VAPID publique (générée avec web-push generate-vapid-keys)
 */

export async function onRequestGet(context) {
  const publicKey = context.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return new Response(
      JSON.stringify({ error: "VAPID_PUBLIC_KEY non configurée dans les variables d'env" }),
      {
        status: 503,
        headers: {
          "Content-Type":                "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  return new Response(
    JSON.stringify({ publicKey }),
    {
      status: 200,
      headers: {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",
        // La clé publique VAPID est stable → cacheable 24h
        "Cache-Control":               "public, max-age=86400",
      },
    }
  );
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
