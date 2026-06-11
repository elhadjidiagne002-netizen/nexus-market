-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — RPC track_delivery : suivi PUBLIC d'une course par lien
--
--  Permet d'afficher le suivi live d'une livraison à toute personne disposant
--  du lien /?track=<delivery_id> (UUID non devinable), SANS connexion ni RLS sur
--  la table deliveries. SECURITY DEFINER → renvoie uniquement des champs publics
--  de suivi (statut, points, position coursier, nom/contact du coursier).
--
--  Utilisé par DeliveryTrackingModal (front) en polling ~9 s.
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.track_delivery(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'id',             d.id,
    'status',         d.status,
    'pickup_label',   d.pickup_label,
    'dropoff_label',  d.dropoff_label,
    'pickup_lat',     d.pickup_lat,
    'pickup_lng',     d.pickup_lng,
    'dropoff_lat',    d.dropoff_lat,
    'dropoff_lng',    d.dropoff_lng,
    'courier_lat',    d.courier_lat,
    'courier_lng',    d.courier_lng,
    'distance_km',    d.distance_km,
    'fee_fcfa',       d.fee_fcfa,
    'courier_payout', d.courier_payout,
    'courier_id',     d.courier_id,
    'assigned_at',    d.assigned_at,
    'courier_name',   c.name,
    'courier_phone',  c.phone,
    'courier_vehicle', c.vehicle_type
  )
  FROM public.deliveries d
  LEFT JOIN public.couriers c ON c.user_id = d.courier_id
  WHERE d.id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.track_delivery(uuid) TO anon, authenticated;
