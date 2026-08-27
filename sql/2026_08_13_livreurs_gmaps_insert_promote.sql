-- ============================================================================
-- LIVREURS / COURSIERS (Google Maps) : INSERT dans prospects (account_type='courier')
--   + PROMOTION en comptes réels.
-- Auto-généré depuis prospection/livreurs_google_maps_senegal.csv (88 fiches).
-- email = prospect_<telephone>@nexusmarket.sn → 1 compte / numéro, idempotent.
-- À coller dans Supabase → SQL Editor (tourne en service_role, bypasse la RLS).
-- Idempotent : on conflict à l'INSERT + dédup par email/on conflict à la promotion.
-- La promotion crée : auth.users + auth.identities + profiles(is_courier=true, géo)
--   + fiche public.couriers(status='pending'). Mot de passe commun = 'Nexus@2024'
--   (variable v_pwd dans le bloc DO ci-dessous — À CHANGER si besoin).
-- Les coursiers arrivent en 'pending' → à valider dans l'admin (comme le flux normal).
-- ============================================================================

insert into public.prospects(account_type,profession,name,phone,email,city,region,address,lat,lng,source,status) values
('courier','livreur','Alex Express Transport - Sénégal','+221 76 500 80 51','prospect_221765008051@nexusmarket.sn','Dakar','Dakar','vers école Nolive',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','AZ MOVE & EXPRESS','+221 77 928 27 95','prospect_221779282795@nexusmarket.sn','Dakar','Dakar','1118',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Bayzal-Express-Service','+221 77 593 00 69','prospect_221775930069@nexusmarket.sn','Dakar','Dakar','',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','CHRONO EXPRESS DELIVERY','+221 77 370 28 28','prospect_221773702828@nexusmarket.sn','Dakar','Dakar','',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','CHRONO LOGISTIQUE SENEGAL','+221 77 575 57 95','prospect_221775755795@nexusmarket.sn','Rufisque','Dakar','',14.716417,-17.273844,'google_maps','new'),
('courier','livreur','Dakar Express Livraison','+221 71 017 40 61','prospect_221710174061@nexusmarket.sn','Dakar','Dakar','behind the market',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','DAKAR EXPRESS LIVRAISON','+221 77 883 47 79','prospect_221778834779@nexusmarket.sn','Dakar','Dakar','',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Express sourire','+221 76 653 95 72','prospect_221766539572@nexusmarket.sn','Dakar','Dakar','',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','GP EXPRESS SERVICES','+221 78 454 56 56','prospect_221784545656@nexusmarket.sn','Dakar','Dakar','2679-C Rue P, rue DD45',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Livraison à domicile (bagages, colis, courses)','+221 77 967 04 14','prospect_221779670414@nexusmarket.sn','Dakar','Dakar','PGMX+2H5',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Livreur Dakar','+221 77 366 28 28','prospect_221773662828@nexusmarket.sn','Dakar','Dakar','Dakar',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Livreur express','+221 77 271 72 42','prospect_221772717242@nexusmarket.sn','Dakar','Dakar','PG7Q+G7G',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Livreur express dakar','+221 76 836 32 46','prospect_221768363246@nexusmarket.sn','Dakar','Dakar','PPQ2+GR4, Cité SIPRES',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Livreur Moto Pro','+221 77 059 89 71','prospect_221770598971@nexusmarket.sn','Dakar','Dakar','Villa N°441',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Livreur Sénégal','+221 77 854 97 97','prospect_221778549797@nexusmarket.sn','Dakar','Dakar','9260',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','MAX EXPRESS service de livraison','+221 77 395 95 89','prospect_221773959589@nexusmarket.sn','Dakar','Dakar','PGHJ+M8H',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Moto Point','+221 78 193 27 11','prospect_221781932711@nexusmarket.sn','Dakar','Dakar','PHRM+WGF, cité Air Afrique',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Optimal Logistique Services','+221 77 871 51 11','prospect_221778715111@nexusmarket.sn','Dakar','Dakar','Lot n° 807',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Pyn express service','+221 77 162 56 88','prospect_221771625688@nexusmarket.sn','Rufisque','Dakar','PP8G+CGP',14.716417,-17.273844,'google_maps','new'),
('courier','livreur','RAQ - TAQ','+221 76 012 63 63','prospect_221760126363@nexusmarket.sn','Dakar','Dakar','Villa 37, Cité Malick Sy - HLM Rue MH-35 BP 946',14.710073,-17.444181,'google_maps','new'),
('courier','livreur','Sow Express Services','+221 77 214 98 98','prospect_221772149898@nexusmarket.sn','Dakar','Dakar','PG8J+MWG, rue 39x20',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Tendouck Global Express Zac Mbao','+221 77 794 51 41','prospect_221777945141@nexusmarket.sn','Dakar','Dakar','PG8J+MWG',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Thiam Ibrahima','+221 77 122 62 20','prospect_221771226220@nexusmarket.sn','Rufisque','Dakar','taaw fekh 25000',14.716417,-17.273844,'google_maps','new'),
('courier','livreur','Vitfé Express','+221 77 671 77 91','prospect_221776717791@nexusmarket.sn','Dakar','Dakar','',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Wooma Yonnima (livraison express)','+221 33 824 10 94','prospect_221338241094@nexusmarket.sn','Dakar','Dakar','PH33+PG7',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','yangoo Thiak thiak','+221 77 275 79 71','prospect_221772757971@nexusmarket.sn','Dakar','Dakar','QM24+C8F',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','YOBULMA EXPRESS','+221 77 162 82 90','prospect_221771628290@nexusmarket.sn','Dakar','Dakar','PMP9+28G',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Yobuma','+221 33 920 22 22','prospect_221339202222@nexusmarket.sn','Dakar','Dakar','',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','BMC baye mor creation','+221 76 485 44 92','prospect_221764854492@nexusmarket.sn','Diourbel','Diourbel','',14.654562,-16.227822,'google_maps','new'),
('courier','livreur','Mbeg_t express','+221 76 558 54 07','prospect_221765585407@nexusmarket.sn','Diourbel','Diourbel','Fass Mbao, Dakar',14.654562,-16.227822,'google_maps','new'),
('courier','livreur','Transport bagages','+221 77 111 01 68','prospect_221771110168@nexusmarket.sn','Diourbel','Diourbel','Case ba',14.654562,-16.227822,'google_maps','new'),
('courier','livreur','Balde transport moto','+221 77 168 98 24','prospect_221771689824@nexusmarket.sn','Kolda','Kolda','',12.892115,-14.940097,'google_maps','new'),
('courier','livreur','Lourd Services','+221 77 664 57 99','prospect_221776645799@nexusmarket.sn','Kolda','Kolda','Daroukhane 1 Wakhinane, 219',12.892115,-14.940097,'google_maps','new'),
('courier','livreur','2KM TRANSPORT','+221 78 145 09 09','prospect_221781450909@nexusmarket.sn','Louga','Louga','JQCQ+GWM, Louga-Richard Toll Rd',15.777002,-16.061847,'google_maps','new'),
('courier','livreur','Multi-Service Fall et Frères','+221 77 260 79 30','prospect_221772607930@nexusmarket.sn','Louga','Louga','rue de la Gar bi Artillerie',15.777002,-16.061847,'google_maps','new'),
('courier','livreur','TALL TRANSPORT','+221 76 848 79 17','prospect_221768487917@nexusmarket.sn','Louga','Louga','JQG4+PPH, Louga-Richard Toll Rd',15.777002,-16.061847,'google_maps','new'),
('courier','livreur','Salam Transports','+221 77 874 81 38','prospect_221778748138@nexusmarket.sn','Tambacounda','Tambacounda','Q8GH+JRR',13.769258,-13.66829,'google_maps','new'),
('courier','livreur','Mbour Business Group MBG','+221 33 999 40 45','prospect_221339994045@nexusmarket.sn','Mbour','Thiès','',14.42074,-16.971484,'google_maps','new'),
('courier','livreur','MBOUR EXPRESS (livraison colis)','+221 78 783 63 63','prospect_221787836363@nexusmarket.sn','Mbour','Thiès','C2CW+QM, en face Nissane, Rte Mbour-Fatick-Kaolack',14.42074,-16.971484,'google_maps','new'),
('courier','livreur','Yonnelbok Livraison à domicile Thiès','+221 77 232 31 39','prospect_221772323139@nexusmarket.sn','Thiès','Thiès','Thiès',14.791461,-16.925605,'google_maps','new'),
('courier','livreur','Diabisse Voyage','+221 76 698 36 73','prospect_221766983673@nexusmarket.sn','Ziguinchor','Ziguinchor','HP9G+F5P, Unnamed Road',12.563493,-16.272461,'google_maps','new'),
('courier','livreur','Maersk Ziguinchor','+221 77 819 22 59','prospect_221778192259@nexusmarket.sn','Ziguinchor','Ziguinchor','HPPM+X32, Rue de Santhiaba',12.563493,-16.272461,'google_maps','new'),
('courier','livreur','Agence Vidal express services','+221 77 205 68 68','prospect_221772056868@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','AGS Déménagement Sénégal','+221 33 836 52 34','prospect_221338365234@nexusmarket.sn','Dakar','Dakar','Route de Mbao, Rte Grand Mbao',14.741542,-17.326147,'google_maps','new'),
('courier','livreur','ALKA Service Transport','+221 78 478 52 09','prospect_221784785209@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','ARRÊTE BAYE MAKHMOUT NIASS','+221 76 909 17 68','prospect_221769091768@nexusmarket.sn','','','1443',null,null,'google_maps','new'),
('courier','livreur','Barham service','+221 78 169 28 22','prospect_221781692822@nexusmarket.sn','','','RM35+77',null,null,'google_maps','new'),
('courier','livreur','BELTRANS Beleup Transports Logistique','+221 77 203 59 18','prospect_221772035918@nexusmarket.sn','Dakar','Dakar','20673 Thiaroye Dakar',14.762352,-17.392072,'google_maps','new'),
('courier','livreur','CAD LOGISTICS SENEGAL','+221 33 827 05 05','prospect_221338270505@nexusmarket.sn','Dakar','Dakar','Cité Keur Gorgui, Villa N°R11',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','Chap livraison','+221 77 408 11 98','prospect_221774081198@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','Club Tiossane','+221 78 480 54 54','prospect_221784805454@nexusmarket.sn','Dakar','Dakar','Thiaroye km 14 route de Rufisque',14.741994,-17.395241,'google_maps','new'),
('courier','livreur','Dash service de livraison','+221 77 868 12 28','prospect_221778681228@nexusmarket.sn','','','PGHJ+M8H',null,null,'google_maps','new'),
('courier','livreur','DBS GROUP Sénégal','+221 77 577 11 47','prospect_221775771147@nexusmarket.sn','Dakar','Dakar','Km 18 route de rufisque Fass Mbao cité Mandela villa n48',14.693425,-17.447938,'google_maps','new'),
('courier','livreur','DHL Courier Service Kaolack','+221 33 945 15 33','prospect_221339451533@nexusmarket.sn','Kaolack','Kaolack','5W4J+XR2, Unnamed Road',14.138815,-16.076391,'google_maps','new'),
('courier','livreur','DHL Service Point (DHL SAINT LOUIS)','+221 33 869 11 11','prospect_221338691111@nexusmarket.sn','Saint-Louis','Saint-Louis','X AYNINA FALL, Rue de France',16.028045,-16.504869,'google_maps','new'),
('courier','livreur','Dieye Transit','+221 77 270 90 78','prospect_221772709078@nexusmarket.sn','','','Q3Q4+9QG, Unnamed Road',null,null,'google_maps','new'),
('courier','livreur','DIOP Transports Saint-Louis','+221 77 815 80 87','prospect_221778158087@nexusmarket.sn','Saint-Louis','Saint-Louis','2GG2+9HM',16.028045,-16.504869,'google_maps','new'),
('courier','livreur','Dioum Transport Et Déménagement','+221 77 468 44 80','prospect_221774684480@nexusmarket.sn','','','Hamo 6 Villa N° K/210',null,null,'google_maps','new'),
('courier','livreur','Global African Movers','+221 77 162 81 81','prospect_221771628181@nexusmarket.sn','','','Villa 91',null,null,'google_maps','new'),
('courier','livreur','Global delivery network Company','+221 70 370 36 37','prospect_221703703637@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','Kaïraba Business Express','+221 78 181 31 58','prospect_221781813158@nexusmarket.sn','','','Marche.Central',null,null,'google_maps','new'),
('courier','livreur','Keur Fatou Nguinda Diop','+221 77 546 08 77','prospect_221775460877@nexusmarket.sn','','','Keur Fatou Guindé Diop N:82',null,null,'google_maps','new'),
('courier','livreur','Lamp solution Thiak Thiak','+221 78 461 79 12','prospect_221784617912@nexusmarket.sn','Kaolack','Kaolack','5W7F+XV5, Kaolack-Diourbel Rd',14.138815,-16.076391,'google_maps','new'),
('courier','livreur','Livraison express','+221 76 976 21 04','prospect_221769762104@nexusmarket.sn','Dakar','Dakar','Rond Point Sipres Zac Mbao',14.741542,-17.326147,'google_maps','new'),
('courier','livreur','LIVRAISON EXPRESS DAKAR','+221 77 614 12 40','prospect_221776141240@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','Livreur Saint-Louis Express','+221 75 000 08 92','prospect_221750000892@nexusmarket.sn','Saint-Louis','Saint-Louis','',16.028045,-16.504869,'google_maps','new'),
('courier','livreur','Malaw Express','+221 77 458 74 74','prospect_221774587474@nexusmarket.sn','','','Face Stade Lat Dior, Route de l''Aéroport Blaise Diagne-AIBD',null,null,'google_maps','new'),
('courier','livreur','MAM_TRANS ET BUSINESS','+221 33 936 34 38','prospect_221339363438@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','Mane Transports','+221 77 101 32 65','prospect_221771013265@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','Mbeg_t EXPRESS','+221 78 432 72 20','prospect_221784327220@nexusmarket.sn','Dakar','Dakar','Poste Thiaroye',14.74604,-17.378287,'google_maps','new'),
('courier','livreur','Mor LAMPARDD','+221 76 244 33 25','prospect_221762443325@nexusmarket.sn','','','Unnamed Road',null,null,'google_maps','new'),
('courier','livreur','Niang Livraison','+221 76 803 25 94','prospect_221768032594@nexusmarket.sn','Dakar','Dakar','KEUR MASSAR',14.782257,-17.311199,'google_maps','new'),
('courier','livreur','Prince Livreur à Saint-Louis','+221 77 846 46 58','prospect_221778464658@nexusmarket.sn','Saint-Louis','Saint-Louis','',16.028045,-16.504869,'google_maps','new'),
('courier','livreur','Sarafina transport yango','+221 77 133 77 51','prospect_221771337751@nexusmarket.sn','Dakar','Dakar','Diamaguene gouy gua derriere la nouvelle Police diamafuene sicap mbao',14.749243,-17.351976,'google_maps','new'),
('courier','livreur','Seck Ndedane','+221 76 269 78 69','prospect_221762697869@nexusmarket.sn','','','V482+H6M Thiak Thiak',null,null,'google_maps','new'),
('courier','livreur','Sén services livraisons','+221 77 878 65 27','prospect_221778786527@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','SEN VISION EXPRESS','+221 77 539 12 57','prospect_221775391257@nexusmarket.sn','Dakar','Dakar','Terrain de basket Thiaroye Azur',14.747343,-17.368778,'google_maps','new'),
('courier','livreur','Sénégal Logistique','+221 77 428 09 75','prospect_221774280975@nexusmarket.sn','','','PG7H+JQ2',null,null,'google_maps','new'),
('courier','livreur','Shein Senegal Dakar','+221 77 128 63 44','prospect_221771286344@nexusmarket.sn','','','QJCM+7GF',null,null,'google_maps','new'),
('courier','livreur','SIXCOM GROUP SERVICE','+221 78 109 73 10','prospect_221781097310@nexusmarket.sn','','','',null,null,'google_maps','new'),
('courier','livreur','Société de Dépannage et de Transport de l''Afrique de l''ouest (SDTAO)','+221 77 728 82 22','prospect_221777288222@nexusmarket.sn','','','PJW7+VPC, A. à péage',null,null,'google_maps','new'),
('courier','livreur','Société Toure Business','+221 77 524 30 68','prospect_221775243068@nexusmarket.sn','Kaolack','Kaolack','5WG2+GXM Ngane Saer',14.138815,-16.076391,'google_maps','new'),
('courier','livreur','Sunu Livreur','+221 77 585 67 58','prospect_221775856758@nexusmarket.sn','','','QP63+QM7',null,null,'google_maps','new'),
('courier','livreur','Taxis bagages','+221 77 339 31 45','prospect_221773393145@nexusmarket.sn','Dakar','Dakar','Diamagueune Sicap Mbao',14.748422,-17.352133,'google_maps','new'),
('courier','livreur','Teranga Express','+221 78 185 18 05','prospect_221781851805@nexusmarket.sn','','','15000',null,null,'google_maps','new'),
('courier','livreur','Wane et Diop','+221 77 117 02 97','prospect_221771170297@nexusmarket.sn','','','PMHH+PG6',null,null,'google_maps','new'),
('courier','livreur','YOOBEUL MOTO','+221 77 903 37 56','prospect_221779033756@nexusmarket.sn','','','17000',null,null,'google_maps','new'),
('courier','livreur','YoungTaf Livreur','+221 77 629 32 59','prospect_221776293259@nexusmarket.sn','','','QH7M+5F5',null,null,'google_maps','new')
on conflict (account_type,phone,name) do nothing;

-- ============================================================================
-- PROMOTION (copie de scripts/promote-prospects.sql, filtrée account_type='courier').
-- ============================================================================
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
      and account_type = 'courier'        -- ← ce script ne promeut QUE les livreurs/coursiers
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
