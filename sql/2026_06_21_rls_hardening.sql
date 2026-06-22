-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — DURCISSEMENT RLS (failles critiques)
--
--  Plusieurs policies étaient ouvertes à TOUT le monde (USING true / WITH CHECK
--  true, censées viser service_role qui de toute façon bypasse la RLS) + une
--  escalade de privilèges sur profiles. Cette migration ferme les 5 failles
--  critiques SANS casser les flux actuels (le front insère déjà active=false
--  pour boost/flash, la résolution de litige passe en contexte admin, etc.).
--
--  service_role (IPN, crons) bypasse la RLS → aucune des suppressions ci-dessous
--  n'affecte le serveur.
--
--  ⚠️ À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PROFILES — bloque l'escalade de privilèges ───────────────────────────
-- profiles_update_own laisse un user modifier son propre rôle/statut. On garde
-- la possibilité d'éditer son profil (nom, téléphone, langue…) mais on interdit
-- aux NON-admins de toucher aux colonnes sensibles (rôle, statut, Pro, commission).
CREATE OR REPLACE FUNCTION public.protect_profile_columns() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service_role (serveur) et admins : autorisés à tout changer.
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;
  -- non-admin : les colonnes sensibles ne doivent pas changer.
  IF NEW.role           IS DISTINCT FROM OLD.role
  OR NEW.status         IS DISTINCT FROM OLD.status
  OR NEW.is_pro         IS DISTINCT FROM OLD.is_pro
  OR NEW.pro_until      IS DISTINCT FROM OLD.pro_until
  OR NEW.pro_plan       IS DISTINCT FROM OLD.pro_plan
  OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    RAISE EXCEPTION 'Modification non autorisée d''un champ protégé du profil';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_profile ON public.profiles;
CREATE TRIGGER trg_protect_profile BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- ── 2. PRODUCT_BOOSTS — empêche l'auto-activation sans paiement ──────────────
-- boosts_vendor_own (ALL) laissait un vendeur passer active=true. On remplace par
-- SELECT (ses boosts) + INSERT (toujours en attente). L'activation reste réservée
-- à l'IPN PayTech (service_role) et à l'admin.
DROP POLICY IF EXISTS boosts_vendor_own ON public.product_boosts;
DROP POLICY IF EXISTS boosts_vendor_select ON public.product_boosts;
CREATE POLICY boosts_vendor_select ON public.product_boosts FOR SELECT
  USING (auth.uid() = vendor_id);
DROP POLICY IF EXISTS boosts_vendor_insert ON public.product_boosts;
CREATE POLICY boosts_vendor_insert ON public.product_boosts FOR INSERT
  WITH CHECK (auth.uid() = vendor_id AND active = false);

-- ── 3. FLASH_SALES — fermer l'activation gratuite ────────────────────────────
-- flash_sales_service (ALL/true) ouvrait tout. On met des policies propres :
-- lecture publique, insertion vendeur (en attente), désactivation vendeur,
-- admin complet. L'activation payante se fait par l'IPN (service_role) / l'admin.
DROP POLICY IF EXISTS flash_sales_service ON public.flash_sales;
DROP POLICY IF EXISTS flash_public_read ON public.flash_sales;
CREATE POLICY flash_public_read ON public.flash_sales FOR SELECT USING (true);
DROP POLICY IF EXISTS flash_vendor_insert ON public.flash_sales;
CREATE POLICY flash_vendor_insert ON public.flash_sales FOR INSERT
  WITH CHECK (auth.uid() = vendor_id AND active = false);
DROP POLICY IF EXISTS flash_vendor_disable ON public.flash_sales;
CREATE POLICY flash_vendor_disable ON public.flash_sales FOR UPDATE
  USING (auth.uid() = vendor_id) WITH CHECK (auth.uid() = vendor_id AND active = false);
DROP POLICY IF EXISTS flash_admin_all ON public.flash_sales;
CREATE POLICY flash_admin_all ON public.flash_sales FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 4. DISPUTES — retirer l'accès « tout le monde » ──────────────────────────
-- dispute_service_all (ALL/true) laissait lire/modifier tous les litiges.
-- Les policies admin + parties (buyer/vendor) + insert buyer couvrent les flux.
DROP POLICY IF EXISTS dispute_service_all ON public.disputes;

-- ── 5. PAYOUT_REQUESTS — retirer l'accès « tout le monde » ───────────────────
-- payout_service_all (ALL/true) exposait/laissait modifier tous les retraits.
-- payout_admin_all + payout_vendor_own + payout_insert_own couvrent les flux.
DROP POLICY IF EXISTS payout_service_all ON public.payout_requests;

COMMIT;
