-- ============================================================================
-- ORG CFG : coordonnées légales (email, tél, adresse), email contact/RGPD et
-- liens sociaux, éditables depuis le panneau admin. Une seule clé app_config
-- pour éviter la dispersion (email perso + tél perso + JSON-LD étaient figés
-- dans 6+ fichiers, cf. audit 2026-08-23).
--
-- Lu par : functions/cgu.js, functions/confidentialite.js, functions/contact.js,
--          functions/a-propos.js, functions/api/org-cfg.js (bundle client),
--          public/index.html (JSON-LD, bouton FB footer, iframe FB, redirect).
--
-- La policy `app_config_public_banners` (2026_08_06) ouvre déjà la lecture anon
-- à la clé 'nexus_admin_banners' — on l'étend ici à 'nexus_org_cfg' (contenu
-- 100% public : email pro, liens sociaux, adresse officielle, nom légal).
-- Le numéro de téléphone légal reste dans la config mais N'EST PAS renvoyé par
-- functions/api/org-cfg.js (protection défensive au cas où un admin y saisirait
-- un numéro perso — les pages SSR CGU/Confidentialité y ont accès directement).
--
-- Idempotent (INSERT ... ON CONFLICT + DROP/CREATE POLICY).
-- ============================================================================

insert into public.app_config (key, value)
values (
  'nexus_org_cfg',
  '{
    "legal_name": "NEXUS Market",
    "legal_email": "nx@nexusmarket.sn",
    "legal_phone": "",
    "legal_address": "Dakar, Sénégal",
    "contact_email": "nx@nexusmarket.sn",
    "rgpd_email": "nx@nexusmarket.sn",
    "facebook_url": "https://www.facebook.com/1233022656551601",
    "facebook_page_id": "1233022656551601",
    "instagram_url": "",
    "tiktok_url": "",
    "twitter_url": "",
    "linkedin_url": "",
    "youtube_url": ""
  }'::jsonb
)
on conflict (key) do nothing;

-- Étend la lecture anon à la nouvelle clé (les données sont publiques par
-- nature : email pro, liens sociaux, nom légal). Le tél reste protégé par
-- functions/api/org-cfg.js (filtré côté serveur avant renvoi au client).
drop policy if exists app_config_public_org_cfg on public.app_config;
create policy app_config_public_org_cfg on public.app_config
  for select
  using (key = 'nexus_org_cfg');
