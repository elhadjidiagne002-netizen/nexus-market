-- ════════════════════════════════════════════════════════════════════════════
--  COURSIERS — Mise en ligne par l'admin
--
--  DEMANDE PRODUIT (2026-08-13) :
--    1. Un coursier n'est PAS en ligne par défaut (reste 'pending' à l'inscription).
--    2. Dès que l'admin VALIDE le compte → le coursier est disponible ET en ligne.
--    3. L'admin peut mettre en ligne / hors ligne un coursier à la main.
--
--  MODÈLE « en ligne » (rappel) — un coursier est proposé/affiché en ligne quand :
--    · couriers.is_available = true            (indicateur de dispo)
--    · profiles.courier_status = 'available'   ← INTENTION : ce flag est la source de
--        vérité. Le cron dispatch_tick_all (bloc C2, chaque minute) REMET
--        is_available=false si courier_status <> 'available'. Il FAUT donc poser
--        courier_status='available', sinon la mise en ligne est annulée en < 1 min.
--    · profiles.location_updated_at récent (< 30 min) → badge « live » + tri
--        « en ligne d'abord » (nearby_couriers / nearby_couriers_offline).
--
--  Ces deux RPC posent les trois d'un coup. SECURITY DEFINER + garde is_admin()
--  (appelées depuis le dashboard admin avec le JWT admin). Idempotentes.
--  À coller dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- ── 1) Valider un coursier (pending → active) ET le mettre en ligne ───────────
create or replace function public.admin_approve_courier(p_courier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'admin requis'; end if;

  update public.couriers
     set status       = 'active',
         is_available = true,
         approved_at  = now()
   where id = p_courier_id
   returning user_id into v_uid;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'coursier introuvable');
  end if;

  -- Intention « en ligne » (survit au cron C2) + fraîcheur position pour le badge live.
  update public.profiles
     set courier_status      = 'available',
         location_updated_at  = now()
   where id = v_uid;

  return jsonb_build_object('ok', true, 'courier_id', p_courier_id, 'user_id', v_uid, 'online', true);
end $$;

-- ── 2) Mettre en ligne / hors ligne un coursier déjà actif ───────────────────
create or replace function public.admin_set_courier_online(p_courier_id uuid, p_online boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'admin requis'; end if;

  update public.couriers
     set is_available = p_online,
         status       = case when p_online then 'active' else status end
   where id = p_courier_id
   returning user_id into v_uid;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'coursier introuvable');
  end if;

  update public.profiles
     set courier_status     = case when p_online then 'available' else 'offline' end,
         location_updated_at = case when p_online then now() else location_updated_at end
   where id = v_uid;

  return jsonb_build_object('ok', true, 'courier_id', p_courier_id, 'user_id', v_uid, 'online', p_online);
end $$;

grant execute on function public.admin_approve_courier(uuid)          to authenticated;
grant execute on function public.admin_set_courier_online(uuid, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  OPTIONNEL — Valider + mettre en ligne EN MASSE tous les coursiers 'pending'
--  (ex. les 88 livreurs importés depuis Google Maps). Décommentez pour l'exécuter.
--  ⚠️ Court-circuite la revue manuelle : ne le faites que si vous voulez tous les
--     activer d'un coup. Idempotent (ne retouche que les 'pending').
-- ════════════════════════════════════════════════════════════════════════════
-- with promus as (
--   update public.couriers
--      set status='active', is_available=true, approved_at=now()
--    where status='pending'
--    returning user_id
-- )
-- update public.profiles p
--    set courier_status='available', location_updated_at=now()
--   from promus where promus.user_id = p.id;

-- ── Vérification rapide ───────────────────────────────────────────────────────
--   select count(*) filter (where status='active')  as actifs,
--          count(*) filter (where is_available)      as en_ligne
--     from public.couriers;
