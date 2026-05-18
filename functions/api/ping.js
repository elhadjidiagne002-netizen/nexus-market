/**
 * GET /api/ping
 * Endpoint de test pour vérifier que Cloudflare Pages Functions est bien actif.
 * Si tu visites https://ton-site.pages.dev/api/ping et que tu obtiens du JSON,
 * c'est gagné. Si tu obtiens du HTML, c'est que Functions n'est pas activé.
 */
export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'NEXUS Market API',
      time: new Date().toISOString(),
      env: context.env.PAYTECH_ENV || 'unknown',
      version: '1.0.0'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    }
  );
}
