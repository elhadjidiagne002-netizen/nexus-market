-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Fiche du coursier assigné (vue mandataire)
--  RPC delivery_courier_card(delivery_id) : renvoie nom / note / téléphone /
--  véhicule du coursier assigné à une course, lisible par le MANDATAIRE de la
--  course (buyer) ou un admin. Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public;

CREATE OR REPLACE FUNCTION public.delivery_courier_card(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d deliveries%ROWTYPE;
  v_c RECORD;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_d FROM public.deliveries WHERE id = p_delivery_id;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  -- Autorisation : le mandataire (acheteur) OU un admin.
  IF NOT (
    v_d.buyer_id = v_uid
    OR EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = v_uid AND me.role = 'admin')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_d.courier_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'assigned', false);
  END IF;

  SELECT name, phone, vehicle_type, rating_avg, deliveries_done
    INTO v_c FROM public.couriers WHERE user_id = v_d.courier_id LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true, 'assigned', true,
    'name', v_c.name, 'phone', v_c.phone, 'vehicle_type', v_c.vehicle_type,
    'rating_avg', v_c.rating_avg, 'deliveries_done', v_c.deliveries_done,
    'status', v_d.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delivery_courier_card(uuid) TO authenticated;
