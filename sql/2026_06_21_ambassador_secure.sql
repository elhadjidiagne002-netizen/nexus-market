-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — SÉCURITÉ parrainage / ambassadeur
--
--  AVANT :
--   • amb_ref_service_all (ALL/true) + amb_ref_insert_auth (INSERT/true)
--     → n'importe qui peut FORGER un parrainage (referred_user_id arbitraire).
--       Cela contourne les gardes add_cashback / add_loyalty_points qui se fient
--       à ambassador_referrals.
--   • ambassadors_service_all (ALL/true) → n'importe qui modifie n'importe quel
--     ambassadeur (gonfler total_earned, changer le statut…).
--
--  APRÈS :
--   • Les agrégats ambassadors (total_referrals/sales/earned/level) sont
--     maintenus par TRIGGER serveur (definer) → plus d'écriture client cross-user.
--   • ambassador_referrals : insert/update uniquement de SA propre ligne
--     (referred_user_id = soi) + admin. Plus de forge pour autrui.
--   • Trigger de protection : un non-admin ne peut pas modifier ses propres
--     agrégats/statut sur ambassadors.
--
--  ⚠️ À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Agrégats maintenus côté serveur (remplace les updates client cross-user).
CREATE OR REPLACE FUNCTION public.nx_amb_ref_aggregate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_earned integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.ambassadors
       SET total_referrals = COALESCE(total_referrals, 0) + 1
     WHERE id = NEW.ambassador_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'paid' AND COALESCE(OLD.status, '') <> 'paid' THEN
      UPDATE public.ambassadors
         SET total_sales  = COALESCE(total_sales, 0)  + COALESCE(NEW.order_amount, 0),
             total_earned = COALESCE(total_earned, 0) + COALESCE(NEW.commission, 0)
       WHERE id = NEW.ambassador_id
       RETURNING total_earned INTO v_earned;
      UPDATE public.ambassadors
         SET level = CASE WHEN v_earned >= 500000 THEN 'platinum'
                          WHEN v_earned >= 200000 THEN 'gold'
                          WHEN v_earned >=  50000 THEN 'silver'
                          ELSE 'bronze' END
       WHERE id = NEW.ambassador_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_amb_ref_aggregate ON public.ambassador_referrals;
CREATE TRIGGER trg_amb_ref_aggregate
  AFTER INSERT OR UPDATE ON public.ambassador_referrals
  FOR EACH ROW EXECUTE FUNCTION public.nx_amb_ref_aggregate();

-- 2. Verrouiller ambassador_referrals (plus de forge pour autrui).
DROP POLICY IF EXISTS amb_ref_service_all ON public.ambassador_referrals;
DROP POLICY IF EXISTS amb_ref_insert_auth ON public.ambassador_referrals;
DROP POLICY IF EXISTS amb_ref_insert_self ON public.ambassador_referrals;
CREATE POLICY amb_ref_insert_self ON public.ambassador_referrals
  FOR INSERT WITH CHECK (referred_user_id = auth.uid());
DROP POLICY IF EXISTS amb_ref_update_self ON public.ambassador_referrals;
CREATE POLICY amb_ref_update_self ON public.ambassador_referrals
  FOR UPDATE USING (referred_user_id = auth.uid());
-- (conserve amb_ref_admin_all + amb_ref_select_own)

-- 3. Protéger les agrégats/statut d'ambassadors contre l'auto-modification.
CREATE OR REPLACE FUNCTION public.nx_amb_protect() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' THEN
    RETURN NEW;                                   -- admin / serveur : libre
  END IF;
  NEW.total_referrals := OLD.total_referrals;     -- un user ne touche pas ses agrégats
  NEW.total_sales     := OLD.total_sales;
  NEW.total_earned    := OLD.total_earned;
  NEW.level           := OLD.level;
  NEW.commission_rate := OLD.commission_rate;
  NEW.status          := OLD.status;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_amb_protect ON public.ambassadors;
CREATE TRIGGER trg_amb_protect BEFORE UPDATE ON public.ambassadors
  FOR EACH ROW EXECUTE FUNCTION public.nx_amb_protect();

-- 4. Fermer la policy ouverte (service_role bypasse la RLS de toute façon).
DROP POLICY IF EXISTS ambassadors_service_all ON public.ambassadors;
-- (conserve amb_admin_all, amb_insert_own, amb_select_own, amb_public_read, amb_update_own ;
--  le trigger nx_amb_protect neutralise les colonnes sensibles pour les non-admins)

COMMIT;
