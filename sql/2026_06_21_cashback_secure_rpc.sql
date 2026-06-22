-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — SÉCURITÉ cashback : ferme la faille « argent gratuit »
--
--  AVANT : policy INSERT `cashback_insert_auth` WITH CHECK (true) + `cashback_service_all`
--  (ALL/true) → tout utilisateur connecté pouvait s'insérer un cashback arbitraire.
--
--  APRÈS : aucun INSERT client direct. Tous les crédits passent par la RPC
--  `add_cashback` (SECURITY DEFINER) qui autorise serveur-side :
--    • admin → tout
--    • soi + montant <= 0 → dépense de son propre solde (redeem)
--    • soi + bonus positif → seulement si l'appelant est un filleul (parrainé)
--    • commission ambassadeur → appelant = filleul, crédité = son parrain
--    • cashback livraison → appelant = vendeur de la commande, crédité = acheteur
--  Les vérifs cross-tables sont en échec-fermé (EXCEPTION → refus) pour ne jamais
--  planter sur un écart de schéma. Le service_role (IPN/crons) bypasse la RLS.
--
--  ⚠️ À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.add_cashback(
  p_user_id uuid, p_order_id text, p_amount_xof integer, p_type text, p_desc text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_admin  boolean := false;
  v_ok     boolean := false;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth requise'; END IF;

  SELECT (role = 'admin') INTO v_admin FROM public.profiles WHERE id = v_caller;

  IF v_admin THEN
    v_ok := true;
  ELSIF p_amount_xof <= 0 AND p_user_id = v_caller THEN
    v_ok := true;                                  -- dépense de son propre solde
  ELSIF p_amount_xof > 0 AND p_user_id = v_caller THEN
    BEGIN                                          -- bonus filleul (sur soi)
      v_ok := EXISTS (SELECT 1 FROM public.ambassador_referrals ar
                      WHERE ar.referred_user_id = v_caller);
    EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  ELSIF p_amount_xof > 0 THEN
    BEGIN                                          -- commission ambassadeur
      v_ok := EXISTS (SELECT 1 FROM public.ambassador_referrals ar
                      JOIN public.ambassadors a ON a.id = ar.ambassador_id
                      WHERE ar.referred_user_id = v_caller AND a.user_id = p_user_id);
    EXCEPTION WHEN OTHERS THEN v_ok := false; END;
    IF NOT v_ok THEN
      BEGIN                                        -- cashback livraison (vendeur → acheteur)
        v_ok := EXISTS (SELECT 1 FROM public.orders o
                        WHERE o.id::text = p_order_id
                          AND o.vendor_id = v_caller AND o.buyer_id = p_user_id);
      EXCEPTION WHEN OTHERS THEN v_ok := false; END;
    END IF;
  END IF;

  IF NOT v_ok THEN RAISE EXCEPTION 'cashback non autorisé'; END IF;

  INSERT INTO public.cashback_transactions(id, user_id, order_id, amount_xof, type, description, created_at)
  VALUES (gen_random_uuid(), p_user_id, p_order_id, p_amount_xof, p_type, p_desc, now());
END; $$;

GRANT EXECUTE ON FUNCTION public.add_cashback(uuid, text, integer, text, text) TO authenticated;

-- Verrouillage : plus d'INSERT/ALL client direct (tout passe par la RPC ci-dessus).
-- La lecture de son propre cashback (cashback_select_own / user_read_cashback) reste.
DROP POLICY IF EXISTS cashback_insert_auth ON public.cashback_transactions;
DROP POLICY IF EXISTS cashback_service_all ON public.cashback_transactions;

COMMIT;
