-- ============================================================================
-- SOS dépannage SANS connexion : un visiteur anonyme peut créer une demande et
-- en suivre le statut. L'id (UUID) de la demande sert de jeton de suivi (stocké
-- côté client dans localStorage). Les demandes anonymes ont requester_id = NULL.
-- ============================================================================

-- 1) Autoriser anon à créer une demande + à faire avancer la cascade au polling.
grant execute on function public.create_rescue_request(jsonb) to anon;
grant execute on function public.rescue_dispatch_tick(uuid)   to anon;

-- 2) Statut public par id (RLS bloque la lecture directe pour anon). Renvoie la
--    demande complète à quiconque possède l'UUID.
create or replace function public.rescue_request_public_status(p_request_id uuid)
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select to_jsonb(r) from public.rescue_requests r where r.id = p_request_id;
$$;
grant execute on function public.rescue_request_public_status(uuid) to anon, authenticated;

-- 3) Annulation publique — UNIQUEMENT les demandes anonymes (requester_id IS NULL),
--    avant clôture. (Les demandes d'un compte connecté passent par cancel_rescue_request.)
create or replace function public.cancel_rescue_request_public(p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_d public.rescue_requests%rowtype;
begin
  select * into v_d from public.rescue_requests where id = p_request_id;
  if v_d.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_d.requester_id is not null then return jsonb_build_object('ok', false, 'reason', 'auth_required'); end if;
  if v_d.status in ('completed','cancelled') then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  update public.rescue_requests set status = 'cancelled', cancelled_at = now() where id = p_request_id;
  update public.rescue_offers   set status = 'expired'   where request_id = p_request_id and status in ('queued','pending');
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.cancel_rescue_request_public(uuid) to anon, authenticated;

-- 4) Notation publique — UNIQUEMENT les demandes anonymes terminées. Mirroir de
--    rate_rescuer, sans le contrôle requester_id = auth.uid().
create or replace function public.rate_rescuer_public(p_request_id uuid, p_rating smallint)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_d public.rescue_requests%rowtype; v_rid uuid;
begin
  if p_rating < 1 or p_rating > 5 then return jsonb_build_object('ok', false, 'reason', 'invalid_rating'); end if;
  select * into v_d from public.rescue_requests where id = p_request_id;
  if v_d.id is null or v_d.requester_id is not null then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if v_d.status <> 'completed' then return jsonb_build_object('ok', false, 'reason', 'not_completed'); end if;
  if v_d.rescuer_rating is not null then return jsonb_build_object('ok', false, 'reason', 'already_rated'); end if;
  update public.rescue_requests set rescuer_rating = p_rating where id = p_request_id;
  select id into v_rid from public.rescuers where user_id = v_d.rescuer_id;
  if v_rid is not null then
    update public.rescuers
       set rating_avg = round(((rating_avg * rating_count) + p_rating) / (rating_count + 1), 2),
           rating_count = rating_count + 1
     where id = v_rid;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.rate_rescuer_public(uuid, smallint) to anon, authenticated;
