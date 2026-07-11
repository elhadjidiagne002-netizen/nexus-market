// functions/cron/notify-retry.js → GET /cron/notify-retry?token=...
// Rejoue les notifications email/WhatsApp en échec (table notification_outbox).
// À déclencher toutes les ~5 min depuis cron-job.org (comme les autres /cron/*) :
//   GET https://nexusmarket.sn/cron/notify-retry?token=VOTRE_NEXUS_WA_SECRET
//
// Ne rejoue QUE le canal encore 'pending' (statut par canal) → jamais de doublon
// sur un canal déjà envoyé. Backoff croissant, dead-letter après max_attempts.
import { supabase } from '../api/_lib/utils.js';
import { sendEventEmail, sendEventWhatsApp } from '../api/_lib/notify.js';

// Minutes d'attente avant le PROCHAIN essai, selon le nº d'essai qu'on vient de faire.
// (l'enfilement initial a déjà posé +5 min ; essai 1 raté → +15 min, etc.)
const BACKOFF_MIN = { 1: 15, 2: 60, 3: 180, 4: 360 };

const json = (o, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) {
    return json({ error: 'Non autorisé — ?token=requis' }, 401);
  }

  const sb = supabase(env);
  let rows = [];
  try {
    rows = await sb.rpc('claim_notification_outbox', { p_limit: 25 });
    if (!Array.isArray(rows)) rows = [];
  } catch (e) {
    return json({ error: 'claim: ' + e.message }, 500);
  }

  let processed = 0, done = 0, failed = 0, pending = 0;

  for (const row of rows) {
    const r = row.recipient || {};
    const vars = row.vars || {};
    let emailStatus = row.email_status;
    let waStatus = row.whatsapp_status;
    const errors = [];

    if (emailStatus === 'pending' && r.email) {
      const res = await sendEventEmail(env, row.event_key, r.email, vars).catch(e => ({ ok: false, error: e.message }));
      emailStatus = res && res.ok ? 'sent' : (res && res.skipped ? 'skipped' : 'pending');
      if (emailStatus === 'pending') errors.push('email:' + (res && res.error));
    }
    if (waStatus === 'pending' && r.phone) {
      const res = await sendEventWhatsApp(env, row.event_key, r.phone, vars).catch(e => ({ ok: false, error: e.message }));
      waStatus = res && res.ok ? 'sent' : (res && res.skipped ? 'skipped' : 'pending');
      if (waStatus === 'pending') errors.push('wa:' + (res && res.error));
    }

    const attempts = (row.attempts || 0) + 1;
    const anyPending = emailStatus === 'pending' || waStatus === 'pending';
    const patch = {
      email_status: emailStatus,
      whatsapp_status: waStatus,
      attempts,
      last_error: errors.join(' | ').slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    };

    if (!anyPending) {
      patch.status = 'done';
      done++;
    } else if (attempts >= (row.max_attempts || 5)) {
      patch.status = 'failed';                 // dead-letter (inspection manuelle)
      if (emailStatus === 'pending') patch.email_status = 'failed';
      if (waStatus === 'pending') patch.whatsapp_status = 'failed';
      failed++;
    } else {
      patch.status = 'pending';
      patch.next_retry_at = new Date(Date.now() + (BACKOFF_MIN[attempts] || 360) * 60000).toISOString();
      pending++;
    }

    try { await sb.from('notification_outbox').update(patch, `id=eq.${row.id}`); } catch (_) {}
    processed++;
  }

  return json({ ok: true, processed, done, failed, pending });
}
