// ============================================================
// functions/api/_lib/payment-fulfill.js
// Logique de « fulfillment » de paiement PARTAGÉE entre agrégateurs mobile money.
//
// Port fidèle de la logique inline de functions/api/payments/paytech/ipn.js
// (activation par `kind` : pro / boost / story / flash / api / b2b_priority /
// transport / commande, MAJ `orders` IDEMPOTENTE, notifications in-app + email/WA).
//
// Utilisé par l'IPN PayDunya (functions/api/payments/paydunya/ipn.js). L'IPN
// PayTech garde pour l'instant sa copie inline (non modifié → zéro risque prod) ;
// il pourra être migré vers ce lib plus tard pour dédupliquer.
//
// ⚠️ Toute évolution de la logique d'activation doit être répercutée AUX DEUX
// endroits tant que PayTech n'est pas migré ici.
// ============================================================

import { sendEventNotification } from './notify.js';

// orders.total est en EUR (convention tranchée) → affichage FCFA = round(total × 655.957).
const EUR_TO_FCFA = 655.957;

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

/**
 * Applique l'effet métier d'un paiement (succès ou échec), quel que soit
 * l'agrégateur qui l'a confirmé.
 *
 * @param {object} env  Bindings Cloudflare (SUPABASE_URL, SUPABASE_SERVICE_KEY…)
 * @param {object} o
 * @param {boolean} o.isPaid       true = paiement confirmé, false = échec/annulation
 * @param {string}  o.ref          référence de transaction (pour payment_ref / session)
 * @param {string}  [o.paymentMethod='mobile']  valeur orders.payment_method ∈ {card,mobile,cod}
 * @param {object}  o.ids          identifiants extraits du custom_data du provider :
 *        { order_id, boostId, subId, storyId, flashId, quoteId, apiId, bookingId }
 * @param {string}  [o.sessionFilter]  filtre PostgREST pour MAJ stripe_sessions
 *        (ex. `session_id=eq.<ref>` ou `payment_intent=eq.<token>`). Optionnel.
 * @returns {Promise<{ok:boolean, kind:string, activated?:boolean, already?:boolean, error?:string}>}
 */
