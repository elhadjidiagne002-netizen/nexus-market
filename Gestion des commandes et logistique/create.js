import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    // 1. Vérifier l'authentification (client)
    const { user, error: authError } = await requireAuth(request, env);
    if (authError) return err(authError.message, authError.status);

    // 2. Récupérer les données de la commande
    const { items, shipping_address, payment_method, notes } = await request.json();
    if (!items || !items.length) return err('Aucun article dans la commande', 400);
    if (!shipping_address) return err('Adresse de livraison manquante', 400);

    const sb = supabase(env);

    // 3. Vérifier que les produits existent et sont en stock
    const productIds = items.map(item => item.product_id);
    const { data: products, error: productsError } = await sb
      .from('products')
      .select('id, price, stock, vendor_id, name, images')
      .in('id', productIds);

    if (productsError) throw productsError;
    if (products.length !== items.length) return err('Un ou plusieurs produits introuvables', 404);

    // 4. Vérifier le stock et calculer le total
    let totalAmount = 0;
    const orderItems = [];
    const vendorId = products[0].vendor_id; // On suppose une seule boutique par commande

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) return err(`Produit ${item.product_id} introuvable`, 404);
      if (product.stock < item.quantity) return err(`Stock insuffisant pour ${product.name}`, 400);

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        product_image: product.images?.[0] || null,
        quantity: item.quantity,
        unit_price: product.price,
        total_price: itemTotal,
        variant: item.variant || null
      });
    }

    // 5. Calculer les frais de livraison (à adapter selon votre logique)
    const deliveryFee = 1000; // Exemple: 1000 FCFA
    const grandTotal = totalAmount + deliveryFee;

    // 6. Générer un numéro de commande unique
    const orderNumber = `NX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`;

    // 7. Créer la commande dans la base de données
    const { data: order, error: orderError } = await sb
      .from('orders')
      .insert({
        user_id: user.id,
        vendor_id: vendorId,
        order_number: orderNumber,
        total_amount: totalAmount,
        delivery_fee: deliveryFee,
        grand_total: grandTotal,
        shipping_address: shipping_address,
        payment_method: payment_method,
        notes: notes
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 8. Ajouter les articles de la commande
    const orderItemsWithOrderId = orderItems.map(item => ({ ...item, order_id: order.id }));
    const { error: itemsError } = await sb
      .from('order_items')
      .insert(orderItemsWithOrderId);

    if (itemsError) throw itemsError;

    // 9. Ajouter l'historique du statut initial
    await sb.from('order_status_history').insert({
      order_id: order.id,
      status: 'pending',
      changed_by: user.id,
      notes: 'Commande créée'
    });

    // 10. Mettre à jour le stock des produits (optionnel: à faire après paiement)
    // for (const item of items) {
    //   const product = products.find(p => p.id === item.product_id);
    //   await sb
    //     .from('products')
    //     .update({ stock: product.stock - item.quantity })
    //     .eq('id', product.id);
    // }

    // 11. Envoyer une notification au vendeur
    const vendor = await sb.from('users').select('id, email, fcm_token').eq('id', vendorId).single();
    if (vendor.data) {
      // Notification push (FCM)
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
              title: 'Nouvelle commande',
              body: `Commande #${orderNumber} de ${user.email}`
            },
            data: {
              order_id: order.id,
              type: 'new_order'
            }
          })
        });
      }

      // Notification email (Nodemailer)
      if (vendor.data.email) {
        await fetch(`${env.FRONTEND_URL}/api/notifications/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: vendor.data.email,
            subject: `Nouvelle commande #${orderNumber}`,
            html: `
              <p>Vous avez reçu une nouvelle commande #<strong>${orderNumber}</strong>.</p>
              <p><strong>Montant total:</strong> ${grandTotal} FCFA</p>
              <p><a href="${env.FRONTEND_URL}/vendor/orders/${order.id}">Voir la commande</a></p>
            `
          })
        });
      }
    }

    // 12. Retourner la commande créée
    return json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        grand_total: order.grand_total,
        status: order.status,
        created_at: order.created_at
      }
    });

  } catch (error) {
    return err(error.message, 500);
  }
}