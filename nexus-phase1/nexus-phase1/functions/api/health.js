/**
 * GET /api/health
 * Health check pour la détection backend côté frontend (ligne 1832 de index.html).
 * Doit obligatoirement renvoyer du JSON pour que le frontend bascule en mode "backend disponible".
 */
export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'nexus-market-api',
      time: new Date().toISOString(),
      checks: {
        runtime: 'cloudflare-pages-functions',
        supabase: !!(context.env.SUPABASE_URL && context.env.SUPABASE_SERVICE_KEY),
        paytech: !!(context.env.PAYTECH_API_KEY && context.env.PAYTECH_API_SECRET),
        sms: context.env.SMS_PROVIDER || 'simulate',
        imgbb: !!context.env.IMGBB_API_KEY
      }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    }
  );
}
