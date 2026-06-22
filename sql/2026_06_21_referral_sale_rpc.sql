-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — RPC record_referral_sale : crédits parrainage CÔTÉ SERVEUR
--
--  Clôt le dernier résidu : les montants (commission parrain, bonus filleul)
--  étaient calculés et insérés depuis le navigateur de l'acheteur → un filleul
--  pouvait, en collusion, sur-déclarer un montant. Désormais TOUT est recalculé
--  serveur-side depuis la commande réelle + le taux admin. Idempotent (créditée
--  une seule fois, à la 1ère commande du filleul).
--
--  Le front appelle simplement record_referral_sale(p_order_id) après création
--  de la commande ; la RPC :
--    1. vérifie que la commande appartient à l'appelant ;
--    2. retrouve son parrainage (referred_user_id = appelant), non déjà payé ;
--    3. recalcule montant (orders.total → XOF) + commission (taux admin) + bonus 2% ;
--    4. crédite le cashback du parrain et du filleul (bypass RLS via definer) ;
--    5. met à jour ambassador_referrals (→ trigger d'agrégats) ;
--    6. notifie parrain + filleul.
--
--  ⚠️ À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.record_referral_sale(p_order_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer      uuid := auth.uid();
  v_order_eur  numeric;
  v_order_xof  integer;
  v_rate       numeric := 5;
  v_commission integer;
  v_bonus      integer;
  v_ref        public.ambassador_referrals%ROWTYPE;
  v_amb_user   uuid;
  v_buyer_name text;
BEGIN
  IF v_buyer IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth'); END IF;

  -- 1. La commande doit appartenir à l'appelant.
  SELECT COALESCE(total, 0) INTO v_order_eur
    FROM public.orders WHERE id::text = p_order_id AND buyer_id = v_buyer;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'order'); END IF;

  -- 2. Parrainage de l'appelant, pas encore crédité.
  SELECT * INTO v_ref FROM public.ambassador_referrals
    WHERE referred_user_id = v_buyer AND COALESCE(status, 'pending') <> 'paid'
    ORDER BY created_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'reason', 'no_pending_referral'); END IF;

  -- 3. Montants recalculés serveur-side.
  v_order_xof := ROUND(v_order_eur * 655.957);
  BEGIN
    SELECT COALESCE((value->>'ambassador_commission_pct')::numeric, 5) INTO v_rate
      FROM public.app_config WHERE key = 'nexus_monetization_cfg';
  EXCEPTION WHEN OTHERS THEN v_rate := 5; END;
  IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 5; END IF;
  v_commission := GREATEST(0, ROUND(v_order_xof * v_rate / 100));
  v_bonus      := GREATEST(0, ROUND(v_order_xof * 0.02));

  SELECT user_id INTO v_amb_user FROM public.ambassadors WHERE id = v_ref.ambassador_id;
  SELECT name INTO v_buyer_name FROM public.profiles WHERE id = v_buyer;

  -- 4. Marquer le parrainage (déclenche le trigger d'agrégats ambassadeur).
  UPDATE public.ambassador_referrals
     SET order_id = p_order_id, order_amount = v_order_xof,
         commission = v_commission, status = 'paid'
   WHERE id = v_ref.id;

  -- 5. Crédits cashback (definer → bypass RLS).
  IF v_amb_user IS NOT NULL AND v_commission > 0 THEN
    INSERT INTO public.cashback_transactions(id, user_id, order_id, amount_xof, type, description, created_at)
    VALUES (gen_random_uuid(), v_amb_user, p_order_id, v_commission, 'earn', 'Commission parrainage', now());
    INSERT INTO public.notifications(id, user_id, type, title, message, link, read, created_at)
    VALUES (gen_random_uuid(), v_amb_user, 'system', '💰 Commission gagnée !',
            'Votre filleul ' || COALESCE(v_buyer_name, 'un client') || ' a passé une commande. Vous gagnez '
            || v_commission || ' FCFA de commission.', '/', false, now());
  END IF;
  IF v_bonus > 0 THEN
    INSERT INTO public.cashback_transactions(id, user_id, order_id, amount_xof, type, description, created_at)
    VALUES (gen_random_uuid(), v_buyer, p_order_id, v_bonus, 'bonus', 'Bonus filleul 1ere commande', now());
    INSERT INTO public.notifications(id, user_id, type, title, message, link, read, created_at)
    VALUES (gen_random_uuid(), v_buyer, 'system', '🎁 Bonus filleul !',
            v_bonus || ' FCFA de cashback crédités pour votre 1ère commande via parrainage.', '/', false, now());
  END IF;

  RETURN jsonb_build_object('ok', true, 'commission', v_commission, 'bonus', v_bonus);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END; $$;

GRANT EXECUTE ON FUNCTION public.record_referral_sale(text) TO authenticated;

COMMIT;
