-- ============================================================
-- NEXUS Market — Migration B2B + Vendeurs
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. Table pending_vendors ─────────────────────────────────
-- Stocke les demandes de comptes vendeurs en attente de validation admin.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,           -- nom de la boutique
  owner_name      TEXT NOT NULL,           -- nom du propriétaire
  phone           TEXT,
  category        TEXT DEFAULT 'Général',
  shop_desc       TEXT,
  ninea           TEXT,
  rc              TEXT,
  structure_type  TEXT DEFAULT 'individuel',
  address         TEXT,
  payment_method  TEXT DEFAULT 'mobile',
  orange_phone    TEXT,
  wave_phone      TEXT,
  iban            TEXT,
  bank_name       TEXT,
  avatar          TEXT DEFAULT 'VD',
  status          TEXT DEFAULT 'pending'   -- pending | approved | rejected
    CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

-- Index pour les requêtes admin
CREATE INDEX IF NOT EXISTS idx_pending_vendors_status
  ON pending_vendors(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_vendors_email
  ON pending_vendors(email);

-- RLS : seul service_role peut lire/écrire (les vendeurs s'inscrivent via le backend)
ALTER TABLE pending_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pending_vendors"
  ON pending_vendors FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);


-- ── 2. Table buyer_pro_profiles ──────────────────────────────
-- Stocke les informations professionnelles des acheteurs B2B.
-- Liée à profiles via user_id.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buyer_pro_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company         TEXT NOT NULL,
  job_title       TEXT,
  ninea           TEXT NOT NULL,
  rc              TEXT,
  address         TEXT,
  ninea_verified  BOOLEAN DEFAULT FALSE,
  ninea_verified_at TIMESTAMPTZ,
  ninea_note      TEXT,                    -- note admin lors de la vérification
  credit_limit    DECIMAL(12,2) DEFAULT 0, -- plafond de crédit B2B (FCFA)
  payment_terms   INT DEFAULT 0,           -- délai de paiement en jours (0 = immédiat)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(ninea)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_buyer_pro_user
  ON buyer_pro_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_buyer_pro_ninea
  ON buyer_pro_profiles(ninea);
CREATE INDEX IF NOT EXISTS idx_buyer_pro_verified
  ON buyer_pro_profiles(ninea_verified);

-- RLS
ALTER TABLE buyer_pro_profiles ENABLE ROW LEVEL SECURITY;

-- L'utilisateur peut lire son propre profil B2B
CREATE POLICY "buyer_pro_read_own"
  ON buyer_pro_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Seul service_role peut insérer/modifier (via le backend)
CREATE POLICY "service_role_all_buyer_pro"
  ON buyer_pro_profiles FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);


-- ── 3. Colonne company_name dans profiles (fallback B2B) ─────
-- Ajoutée si la table buyer_pro_profiles n'existe pas encore
-- lors de l'inscription. Permet de stocker le nom d'entreprise.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_name TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio TEXT;       -- JSON fallback pour données B2B extra


-- ── 4. Trigger updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_pending_vendors ON pending_vendors;
CREATE TRIGGER set_updated_at_pending_vendors
  BEFORE UPDATE ON pending_vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_buyer_pro ON buyer_pro_profiles;
CREATE TRIGGER set_updated_at_buyer_pro
  BEFORE UPDATE ON buyer_pro_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 5. Vue admin pour les comptes B2B ────────────────────────
CREATE OR REPLACE VIEW v_buyer_pro_admin AS
SELECT
  p.id,
  p.name,
  p.email,
  p.status,
  p.phone,
  p.created_at,
  b.company,
  b.job_title,
  b.ninea,
  b.rc,
  b.address,
  b.ninea_verified,
  b.ninea_verified_at,
  b.ninea_note,
  b.credit_limit,
  b.payment_terms
FROM profiles p
LEFT JOIN buyer_pro_profiles b ON b.user_id = p.id
WHERE p.role = 'buyer_pro'
ORDER BY p.created_at DESC;


-- ── 6. Vérification ──────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pending_vendors') THEN
    RAISE NOTICE '✅ Table pending_vendors créée';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'buyer_pro_profiles') THEN
    RAISE NOTICE '✅ Table buyer_pro_profiles créée';
  END IF;
END $$;
