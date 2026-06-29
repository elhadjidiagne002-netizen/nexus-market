-- Bannières de la page d'accueil (hero carrousel de la nouvelle interface #nx-proto-overlay)
-- Pilotables depuis la base ; lecture publique des bannières actives, écriture réservée admin.
-- Appliqué en prod le 2026-06-29 (via Supabase Management API).

CREATE TABLE IF NOT EXISTS public.banners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag         text,                       -- sur-titre (ex. "LOUMA DU VENDREDI")
  title       text NOT NULL,
  cta_label   text,                       -- libellé du bouton
  cta_action  text,                       -- 'louma'|'pros'|'courier'|'troc'|'stories'|'assistant'
                                          -- | 'cat:<Nom>' | 'q:<terme>' | 'url:/<chemin>'
  image_url   text,
  sponsored   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS banners_public_read ON public.banners;
CREATE POLICY banners_public_read ON public.banners
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS banners_admin_all ON public.banners;
CREATE POLICY banners_admin_all ON public.banners
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Amorçage : les 4 bannières éditoriales d'origine (modifiables ensuite en base)
INSERT INTO public.banners (tag, title, cta_label, cta_action, image_url, sponsored, sort_order)
SELECT * FROM (VALUES
  ('PARTENARIAT PREMIUM', 'Tout le Sénégal dans une seule appli', 'Découvrir l''offre', 'url:/', 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1280&h=500&fit=crop', true, 1),
  ('LOUMA DU VENDREDI', 'Jusqu''à -70% sur les produits frais & locaux', 'J''en profite', 'louma', 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1280&h=500&fit=crop', false, 2),
  ('NEXUS PRO', 'Un artisan vérifié près de chez vous', 'Trouver un pro', 'pros', 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1280&h=500&fit=crop', false, 3),
  ('PAIEMENT SÉCURISÉ', 'Payez avec Wave, Orange Money ou carte', 'En savoir plus', 'url:/faq', 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1280&h=500&fit=crop', false, 4)
) AS v(tag, title, cta_label, cta_action, image_url, sponsored, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.banners);
