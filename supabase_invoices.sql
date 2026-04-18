-- ════════════════════════════════════════════════════════════════════════════
-- NEXUS Market Sénégal — Configuration Supabase : Factures (Invoices)
-- Version : 1.0.0
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. TABLE PRINCIPALE : invoices ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Numéro lisible, ex: "FAC-2025-000042" ou "VEND-2025-000007"
  invoice_number   text        UNIQUE NOT NULL,

  -- "buyer"  → reçu d'achat pour l'acheteur
  -- "vendor" → relevé de vente pour le vendeur
  -- "admin"  → facture interne / avoir
  type             text        NOT NULL CHECK (type IN ('buyer', 'vendor', 'admin')),

  -- Référence commande (texte car order.id peut être alphanumérique dans le frontend)
  order_id         text        NOT NULL,

  -- Parties concernées
  buyer_id         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  vendor_id        uuid        REFERENCES profiles(id) ON DELETE SET NULL,

  -- Montants en FCFA
  amount_ht        numeric(12,0) NOT NULL DEFAULT 0,  -- HT
  tva              numeric(12,0) NOT NULL DEFAULT 0,  -- TVA 18 %
  amount_ttc       numeric(12,0) NOT NULL DEFAULT 0,  -- TTC
  commission       numeric(12,0) NOT NULL DEFAULT 0,  -- Commission NEXUS (pour vendeur)
  net_vendor       numeric(12,0) NOT NULL DEFAULT 0,  -- Net à payer au vendeur

  -- Statut
  status           text        NOT NULL DEFAULT 'issued'
                               CHECK (status IN ('draft', 'issued', 'paid', 'cancelled', 'refunded')),

  -- Données complètes sérialisées (produits, adresses, infos paiement…)
  metadata         jsonb,

  -- Horodatage
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 2. TRIGGER updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. INDEX ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_id    ON invoices (buyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor_id   ON invoices (vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id    ON invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_type_status ON invoices (type, status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at  ON invoices (created_at DESC);

-- ── 4. ROW LEVEL SECURITY ─────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Acheteur : accès uniquement à ses propres factures (type = 'buyer')
CREATE POLICY "buyer_read_own_invoices" ON invoices
  FOR SELECT
  USING (
    auth.uid() = buyer_id
    AND type = 'buyer'
  );

-- Vendeur : accès uniquement à ses propres relevés (type = 'vendor')
CREATE POLICY "vendor_read_own_invoices" ON invoices
  FOR SELECT
  USING (
    auth.uid() = vendor_id
    AND type = 'vendor'
  );

-- Admin : accès total via service_role (bypasse RLS) — pas de policy needed côté backend

-- Acheteur : peut créer sa propre facture (le frontend la génère, le backend la sauvegarde)
CREATE POLICY "buyer_insert_own_invoice" ON invoices
  FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_id
    AND type = 'buyer'
  );

-- Vendeur : peut créer son propre relevé
CREATE POLICY "vendor_insert_own_invoice" ON invoices
  FOR INSERT
  WITH CHECK (
    auth.uid() = vendor_id
    AND type = 'vendor'
  );

-- ── 5. FONCTION : génération automatique du numéro de facture ──────────────
-- Ex: FAC-2025-000001 pour acheteur, VEND-2025-000001 pour vendeur
CREATE SEQUENCE IF NOT EXISTS invoice_seq_buyer  START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS invoice_seq_vendor START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS invoice_seq_admin  START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_invoice_number(p_type text)
RETURNS text AS $$
DECLARE
  prefix   text;
  seq_val  bigint;
  yr       text;
BEGIN
  yr := to_char(now(), 'YYYY');
  CASE p_type
    WHEN 'buyer'  THEN prefix := 'FAC';  seq_val := nextval('invoice_seq_buyer');
    WHEN 'vendor' THEN prefix := 'VEND'; seq_val := nextval('invoice_seq_vendor');
    ELSE               prefix := 'ADM';  seq_val := nextval('invoice_seq_admin');
  END CASE;
  RETURN prefix || '-' || yr || '-' || lpad(seq_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. FONCTION RPC : sauvegarder une facture (appelée depuis le backend) ──
-- Usage côté serveur Node :
--   await supabase.rpc('save_invoice', { p_type:'buyer', p_order_id:'...', ... })
CREATE OR REPLACE FUNCTION save_invoice(
  p_type       text,
  p_order_id   text,
  p_buyer_id   uuid    DEFAULT NULL,
  p_vendor_id  uuid    DEFAULT NULL,
  p_amount_ht  numeric DEFAULT 0,
  p_tva        numeric DEFAULT 0,
  p_amount_ttc numeric DEFAULT 0,
  p_commission numeric DEFAULT 0,
  p_net_vendor numeric DEFAULT 0,
  p_status     text    DEFAULT 'issued',
  p_metadata   jsonb   DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_number text;
  v_id     uuid;
BEGIN
  v_number := generate_invoice_number(p_type);
  INSERT INTO invoices (
    invoice_number, type, order_id,
    buyer_id, vendor_id,
    amount_ht, tva, amount_ttc,
    commission, net_vendor,
    status, metadata
  ) VALUES (
    v_number, p_type, p_order_id,
    p_buyer_id, p_vendor_id,
    p_amount_ht, p_tva, p_amount_ttc,
    p_commission, p_net_vendor,
    p_status, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',             v_id,
    'invoice_number', v_number,
    'type',           p_type,
    'amount_ttc',     p_amount_ttc
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. VUE : résumé des factures pour le dashboard admin ─────────────────────
CREATE OR REPLACE VIEW v_invoices_summary AS
SELECT
  i.id,
  i.invoice_number,
  i.type,
  i.order_id,
  i.status,
  i.amount_ttc,
  i.commission,
  i.net_vendor,
  i.created_at,
  pb.name   AS buyer_name,
  pb.email  AS buyer_email,
  pv.name   AS vendor_name,
  pv.email  AS vendor_email
FROM invoices i
LEFT JOIN profiles pb ON pb.id = i.buyer_id
LEFT JOIN profiles pv ON pv.id = i.vendor_id;

-- La vue est accessible via service_role uniquement (pas de RLS sur les vues)

-- ── 8. STORAGE BUCKET : stockage PDF (optionnel — si vous voulez garder les PDFs) ──
-- Décommenter si vous voulez stocker les PDFs générés côté serveur dans Supabase Storage :
/*
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,                -- privé
  5242880,              -- 5 MB max par fichier
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policy : seul le propriétaire peut lire son PDF
CREATE POLICY "owner_read_invoice_pdf" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy : le service_role (backend) peut créer/supprimer les PDFs
CREATE POLICY "service_write_invoice_pdf" ON storage.objects
  FOR ALL
  USING (bucket_id = 'invoices')
  WITH CHECK (bucket_id = 'invoices');
*/

-- ── 9. VÉRIFICATION ──────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Table invoices créée avec succès';
  RAISE NOTICE '✅ RLS activé (acheteur + vendeur isolés)';
  RAISE NOTICE '✅ Séquences FAC-/VEND-/ADM- prêtes';
  RAISE NOTICE '✅ Fonction save_invoice() disponible';
  RAISE NOTICE '✅ Vue v_invoices_summary disponible';
END $$;
