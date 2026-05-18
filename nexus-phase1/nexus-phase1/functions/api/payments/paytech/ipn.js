/**
 * POST /api/payments/paytech/ipn
 * Webhook serveur-à-serveur appelé par PayTech après chaque transaction.
 * Met à jour la table Supabase `orders` avec le statut du paiement.
 *
 * Variables d'env :
 *   PAYTECH_API_KEY, PAYTECH_API_SECRET (pour vérifier la signature IPN)
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    // PayTech envoie parfois en form-urlencoded
    try {
      const fd = await request.formData();
      body = Object.fromEntries(fd.entries());
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  }

  const {
    type_event,
    ref_command,
    item_price,
    payment_method,
    client_phone,
    api_key_sha256,
    api_secret_sha256,
    custom_field
  } = body;

  // ── Vérification de signature (PayTech envoie les hashes SHA256 des clés) ─
  if (env.PAYTECH_API_KEY && env.PAYTECH_API_SECRET) {
    const expectedKeyHash = await sha256(env.PAYTECH_API_KEY);
    const expectedSecretHash = await sha256(env.PAYTECH_API_SECRET);
    if (api_key_sha256 !== expectedKeyHash || api_secret_sha256 !== expectedSecretHash) {
      return new Response('Signature invalide', { status: 403 });
    }
  }

  if (type_event !== 'sale_complete') {
    // Autres events (sale_canceled, refund) → log seulement
    return new Response('OK', { status: 200 });
  }

  // ── Récupérer l'order_id depuis custom_field ─────────────────────────────
  let orderId = ref_command;
  try {
    if (custom_field) {
      const cf = typeof custom_field === 'string' ? JSON.parse(custom_field) : custom_field;
      orderId = cf.order_id || orderId;
    }
  } catch { /* utilise ref_command */ }

  // ── Update Supabase ──────────────────────────────────────────────────────
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return new Response('Supabase non configuré', { status: 503 });
  }

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          payment_status: 'paid',
          payment_method: payment_method || 'paytech',
          payment_ref: ref_command,
          paid_at: new Date().toISOString()
        })
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error('[PayTech IPN] Supabase update failed:', txt);
      return new Response('Supabase error', { status: 502 });
    }
    return new Response('OK', { status: 200 });
  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
