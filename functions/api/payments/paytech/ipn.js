// ============================================================
// functions/api/payments/paytech/ipn.js
// Cloudflare Pages Function — IPN webhook PayTech
//
// PayTech appelle cette URL après chaque paiement confirmé.
// On vérifie le hash HMAC avant de marquer la commande paid.
// ============================================================

import { sendEventEmail } from '../../_lib/notify.js';

const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sbUpdate(env, table, filter, data) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

async function sbGet(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  return r.ok ? r.json() : [];
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return jsonR({ error: 'POST uniquement' }, 405);

  let payload;
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    payload = await request.json().catch(() => ({}));
  } else {
    // form-encoded
    const text = await request.text();
    payload = Object.fromEntries(new URLSearchParams(text));
  }

  const { ref_command, token, api_key_sha256, api_secret_sha256, type_event, custom_field } = payload;

  // 1. Vérifier le hash HMAC PayTech
  // Accepte les deux conventions de nommage du secret présentes dans le projet :
  // PAYTECH_API_SECRET (flux init/ipn) ou PAYTECH_SECRET_KEY (flux mobile-money).
  const expectedKeyHash    = await sha256hex(env.PAYTECH_API_KEY || '');
  const expectedSecretHash = await sha256hex(env.PAYTECH_API_SECRET || env.PAYTECH_SECRET_KEY || '');

  if (api_key_sha256 !== expectedKeyHash || api_secret_sha256 !== expectedSecretHash) {
    console.error('[PayTech IPN] Hash invalide');
    return jsonR({ error: 'Hash invalide' }, 401);
  }

  // 2. Extraire l'identifiant depuis custom_field (commande / boost / abo Pro)
  let order_id = null, boostId = null, subId = null, storyId = null;
  try {
    const cf = typeof custom_field === 'string' ? JSON.parse(custom_field) : custom_field;
    order_id = cf?.order_id;
    boostId  = cf?.boostId || cf?.boost_id;
    subId    = cf?.subId   || cf?.sub_id;
    storyId  = cf?.storyId || cf?.story_id;
  } catch { /* ignore */ }

  const isPaid = type_event === 'sale_complete';

  // 2ter. Abonnement BOUTIQUE PRO : activé côté serveur (durée canonique).
  if (subId && !order_id) {
    if (isPaid) {
      const PRO_DAYS = { pro_mensuel: 30, pro_annuel: 365 };
      const subs = await sbGet(env, `vendor_subscriptions?id=eq.${encodeURIComponent(subId)}&select=vendor_id,plan,started_at`);
      const s = subs?.[0];
      const days = (s && PRO_DAYS[s.plan]) || 30;
      const start = s?.started_at ? new Date(s.started_at) : new Date();
      const endsAt = new Date(start.getTime() + days * 86400000).toISOString();
      await sbUpdate(env, 'vendor_subscriptions', `id=eq.${encodeURIComponent(subId)}`, {
        payment_status: 'paid', active: true, payment_method: 'mobile', payment_ref: ref_command || null, ends_at: endsAt,
      });
      if (s?.vendor_id) {
        await sbUpdate(env, 'profiles', `id=eq.${encodeURIComponent(s.vendor_id)}`, {
          is_pro: true, pro_until: endsAt, pro_plan: s.plan,
        });
      }
    } else {
      await sbUpdate(env, 'vendor_subscriptions', `id=eq.${encodeURIComponent(subId)}`, { payment_status: 'failed', active: false });
    }
    return jsonR({ ok: true, kind: 'pro', activated: isPaid });
  }

  // 2bis. Paiement de BOOST vendeur (libre-service) : on l'ACTIVE côté serveur
  // (signal de confiance) au lieu de se fier au retour navigateur (qui pouvait
  // être déclenché sans payer). On ne touche pas à la table orders.
  if (boostId && !order_id) {
    if (isPaid) {
      // Durée CANONIQUE par type (le ends_at inséré côté client n'est pas fiable).
      const BOOST_DAYS = { top_3j: 3, boost_semaine: 7, boost_mensuel: 30, pro_mensuel: 30, category_top: 7 };
      const boosts = await sbGet(env, `product_boosts?id=eq.${encodeURIComponent(boostId)}&select=product_id,boost_type,started_at`);
      const b = boosts?.[0];
      const days = (b && BOOST_DAYS[b.boost_type]) || 7;
      const start = b?.started_at ? new Date(b.started_at) : new Date();
      const endsAt = new Date(start.getTime() + days * 86400000).toISOString();

      await sbUpdate(env, 'product_boosts', `id=eq.${encodeURIComponent(boostId)}`, {
        payment_status: 'paid', active: true, payment_method: 'mobile',
        payment_ref: ref_command || null, ends_at: endsAt,
      });
      if (b?.product_id) {
        await sbUpdate(env, 'products', `id=eq.${encodeURIComponent(b.product_id)}`, {
          is_boosted: true, boost_ends_at: endsAt,
        });
      }
    } else {
      await sbUpdate(env, 'product_boosts', `id=eq.${encodeURIComponent(boostId)}`, {
        payment_status: 'failed', active: false,
      });
    }
    return jsonR({ ok: true, kind: 'boost', activated: isPaid });
  }

  // 2quater. Paiement de PUBLICATION d'une STORY → activation côté serveur
  // (pending_payment -> active). En cas d'échec, on laisse 'pending_payment'
  // pour permettre une nouvelle tentative.
  if (storyId && !order_id) {
    if (isPaid) {
      await sbUpdate(env, 'stories', `id=eq.${encodeURIComponent(storyId)}`, { status: 'active' });
    }
    return jsonR({ ok: true, kind: 'story', activated: isPaid });
  }

  if (!order_id) {
    console.error('[PayTech IPN] order_id absent');
    return jsonR({ error: 'order_id manquant' }, 400);
  }

  // 3. Mettre à jour la commande
  // [FIX] status ∈ {pending_payment,processing,in_transit,delivered,cancelled} :
  // 'payment_failed' n'est pas une valeur valide → 'cancelled' en cas d'échec.
  await sbUpdate(env, 'orders', `id=eq.${encodeURIComponent(order_id)}`, {
    status:         isPaid ? 'processing' : 'cancelled',
    payment_status: isPaid ? 'paid' : 'failed',
    payment_method: 'mobile',
    updated_at:     new Date().toISOString(),
  });

  // 4. Mettre à jour la session PayTech
  await sbUpdate(env, 'stripe_sessions', `session_id=eq.${encodeURIComponent(ref_command || '')}`, {
    status:     isPaid ? 'paid' : 'failed',
    updated_at: new Date().toISOString(),
  });

  // 5. Créer une notification in-app
  if (isPaid) {
    const orders = await sbGet(env, `orders?id=eq.${encodeURIComponent(order_id)}&select=buyer_id,total,buyer_email,buyer_name`);
    const order = orders?.[0];
    if (order?.buyer_id) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id:         crypto.randomUUID(),
          user_id:    order.buyer_id,
          type:       'order',
          title:      '✅ Paiement confirmé',
          message:    `Votre paiement de ${Number(order.total).toLocaleString('fr-FR')} FCFA a été reçu.`,
          link:       `/?order=${order_id}`,
          read:       false,
          created_at: new Date().toISOString(),
        }),
      });
    }
    // Email acheteur : paiement reçu (centre de notifications)
    if (order?.buyer_email) {
      await sendEventEmail(env, 'payment_received', order.buyer_email, {
        buyer_name: order.buyer_name || 'Client',
        order_id:   order_id,
        total:      Number(order.total || 0).toLocaleString('fr-FR'),
        _userId:    order.buyer_id || null,
        _orderId:   order_id,
      }).catch(e => console.warn('[PayTech IPN] email:', e.message));
    }
  }

  return jsonR({ ok: true });
}
