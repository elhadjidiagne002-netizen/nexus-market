-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — DISPATCH : CORRECTIF REFUS COURSIER (2026-06-19)
--
--  PROBLÈME SIGNALÉ : « les courses refusées par le coursier ne sont ni
--  placées en attente ni réattribuées ».
--
--  DEUX CAUSES IDENTIFIÉES :
--
--  1. _activate_next_offer : exclusion PERMANENTE des coursiers déjà sollicités
--     (WHERE n.user_id NOT IN (SELECT courier_id FROM delivery_offers ...)).
--     Dès que tous les coursiers proches ont refusé/expiré une première fois,
--     la file est vide, aucun nouveau coursier n'est trouvé, la course passe
--     en no_courier et Y RESTE INDÉFINIMENT — le filet de sécurité (cron)
--     échoue aussi car il appelle la même fonction bloquée.
--     → CORRECTIF : 2ème passe de re-scan avec un cooldown de 10 minutes :
--       après 10 min, un coursier qui avait refusé/expiré peut être ré-sollicité.
--
--  2. decline_delivery : rejet si delivery.status ≠ 'searching'. Quand les
--     3 minutes s'écoulent (dispatch_tick_all expire l'offre et passe la
--     livraison en no_courier) JUSTE AVANT que le coursier clique « Refuser »,
--     le clic est silencieusement rejeté ('not_searching') — la livraison ne
--     réessaie jamais de cascader.
--     → CORRECTIF : accepter no_courier et pending ; marquer l'offre expired
--       comme declined ; remettre la livraison en searching avant le cascade.
--
--  S'applique APRÈS 2026_06_16_courier_presence_freshness_selfheal.
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ── _activate_next_offer : 2ème passe cooldown 10 min ─────────────────────────
CREATE OR REPLACE FUNCTION public._activate_next_offer(p_delivery_id uuid, p_duree_s integer DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_off RECORD; v_c RECORD; v_d RECORD;
  v_guard integer := 0; v_inserted integer := 0;
BEGIN
  SELECT pickup_lat, pickup_lng, pickup_label, dropoff_label, courier_payout
    INTO v_d FROM public.deliveries WHERE id = p_delivery_id;

  -- Anti-doublon : une offre déjà active ? on la renvoie telle quelle.
  SELECT o.* INTO v_off FROM public.delivery_offers o
   WHERE o.delivery_id = p_delivery_id AND o.status = 'pending' ORDER BY o.seq ASC LIMIT 1;
  IF FOUND THEN
    SELECT c.user_id, c.name, c.phone INTO v_c FROM public.couriers c WHERE c.user_id = v_off.courier_id;
    RETURN jsonb_build_object('courier_id', v_off.courier_id, 'user_id', v_off.courier_id,
                              'name', v_c.name, 'phone', v_c.phone, 'distance_km', v_off.distance_km,
                              'expires_at', v_off.expires_at);
  END IF;

  LOOP
    v_guard := v_guard + 1; IF v_guard > 80 THEN EXIT; END IF;

    SELECT o.* INTO v_off FROM public.delivery_offers o
     WHERE o.delivery_id = p_delivery_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;

    IF NOT FOUND THEN
      IF v_d.pickup_lat IS NOT NULL THEN

        -- 1ère passe : coursiers jamais sollicités pour cette livraison.
        INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
        SELECT p_delivery_id, n.user_id, n.distance_km, 'queued',
               COALESCE((SELECT MAX(seq) FROM public.delivery_offers WHERE delivery_id = p_delivery_id), -1)
                 + ROW_NUMBER() OVER (ORDER BY n.distance_km)
        FROM public.nearby_couriers(v_d.pickup_lat, v_d.pickup_lng, 30000, 20) n
        WHERE n.user_id NOT IN (
          SELECT courier_id FROM public.delivery_offers WHERE delivery_id = p_delivery_id
        );
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        -- 2ème passe (cooldown 10 min) : si aucun nouveau coursier trouvé, ré-inclure
        -- ceux qui ont refusé ou expiré il y a > 10 min. Permet de sortir du blocage
        -- no_courier quand seul 1–2 coursiers sont disponibles dans la zone.
        IF v_inserted = 0 THEN
          INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
          SELECT p_delivery_id, n.user_id, n.distance_km, 'queued',
                 COALESCE((SELECT MAX(seq) FROM public.delivery_offers WHERE delivery_id = p_delivery_id), -1)
                   + ROW_NUMBER() OVER (ORDER BY n.distance_km)
          FROM public.nearby_couriers(v_d.pickup_lat, v_d.pickup_lng, 30000, 20) n
          WHERE n.user_id NOT IN (
            -- Exclure : offres encore actives OU refus/expirations récents (< 10 min)
            SELECT courier_id FROM public.delivery_offers
            WHERE delivery_id = p_delivery_id
              AND (status IN ('queued', 'pending', 'accepted')
                   OR responded_at > now() - interval '10 minutes')
          );
        END IF;

        SELECT o.* INTO v_off FROM public.delivery_offers o
         WHERE o.delivery_id = p_delivery_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;
      END IF;
    END IF;

    IF NOT FOUND THEN
      UPDATE public.deliveries SET status = 'no_courier'
       WHERE id = p_delivery_id AND status IN ('searching', 'pending');
      RETURN NULL;
    END IF;

    -- Coursier encore réellement disponible ? (user_id = auth.uid)
    SELECT c.user_id, c.name, c.phone, c.is_available, c.status
      INTO v_c FROM public.couriers c WHERE c.user_id = v_off.courier_id;
    IF NOT FOUND OR v_c.is_available IS NOT TRUE OR v_c.status <> 'active' THEN
      UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = v_off.id;
      CONTINUE;
    END IF;

    -- Activer l'offre : le coursier a p_duree_s secondes (défaut 3 min).
    UPDATE public.delivery_offers
       SET status = 'pending', offered_at = now(),
           expires_at = now() + make_interval(secs => GREATEST(p_duree_s, 10))
     WHERE id = v_off.id;
    UPDATE public.deliveries SET status = 'searching'
     WHERE id = p_delivery_id AND status IN ('no_courier', 'pending');

    -- Notification in-app (cloche) au coursier — best-effort.
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, link, read)
      VALUES (v_off.courier_id, 'offer',
              '🛵 Nouvelle course — 3 min pour accepter',
              COALESCE(v_d.pickup_label, 'Retrait') || ' → ' || COALESCE(v_d.dropoff_label, 'Livraison')
                || CASE WHEN v_d.courier_payout IS NOT NULL
                        THEN ' · ' || v_d.courier_payout || ' FCFA' ELSE '' END,
              '/', false);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object('courier_id', v_off.courier_id, 'user_id', v_off.courier_id,
                              'name', v_c.name, 'phone', v_c.phone, 'distance_km', v_off.distance_km,
                              'expires_at', now() + make_interval(secs => GREATEST(p_duree_s, 10)));
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── decline_delivery : accepte no_courier + expired + pending ─────────────────
CREATE OR REPLACE FUNCTION public.decline_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_next jsonb; v_row deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;

  -- Déjà attribuée à un autre coursier → impossible de refuser.
  IF v_row.courier_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;
  -- Statuts terminaux (livrée, annulée, etc.) → sans objet.
  IF v_row.status NOT IN ('searching', 'no_courier', 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_applicable');
  END IF;

  -- Marquer l'offre comme refusée — accepte aussi 'expired' car le coursier peut
  -- cliquer « Refuser » juste après l'expiration des 3 min (race condition UX).
  UPDATE public.delivery_offers SET status = 'declined', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id
     AND status IN ('pending', 'expired');

  -- Si la livraison était tombée en no_courier (tous les délais expirés avant
  -- ce refus explicite), la remettre en searching pour relancer la cascade.
  UPDATE public.deliveries SET status = 'searching'
   WHERE id = p_delivery_id AND status = 'no_courier' AND courier_id IS NULL;

  v_next := public._activate_next_offer(p_delivery_id);
  RETURN jsonb_build_object(
    'ok', true,
    'exhausted', (v_next IS NULL),
    'next_courier', v_next,
    'notified_couriers', CASE WHEN v_next IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_next) END,
    'pickup_label',   v_row.pickup_label,
    'dropoff_label',  v_row.dropoff_label,
    'distance_km',    v_row.distance_km,
    'courier_payout', v_row.courier_payout,
    'fee_fcfa',       v_row.fee_fcfa
  );
END;
$$;

-- ── Droits (réaffirmés) ──────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._activate_next_offer(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_delivery(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  Vérification après exécution :
--    SELECT public.decline_delivery('<delivery_id>', '<courier_user_id>');
--    -- doit retourner { "ok": true, "exhausted": false/true, ... }
-- ════════════════════════════════════════════════════════════════════════════
