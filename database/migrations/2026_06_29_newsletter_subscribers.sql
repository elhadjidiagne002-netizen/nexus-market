-- Inscriptions newsletter (bouton « S'abonner » du footer de la nouvelle interface).
-- Insertion publique (anon) autorisée ; lecture réservée aux admins.
-- Appliqué en prod le 2026-06-29 (via Supabase Management API).

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  source      text DEFAULT 'home',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS newsletter_public_insert ON public.newsletter_subscribers;
CREATE POLICY newsletter_public_insert ON public.newsletter_subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS newsletter_admin_read ON public.newsletter_subscribers;
CREATE POLICY newsletter_admin_read ON public.newsletter_subscribers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
