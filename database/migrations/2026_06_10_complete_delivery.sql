-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Clôture d'une course + enregistrement du GAIN coursier
--  RPC complete_delivery(delivery_id) : à la livraison,
--    · marque la course 'delivered',
--    · crée la ligne de gain (courier_earnings, statut 'pending'),
--    · incrémente couriers.total_earned + deliveries_done,
--    · remet le coursier DISPONIBLE (is_available=true, courier_status='available').
--  Appelé par le coursier (ou un admin). courier_earnings.courier_id = couriers.id.
--  Idempotent (anti double-comptage via courier_earnings existant). À exécuter dans
--  Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public;

CREATE OR REPLACE FUNCTION public.complete_delivery(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d      deliveries%ROWTYPE;
  v_cid    uuid;          -- couriers.id
  v_uid    uuid := auth.uid();
  v_payout integer;
BEGIN
  SELECT * INTO v_d FROM public.deliveries WHERE id = p_delivery_id;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  -- Autorisation : le coursier assigné OU un admin.
  IF NOT (
    v_d.courier_id = v_uid
    OR EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = v_uid AND me.role = 'admin')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Déjà livrée → idempotent.
  IF v_d.status = 'delivered' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  UPDATE public.deliveries SET status = 'delivered', delivered_at = now() WHERE id = p_delivery_id;

  v_payout := COALESCE(v_d.courier_payout, 0);
  SELECT id INTO v_cid FROM public.couriers WHERE user_id = v_d.courier_id LIMIT 1;

  IF v_cid IS NOT NULL THEN
    -- Gain (une seule fois par course)
    IF NOT EXISTS (SELECT 1 FROM public.courier_earnings WHERE delivery_id = p_delivery_id) THEN
      INSERT INTO public.courier_earnings (courier_id, delivery_id, amount, type, status)
      VALUES (v_cid, p_delivery_id, v_payout, 'delivery', 'pending');
      UPDATE public.couriers
         SET total_earned   = COALESCE(total_earned, 0) + v_payout,
             deliveries_done = COALESCE(deliveries_done, 0) + 1
       WHERE id = v_cid;
    END IF;
    -- Coursier de nouveau disponible
    UPDATE public.couriers SET is_available = true WHERE id = v_cid;
  END IF;

  IF v_d.courier_id IS NOT NULL THEN
    UPDATE public.profiles
       SET courier_status = 'available',
           courier_trips  = COALESCE(courier_trips, 0) + 1
     WHERE id = v_d.courier_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'payout', v_payout, 'buyer_id', v_d.buyer_id, 'order_id', v_d.order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;
