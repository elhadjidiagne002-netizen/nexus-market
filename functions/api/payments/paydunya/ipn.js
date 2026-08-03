// ============================================================
// functions/api/payments/paydunya/ipn.js
// Cloudflare Pages Function — webhook (IPN) PayDunya.
//
// PayDunya appelle cette URL après un paiement. On vérifie le hash SHA-512 de la
// MASTER KEY (WebCrypto natif) avant d'appliquer le fulfillment partagé.
//
// URL à configurer dans le dashboard PayDunya (IPN/callback) :
//   https://nexusmarket.sn/api/payments/paydunya/ipn
//
// ⚠️ DORMANT tant que PAYDUNYA_MASTER_KEY n'est pas définie (renvoie 401 sur toute
// requête → aucun paiement ne peut être marqué payé par erreur).
// ⚠️ PROTOTYPE : à valider en SANDBOX. Le format exact du corps du webhook PayDunya
// (form-encoded imbriqué `data[...]` vs JSON) est géré de façon défensive ci-dessous.
// ============================================================

import { fulfillPayment } from '../../_lib/payment-fulfill.js';
import { sha512hex, timingSafeEqual, parseNested } from '../../_lib/webhook-utils.js';

const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return jsonR({ error: 'POST uniquement' }, 405);

  if (!env.PAYDUNYA_MASTER_KEY) {
    console.error('[PayDunya IPN] PAYDUNYA_MASTER_KEY non configurée');
    return jsonR({ error: 'Non configuré' }, 401);
  }

  // 1. Parser le corps (JSON ou form-encoded imbriqué).
  let parsed;
  const ct = request.headers.get('Content-Type') || '';
  try {
    if (ct.includes('application/json')) {
      parsed = await request.json();
    } else {
      parsed = parseNested(new URLSearchParams(await request.text()));
    }
  } catch {
    return jsonR({ error: 'Corps invalide' }, 400);
  }
  // PayDunya enveloppe généralement dans `data`.
  const b = (parsed && parsed.data) ? parsed.data : parsed;
  if (!b || typeof b !== 'object') return jsonR({ error: 'Corps vide' }, 400);

  // 2. Vérifier le hash SHA-512 de la master key.
  const expected = await sha512hex(env.PAYDUNYA_MASTER_KEY);
  if (!b.hash || !timingSafeEqual(String(b.hash), expected)) {
    console.error('[PayDunya IPN] Hash invalide');
    return jsonR({ error: 'Hash invalide' }, 401);
  }

  // 3. Statut : payé uniquement si completed + response_code "00".
  const isPaid = b.status === 'completed' && String(b.response_code) === '00';
  const isFailure = b.status === 'cancelled' || b.status === 'failed';
  if (!isPaid && !isFailure) {
    // Statut intermédiaire (pending…) → accusé de réception sans action.
    return jsonR({ ok: true, ignored: b.status || 'unknown' });
  }

  // 4. Identifiants depuis custom_data (posés par init.js).
  const cd = b.custom_data || {};
  const ids = {
    order_id:  cd.order_id,
    boostId:   cd.boost_id || cd.boostId,
    subId:     cd.sub_id   || cd.subId,
    storyId:   cd.story_id || cd.storyId,
    flashId:   cd.flash_id,
    quoteId:   cd.quote_id,
    apiId:     cd.api_id   || cd.apiId,
    bookingId: cd.booking_id,
  };
  const ref = cd.transaction_id || (b.invoice && b.invoice.token) || null;

  try {
    const result = await fulfillPayment(env, {
      isPaid,
      ref,
      paymentMethod: 'mobile',
      ids,
      sessionFilter: ref ? `session_id=eq.${encodeURIComponent(ref)}` : null,
    });
    return jsonR(result, result.ok ? 200 : 400);
  } catch (err) {
    console.error('[PayDunya IPN] Exception:', err.message);
    return jsonR({ error: err.message }, 500);
  }
}
