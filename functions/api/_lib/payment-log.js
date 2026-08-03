// ============================================================
// functions/api/_lib/payment-log.js
// Journalisation BEST-EFFORT dans la table d'audit `payment_events`
// (migration sql/2026_08_02_payment_events.sql — #1 roadmap pro).
//
// ⚠️ Ne DOIT JAMAIS casser un flux paiement : toute erreur (table absente,
// réseau…) est avalée. Tant que la migration n'est pas appliquée, l'insert
// échoue silencieusement → comportement inchangé. Une fois la table créée,
// la piste d'audit se remplit automatiquement.
// ============================================================

/**
 * @param {object} env  bindings (SUPABASE_URL, SUPABASE_SERVICE_KEY)
 * @param {object} ev
 *   @param {string}  ev.provider    'stripe' | 'paytech' | 'paydunya' | 'reconcile'
 *   @param {string}  ev.event_type  'init' | 'ipn_paid' | 'ipn_failed' | 'reconciled_paid' | 'reconciled_failed' | 'discrepancy'
 *   @param {string=} ev.order_id    UUID (null pour boost/story/…)
 *   @param {string=} ev.ref         ref_command / token / transaction_id
 *   @param {number=} ev.amount
 *   @param {string=} ev.currency    défaut 'XOF'
 *   @param {string=} ev.status
 *   @param {object=} ev.payload     corps brut / contexte (audit)
 *   @param {string=} ev.note
 */
export async function logPaymentEvent(env, ev) {
  try {
    if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !ev) return;
    await fetch(`${env.SUPABASE_URL}/rest/v1/payment_events`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        provider:   ev.provider,
        event_type: ev.event_type,
        order_id:   ev.order_id || null,
        ref:        ev.ref || null,
        amount:     ev.amount != null ? ev.amount : null,
        currency:   ev.currency || 'XOF',
        status:     ev.status || null,
        payload:    ev.payload || null,
        note:       ev.note || null,
      }),
    });
  } catch (_) {
    // best-effort : un journal d'audit ne doit jamais interrompre un paiement.
  }
}
