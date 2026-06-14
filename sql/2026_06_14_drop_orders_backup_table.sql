-- ============================================================================
-- Suppression de la table de backup obsolète _orders_backup_20260521 — Audit 2026-06-14
--
-- Snapshot figé de `orders` daté du 2026-05-21 (16 lignes), sans clé primaire,
-- 0 FK entrante, 0 vue dépendante. N'est référencée nulle part dans le code.
-- Encombrait le schéma. Suppression validée par l'utilisateur.
-- ============================================================================

DROP TABLE IF EXISTS public._orders_backup_20260521;
