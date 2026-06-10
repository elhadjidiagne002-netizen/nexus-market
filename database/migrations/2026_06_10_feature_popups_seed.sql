-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — POPUPS d'annonce des NOUVELLES FONCTIONNALITÉS
--
--  Crée, dans la table admin `site_popups`, un pop-up d'annonce pour chaque
--  fonctionnalité phare qui n'en avait pas. Le CTA OUVRE la fonctionnalité
--  (cta_url = 'nexus:open-…' → événement écouté par le front ; '#louma' → hash).
--
--  · Régulation admin conservée : ces pop-ups apparaissent dans
--    « Admin → Popups » (PopupsAdminPanel) — éditables, désactivables, supprimables.
--  · Idempotent : n'insère un pop-up que s'il n'existe pas déjà (par titre).
--  · Type-safe : détecte si `show_on` est jsonb ou text[] et insère en conséquence.
--
--  Affichage : toast bas-droite, page d'accueil, une seule fois par visiteur
--  (show_once). L'admin peut changer position/cible/page/ordre.
--
--  À exécuter dans Supabase → SQL Editor. Pré-requis : table site_popups.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

DO $$
DECLARE
  v_show_on_type text;
  rec record;
BEGIN
  -- La table doit exister.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'site_popups'
  ) THEN
    RAISE NOTICE 'Table site_popups absente — rien à faire.';
    RETURN;
  END IF;

  SELECT data_type INTO v_show_on_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'site_popups' AND column_name = 'show_on';

  FOR rec IN
    SELECT * FROM (VALUES
      ('🛵 Nouveau : Coursier à la demande',
       'Faites livrer ou récupérer un colis en quelques minutes — suivi GPS en direct.',
       '🛵', 'Commander un coursier', 'nexus:open-courier', 'feature', 'green'),
      ('🐑 NEXUS Élevage & produits locaux',
       'Moutons Tabaski, volaille, bétail et produits du terroir. Soutenez le Sénégal !',
       '🐑', 'Découvrir', 'nexus:open-local-elevage', 'feature', 'orange'),
      ('🎬 NEXUS Stories',
       'Les produits en vidéo, comme des stories. Regardez — et publiez les vôtres !',
       '🎬', 'Regarder', 'nexus:open-stories', 'feature', 'purple'),
      ('🔄 NEXUS Troc',
       'Échangez vos objets sans argent. Proposez un troc en un clic.',
       '🔄', 'Explorer le troc', 'nexus:open-troc', 'feature', 'blue'),
      ('🏪 Louma — le marché en ligne',
       'Le grand marché hebdomadaire, version digitale. À ne pas manquer.',
       '🏪', 'Visiter le Louma', '#louma', 'feature', 'dark'),
      ('🎓 Tutoriels NEXUS',
       'Apprenez à vendre, acheter et livrer en 2 minutes avec nos tutoriels.',
       '🎓', 'Voir les tutoriels', 'nexus:open-tutorials', 'feature', 'blue')
    ) AS t(title, body, icon, cta_label, cta_url, type, theme)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.site_popups WHERE title = rec.title);

    IF v_show_on_type = 'jsonb' THEN
      INSERT INTO public.site_popups
        (title, body, icon, cta_label, cta_url, type, theme, position, target, show_once, delay_seconds, active, show_on, starts_at)
      VALUES
        (rec.title, rec.body, rec.icon, rec.cta_label, rec.cta_url, rec.type, rec.theme,
         'bottom-right', 'all', true, 5, true, '["home"]'::jsonb, now());
    ELSIF v_show_on_type = 'ARRAY' THEN
      INSERT INTO public.site_popups
        (title, body, icon, cta_label, cta_url, type, theme, position, target, show_once, delay_seconds, active, show_on, starts_at)
      VALUES
        (rec.title, rec.body, rec.icon, rec.cta_label, rec.cta_url, rec.type, rec.theme,
         'bottom-right', 'all', true, 5, true, ARRAY['home']::text[], now());
    ELSE
      -- show_on absent/autre type → on l'omet (pop-up affiché sur toutes les pages).
      INSERT INTO public.site_popups
        (title, body, icon, cta_label, cta_url, type, theme, position, target, show_once, delay_seconds, active, starts_at)
      VALUES
        (rec.title, rec.body, rec.icon, rec.cta_label, rec.cta_url, rec.type, rec.theme,
         'bottom-right', 'all', true, 5, true, now());
    END IF;

    RAISE NOTICE 'Pop-up créé : %', rec.title;
  END LOOP;
END $$;

-- Vérification : SELECT title, type, theme, position, target, active FROM public.site_popups
--                WHERE type = 'feature' ORDER BY created_at DESC;
