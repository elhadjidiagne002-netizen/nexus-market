-- ============================================================================
-- Consolidation orders — Étape 2 (différée) : drop de la colonne miroir amount_eur
-- Suite de 2026_06_14_orders_columns_consolidation.sql.
--
-- Prérequis (REMPLI le 2026-06-14) : le relevé vendeur (public/index.html) lisait
-- `r.amount_eur`. Correctif déployé en prod (commit 02f3d56) → lecture désormais
-- `total ?? amount_eur ?? 0`. amount_eur n'est donc plus lue nulle part (code + base).
-- Canonique montant = `total` (EUR). amount_eur = miroir mort (= total à l'ère
-- ancienne, 0 ensuite). 0 dépendance (policy/vue) vérifiée avant exécution.
-- ============================================================================

ALTER TABLE public.orders DROP COLUMN IF EXISTS amount_eur;
