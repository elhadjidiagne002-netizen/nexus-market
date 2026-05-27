/**
 * functions/push-vapid-key.js
 * Retourne la clé publique VAPID
 */
export async function onRequestGet(context) {
  const { env } = context;
  const publicKey = env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return new Response(
      JSON.stringify({ error: "VAPID_PUBLIC_KEY non configurée" }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  return new Response(JSON.stringify({ publicKey }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
