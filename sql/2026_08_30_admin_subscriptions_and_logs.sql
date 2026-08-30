-- 2026-08-30 — Suivi des abonnements/renouvellements + journal admin unifié.
-- Contexte : demande utilisateur "logs détaillés dans tous les secteurs" +
-- "suivi des abonnements et dates de renouvellement" + rapport quotidien email.
-- Aucune API n'expose les dates de renouvellement réelles (Resend, Cloudflare,
-- Supabase, etc.) → table admin-éditable, remplie manuellement par l'utilisateur.
-- Les "logs" agrègent les tables déjà existantes (email_logs, whatsapp_logs,
-- notification_outbox, payment_events, maintenance_log) via deux fonctions RPC
-- SECURITY DEFINER, dans le même esprit que admin_supabase_usage().

-- ─── Table subscriptions ────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  service_name  text not null unique,
  category      text,
  dashboard_url text,
  notes         text,
  plan_name     text,
  cost_amount   numeric,
  cost_currency text,
  billing_cycle text check (billing_cycle in ('monthly','yearly','one_time','free')),
  renewal_date  date,
  status        text not null default 'active' check (status in ('active','trial','cancelled','paused')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists subscriptions_renewal_idx on public.subscriptions (renewal_date);

alter table public.subscriptions enable row level security;
-- Defense-in-depth : le backend utilise la clé service_role (bypass RLS de toute
-- façon) — pas de policy anon/authenticated, cette table n'est jamais lue/écrite
-- directement depuis le navigateur.
revoke all on public.subscriptions from anon, authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

-- Seed : les 11 services déjà recensés dans EXTERNAL_LINKS
-- (functions/api/admin/platform-usage.js) — noms/URLs/notes repris tels quels,
-- coût et date de renouvellement laissés NULL (à saisir par l'utilisateur).
insert into public.subscriptions (service_name, dashboard_url, notes, category) values
  ('Supabase — Facturation & usage', 'https://supabase.com/dashboard/project/pqcqbstbdujzaclsiosv/settings/billing/usage', 'Égress, invocations Edge Functions, MAU — pas d''API publique.', 'hosting'),
  ('Cloudflare — Analytics', 'https://dash.cloudflare.com/', 'Pages, Workers, DNS, cache.', 'hosting'),
  ('Green API (WhatsApp sortant)', 'https://console.green-api.com/', 'Quota mensuel du plan gratuit (466 = dépassé).', 'messaging'),
  ('WAHA (WhatsApp secours)', 'https://dashboard.render.com/', 'Instance Render — vérifier heures/mois du plan Starter.', 'messaging'),
  ('Groq (IA — bots, assistant)', 'https://console.groq.com/settings/billing', 'Tokens IA utilisés par le chatbot et l''assistant produit.', 'ai'),
  ('Resend (email primaire)', 'https://resend.com/emails', '3 000 emails/mois gratuits.', 'email'),
  ('Brevo (email secours)', 'https://app.brevo.com/', '300 emails/jour gratuits.', 'email'),
  ('Firecrawl (prospection catalogue)', 'https://www.firecrawl.dev/app', '500 crédits/mois gratuits.', 'scraping'),
  ('Brave Search API', 'https://api-dashboard.search.brave.com/app/dashboard', 'Limite personnalisée déjà activée (cf. Usage limits).', 'search'),
  ('Apify (scraping ponctuel)', 'https://console.apify.com/billing/current-period', 'Plafonné à $5/mois (limite native du plan gratuit).', 'scraping'),
  ('PayTech (paiements mobile money)', 'https://paytech.sn/', 'Transactions, pas un quota de données.', 'payment')
on conflict (service_name) do nothing;

-- ─── Fonctions RPC : journal admin unifié ───────────────────────────────────
-- Valeurs réelles vérifiées en direct (2026-08-30) : email_logs.status et
-- whatsapp_logs.status ∈ {sent, failed} ; notification_outbox.status = pending
-- (seule valeur observée, le CASE reste défensif pour 'failed'/'done' à venir) ;
-- payment_events.event_type inclut reconciled_paid/reconciled_failed
-- (functions/cron/reconcile-payments.js) — table à 0 lignes actuellement, CASE
-- défensif par ilike plutôt que liste figée.
-- audit_logs (jamais écrite, 0 lignes) et rate_limits (compteur vivant, pas
-- d'événements datés) délibérément exclus de l'union.
create or replace function public.admin_logs_feed(
  p_limit int default 25, p_offset int default 0,
  p_action text default null, p_level text default null
)
returns table(id text, ts timestamptz, level text, action text, message text, user_email text, user_id uuid, ip text)
language sql security definer set search_path = public as $$
  with unioned as (
    select 'email:'||el.id::text as id, el.created_at as ts,
      case when el.status = 'failed' then 'error' else 'info' end as level,
      'email:'||coalesce(el.template,'generic') as action,
      el.subject as message, el.to_email as user_email, el.user_id, null::text as ip
    from public.email_logs el
    union all
    select 'wa:'||wl.id::text, wl.created_at,
      case when wl.status = 'failed' or wl.error_msg is not null then 'error' else 'info' end,
      'whatsapp:'||coalesce(wl.template,'msg'),
      coalesce(wl.error_msg, left(wl.message, 200)), null, wl.user_id, null
    from public.whatsapp_logs wl
    union all
    select 'nx:'||nb.id::text, nb.created_at,
      case when nb.status = 'failed' then 'error'
           when nb.status = 'pending' and nb.attempts > 0 then 'warn'
           else 'info' end,
      'notify:'||nb.event_key,
      coalesce(nb.last_error, nb.event_key),
      nb.recipient->>'email', null, null
    from public.notification_outbox nb
    union all
    select 'pay:'||pe.id::text, pe.created_at,
      case when pe.event_type ilike '%fail%' or pe.event_type ilike '%discrepancy%' then 'error' else 'info' end,
      'payment:'||pe.provider||':'||pe.event_type,
      coalesce(pe.note, pe.ref), null, null, null
    from public.payment_events pe
    union all
    select 'cron:'||ml.id::text, ml.run_at,
      case when (ml.result->>'error') is not null then 'error' else 'info' end,
      'cron:'||ml.job,
      left(ml.result::text, 200), null, null, null
    from public.maintenance_log ml
  )
  select * from unioned
  where (p_level is null or level = p_level)
    and (p_action is null or action ilike '%'||p_action||'%')
  order by ts desc
  limit p_limit offset p_offset;
$$;

create or replace function public.admin_logs_summary(p_since_days int default 30)
returns table(action text, count bigint)
language sql security definer set search_path = public as $$
  with unioned as (
    select 'email:'||coalesce(template,'generic') as action, created_at from public.email_logs
    union all select 'whatsapp:'||coalesce(template,'msg'), created_at from public.whatsapp_logs
    union all select 'notify:'||event_key, created_at from public.notification_outbox
    union all select 'payment:'||provider||':'||event_type, created_at from public.payment_events
    union all select 'cron:'||job, run_at from public.maintenance_log
  )
  select action, count(*) from unioned
  where created_at >= now() - make_interval(days => p_since_days)
  group by action order by count(*) desc;
$$;

revoke all on function public.admin_logs_feed(int,int,text,text) from public, anon, authenticated;
revoke all on function public.admin_logs_summary(int) from public, anon, authenticated;
grant execute on function public.admin_logs_feed(int,int,text,text) to service_role;
grant execute on function public.admin_logs_summary(int) to service_role;
