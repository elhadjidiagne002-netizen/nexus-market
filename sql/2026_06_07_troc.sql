-- 2026_06_07_troc.sql
-- NEXUS Troc — échange d'objets sans argent (« mon téléphone contre ta tablette »).
-- Ancré dans la culture sénégalaise du troc ; pas de commission directe mais fort
-- générateur de trafic acheteur (pages /troc/* indexables).
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

-- ── Annonces de troc ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.troc_listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- NULL si publié sans compte
  owner_name  TEXT,
  title       TEXT NOT NULL,                 -- ex. « iPhone 11 64 Go »
  description TEXT,
  photo_url   TEXT,
  category    TEXT,
  city        TEXT DEFAULT 'Dakar',
  want        TEXT,                          -- ce que la personne recherche en échange
  est_value_fcfa INT,                        -- valeur estimée (indicative)
  phone       TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','expired')),
  views       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);
CREATE INDEX IF NOT EXISTS idx_troc_status  ON public.troc_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_troc_owner   ON public.troc_listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_troc_city    ON public.troc_listings(city);

-- ── Propositions d'échange ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.troc_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES public.troc_listings(id) ON DELETE CASCADE,
  proposer_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposer_name TEXT,
  offered_title TEXT NOT NULL,               -- l'objet proposé en échange
  offered_photo_url TEXT,
  message       TEXT,
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_troc_prop_listing ON public.troc_proposals(listing_id, created_at DESC);

-- ── RLS (calquée sur le modèle « sans compte » des annonces express) ─────────
ALTER TABLE public.troc_listings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.troc_proposals ENABLE ROW LEVEL SECURITY;

-- Lecture publique des annonces actives.
DROP POLICY IF EXISTS troc_public_read ON public.troc_listings;
CREATE POLICY troc_public_read ON public.troc_listings FOR SELECT USING (status = 'active');

-- Publication ouverte (avec ou sans compte), comme les annonces express.
DROP POLICY IF EXISTS troc_insert_any ON public.troc_listings;
CREATE POLICY troc_insert_any ON public.troc_listings FOR INSERT WITH CHECK (true);

-- Modification/suppression réservées au propriétaire connecté.
DROP POLICY IF EXISTS troc_update_own ON public.troc_listings;
CREATE POLICY troc_update_own ON public.troc_listings FOR UPDATE USING (owner_id = auth.uid());
DROP POLICY IF EXISTS troc_delete_own ON public.troc_listings;
CREATE POLICY troc_delete_own ON public.troc_listings FOR DELETE USING (owner_id = auth.uid());

-- Propositions : lecture par le propriétaire de l'annonce ou le proposeur ;
-- création ouverte ; (la modération de statut se fait via la service key côté serveur).
DROP POLICY IF EXISTS troc_prop_insert_any ON public.troc_proposals;
CREATE POLICY troc_prop_insert_any ON public.troc_proposals FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS troc_prop_read ON public.troc_proposals;
CREATE POLICY troc_prop_read ON public.troc_proposals FOR SELECT USING (
  proposer_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.troc_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid())
);
DROP POLICY IF EXISTS troc_prop_update_owner ON public.troc_proposals;
CREATE POLICY troc_prop_update_owner ON public.troc_proposals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.troc_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid())
);

COMMIT;
