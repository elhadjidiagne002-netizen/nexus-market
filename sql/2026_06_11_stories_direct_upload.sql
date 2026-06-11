-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — STORIES : UPLOAD DIRECT (sans Mux) + IMPORT DE FICHIER
--
--  PROBLÈME : « toujours impossible de faire de stories ». Cause racine : tout
--  le flux Stories dépendait de Mux (MUX_TOKEN_ID / MUX_TOKEN_SECRET). Sans ces
--  variables, /api/stories/upload renvoyait 503 → aucune story publiable.
--
--  SOLUTION : permettre l'upload DIRECT de la vidéo dans Supabase Storage
--  (bucket public `nexus-stories`), avec lecture par URL publique — exactement
--  comme les images (bucket nexus-images). La story devient ACTIVE immédiatement
--  (pas d'encodage Mux, pas de webhook). Le flux Mux reste disponible si
--  configuré (qualité HLS adaptative), mais n'est plus un prérequis.
--
--  Ce script ajoute :
--   1. stories.video_url (TEXT) — URL publique de la vidéo (lecture directe).
--   2. Bucket Storage public `nexus-stories` + policies (upload par utilisateur
--      authentifié, lecture publique).
--
--  Idempotent. À exécuter dans Supabase → SQL Editor (rôle postgres).
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- 1) Colonne d'URL vidéo directe (coexiste avec les colonnes mux_*).
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS video_url text;

-- 2) Bucket Storage public dédié aux vidéos de stories.
--    file_size_limit : 100 Mo (cohérent avec la limite côté client).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('nexus-stories', 'nexus-stories', true, 104857600)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 104857600;

-- 3) Policies Storage sur ce bucket.
--    Lecture : publique (les vidéos sont destinées à être vues par tous).
--    Écriture : tout utilisateur authentifié (un vendeur connecté publie une
--    story). La suppression/màj restent réservées au propriétaire de l'objet.
DO $$
BEGIN
  -- Lecture publique
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'nexus_stories_public_read') THEN
    CREATE POLICY "nexus_stories_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'nexus-stories');
  END IF;

  -- Upload par utilisateur authentifié
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'nexus_stories_auth_insert') THEN
    CREATE POLICY "nexus_stories_auth_insert" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'nexus-stories');
  END IF;

  -- MàJ/suppression par le propriétaire de l'objet
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'nexus_stories_owner_update') THEN
    CREATE POLICY "nexus_stories_owner_update" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = 'nexus-stories' AND owner = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'nexus_stories_owner_delete') THEN
    CREATE POLICY "nexus_stories_owner_delete" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = 'nexus-stories' AND owner = auth.uid());
  END IF;
END $$;

-- NOTE : l'INSERT de la ligne `stories` se fait côté serveur via la service key
-- (/api/stories/upload), qui contourne le RLS de la table — aucune policy
-- supplémentaire sur public.stories n'est nécessaire pour la publication.
