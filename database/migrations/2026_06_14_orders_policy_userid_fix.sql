-- ============================================================================
-- Correctif policy RLS `orders_update_buyer_cancel_only` — buyer_id au lieu de user_id
-- Audit 2026-06-14.
--
-- BUG corrigé : la policy autorisant un acheteur à annuler sa commande testait
-- `auth.uid() = user_id` (colonne legacy, doublon de buyer_id). Or buyer_id est
-- le canonique (user_id parfois NULL/différent) → certains acheteurs ne pouvaient
-- pas annuler. On repointe sur buyer_id : correct + lève la dépendance à user_id
-- (qui peut alors être supprimée par la consolidation).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS orders_update_buyer_cancel_only ON public.orders;
CREATE POLICY orders_update_buyer_cancel_only ON public.orders
  FOR UPDATE
  USING (auth.uid() = buyer_id AND status = ANY (ARRAY['pending'::text, 'processing'::text]))
  WITH CHECK (auth.uid() = buyer_id AND status = 'cancelled'::text);

COMMIT;
