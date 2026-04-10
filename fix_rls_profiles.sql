-- ═══════════════════════════════════════════════════════════════
-- NEXUS MARKET — Fix RLS table "profiles"
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Activer RLS sur la table (si pas déjà fait)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Supprimer les anciennes politiques conflictuelles (si elles existent)
DROP POLICY IF EXISTS "Users can view own profile"    ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"  ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON profiles;
DROP POLICY IF EXISTS "Users can upsert own profile"  ON profiles;

-- 3. SELECT — chaque utilisateur peut lire son propre profil
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- 4. INSERT — chaque utilisateur peut créer son propre profil
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. UPDATE — chaque utilisateur peut modifier son propre profil
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 6. (Optionnel) Permettre aux admins de tout voir
-- CREATE POLICY "Admins can view all profiles"
--   ON profiles FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- Vérification : liste les politiques actives
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles';
