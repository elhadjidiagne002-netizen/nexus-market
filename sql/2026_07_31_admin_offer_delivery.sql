-- ============================================================================
-- NEXUS Market — 2026-07-31
-- admin_offer_delivery : l'admin PROPOSE une course à un coursier même hors ligne
-- ----------------------------------------------------------------------------
-- Problème résolu
--   Jusqu'ici l'admin n'avait que deux options sur une course sans coursier :
--     • « Assigner » (admin_assign_delivery) → attribution FORCÉE : la course
--       passe directement en 'accepted' au nom d'un coursier qui n'a rien accepté
--       et qui n'est peut-être même pas devant son téléphone ;
--     • « 🤖 Auto » → ne considère que les coursiers EN LIGNE (nearby_couriers
--       filtre is_available = true + position fraîche < 30 min). Quand personne
--       n'est en ligne — le cas courant en heures creuses — il ne trouve rien.
--
--   Il manquait l'entre-deux : proposer la course à un coursier précis, hors
--   ligne, et le pousser à se connecter pour l'accepter LUI-MÊME.
--
-- Ce que fait cette fonction
--   1. Met le coursier « en ligne » côté serveur (couriers.is_available = true,
--      profiles.courier_status = 'online') — c'est ce que l'admin veut dire par
--      « le mettre en ligne même s'il ne l'est pas ». Optionnel (p_force_online).
--   2. Crée une OFFRE ciblée dans delivery_offers (status 'pending', seq = -5
--      pour passer avant toute la cascade), avec une expiration LONGUE (15 min
--      par défaut, contre 40 s pour la cascade automatique) : le coursier doit
--      avoir le temps d'ouvrir WhatsApp, puis l'application.
--   3. Neutralise les autres offres en cours sur cette course pour éviter que
--      deux coursiers voient la même course « réservée pour eux ».
--
--   La course N'EST PAS attribuée : le coursier reste libre d'accepter ou non.
--   accept_delivery() exige justement une offre 'pending' à son nom — c'est ce
--   qui rend l'acceptation possible depuis son tableau de bord.
--
-- Reprise normale du dispatch
--   Passé le délai, dispatch_tick expire l'offre et _activate_next_offer relance
--   la cascade habituelle. Aucune course ne reste bloquée si le coursier ignore
--   le message.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_offer_delivery(
  p_delivery_id  uuid,
  p_courier_id   uuid,                 -- = couriers.user_id (= auth.uid du coursier)
  p_minutes      integer DEFAULT 15,
  p_force_online boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row       public.deliveries%ROWTYPE;
  v_c         RECORD;
  v_min       integer;
  v_expires   timestamptz;
  v_was_online boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin requis'; END IF;

  -- Borne le délai : trop court = inutile (le coursier n'a pas le temps
  -- d'ouvrir l'app), trop long = la course reste gelée sur un seul coursier.
  v_min := LEAST(GREATEST(COALESCE(p_minutes, 15), 2), 120);

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'course_introuvable');
  END IF;
  IF v_row.courier_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_attribuee');
  END IF;
  IF v_row.status NOT IN ('pending', 'searching', 'no_courier') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'statut_non_proposable',
                              'status', v_row.status);
  END IF;

  SELECT c.user_id, c.name, c.status, c.is_available, c.vehicle_type,
         COALESCE(NULLIF(c.phone, ''), p.phone) AS phone,
         COALESCE(NULLIF(p.wave_phone, ''), NULLIF(p.orange_phone, ''),
                  NULLIF(c.phone, ''), p.phone) AS whatsapp,
         (c.is_available = true
          AND p.location_updated_at > now() - interval '30 minutes') AS is_online
    INTO v_c
    FROM public.couriers c
    JOIN public.profiles p ON p.id = c.user_id
   WHERE c.user_id = p_courier_id;

  IF v_c.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'coursier_introuvable');
  END IF;
  -- Un coursier suspendu ou non encore approuvé ne doit pas recevoir de course :
  -- le forcer en ligne contournerait la décision de modération.
  IF v_c.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'coursier_non_actif',
                              'courier_status', v_c.status);
  END IF;

  v_was_online := COALESCE(v_c.is_online, false);

  IF p_force_online THEN
    UPDATE public.couriers
       SET is_available = true, updated_at = now()
     WHERE user_id = p_courier_id;
    -- 'available' est la valeur CANONIQUE côté application (setCourierStatus
    -- l'écrit, le panneau admin filtre dessus) — surtout pas 'online', qui
    -- n'existe nulle part ailleurs. Pas 'busy' non plus : il n'a rien accepté.
    -- location_updated_at est volontairement LAISSÉ TEL QUEL : le rafraîchir
    -- ferait croire à une position fraîche que le coursier n'a pas envoyée, et
    -- nearby_couriers le proposerait à des clients sur une position périmée.
    UPDATE public.profiles
       SET courier_status = 'available'
     WHERE id = p_courier_id;
  END IF;

  -- Une seule offre active à la fois sur une course donnée.
  UPDATE public.delivery_offers
     SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id
     AND status IN ('pending', 'queued');

  v_expires := now() + make_interval(mins => v_min);

  INSERT INTO public.delivery_offers
    (delivery_id, courier_id, status, seq, offered_at, expires_at, distance_km)
  VALUES
    (p_delivery_id, p_courier_id, 'pending', -5, now(), v_expires, NULL);

  -- 'searching' est l'état attendu par accept_delivery (et par le suivi client).
  UPDATE public.deliveries
     SET status = 'searching'
   WHERE id = p_delivery_id AND status <> 'searching';

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;

  RETURN jsonb_build_object(
    'ok', true,
    'delivery_id',   p_delivery_id,
    'expires_at',    v_expires,
    'minutes',       v_min,
    'forced_online', (p_force_online AND NOT v_was_online),
    'was_online',    v_was_online,
    'courier', jsonb_build_object(
      'user_id',  v_c.user_id,
      'name',     v_c.name,
      'phone',    v_c.phone,
      'whatsapp', v_c.whatsapp,
      'vehicle',  v_c.vehicle_type
    ),
    -- ⚠️ `deliveries` n'a PAS de pickup_city / delivery_city : ces noms n'existent
    -- que dans le mapping JS du panneau admin. Les vraies colonnes sont
    -- pickup_label / pickup_zone et dropoff_label / dropoff_zone.
    'delivery', jsonb_build_object(
      'pickup_label',   COALESCE(v_row.pickup_label,  v_row.pickup_zone),
      'dropoff_label',  COALESCE(v_row.dropoff_label, v_row.dropoff_zone),
      'pickup_city',    v_row.pickup_zone,
      'delivery_city',  v_row.dropoff_zone,
      'items_desc',     v_row.items_desc,
      'distance_km',    v_row.distance_km,
      'courier_payout', v_row.courier_payout,
      'fee_fcfa',       v_row.fee_fcfa
    )
  );
END;
$function$;

-- ⚠️ REVOKE FROM PUBLIC ne suffit PAS ici : les privilèges par défaut Supabase
-- (ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated)
-- accordent EXECUTE à `anon` DIRECTEMENT, pas via PUBLIC. Il faut le révoquer
-- nommément, sinon has_function_privilege('anon', …) reste true.
REVOKE ALL ON FUNCTION public.admin_offer_delivery(uuid, uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_offer_delivery(uuid, uuid, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_delivery(uuid, uuid, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_offer_delivery(uuid, uuid, integer, boolean) IS
  'Admin : propose (sans attribuer) une course à un coursier, en le remettant en ligne. Crée une offre pending prioritaire à expiration longue.';

-- ----------------------------------------------------------------------------
-- Événement de notification : rend l'envoi WhatsApp pilotable depuis l'admin.
-- whatsapp_enabled = true EXPLICITEMENT — le défaut de la colonne est false,
-- ce qui ferait silencieusement sauter l'envoi (gating serveur ET client).
-- ----------------------------------------------------------------------------
INSERT INTO public.notification_events
  (event_key, label, category, description, email_enabled, whatsapp_enabled, sort_order)
VALUES
  ('courier_offer', 'Course proposée à un coursier', 'admin',
   'WhatsApp envoyé au coursier quand l''admin lui propose une course et le remet en ligne.',
   false, true, 63)
ON CONFLICT (event_key) DO NOTHING;
