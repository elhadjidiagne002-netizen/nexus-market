// functions/cron/daily-report.js → GET /cron/daily-report?token=...
// Rapport quotidien condensé envoyé par email à l'administrateur : commandes
// et comptes des dernières 24h, résumé du journal admin unifié, alertes
// (notifications en échec, paiements en écart, config manquante), abonnements
// à renouveler prochainement (table subscriptions).
//
// À déclencher une fois par jour depuis cron-job.org (comme les autres /cron/*) :
//   GET https://nexusmarket.sn/cron/daily-report?token=VOTRE_CRON_SECRET
//
// Note : ADMIN_EMAIL (wrangler.toml) = nx@nexusmarket.sn, utilisée pour d'autres
// alertes existantes — pas forcément la boîte que l'utilisateur veut pour CE
// rapport. Destinataire dédié : DAILY_REPORT_EMAIL, avec repli explicite sur
// l'adresse demandée par l'utilisateur (pas sur ADMIN_EMAIL, pour éviter un envoi
// silencieux vers la mauvaise boîte).
import { supabase, sendEmail } from '../api/_lib/utils.js';
import { logEmail } from '../api/_lib/notify.js';
import { fetchLogsSummary } from '../api/_lib/logs.js';

const RENEWAL_WINDOW_DAYS = 14;
const FALLBACK_REPORT_EMAIL = 'elhadjidiagne002@gmail.com';

const json = (o, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) {
    return json({ error: 'Non autorisé — ?token=requis' }, 401);
  }
  return json(await buildAndSendReport(env));
}

