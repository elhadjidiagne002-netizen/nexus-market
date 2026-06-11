-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — dispatch_tick_all() : avance TOUTES les cascades coursier dont
--  l'offre active a expiré (timeout), même si aucun mandataire ne regarde l'écran.
--  Appelée par le cron /cron/dispatch (GET externe ~1/min).
--
--  Idempotent. Prérequis : 2026_06_09_courier_dispatch.sql (_activate_next_offer).
--  À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r RECORD;
  v_next jsonb;
  v_advanced integer := 0;
  v_notify jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa, o.id AS offer_id
      FROM public.deliveries d
      JOIN public.delivery_offers o
        ON o.delivery_id = d.id AND o.status = 'pending'
     WHERE d.status = 'searching'
       AND d.courier_id IS NULL
       AND o.expires_at IS NOT NULL
       AND o.expires_at < now()
  LOOP
    -- L'offre active a expiré → on la marque et on active le coursier suivant.
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
     WHERE id = r.offer_id;

    v_next := public._activate_next_offer(r.delivery_id, 45);
    v_advanced := v_advanced + 1;

    IF v_next IS NOT NULL THEN
      v_notify := v_notify || jsonb_build_array(jsonb_build_object(
        'delivery_id',   r.delivery_id,
        'courier_id',    v_next->>'courier_id',
        'user_id',       v_next->>'user_id',
        'name',          v_next->>'name',
        'phone',         v_next->>'phone',
        'distance_km',   (v_next->>'distance_km')::numeric,
        'pickup_label',  r.pickup_label,
        'dropoff_label', r.dropoff_label,
        'course_km',     r.distance_km,
        'courier_payout', r.courier_payout,
        'fee_fcfa',      r.fee_fcfa
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('advanced', v_advanced, 'notify', v_notify);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_tick_all() TO authenticated;
