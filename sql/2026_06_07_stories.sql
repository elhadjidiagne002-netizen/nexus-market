-- 2026_06_07_stories.sql
-- NEXUS Stories — vidéos produit courtes (15–60s, format Reels). Les vendeurs
-- filment leurs articles, les acheteurs « swipent ». Pipeline vidéo via Mux.com.
-- Génère 3–5× plus d'engagement que les photos statiques.
--
-- Flux : /api/stories/upload crée un upload direct Mux + insère la story
-- (status=uploading). Le webhook /api/webhooks/mux passe status=active dès que
-- la vidéo est encodée (mux_playback_id renseigné).
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

CREATE TABLE IF NOT EXISTS public.stories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  vendor_name     TEXT,
  product_id      UUID REFERENCES public.products(id) ON DELETE SET NULL,
  title           TEXT,
  description     TEXT,
  category        TEXT,
  city            TEXT DEFAULT 'Dakar',
  mux_upload_id   TEXT,     -- id de l'upload direct Mux (clé de jointure webhook)
  mux_asset_id    TEXT,
  mux_playback_id TEXT,     -- => https://stream.mux.com/<id>.m3u8
  duration        NUMERIC,  -- secondes
  status          TEXT NOT NULL DEFAULT 'uploading'
                    CHECK (status IN ('uploading','processing','active','errored','closed')),
  views           INT NOT NULL DEFAULT 0,
  likes           INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);
CREATE INDEX IF NOT EXISTS idx_stories_status ON public.stories(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_vendor ON public.stories(vendor_id);
CREATE INDEX IF NOT EXISTS idx_stories_upload ON public.stories(mux_upload_id);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Lecture publique des stories prêtes.
DROP POLICY IF EXISTS stories_public_read ON public.stories;
CREATE POLICY stories_public_read ON public.stories FOR SELECT USING (status = 'active');

-- Le vendeur peut gérer ses propres stories (l'insertion réelle se fait côté
-- serveur via la service key dans /api/stories/upload).
DROP POLICY IF EXISTS stories_update_own ON public.stories;
CREATE POLICY stories_update_own ON public.stories FOR UPDATE USING (vendor_id = auth.uid());
DROP POLICY IF EXISTS stories_delete_own ON public.stories;
CREATE POLICY stories_delete_own ON public.stories FOR DELETE USING (vendor_id = auth.uid());

-- Modération admin complète.
DROP POLICY IF EXISTS stories_admin_all ON public.stories;
CREATE POLICY stories_admin_all ON public.stories FOR ALL
  USING      ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

COMMIT;
