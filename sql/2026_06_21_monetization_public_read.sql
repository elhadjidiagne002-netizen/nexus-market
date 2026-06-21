-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Monétisation : lecture publique des PRIX réglés par l'admin
--
--  app_config n'avait qu'une policy "admin full" → les acheteurs (anon) ne
--  pouvaient pas lire les tarifs (boosts, Pro, flash…) réglés dans le tableau de
--  bord. Résultat : changer un prix dans Admin → Monétisation n'avait aucun effet.
--
--  On ouvre la lecture publique de la SEULE clé de monétisation (prix non
--  sensibles). Les autres clés (config technique, WhatsApp…) restent admin-only.
--  Idempotent. ⚠️ À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS app_config_public_monet ON public.app_config;
CREATE POLICY app_config_public_monet ON public.app_config
  FOR SELECT USING (key = 'nexus_monetization_cfg');

COMMIT;
