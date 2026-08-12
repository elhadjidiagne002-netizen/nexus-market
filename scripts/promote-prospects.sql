-- scripts/promote-prospects.sql
-- Promeut EN MASSE tous les prospects (table CRM `public.prospects`) en vrais comptes,
-- 100% en SQL — à coller dans Supabase → SQL Editor (aucune Service Role Key à manipuler,
-- l'éditeur tourne en service_role et bypasse la RLS).
--
-- Ce que fait le script, pour chaque prospect NON encore promu :
--   1. génère un email (email fourni, sinon slug(nom).4derniers-chiffres@nexusmarket.sn) ;
--   2. crée le compte auth.users + auth.identities (mot de passe = variable ci-dessous),
--      ou réutilise le compte existant si l'email existe déjà ;
--   3. laisse le trigger handle_new_user créer le profil, puis pose les flags + géo ;
--   4. crée la fiche métier : pros → status 'active' (visible direct), couriers → 'pending' ;
--   5. marque le prospect status='promoted' + promoted_user_id.
--
-- Idempotent : relançable sans créer de doublons (dédup par email + on conflict).
-- Filtre par défaut : tous les prospects dont status <> 'promoted'.
-- Pour ne traiter qu'un type, ajoute p.ex.  and account_type = 'pro'  au WHERE (marqué ci-dessous).

create extension if not exists pgcrypto;

-- Retire les accents FR courants sans dépendre de l'extension `unaccent`.
create or replace function pg_temp.unaccent_safe(txt text) returns text
language sql immutable as $fn$
  select translate(coalesce(txt,''),
    'àâäáãçéèêëíïîìóôöòõúùûüýñ',
    'aaaaaceeeeiiiiooooouuuuyn');
$fn$;

-- Journal des résultats — affiché dans la grille « Results » à la fin (visible même si
-- l'onglet Messages ne montre pas les RAISE NOTICE).
drop table if exists _promo_log;
create temp table _promo_log (seq serial, name text, account_type text, email text, outcome text, detail text);

do $$
declare
  p            record;
  v_uid        uuid;
  v_email      text;
  v_slug       text;
  v_d4         text;
  v_role       text;
  v_phone      text;
  v_note       text;
  v_spec       text[];
  v_hay        text;
  v_pwd        text := 'Nexus@2024';   -- ← mot de passe attribué à tous les comptes créés
  n_ok         int := 0;
  n_skip       int := 0;
  n_reuse      int := 0;
  n_err        int := 0;
begin
  -- Le trigger protect_profile_columns() interdit de changer role/is_pro/status SAUF pour
  -- service_role ou is_admin(). Le SQL Editor n'a pas de JWT (auth.role() = NULL) → on se
  -- déclare service_role le temps de CETTE transaction (chemin privilégié prévu par le
  -- trigger). Idem pour toute RLS/anti-escalade s'appuyant sur auth.role().
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true); -- variante ancienne d'auth.role()

  -- Diagnostic : le bypass a-t-il pris ? combien de lignes à traiter ?
  insert into _promo_log(name, outcome, detail) values (
    '(DIAGNOSTIC)', 'info',
    'auth.role()=[' || coalesce(auth.role(), 'NULL') || '] · prospects non-promus=' ||
    (select count(*) from public.prospects where status is distinct from 'promoted')::text);

  for p in
    select * from public.prospects
    where status is distinct from 'promoted'
    -- and account_type = 'pro'          -- ← dé-commente pour filtrer par type
    order by created_at asc
  loop
   -- Sous-bloc par prospect : une erreur (doublon de téléphone, contrainte…) est CAPTURÉE
   -- et n'annule que CE prospect (savepoint implicite), pas toute la transaction. Sans ça,
   -- une seule ligne fautive ferait tout échouer (rien d'enregistré).
   begin
    -- profession requise pour une fiche pro
    if p.account_type = 'pro' and coalesce(nullif(trim(p.profession), ''), null) is null then
      insert into _promo_log(name, account_type, outcome, detail) values (p.name, p.account_type, 'ignoré', 'pro sans profession');
      n_skip := n_skip + 1;
      continue;
    end if;

    v_role := case p.account_type when 'vendor' then 'vendor' else 'buyer' end;

    -- ---- email ----
    -- On IGNORE l'email-placeholder non-unique 'prospect_@...' (généré à l'import pour les
    -- fiches sans numéro, ex. « Voir Facebook ») : sinon plusieurs entreprises distinctes le
    -- partagent → fusionnées sur UN seul compte. Suffixe déterministe (hash de l'id) quand il
    -- n'y a pas de chiffres de téléphone → email UNIQUE par prospect ET idempotent (re-run OK).
    if coalesce(p.email,'') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       and lower(p.email) !~ '^prospect_?@' then
      v_email := lower(trim(p.email));
    else
      v_slug := regexp_replace(lower(pg_temp.unaccent_safe(coalesce(p.name,''))), '[^a-z0-9]+', '.', 'g');
      v_slug := trim(both '.' from v_slug);
      v_d4   := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 4);
      if v_slug <> '' then
        v_email := v_slug || '.' || coalesce(nullif(v_d4,''), left(md5(p.id::text),4)) || '@nexusmarket.sn';
      else
        v_email := 'prospect.' || coalesce(nullif(v_d4,''), left(md5(p.id::text),6)) || '@nexusmarket.sn';
      end if;
    end if;

    -- ---- compte auth : réutilise si l'email existe, sinon crée ----
    select id into v_uid from auth.users where lower(email) = v_email limit 1;
    if v_uid is not null then
      n_reuse := n_reuse + 1;
    else
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, crypt(v_pwd, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
          'name', coalesce(p.name,''), 'phone', coalesce(p.phone,''),
          'role', v_role, 'account_type', coalesce(p.account_type,'custom'),
          'profession', coalesce(p.profession,''), 'imported', true
        ),
        now(), now()
      );
      insert into auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        v_uid::text, v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_email),
        'email', now(), now(), now()
      );
    end if;

    -- ---- profil (le trigger handle_new_user a pu déjà le créer) ----
    insert into public.profiles (id, email, name, phone, role)
    values (v_uid, v_email, coalesce(p.name,''), coalesce(p.phone,''), v_role)
    on conflict (id) do update
      set email = coalesce(public.profiles.email, excluded.email),
          name  = coalesce(nullif(public.profiles.name,''), excluded.name),
          phone = coalesce(nullif(public.profiles.phone,''), excluded.phone),
          role  = excluded.role;

    -- flags + géo (le trigger sync_profile_geolocation remplira profiles.geolocation)
    update public.profiles set
      is_pro      = case when p.account_type = 'pro'     then true else is_pro end,
      is_courier  = case when p.account_type = 'courier' then true else is_courier end,
      is_breeder  = case when p.account_type = 'breeder' then true else is_breeder end,
      is_rescuer  = case when p.account_type = 'rescuer' then true else is_rescuer end,
      rescuer_status = case when p.account_type = 'rescuer' then 'available' else rescuer_status end,
      current_lat = coalesce(p.lat, current_lat),
      current_lng = coalesce(p.lng, current_lng),
      location_updated_at = case when p.lat is not null and p.lng is not null then now() else location_updated_at end
    where id = v_uid;

    -- ---- fiche métier ----
    -- `couriers.phone` (et parfois `pros.phone`) est NOT NULL + UNIQUE. Un prospect sans
    -- numéro, ou dont le numéro duplique une fiche existante, reçoit un téléphone-repère
    -- UNIQUE (`na-<8 hex de l'uid>`) pour satisfaire les contraintes et sortir de la file.
    -- La note le signale → l'admin pourra corriger/rejeter ensuite.
    v_note := null;
    if p.account_type = 'pro' then
      v_phone := nullif(trim(p.phone), '');
      if v_phone is not null and exists (select 1 from public.pros where phone = v_phone and user_id <> v_uid) then v_phone := null; end if;
      if v_phone is null then v_phone := 'na-' || left(v_uid::text, 8); v_note := 'téléphone manquant/dupliqué → repère'; end if;
      insert into public.pros (user_id, profession, name, phone, city, status, disponible)
      values (v_uid, p.profession, coalesce(p.name,''), v_phone, p.city, 'active', true)
      on conflict (user_id) do update
        set profession = excluded.profession, status = 'active', disponible = true;
    elsif p.account_type = 'courier' then
      v_phone := nullif(trim(p.phone), '');
      if v_phone is not null and exists (select 1 from public.couriers where phone = v_phone and user_id <> v_uid) then v_phone := null; end if;
      if v_phone is null then v_phone := 'na-' || left(v_uid::text, 8); v_note := 'téléphone manquant/dupliqué → repère'; end if;
      insert into public.couriers (user_id, name, phone, status)
      values (v_uid, coalesce(p.name,''), v_phone, 'pending')
      on conflict (user_id) do nothing;
    elsif p.account_type = 'rescuer' then
      -- Dépanneur (vertical NEXUS Dépannage). rescuers.phone nullable et NON unique → pas de
      -- repère. specialties dérivées de la profession (codes valides mechanic|tow_truck|
      -- battery|tire|fuel|lockout), défaut mechanic si aucun mot-clé.
      v_hay := lower(pg_temp.unaccent_safe(coalesce(p.profession,'') || ' ' || coalesce(p.name,'')));
      -- NB: array_append (PAS `|| 'texte'`) : `text[] || 'litteral'` non typé fait un
      -- array_cat et échoue avec "malformed array literal".
      v_spec := array[]::text[];
      if v_hay ~ 'remorqu|depanneuse|tow|plateau' then v_spec := array_append(v_spec, 'tow_truck'); end if;
      if v_hay ~ 'batterie|battery|demarrage|survolt' then v_spec := array_append(v_spec, 'battery'); end if;
      if v_hay ~ 'pneu|tire|crevaison|roue' then v_spec := array_append(v_spec, 'tire'); end if;
      if v_hay ~ 'carburant|essence|fuel|panne seche' then v_spec := array_append(v_spec, 'fuel'); end if;
      if v_hay ~ 'serrur|clef|^cle | cle |lockout|ouverture' then v_spec := array_append(v_spec, 'lockout'); end if;
      if v_hay ~ 'mecanic|garage|moteur|electr|diagnostic' then v_spec := array_append(v_spec, 'mechanic'); end if;
      if array_length(v_spec,1) is null then v_spec := array['mechanic']; end if;
      insert into public.rescuers (user_id, name, phone, specialties, vehicle_type, is_available, status)
      values (v_uid, coalesce(p.name,''), nullif(trim(p.phone),''), v_spec, null, true, 'active')
      on conflict (user_id) do update set specialties = excluded.specialties, status = 'active', is_available = true;
    end if;

    -- ---- marque le prospect ----
    update public.prospects
       set status = 'promoted', promoted_user_id = v_uid, email = v_email, updated_at = now()
     where id = p.id;

    n_ok := n_ok + 1;
    insert into _promo_log(name, account_type, email, outcome, detail)
      values (p.name, p.account_type, v_email, 'promu', v_note);
   exception when others then
     n_err := n_err + 1;
     insert into _promo_log(name, account_type, email, outcome, detail)
       values (p.name, p.account_type, v_email, 'ERREUR', sqlerrm);
   end;
  end loop;

  insert into _promo_log(name, outcome, detail) values (
    '(RÉCAP)', 'info',
    n_ok || ' promus, ' || n_reuse || ' réutilisés, ' || n_skip || ' ignorés, ' || n_err || ' erreurs · mdp=' || v_pwd);
end $$;

-- ── Résultats (grille « Results ») ────────────────────────────────────────────
-- Dernier SELECT = ce qui s'affiche : DIAGNOSTIC + RÉCAP + toutes les ERREURS (avec le
-- message exact). Le détail complet (dont les 'promu') reste requêtable via _promo_log.
select seq, outcome, name, account_type, email, detail
  from _promo_log
 where outcome in ('info', 'ERREUR')
 order by seq;
