-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — PRÉSENCE COURSIER : fraîcheur 30 min + auto-réparation inverse
--
--  CONTEXTE (2026-06-16) : « les commanditaires ne voient pas de livreur en ligne
--  alors qu'un livreur est en ligne et disponible ». Diagnostic sur la base
--  déployée :
--    · Le ping GPS du coursier (courier_ping) ne partait jamais (builder
--      supabase-js paresseux, sans .then) → position figée → coursier exclu par
--      le filtre de fraîcheur « < 15 min » de nearby_couriers/online_couriers_count.
--      → CORRIGÉ CÔTÉ FRONT (public/index.html : .then() sur le ping).
--    · Désync observé : `dame gueye` avait couriers.is_available=true MAIS
--      profiles.courier_status='offline' et un ping vieux de ~94 h → « disponible
--      en base » mais hors ligne en réalité.
--
--  CETTE MIGRATION (complément serveur, robustesse) :
--    1. Fenêtre de fraîcheur portée de 15 à 30 min dans nearby_couriers ET
--       online_couriers_count : tolère les coupures de ping sur mobile (timers
--       throttlés quand l'écran est verrouillé / l'onglet en arrière-plan). La
--       cascade reste « le plus proche d'abord » et le coursier voit la distance
--       et peut refuser → un coursier légèrement périmé ne bloque pas la course.
--    2. dispatch_tick_all gagne une AUTO-RÉPARATION INVERSE (bloc C2) : tout
--       coursier marqué is_available=true qui n'a PLUS l'intention d'être en ligne
--       (profiles.courier_status <> 'available') et SANS course en cours est remis
--       is_available=false → l'indicateur colle à la réalité (corrige dame gueye).
--
--  S'applique APRÈS 2026_06_12_dispatch_radius30_selfheal (reprend dispatch_tick_all
--  mode 'cascade_180s_r30', n'ajoute que le bloc C2 et la fenêtre 30 min).
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ── 1a. nearby_couriers : fraîcheur 15 → 30 min (signature inchangée) ─────────
CREATE OR REPLACE FUNCTION public.nearby_couriers(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_m  integer DEFAULT 7000,
  p_limit     integer DEFAULT 15
)
RETURNS TABLE (
  courier_id  uuid,
  user_id     uuid,
  name        text,
  phone       text,
  vehicle_type text,
  distance_km numeric,
  rating_avg  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.user_id,
    c.name,
    c.phone,
    c.vehicle_type,
    ROUND((ST_Distance(
      p.geolocation,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0)::numeric, 2) AS distance_km,
    c.rating_avg
  FROM public.couriers c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.is_available = true
    AND c.status = 'active'
    AND p.geolocation IS NOT NULL
    -- position fraîche (< 30 min) : tolère le throttling des timers mobiles
    AND (p.location_updated_at IS NULL OR p.location_updated_at > now() - interval '30 minutes')
    AND ST_DWithin(
          p.geolocation,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          GREATEST(p_radius_m, 0)
        )
  ORDER BY p.geolocation <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT GREATEST(p_limit, 1);
$$;

-- ── 1b. online_couriers_count : fraîcheur 15 → 30 min (rayon défaut 30 km) ────
CREATE OR REPLACE FUNCTION public.online_couriers_count(
  p_lat      double precision DEFAULT NULL,
  p_lng      double precision DEFAULT NULL,
  p_radius_m integer          DEFAULT 30000
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT count(*)::integer
  FROM public.couriers c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.is_available = true
    AND c.status = 'active'
    AND p.geolocation IS NOT NULL
    AND (p.location_updated_at IS NULL OR p.location_updated_at > now() - interval '30 minutes')
    AND (
      p_lat IS NULL OR p_lng IS NULL
      OR ST_DWithin(
           p.geolocation,
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
           GREATEST(COALESCE(p_radius_m, 30000), 0)
         )
    );
$$;

-- ── 2. dispatch_tick_all : + AUTO-RÉPARATION INVERSE (bloc C2) ────────────────
--     Reprend la version déployée (cascade_180s_r30) et ajoute C2.
CREATE OR REPLACE FUNCTION public.dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r RECORD; v_next jsonb; v_advanced integer := 0; v_healed integer := 0; v_notify jsonb := '[]'::jsonb;
BEGIN
  -- C) AUTO-RÉPARATION : coursier actif, voulu en ligne (courier_status =
  --    'available'), SANS course en cours, mais is_available=false (indicateur
  --    resté bloqué après une livraison/annulation) → on le remet disponible.
  UPDATE public.couriers c SET is_available = true
   WHERE c.status = 'active' AND c.is_available = false
     AND EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = c.user_id AND p.courier_status = 'available')
     AND NOT EXISTS (SELECT 1 FROM public.deliveries d
                      WHERE d.courier_id = c.user_id
                        AND d.status IN ('accepted','picked_up','in_transit'));
  GET DIAGNOSTICS v_healed = ROW_COUNT;

  -- C2) COHÉRENCE INVERSE : coursier marqué is_available=true mais qui n'a PLUS
  --     l'intention d'être en ligne (courier_status <> 'available') et SANS course
  --     en cours → remis is_available=false. Corrige l'état « disponible en base
  --     mais hors ligne à l'écran » (ex. is_available laissé true par
  --     complete_delivery alors que le coursier s'est déconnecté). N'affecte NI
  --     les coursiers volontairement en ligne NI ceux en course.
  UPDATE public.couriers c SET is_available = false
   WHERE c.is_available = true
     AND NOT EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = c.user_id AND p.courier_status = 'available')
     AND NOT EXISTS (SELECT 1 FROM public.deliveries d
                      WHERE d.courier_id = c.user_id
                        AND d.status IN ('accepted','picked_up','in_transit'));

  -- A) Offres actives EXPIRÉES (> 3 min sans réponse) → coursier suivant.
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa, o.id AS offer_id
      FROM public.deliveries d
      JOIN public.delivery_offers o ON o.delivery_id = d.id AND o.status = 'pending'
     WHERE d.status = 'searching' AND d.courier_id IS NULL
       AND o.expires_at IS NOT NULL AND o.expires_at < now()
  LOOP
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = r.offer_id;
    v_next := public._activate_next_offer(r.delivery_id);
    v_advanced := v_advanced + 1;
    IF v_next IS NOT NULL THEN
      v_notify := v_notify || jsonb_build_array(jsonb_build_object(
        'delivery_id', r.delivery_id, 'courier_id', v_next->>'courier_id', 'user_id', v_next->>'user_id',
        'name', v_next->>'name', 'phone', v_next->>'phone',
        'distance_km', (v_next->>'distance_km')::numeric,
        'pickup_label', r.pickup_label, 'dropoff_label', r.dropoff_label,
        'course_km', r.distance_km, 'courier_payout', r.courier_payout, 'fee_fcfa', r.fee_fcfa));
    END IF;
  END LOOP;

  -- B) FILET DE SÉCURITÉ : courses sans coursier et SANS offre active → ré-amorce.
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa
      FROM public.deliveries d
     WHERE d.courier_id IS NULL
       AND d.status IN ('searching','no_courier')
       AND d.pickup_lat IS NOT NULL AND d.pickup_lng IS NOT NULL
       AND d.created_at > now() - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM public.delivery_offers o
                        WHERE o.delivery_id = d.id AND o.status = 'pending')
     ORDER BY d.created_at ASC
     LIMIT 100
  LOOP
    v_next := public._activate_next_offer(r.delivery_id);
    IF v_next IS NOT NULL THEN
      v_advanced := v_advanced + 1;
      v_notify := v_notify || jsonb_build_array(jsonb_build_object(
        'delivery_id', r.delivery_id, 'courier_id', v_next->>'courier_id', 'user_id', v_next->>'user_id',
        'name', v_next->>'name', 'phone', v_next->>'phone',
        'distance_km', (v_next->>'distance_km')::numeric,
        'pickup_label', r.pickup_label, 'dropoff_label', r.dropoff_label,
        'course_km', r.distance_km, 'courier_payout', r.courier_payout, 'fee_fcfa', r.fee_fcfa));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('advanced', v_advanced, 'healed', v_healed,
                            'notify', v_notify, 'mode', 'cascade_180s_r30_fresh30');
END;
$$;

-- ── Droits (réaffirmés) ──────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.nearby_couriers(double precision, double precision, integer, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.online_couriers_count(double precision, double precision, integer)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick_all()                                                    TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
--  Vérification rapide après exécution :
--    SELECT public.online_couriers_count();          -- nb de livreurs éligibles
--    SELECT public.dispatch_tick_all();              -- doit renvoyer mode=…_fresh30
-- ════════════════════════════════════════════════════════════════════════════
