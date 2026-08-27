-- ============================================================================
-- Réactive les produits désactivés par erreur + approuve tous les produits
-- en attente de modération.
--
-- Constat : 599/651 produits sont déjà actifs et visibles publiquement mais
-- moderated=false, ce qui les fait apparaître comme "en attente d'approbation"
-- dans le panneau admin "Produits" (view === "products") — sans effet sur la
-- visibilité réelle du site (le storefront filtre sur `active`, pas
-- `moderated`), mais génère un badge/liste d'attente encombrant en continu.
-- 5 produits électroniques légitimes (Tondeuse Nova, 2x Dell Latitude,
-- Lenovo ThinkPad, câble Tecno) étaient aussi active=false sans raison
-- apparente — réactivés ici. « beignet » et « le coran » restent
-- délibérément désactivés (test factice / contenu protégé par le droit
-- d'auteur — cf. sql/2026_08_26_delete_fake_seed_products.sql et l'audit
-- AdSense du 2026-08-26) : à NE PAS réactiver.
--
-- Idempotent : rejouer ce script ne change plus rien à la 2e exécution.
-- ============================================================================

UPDATE public.products
SET active = true
WHERE active = false
  AND id NOT IN ('55f366bc-6df8-4276-9d79-578b73c2a038', '3fa56acd-b2ad-418b-8461-53e95b94639e');

UPDATE public.products
SET moderated = true
WHERE moderated = false;
