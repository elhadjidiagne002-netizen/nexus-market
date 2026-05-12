import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const { user, error: authError } = await requireAuth(request, env);
    if (authError) return err(authError.message, authError.status);

    const url = new URL(request.url);
    const orderId = url.pathname.split('/')[3];
    if (!orderId) return err('orderId manquant', 400);

    const { reason } = await request.json();
    if (!reason) return err('Raison d\'annulation manquante', 400);

    const sb = supabase(env);

    // 1. Récupérer la commande
    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('*, user_id, vendor_id, status')
      .eq('id', orderId)
      .single();

    if (orderError) return err('Commande introuvable', 404);

    // 2. Vérifier les permissions (seul le client ou l'admin peut annuler)
    if (order.user_id !== user.id && user.role !== 'admin') {
      return err('Non autorisé à annuler cette commande', 403);
    }

    // 3. Vérifier que la commande peut être annulée (statut = pending ou confirmed)
    if (!['pending', 'confirmed'].includes(order.status)) {
      return err('Cette commande ne peut plus être annulée', 400);
    }

    // 4. Mettre à jour le statut
    const { error: updateError } = await sb
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    // 5. Ajouter l'historique
    await sb.from('order_status_history').insert({
      order_id: orderId,
      status: 'cancelled',
      changed_by: user.id,
      notes: `Annulée par le client. Raison: ${reason}`
    });

    // 6. Rembourser le client si le paiement était effectué (à implémenter avec PayTech)
    if (order.payment_status === 'paid') {
      // TODO: Appeler l'API PayTech pour le remboursement
      // Exemple:
      // await fetch('https://api.paytech.sn/refund', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.PAYTECH_API_KEY}` },
      //   body: JSON.stringify({ order_id: orderId, amount: order.grand_total })
      // });
      console.log(`[TODO] Rembourser ${order.grand_total} FCFA pour la commande #${order.order_number}`);
    }

    // 7. Notifier le vendeur
    const vendor = await sb.from('users').select('fcm_token, email').eq('id', order.vendor_id).single();
    if (vendor.data) {
      if (vendor.data.fcm_token) {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${env.FCM_SERVER_KEY}`
          },
          body: JSON.stringify({
            to: vendor.data.fcm_token,
            notification: {
              title: 'Commande annulée',
              body: `Commande #${order.order_number} annulée par le client`
            },
            data: {
              order_id: orderId,
              type: 'order_cancelled'
            }
          })
        });
      }

      if (vendor.data.email) {
        await fetch(`${env.FRONTEND_URL}/api/notifications/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: vendor.data.email,
            subject: `Commande #${order.order_number} annulée`,
            html: `
              <p>La commande #<strong>${order.order_number}</strong> a été annulée par le client.</p>
              <p><strong>Raison:</strong> ${reason}</p>
              <p><a href="${env.FRONTEND_URL}/vendor/orders/${orderId}">Voir la commande</a></p>
            `
          })
        });
      }
    }

    return json({
      success: true,
      message: 'Commande annulée avec succès'
    });

  } catch (error) {
    return err(error.message, 500);
  }
}