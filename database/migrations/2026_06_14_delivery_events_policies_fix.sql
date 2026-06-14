-- ============================================================================
-- Correctif policies RLS `delivery_events` — joindre orders sur la PK uuid
-- Audit 2026-06-14 (docs/audit-db-2026-06-14.md).
--
-- BUG corrigé : delivery_events.order_id est `uuid`, mais les policies le
-- comparaient à orders.id_old (text legacy). Or id_old = id pour seulement
-- 14 des 27 commandes → pour les 13 autres, l'acheteur/vendeur ne pouvait NI
-- lire NI insérer les delivery_events de sa propre commande (RLS faux négatif).
--
-- On repointe sur orders.id (uuid = uuid) : correct pour 100% des commandes,
-- et ça lève la dépendance à orders.id_old (qui peut alors être supprimée).
-- Sémantique inchangée par ailleurs (mêmes vérifs actor_id / vendor / admin).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS delivery_events_read_parties ON public.delivery_events;
CREATE POLICY delivery_events_read_parties ON public.delivery_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = delivery_events.order_id
        AND (o.buyer_id = auth.uid() OR o.vendor_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS delivery_events_insert_vendor_admin ON public.delivery_events;
CREATE POLICY delivery_events_insert_vendor_admin ON public.delivery_events
  FOR INSERT
  WITH CHECK (
    auth.uid() = actor_id
    AND (
      EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = delivery_events.order_id
          AND o.vendor_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );

COMMIT;
