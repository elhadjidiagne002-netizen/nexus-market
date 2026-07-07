// ============================================================
// functions/api/payments/paytech/verify/[orderId].js
// GET /api/payments/paytech/verify/:orderId
// Vérifie si une commande a été payée (après IPN reçu).
//
// [SEC] Auth OBLIGATOIRE + contrôle de propriété : seul l'acheteur, le vendeur
// concerné ou un admin peut lire le statut/montant d'une commande. Le front
// (DataService.paymentFetch) envoie toujours le Bearer token Supabase.
// Auparavant ce handler était public ET masquait la variante [[orderId]].js
// (précédence de routage Cloudflare) → fuite statut+montant par UUID. Corrigé
// (2026-07-07) : [[orderId]].js supprimé, auth+ownership ajoutés ici.
// ============================================================
import { handle, requireAuth, ok, err } from '../../../_lib/supabase.js';

export const onRequest = handle(async ({ request, env, params }) => {
  if (request.method !== 'GET') return err('GET uniquement', 405);

  const { user } = await requireAuth(env, request); // throw 401 si token absent/invalide

  const orderId = params?.orderId || new URL(request.url).pathname.split('/').pop();
  if (!orderId) return err('orderId manquant', 400);

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=buyer_id,vendor_id,status,payment_status,total`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  ).catch(() => null);

  const orders = r?.ok ? await r.json().catch(() => []) : [];
  const order = orders?.[0];
  if (!order) return err('Commande introuvable', 404);

  // Contrôle de propriété : acheteur, vendeur concerné, ou admin.
  const owns = order.buyer_id === user.id || order.vendor_id === user.id || user.role === 'admin';
  if (!owns) return err('Non autorisé', 403);

  return ok({
    paid:   order.payment_status === 'paid',
    failed: order.payment_status === 'failed',
    status: order.status,
    amount: order.total,
  });
});