export async function fulfillPayment(env, o) {
  const { isPaid, ref } = o;
  const paymentMethod = o.paymentMethod || 'mobile';
  const { order_id, boostId, subId, storyId, flashId, quoteId, apiId, bookingId } = o.ids || {};

  // ── Abonnement BOUTIQUE PRO ────────────────────────────────────────────────
  if (subId && !order_id) {
    if (isPaid) {
      const PRO_DAYS = { pro_mensuel: 30, pro_annuel: 365 };
      const subs = await sbGet(env, `vendor_subscriptions?id=eq.${encodeURIComponent(subId)}&select=vendor_id,plan,started_at`);
      const s = subs?.[0];
      const days = (s && PRO_DAYS[s.plan]) || 30;
      const start = s?.started_at ? new Date(s.started_at) : new Date();
      const endsAt = new Date(start.getTime() + days * 86400000).toISOString();
      await sbUpdate(env, 'vendor_subscriptions', `id=eq.${encodeURIComponent(subId)}`, {
        payment_status: 'paid', active: true, payment_method: paymentMethod, payment_ref: ref || null, ends_at: endsAt,
      });
      if (s?.vendor_id) {
        await sbUpdate(env, 'profiles', `id=eq.${encodeURIComponent(s.vendor_id)}`, {
          is_pro: true, pro_until: endsAt, pro_plan: s.plan,
        });
      }
    } else {
      await sbUpdate(env, 'vendor_subscriptions', `id=eq.${encodeURIComponent(subId)}`, { payment_status: 'failed', active: false });
    }
    return { ok: true, kind: 'pro', activated: isPaid };
  }

  // ── BOOST vendeur (libre-service) ───────────────────────────────────────────
  if (boostId && !order_id) {
    if (isPaid) {
      const BOOST_DAYS = { top_3j: 3, boost_semaine: 7, boost_mensuel: 30, pro_mensuel: 30, category_top: 7 };
      const boosts = await sbGet(env, `product_boosts?id=eq.${encodeURIComponent(boostId)}&select=product_id,boost_type,started_at`);
      const b = boosts?.[0];
      const days = (b && BOOST_DAYS[b.boost_type]) || 7;
      const start = b?.started_at ? new Date(b.started_at) : new Date();
      const endsAt = new Date(start.getTime() + days * 86400000).toISOString();
      await sbUpdate(env, 'product_boosts', `id=eq.${encodeURIComponent(boostId)}`, {
        payment_status: 'paid', active: true, payment_method: paymentMethod,
        payment_ref: ref || null, ends_at: endsAt,
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
    return { ok: true, kind: 'boost', activated: isPaid };
  }

  // ── PUBLICATION d'une STORY (pending_payment → active) ──────────────────────
  if (storyId && !order_id) {
    if (isPaid) {
      await sbUpdate(env, 'stories', `id=eq.${encodeURIComponent(storyId)}`, { status: 'active' });
    }
    return { ok: true, kind: 'story', activated: isPaid };
  }

  // ── VENTE FLASH sponsorisée ─────────────────────────────────────────────────
  if (flashId && !order_id) {
    await sbUpdate(env, 'flash_sales', `id=eq.${encodeURIComponent(flashId)}`, {
      payment_status: isPaid ? 'paid' : 'failed', active: !!isPaid, payment_ref: ref || null,
    });
    return { ok: true, kind: 'flash', activated: isPaid };
  }

  // ── ABONNEMENT API PRO ──────────────────────────────────────────────────────
  if (apiId && !order_id) {
    await sbUpdate(env, 'api_subscriptions', `id=eq.${encodeURIComponent(apiId)}`, {
      status: isPaid ? 'active' : 'pending', payment_status: isPaid ? 'paid' : 'failed',
      payment_method: paymentMethod, payment_ref: ref || null,
    });
    return { ok: true, kind: 'api', activated: isPaid };
  }

  // ── PRIORITÉ B2B ────────────────────────────────────────────────────────────
  if (quoteId && !order_id) {
    await sbUpdate(env, 'b2b_quotes', `id=eq.${encodeURIComponent(quoteId)}`, {
      priority_payment_status: isPaid ? 'paid' : 'failed',
      priority_payment_ref: ref || null,
      priority_paid_at: isPaid ? new Date().toISOString() : null,
    });
    return { ok: true, kind: 'b2b_priority', activated: isPaid };
  }

  // ── RÉSERVATION TRANSPORT (place covoiturage / colis sur trajet) ────────────
  if (bookingId && !order_id) {
    const resas = await sbGet(env, `transport_reservations?id=eq.${encodeURIComponent(bookingId)}&select=trip_id,booking_type,seats_booked,payment_status`);
    const resa = resas?.[0];
    if (isPaid) {
      await sbUpdate(env, 'transport_reservations', `id=eq.${encodeURIComponent(bookingId)}&payment_status=neq.paid`, {
        payment_status: 'paid', status: 'confirmed', payment_method: paymentMethod, payment_ref: ref || null,
      });
    } else {
      if (resa?.booking_type === 'seat' && resa.trip_id) {
        const trips = await sbGet(env, `transport_trips?id=eq.${encodeURIComponent(resa.trip_id)}&select=seats_available,seats_total`);
        const trip = trips?.[0];
        if (trip) {
          const restored = Math.min(trip.seats_total, (trip.seats_available || 0) + (resa.seats_booked || 0));
          await sbUpdate(env, 'transport_trips', `id=eq.${encodeURIComponent(resa.trip_id)}`, { seats_available: restored });
        }
        await sbUpdate(env, 'transport_reservations', `id=eq.${encodeURIComponent(bookingId)}`, {
          payment_status: 'failed', status: 'cancelled',
        });
      } else {
        await sbUpdate(env, 'transport_reservations', `id=eq.${encodeURIComponent(bookingId)}`, { payment_status: 'failed' });
      }
    }
    return { ok: true, kind: 'transport', activated: isPaid };
  }

  if (!order_id) {
    console.error('[fulfillPayment] order_id absent');
    return { ok: false, kind: 'unknown', error: 'order_id manquant' };
  }

  // ── COMMANDE ────────────────────────────────────────────────────────────────
  // [IDEMPOTENCE] passage à 'paid' UNE SEULE FOIS (les IPN peuvent être retentés).
  // Condition `payment_status=neq.paid` + return=representation pour détecter la
  // transition ; 0 ligne → déjà payé → on sort sans rejouer notif/email.
  if (isPaid) {
    const updRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}&payment_status=neq.paid`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          status: 'processing', payment_status: 'paid', payment_method: paymentMethod,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    const updated = await updRes.json().catch(() => []);
    if (!Array.isArray(updated) || updated.length === 0) {
      console.log('[fulfillPayment] Commande déjà payée — IPN ignoré (idempotent).');
      return { ok: true, kind: 'order', already: true };
    }
  } else {
    await sbUpdate(env, 'orders', `id=eq.${encodeURIComponent(order_id)}`, {
      status: 'cancelled', payment_status: 'failed', payment_method: paymentMethod,
      updated_at: new Date().toISOString(),
    });
  }

  // MAJ session (réconciliation) si un filtre a été fourni.
  if (o.sessionFilter) {
    await sbUpdate(env, 'stripe_sessions', o.sessionFilter, {
      status: isPaid ? 'paid' : 'failed', updated_at: new Date().toISOString(),
    }).catch(() => {});
  }

  // Notification in-app + email/WhatsApp acheteur (paiement reçu).
  if (isPaid) {
    const orders = await sbGet(env, `orders?id=eq.${encodeURIComponent(order_id)}&select=buyer_id,total,buyer_email,buyer_name,buyer_phone`);
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
          message:    `Votre paiement de ${Math.round((Number(order.total) || 0) * EUR_TO_FCFA).toLocaleString('fr-FR')} FCFA a été reçu.`,
          link:       `/?order=${order_id}`,
          read:       false,
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
    if (order?.buyer_email || order?.buyer_phone) {
      await sendEventNotification(env, 'payment_received', { email: order.buyer_email, phone: order.buyer_phone }, {
        buyer_name: order.buyer_name || 'Client',
        order_id,
        total: Math.round((Number(order.total) || 0) * EUR_TO_FCFA).toLocaleString('fr-FR'),
        _userId: order.buyer_id || null,
        _orderId: order_id,
      }).catch(e => console.warn('[fulfillPayment] notify:', e.message));
    }
  }

  return { ok: true, kind: 'order', activated: isPaid };
}
