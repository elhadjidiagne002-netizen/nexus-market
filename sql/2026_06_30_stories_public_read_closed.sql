-- Stories : autoriser la lecture publique des stories « closed » en plus des « active ».
-- Demande commerçant (2026-06-30) : la section Stories de l'accueil n'affichait qu'1 story
-- car la RLS ne laissait passer que status='active' non expirée. Les stories closed
-- (ex. « Chien ») étaient bloquées côté serveur → invisibles malgré l'élargissement
-- des requêtes front (overlay #nxp-storiesRow + lecteur React in('active','closed')).
-- Appliqué en prod le 2026-06-30 via Supabase Management API.

DROP POLICY IF EXISTS stories_public_read ON public.stories;
CREATE POLICY stories_public_read ON public.stories
  FOR SELECT
  USING (
    (status = 'active' AND (expires_at IS NULL OR expires_at > now()))
    OR status = 'closed'
  );
