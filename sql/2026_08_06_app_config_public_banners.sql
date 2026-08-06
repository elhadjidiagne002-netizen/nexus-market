-- ════════════════════════════════════════════════════════════════════════════
--  app_config — lecture publique (anon) de nexus_admin_banners.
--
--  Problème observé : les bannières du carrousel d'accueil publiées par l'admin
--  (app_config.nexus_admin_banners) n'étaient visibles QUE pour les visiteurs
--  CONNECTÉS. Les policies SELECT existantes n'ouvraient l'accès anon qu'à
--  'nexus_monetization_cfg' ; pour toute autre clé il fallait auth.role() =
--  'authenticated'. Résultat : un visiteur non connecté (le cas le plus courant
--  sur la home) retombait sur les bannières par défaut, tandis qu'un visiteur
--  connecté voyait les bannières admin → « pas toujours visible » selon l'état
--  de connexion. Le frontend public ne lit que 2 clés (nexus_monetization_cfg
--  déjà publique, nexus_admin_banners) → on ouvre la seconde en lecture seule.
--
--  Les bannières hero sont du contenu d'affichage 100% public (titre, sous-titre,
--  image, CTA) — aucune donnée sensible. Lecture seule ; l'écriture reste
--  réservée à l'admin (app_config_admin_all) et au service_role.
--
--  Idempotent (DROP POLICY IF EXISTS + CREATE).
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS app_config_public_banners ON public.app_config;
CREATE POLICY app_config_public_banners ON public.app_config
  FOR SELECT
  USING (key = 'nexus_admin_banners');
