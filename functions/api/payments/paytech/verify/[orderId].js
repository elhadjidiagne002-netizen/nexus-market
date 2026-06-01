// ============================================================
// functions/api/payments/paytech/verify/[orderId].js
// GET /api/payments/paytech/verify/:orderId
// Vérifie si une commande a été payée (après IPN reçu)
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return jsonR({ error: 'GET uniquement' }, 405);

  const orderId = params?.orderId || new URL(request.url).pathname.split('/').pop();
  if (!orderId) return jsonR({ error: 'orderId manquant' }, 400);

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=status,payment_status,total`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });

  const orders = await r.json().catch(() => []);
  const order = orders?.[0];
  if (!order) return jsonR({ error: 'Commande introuvable' }, 404);

  return jsonR({
    paid:   order.payment_status === 'paid',
    failed: order.payment_status === 'failed',
    status: order.status,
    amount: order.total,
  });
}
