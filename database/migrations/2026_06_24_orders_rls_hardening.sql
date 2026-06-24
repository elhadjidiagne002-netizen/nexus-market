-- 2026_06_24_orders_rls_hardening.sql
-- ============================================================================
-- [SÉCURITÉ] Durcissement RLS de la table orders.
-- ============================================================================
-- Les policies RLS sont PERMISSIVES (OR) : une seule policy trop large suffit à
-- ouvrir une faille. Deux problèmes corrigés :
--
-- 1. IDOR / FUITE DE DONNÉES (critique)
--    La policy "Buyers read own orders" avait  qual = (auth.uid() IS NOT NULL).
--    Son nom dit « ses propres commandes » mais la condition est juste « être
--    connecté » → N'IMPORTE QUEL utilisateur connecté pouvait lire TOUTES les
--    commandes : noms, adresses, téléphones, montants, historique d'achat de
--    tous les clients. Vérifié : un acheteur ne voit plus que les SIENNES.
--
-- 2. INTÉGRITÉ / FRAUDE (élevé)
--    Les policies UPDATE "orders_update_own" et "Autoriser la mise à jour du
--    statut des commandes" (qual buyer_id OR vendor_id, with_check permissif)
--    laissaient un ACHETEUR modifier n'importe quelle colonne de SA commande,
--    par ex.  update({payment_status:'paid', status:'processing'})  → se faire
--    passer pour payé sans payer (le vendeur expédie). Vérifié : bloqué.
--
-- Policies CONSERVÉES (couvrent tous les flux légitimes — vérifié par tests) :
--   - orders_select_own_buyer / orders_select_own_vendor / "Users can read own
--     orders"  → lecture de SES commandes (acheteur/vendeur)
--   - orders_update_buyer_cancel_only  → l'acheteur peut UNIQUEMENT annuler
--     (pending/processing → cancelled)
--   - orders_update_vendor_or_admin    → le vendeur/admin met à jour le statut
--   - orders_admin_all / orders_admin_all_fixed → admin

DROP POLICY IF EXISTS "Buyers read own orders" ON public.orders;
DROP POLICY IF EXISTS "orders_update_own" ON public.orders;
DROP POLICY IF EXISTS "Autoriser la mise à jour du statut des commandes" ON public.orders;

-- NB résiduel (non corrigé ici, impact moindre, à valider avec le flux checkout) :
-- les policies INSERT "Allow authenticated insert" (with_check auth.role()=
-- 'authenticated') et "Buyers insert orders" (with_check auth.uid() IS NOT NULL)
-- permettent d'insérer une commande avec un buyer_id arbitraire. La policy
-- correcte orders_insert_buyer (buyer_id = auth.uid()) existe déjà. À durcir
-- une fois confirmé que la création de commande pose toujours buyer_id = self.
