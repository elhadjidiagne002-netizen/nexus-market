-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Notation des coursiers (moyenne glissante)
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
--
--  · couriers.rating_avg existe déjà (default 5.0) mais sans compteur.
--  · On ajoute rating_count + deliveries.courier_rating (1 note par course).
--  · RPC rate_courier(delivery_id, stars) : met à jour la moyenne de façon
--    atomique et empêche la double notation d'une même course.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS courier_rating smallint;

CREATE OR REPLACE FUNCTION public.rate_courier(p_delivery_id uuid, p_stars integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_courier uuid;
  v_already smallint;
  v_avg numeric;
  v_cnt integer;
BEGIN
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_stars');
  END IF;

  SELECT courier_id, courier_rating INTO v_courier, v_already
    FROM public.deliveries WHERE id = p_delivery_id;

  IF v_courier IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_courier');
  END IF;
  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_rated');
  END IF;

  -- Note enregistrée sur la course (verrou anti double-notation)
  UPDATE public.deliveries SET courier_rating = p_stars WHERE id = p_delivery_id;

  -- Moyenne glissante sur la fiche coursier
  SELECT COALESCE(rating_avg, 5.0), COALESCE(rating_count, 0)
    INTO v_avg, v_cnt FROM public.couriers WHERE id = v_courier;

  UPDATE public.couriers
     SET rating_avg = ROUND(((v_avg * v_cnt) + p_stars) / (v_cnt + 1), 2),
         rating_count = v_cnt + 1
   WHERE id = v_courier;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_courier(uuid, integer) TO authenticated;
