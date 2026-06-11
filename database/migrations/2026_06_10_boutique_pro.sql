-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Abonnement « Boutique Pro » (vendeur)
--
--  Abonnement vendeur (mensuel/annuel) payé en mobile money via PayTech. Donne
--  un badge PRO, la mise en avant et (extensible) des stats avancées. Activé
--  CÔTÉ SERVEUR par l'IPN PayTech (signal de confiance), jamais par le client.
--
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro    boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_plan  text;

CREATE TABLE IF NOT EXISTS public.vendor_subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan           text NOT NULL CHECK (plan IN ('pro_mensuel','pro_annuel')),
  price_fcfa     integer NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ends_at        timestamptz,
  active         boolean NOT NULL DEFAULT false,
  payment_method text,
  payment_ref    text,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendor_subs_vendor ON public.vendor_subscriptions(vendor_id);

ALTER TABLE public.vendor_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_subs_own ON public.vendor_subscriptions;
CREATE POLICY vendor_subs_own ON public.vendor_subscriptions
  FOR SELECT USING (auth.uid() = vendor_id);
DROP POLICY IF EXISTS vendor_subs_insert ON public.vendor_subscriptions;
CREATE POLICY vendor_subs_insert ON public.vendor_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = vendor_id);
-- L'activation (active/payment_status) se fait via service_role (IPN), qui
-- contourne la RLS → pas de policy UPDATE publique (le client ne s'active pas).

-- Expire les abonnements échus (à appeler par le cron cleanup).
CREATE OR REPLACE FUNCTION public.expire_vendor_pro()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.profiles SET is_pro = false
   WHERE is_pro = true AND pro_until IS NOT NULL AND pro_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.vendor_subscriptions SET active = false
   WHERE active = true AND ends_at IS NOT NULL AND ends_at < now();
  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.expire_vendor_pro() TO service_role, authenticated;
