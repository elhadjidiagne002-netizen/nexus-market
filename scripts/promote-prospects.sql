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

do $$
declare
  p            record;
  v_uid        uuid;
  v_email      text;
  v_slug       text;
  v_d4         text;
  v_role       text;
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
      raise notice '⊘ %  (pro sans profession — ignoré)', p.name;
      n_skip := n_skip + 1;
      continue;
    end if;

    v_role := case p.account_type when 'vendor' then 'vendor' else 'buyer' end;

    -- ---- email ----
    if coalesce(p.email,'') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_email := lower(trim(p.email));
    else
      v_slug := regexp_replace(lower(pg_temp.unaccent_safe(coalesce(p.name,''))), '[^a-z0-9]+', '.', 'g');
      v_slug := trim(both '.' from v_slug);
      v_d4   := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 4);
      if v_slug <> '' then
        v_email := v_slug || case when v_d4 <> '' then '.'||v_d4 else '' end || '@nexusmarket.sn';
      elsif v_d4 <> '' then
        v_email := 'prospect.'||v_d4||'@nexusmarket.sn';
      else
        v_email := 'prospect.'||substr(md5(random()::text),1,6)||'@nexusmarket.sn';
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
      current_lat = coalesce(p.lat, current_lat),
      current_lng = coalesce(p.lng, current_lng),
      location_updated_at = case when p.lat is not null and p.lng is not null then now() else location_updated_at end
    where id = v_uid;

    -- ---- fiche métier ----
    if p.account_type = 'pro' then
      -- phone en NULL si vide : un index unique sur phone rejette deux chaînes '' mais
      -- accepte plusieurs NULL (btree traite les NULL comme distincts).
      insert into public.pros (user_id, profession, name, phone, city, status, disponible)
      values (v_uid, p.profession, coalesce(p.name,''), nullif(p.phone,''), p.city, 'active', true)
      on conflict (user_id) do update
        set profession = excluded.profession, status = 'active', disponible = true;
    elsif p.account_type = 'courier' then
      insert into public.couriers (user_id, name, phone, status)
      values (v_uid, coalesce(p.name,''), nullif(p.phone,''), 'pending')
      on conflict (user_id) do nothing;
    end if;

    -- ---- marque le prospect ----
    update public.prospects
       set status = 'promoted', promoted_user_id = v_uid, email = v_email, updated_at = now()
     where id = p.id;

    n_ok := n_ok + 1;
    raise notice '✓ %  →  %', coalesce(p.name,'(sans nom)'), v_email;
   exception when others then
     n_err := n_err + 1;
     raise notice '✗ %  : %', coalesce(p.name,'(sans nom)'), sqlerrm;
   end;
  end loop;

  raise notice '=== Terminé : % promus (dont % réutilisés), % ignorés, % erreurs. Mot de passe: % ===',
    n_ok, n_reuse, n_skip, n_err, v_pwd;
end $$;
