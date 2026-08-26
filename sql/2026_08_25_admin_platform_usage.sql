-- ============================================================================
-- Dashboard admin « Utilisation plateformes » : expose la taille réelle de la
-- base et du storage Supabase (uniquement calculables en SQL — l'API Management
-- Supabase n'a PAS d'endpoint /usage, cf. audit 2026-08-25) via une fonction
-- SECURITY DEFINER, lue par functions/api/admin/platform-usage.js (service_role
-- only, jamais exposée au client anon).
-- ============================================================================

create or replace function public.admin_supabase_usage()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'storage_size_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'storage_object_count', (select count(*) from storage.objects)
  );
$$;

-- Pas d'accès anon/authenticated : uniquement le service_role (backend admin).
revoke all on function public.admin_supabase_usage() from public;
revoke all on function public.admin_supabase_usage() from anon;
revoke all on function public.admin_supabase_usage() from authenticated;
grant execute on function public.admin_supabase_usage() to service_role;
