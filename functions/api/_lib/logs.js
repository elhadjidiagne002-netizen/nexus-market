// functions/api/_lib/logs.js — Journal admin unifié (agrège email_logs,
// whatsapp_logs, notification_outbox, payment_events, maintenance_log via
// les RPC SQL admin_logs_feed/admin_logs_summary, sql/2026_08_30_admin_subscriptions_and_logs.sql).
// Partagé entre /api/admin/logs(/summary) et le cron /cron/daily-report,
// pour ne pas dupliquer la logique d'agrégation entre les deux consommateurs.
import { supabase } from './utils.js';

export async function fetchLogsFeed(env, { limit = 25, offset = 0, action = null, level = null } = {}) {
  const sb = supabase(env);
  const rows = await sb.rpc('admin_logs_feed', {
    p_limit: Math.min(Number(limit) || 25, 200),
    p_offset: Math.max(Number(offset) || 0, 0),
    p_action: action || null,
    p_level: level || null,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function fetchLogsSummary(env, { sinceDays = 30 } = {}) {
  const sb = supabase(env);
  const rows = await sb.rpc('admin_logs_summary', { p_since_days: Number(sinceDays) || 30 });
  return Array.isArray(rows) ? rows : [];
}
