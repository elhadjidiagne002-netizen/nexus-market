-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Invariant « commande LIVRÉE ⇒ PAYÉE » (filet serveur)
--
--  Constat audit : 100 % des commandes restaient payment_status='pending', même
--  livrées (le webhook Stripe / IPN PayTech ne marquait pas le paiement, et le
--  COD n'était jamais réconcilié). Ce trigger garantit l'invariant pour TOUS les
--  chemins (status.js, RPC, app coursier, mise à jour admin) : dès qu'une
--  commande passe 'delivered', payment_status devient 'paid'.
--
--  N'affecte PAS les remboursements (ne se déclenche que sur changement de
--  status, pas de payment_status). Idempotent.
--  À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public._order_delivered_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'delivered' AND (NEW.payment_status IS DISTINCT FROM 'paid') THEN
    NEW.payment_status := 'paid';
    IF NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_delivered_paid ON public.orders;
CREATE TRIGGER trg_order_delivered_paid
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._order_delivered_paid();

-- Rattrapage immédiat de l'existant.
UPDATE public.orders SET payment_status = 'paid'
 WHERE status = 'delivered' AND payment_status IS DISTINCT FROM 'paid';