async function buildAndSendReport(env) {
  const sb = supabase(env);
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const renewalCutoff = new Date(Date.now() + RENEWAL_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const out = { run_at: new Date().toISOString() };

  const [orders, buyers, vendors, logSummary, notifFailed, paymentIssues, renewals] = await Promise.all([
    sb.from('orders').select('id,total,payment_status', `created_at=gte.${since24h}&limit=1000`).catch(() => []),
    sb.from('profiles').select('id', `role=eq.buyer&created_at=gte.${since24h}&limit=1000`).catch(() => []),
    sb.from('profiles').select('id', `role=eq.vendor&created_at=gte.${since24h}&limit=1000`).catch(() => []),
    fetchLogsSummary(env, { sinceDays: 1 }).catch(() => []),
    sb.from('notification_outbox').select('id', 'status=eq.failed&limit=1000').catch(() => []),
    sb.from('payment_events').select('id,provider,event_type,ref', `created_at=gte.${since24h}&event_type=ilike.*fail*&limit=50`).catch(() => []),
    sb.from('subscriptions').select('service_name,renewal_date,cost_amount,cost_currency,plan_name', `renewal_date=lte.${renewalCutoff}&order=renewal_date.asc`).catch(() => []),
  ]);

  const ordersArr = Array.isArray(orders) ? orders : [];
  const totalEur = ordersArr.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalFcfa = Math.round(totalEur * 655.957);
  const byPaymentStatus = ordersArr.reduce((acc, o) => {
    acc[o.payment_status || 'inconnu'] = (acc[o.payment_status || 'inconnu'] || 0) + 1;
    return acc;
  }, {});

  out.orders24h = ordersArr.length;
  out.totalFcfa24h = totalFcfa;
  out.byPaymentStatus = byPaymentStatus;
  out.newBuyers24h = Array.isArray(buyers) ? buyers.length : 0;
  out.newVendors24h = Array.isArray(vendors) ? vendors.length : 0;
  out.notifFailed = Array.isArray(notifFailed) ? notifFailed.length : 0;
  out.paymentIssues24h = Array.isArray(paymentIssues) ? paymentIssues.length : 0;
  out.renewalsUpcoming = Array.isArray(renewals) ? renewals.length : 0;

  const configHealth = [
    ['Resend (email primaire)', !!env.RESEND_API_KEY],
    ['Brevo (email secours)', !!env.BREVO_API_KEY],
    ['PayTech', !!(env.PAYTECH_API_KEY && (env.PAYTECH_API_SECRET || env.PAYTECH_SECRET_KEY))],
    ['WhatsApp Green API', !!(env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN)],
  ].filter(([, ok]) => !ok);

  const html = renderDigestHtml({
    date: out.run_at,
    orders24h: out.orders24h,
    totalFcfa: totalFcfa,
    byPaymentStatus,
    newBuyers: out.newBuyers24h,
    newVendors: out.newVendors24h,
    logSummary: Array.isArray(logSummary) ? logSummary.slice(0, 8) : [],
    notifFailed: out.notifFailed,
    paymentIssues: Array.isArray(paymentIssues) ? paymentIssues : [],
    configHealth,
    renewals: Array.isArray(renewals) ? renewals : [],
  });

  const to = env.DAILY_REPORT_EMAIL || FALLBACK_REPORT_EMAIL;
  const subject = `📊 Rapport quotidien NEXUS Market — ${out.run_at.slice(0, 10)}`;

  try {
    const r = await sendEmail(env, { to, subject, html });
    const status = r && r.ok ? 'sent' : 'failed';
    out.emailStatus = status;
    await logEmail(env, { to_email: to, subject, template: 'daily_admin_report', status });
  } catch (e) {
    out.emailStatus = 'failed';
    out.emailError = e.message;
    try {
      await logEmail(env, { to_email: to, subject, template: 'daily_admin_report', status: 'failed' });
    } catch (_) {}
    console.warn('[daily-report] envoi KO:', e.message);
  }

  return out;
}

function renderDigestHtml(d) {
  const statusLines = Object.entries(d.byPaymentStatus)
    .map(([k, v]) => `<li>${esc(k)} : ${v}</li>`).join('');
  const logLines = d.logSummary
    .map((s) => `<li>${esc(s.action)} — ${s.count}</li>`).join('') || '<li>Aucune activité.</li>';

  const alerts = [];
  if (d.notifFailed > 0) alerts.push(`<li>⚠️ ${d.notifFailed} notification(s) en échec définitif (notification_outbox).</li>`);
  if (d.paymentIssues.length > 0) alerts.push(`<li>⚠️ ${d.paymentIssues.length} événement(s) de paiement en écart (24h) : ${esc(d.paymentIssues.map(p => p.ref).slice(0, 5).join(', '))}</li>`);
  for (const [name] of d.configHealth) alerts.push(`<li>⚠️ Configuration manquante : ${esc(name)}</li>`);

  const renewalRows = d.renewals.map((r) => {
    const cost = r.cost_amount != null ? `${r.cost_amount} ${esc(r.cost_currency || '')}` : '—';
    return `<li><b>${esc(r.service_name)}</b> — ${esc(r.renewal_date || '—')} (${cost}${r.plan_name ? ', ' + esc(r.plan_name) : ''})</li>`;
  }).join('') || '<li>Aucune date de renouvellement saisie ou aucune échéance proche.</li>';

  return `<div style="font-family:Arial,sans-serif;max-width:640px">
    <h2 style="color:#006d40">📊 Rapport quotidien NEXUS Market</h2>
    <p style="color:#888;font-size:12px">${esc(d.date)}</p>

    <h3>Commandes (24h)</h3>
    <ul><li>Créées : ${d.orders24h}</li><li>Total : ${d.totalFcfa.toLocaleString('fr-FR')} FCFA</li>${statusLines}</ul>

    <h3>Comptes (24h)</h3>
    <ul><li>Nouveaux acheteurs : ${d.newBuyers}</li><li>Nouveaux vendeurs : ${d.newVendors}</li></ul>

    <h3>Journal d'activité (24h)</h3>
    <ul>${logLines}</ul>

    ${alerts.length ? `<h3 style="color:#b91c1c">Alertes</h3><ul>${alerts.join('')}</ul>` : ''}

    <h3>Abonnements à renouveler (≤ ${RENEWAL_WINDOW_DAYS} jours)</h3>
    <ul>${renewalRows}</ul>

    <p><a href="https://nexusmarket.sn/dashboard-admin">Voir le tableau de bord admin →</a></p>
  </div>`;
}
