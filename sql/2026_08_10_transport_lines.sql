-- ════════════════════════════════════════════════════════════════════════════
--  LIGNES DE TRANSPORT RÉGULIÈRES (inter-villes) + RÉCURRENCES
--  Distinct du covoiturage (transport_trips = départ unique daté). Ici : des
--  LIGNES commerciales programmées (DDD, Salam, ferry COSAMA, 7-places, VTC…)
--  avec une ou plusieurs RÉCURRENCES (quotidien, plusieurs par jour,
--  hebdomadaire à jours fixes, sur demande, jours d'événement type Magal…).
--
--  Alimenté par l'importateur (nexus_importer.html, onglet « Transport »)
--  depuis prospection/transport_dakar_regions_senegal.csv.
--
--  Convention monétaire : prix en FCFA (int), cohérent avec transport_trips /
--  couriers (fee_fcfa). PAS d'EUR ici (≠ products/orders).
--
--  À exécuter dans Supabase → SQL Editor (idempotent, rejouable).
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. transport_lines — la ligne commerciale (le « trajet » régulier) ──────
CREATE TABLE IF NOT EXISTS public.transport_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator              text NOT NULL,                 -- Compagnie
  page_name             text,                          -- Nom_page
  page_type             text,                          -- Type_page (page_officielle, annuaire, profil_pro, groupe)
  vehicle_type          text NOT NULL DEFAULT 'bus'
                          CHECK (vehicle_type IN ('bus','minibus','voiture','7_places','ferry','van')),
  origin_city           text NOT NULL,                 -- Destination_depuis
  origin_gare           text,                          -- Gare_depart
  origin_address        text,                          -- Adresse_gare
  origin_quartier       text,                          -- Quartier
  origin_region         text,                          -- Region
  destinations          text NOT NULL,                 -- Destinations (liste brute « A|B|C »)
  destination_main      text,                          -- 1re destination (dérivée)
  arrival_gare          text,                          -- Gare_arrivee
  arrival_address       text,                          -- Adresse_gare_arrivee
  phone                 text,                          -- Telephone (1er si multiples)
  phones_all            text,                          -- Telephone brut (peut contenir « |… »)
  whatsapp              text,                          -- WhatsApp
  email                 text,                          -- Email
  url_facebook          text,
  url_site              text,
  url_group_facebook    text,
  price_fcfa            integer,                        -- Prix_fcfa (NULL si « variable »)
  price_vip_fcfa        integer,                        -- Tarif_vip_fcfa
  price_child_fcfa      integer,                        -- Tarif_enfant_fcfa
  price_luggage         text,                           -- Tarif_bagage_fcfa (souvent « 1000 FCFA/pièce »)
  duration              text,                           -- Duree_trajet (« 3h00 », « 22h-36h »…)
  seats                 integer,                        -- Nb_places (NULL si « variable »)
  climatise             boolean,                        -- Climatise
  escales               text,                           -- Escales
  services              text,                           -- Services_bord
  reservation           boolean,                        -- Reservation (oui/non)
  luggage_included      text,                           -- Bagages_inclus
  reservation_mode      text,                           -- Mode_reservation
  reservation_delay     text,                           -- Delai_reservation
  horaire_depart_raw    text,                           -- Horaire_depart brut (peut être « 04h30 à 00h30 (…) »)
  horaire_arrivee_raw   text,                           -- Horaire_arrivee brut
  notes                 text,                           -- Notes
  lat                   double precision,               -- Latitude
  lng                   double precision,               -- Longitude
  source                text,                           -- Source
  collected_at          date,                           -- Date_collecte
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Clé de dédup pour un ré-import 100 % idempotent (upsert onConflict).
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_lines_key
  ON public.transport_lines (operator, origin_city, destinations, vehicle_type);

CREATE INDEX IF NOT EXISTS idx_transport_lines_search
  ON public.transport_lines (origin_city, destination_main)
  WHERE active = true;

-- ─── 2. transport_recurrences — la fréquence/le calendrier d'une ligne ───────
--  kind normalise Frequence + Jours_operation en un type exploitable par l'UI :
--    daily            = tous les jours (« quotidien »)
--    multiple_daily   = plusieurs départs par jour (« plusieurs_par_jour »)
--    weekly           = jours fixes dans la semaine (« hebdomadaire », « Mar|Ven »…)
--    on_demand        = sur réservation (« sur_demande »)
--    special_event    = jours d'événement (« Jours Magal uniquement », « 15 Août »)
--  days_of_week / excluded_days : tokens FR (Lun,Mar,Mer,Jeu,Ven,Sam,Dim).
--  departure_times : horaires de départ éclatés (« 07h00|15h00 » → {07h00,15h00}).
CREATE TABLE IF NOT EXISTS public.transport_recurrences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id           uuid NOT NULL REFERENCES public.transport_lines(id) ON DELETE CASCADE,
  kind              text NOT NULL DEFAULT 'daily'
                      CHECK (kind IN ('daily','multiple_daily','weekly','on_demand','special_event')),
  frequence_raw     text,                    -- valeur brute de la colonne Frequence
  jours_raw         text,                    -- valeur brute de la colonne Jours_operation
  days_of_week      text[] NOT NULL DEFAULT '{}',   -- jours d'opération (weekly/daily partiel)
  excluded_days     text[] NOT NULL DEFAULT '{}',   -- « quotidien sauf Sam » → {Sam}
  departure_times   text[] NOT NULL DEFAULT '{}',   -- horaires de départ
  arrival_times     text[] NOT NULL DEFAULT '{}',   -- horaires d'arrivée
  special_label     text,                    -- ex. « Jours Magal uniquement », « 15 Août »
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_recur_line ON public.transport_recurrences (line_id);
-- Une seule récurrence par (ligne, jours bruts) → ré-import idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_recur_key
  ON public.transport_recurrences (line_id, COALESCE(jours_raw, ''), COALESCE(frequence_raw, ''));

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
--  Lecture publique des lignes actives (catalogue transport, non sensible).
--  Écriture réservée à l'admin (import via service_role qui bypasse la RLS).
ALTER TABLE public.transport_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_recurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transport_lines_public_read ON public.transport_lines;
CREATE POLICY transport_lines_public_read ON public.transport_lines
  FOR SELECT USING (active = true);
DROP POLICY IF EXISTS transport_lines_admin_all ON public.transport_lines;
CREATE POLICY transport_lines_admin_all ON public.transport_lines
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS transport_recur_public_read ON public.transport_recurrences;
CREATE POLICY transport_recur_public_read ON public.transport_recurrences
  FOR SELECT USING (
    line_id IN (SELECT id FROM public.transport_lines WHERE active = true)
  );
DROP POLICY IF EXISTS transport_recur_admin_all ON public.transport_recurrences;
CREATE POLICY transport_recur_admin_all ON public.transport_recurrences
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Lecture par le rôle anon/authenticated (le GRANT est nécessaire EN PLUS de la
-- RLS — cf. mémoire orders-update-grant-403 : policy ≠ suffisante sans GRANT).
GRANT SELECT ON public.transport_lines TO anon, authenticated;
GRANT SELECT ON public.transport_recurrences TO anon, authenticated;
