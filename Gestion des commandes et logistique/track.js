import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const { user, error: authError } = await requireAuth(request, env);
    if (authError) return err(authError.message, authError.status);

    const { order_id, tracking_number, delivery_partner } = await request.json();
    if (!order_id) return err('order_id manquant', 400);

    const sb = supabase(env);

    // 1. Vérifier que la commande appartient à l'utilisateur
    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('*, user_id, vendor_id')
      .eq('id', order_id)
      .single();

    if (orderError) return err('Commande introuvable', 404);
    if (order.user_id !== user.id && order.vendor_id !== user.id && user.role !== 'admin') {
      return err('Non autorisé à suivre cette commande', 403);
    }

    // 2. Mettre à jour le numéro de suivi et le partenaire de livraison
    const { error: updateError } = await sb
      .from('orders')
      .update({
        tracking_number: tracking_number,
        delivery_partner: delivery_partner,
        delivery_eta: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // +3 jours
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id);

    if (updateError) throw updateError;

    // 3. Ajouter l'historique
    await sb.from('order_status_history').insert({
      order_id: order_id,
      status: 'shipped',
      changed_by: user.id,
      notes: `Numéro de suivi: ${tracking_number} (${delivery_partner})`
    });

    // 4. Notifier le client (si le vendeur met à jour le suivi)
    if (order.vendor_id === user.id) {
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
                title: 'Votre commande est en route !',
                body: `Commande #${order.order_number} expédiée avec ${delivery_partner}`
              },
              data: {
                order_id: order_id,
                type: 'order_shipped',
                tracking_number: tracking_number,
                delivery_partner: delivery_partner
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
              subject: `Votre commande #${order.order_number} est en route !`,
              html: `
                <p>Votre commande #<strong>${order.order_number}</strong> a été expédiée avec <strong>${delivery_partner}</strong>.</p>
                <p><strong>Numéro de suivi:</strong> ${tracking_number}</p>
                <p><strong>Date estimée de livraison:</strong> ${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')}</p>
                <p><a href="${env.FRONTEND_URL}/orders/${order_id}/track">Suivre ma commande</a></p>
              `
            })
          });
        }
      }
    }

    return json({
      success: true,
      message: 'Numéro de suivi mis à jour',
      tracking_number: tracking_number,
      delivery_partner: delivery_partner
    });

  } catch (error) {
    return err(error.message, 500);
  }
}