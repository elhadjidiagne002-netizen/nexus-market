-- ============================================================================
-- Ajoute la bannière "NEXUS Éducation" au carrousel héro de l'accueil.
--
-- Constat : app_config.nexus_admin_banners (JSONB, 13 bannières) REMPLACE
-- entièrement le SLIDES codé en dur de public/index.html dès qu'il existe
-- (applyAdminBanners() écrase `slides`, ne fusionne jamais) — modifier
-- uniquement le fallback JS ne suffit donc pas en prod. Cette bannière a
-- aussi été ajoutée au fallback JS pour rester cohérente hors-ligne/repli.
--
-- Idempotent : ne rejoue rien si une bannière "NEXUS Éducation" existe déjà.
-- ============================================================================

UPDATE public.app_config
SET value = value || '[{
  "cls": "slide-2",
  "cta": "Découvrir",
  "sub": "Collège, lycée, université — téléchargement libre, sans inscription",
  "deco": "🎓",
  "badge": "🎓 NEXUS Éducation",
  "title": "Cours & exercices\nscolaires gratuits",
  "action": "nexus:open-education",
  "active": true
}]'::jsonb
WHERE key = 'nexus_admin_banners'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(value) b
    WHERE b->>'action' = 'nexus:open-education'
  );
