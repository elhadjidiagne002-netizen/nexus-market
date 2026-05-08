// /.netlify/functions/push-vapid-key
// Retourne la clé publique VAPID au client pour qu'il puisse s'abonner au push.
// La clé privée reste côté serveur dans les variables d'env Netlify.

exports.handler = async () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "VAPID_PUBLIC_KEY non configurée dans les variables d'env Netlify" }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400", // clé publique : cacheable 24h
    },
    body: JSON.stringify({ publicKey }),
  };
};
