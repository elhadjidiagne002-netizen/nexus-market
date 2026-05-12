import { CORS, options, json, err, supabase, requireAuth, requireAdminOrVendor } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const { user, error: authError } = await requireAuth(request, env);
    if (authError) return err(authError.message, authError.status);

    const url = new URL(request.url);
    const orderId = url.pathname.split('/')[3]; // Extraire orderId de l'URL
    if (!orderId) return err('orderId manquant', 400);

    const { status, notes } = await request.json();
    if (!status) return err('Statut manquant', 400);

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return err(`Statut invalide. Valeurs autorisées: ${validStatuses.join(', ')}`, 400);
    }

    const sb = supabase(env);

    // 1. Récupérer la commande et vérifier les permissions
    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('*, vendor_id')
      .eq('id', orderId)
      .single();

    if (orderError) return err('Commande introuvable', 404);
    if (order.vendor_id !== user.id && user.role !== 'admin') {
      return err('Non autorisé à modifier cette commande', 403);
    }

    // 2. Mettre à jour le statut de la commande
    const { error: updateError } = await sb
      .from('orders')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    // 3. Ajouter l'historique du statut
    await sb.from('order_status_history').insert({
      order_id: orderId,
      status: status,
      changed_by: user.id,
      notes: notes || `Statut changé en ${status}`
    });

    // 4. Envoyer des notifications si nécessaire
    if (status === 'shipped' && order.tracking_number) {
      // Notification au client: commande expédiée
      const client = await sb.from('users').select('fcm_token, email').eq('id', order.user_id).single();
      if (client.data) {
        if (client.data.fcm_token) {
          await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `key=${env.FCM_SERVER_KEY}`
            },
            body: JSON.stringify({
              to: client.data.fcm_token,
              notification: {
                title: 'Commande expédiée',
                body: `Votre commande #${order.order_number} a été expédiée. Numéro de suivi: ${order.tracking_number}`
              },
              data: {
                order_id: orderId,
                type: 'order_shipped',
                tracking_number: order.tracking_number
              }
            })
          });
        }

        if (client.data.email) {
          await fetch(`${env.FRONTEND_URL}/api/notifications/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: client.data.email,
              subject: `Votre commande #${order.order_number} a été expédiée`,
              html: `
                <p>Votre commande #<strong>${order.order_number}</strong> a été expédiée.</p>
                <p><strong>Numéro de suivi:</strong> ${order.tracking_number}</p>
                <p><strong>Partenaire de livraison:</strong> ${order.delivery_partner || 'Non spécifié'}</p>
                <p><a href="${env.FRONTEND_URL}/orders/${orderId}/track">Suivre ma commande</a></p>
              `
            })
          });
        }
      }
    }

    // 5. Retourner la commande mise à jour
    const { data: updatedOrder } = await sb
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    return json({
      success: true,
      order: updatedOrder
    });

  } catch (error) {
    return err(error.message, 500);
  }
}