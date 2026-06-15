-- ============================================================================
-- FIX CRITIQUE — triggers/RPC référençant des colonnes orders SUPPRIMÉES
-- Suite à la consolidation (drop de amount_eur/user_id/canceled_at/order_total/
-- amount_fcfa/id_old), des fonctions plpgsql référencent encore ces colonnes
-- dans leur CORPS (non détecté au DROP : plpgsql est résolu à l'exécution).
-- Symptôme : toute création/maj de commande échoue avec
--   ERROR 42703: record "new" has no field "amount_eur"
-- -> create_order_atomic 400, insert orders 400, checkout cassé, emails non envoyés.
-- ============================================================================

-- 1) sync_order_total : ne synchronisait QUE total <-> amount_eur (colonne supprimée)
--    => entièrement obsolète. On retire le trigger ET la fonction.
DROP TRIGGER IF EXISTS trg_sync_order_total ON public.orders;
DROP FUNCTION IF EXISTS public.sync_order_total();

-- 2) sync_orders_columns : on retire les blocs des colonnes supprimées
--    (amount_eur, user_id, canceled_at) et on conserve products<->items,
--    le garde-fou items NOT NULL, et le garde-fou currency.
CREATE OR REPLACE FUNCTION public.sync_orders_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- products <-> items
  IF NEW.products IS NULL AND NEW.items IS NOT NULL THEN NEW.products := NEW.items; END IF;
  IF NEW.items    IS NULL AND NEW.products IS NOT NULL THEN NEW.items    := NEW.products; END IF;
  IF NEW.items    IS NULL THEN NEW.items := '[]'::jsonb; END IF;  -- garde-fou NOT NULL
  -- currency garde-fou
  IF NEW.currency IS NULL THEN NEW.currency := 'XOF'; END IF;
  RETURN NEW;
END;
$$;

-- 3) get_vendor_revenue_series : SUM(amount_eur) -> SUM(total) (montant canonique)
CREATE OR REPLACE FUNCTION public.get_vendor_revenue_series(p_vendor_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(day date, revenue numeric, orders bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', o.created_at)::DATE   AS day,
    COALESCE(SUM(o.total), 0)                AS revenue,
    COUNT(*)                                  AS orders
  FROM orders o
  WHERE
    (
      o.vendor_id = p_vendor_id
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE jsonb_typeof(o.items) WHEN 'array' THEN o.items ELSE '[]'::jsonb END
        ) item
        WHERE item->>'vendor' = p_vendor_id::TEXT OR item->>'vendorId' = p_vendor_id::TEXT
      )
    )
    AND o.created_at >= v_start
    AND o.status NOT IN ('cancelled', 'failed', 'refunded')
  GROUP BY DATE_TRUNC('day', o.created_at)::DATE
  ORDER BY day ASC;
END;
$$;
