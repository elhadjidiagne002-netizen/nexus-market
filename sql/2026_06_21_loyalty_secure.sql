-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — SÉCURITÉ fidélité : ferme l'auto-octroi de points
--
--  Les 3 surcharges de add_loyalty_points étaient SECURITY DEFINER SANS aucune
--  autorisation → n'importe qui pouvait créditer des points arbitraires (points
--  convertibles en réduction FCFA). On préserve le corps de chaque surcharge et
--  on PRÉFIXE une garde d'autorisation (admin / redeem-soi / earn justifié par
--  commande livrée ou parrainage / service_role). On ferme aussi les policies
--  RLS ouvertes (insert direct).
--
--  ⚠️ À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Helper d'autorisation : un crédit/débit de points est-il légitime pour l'appelant ?
CREATE OR REPLACE FUNCTION public.nx_loyalty_authorized(p_user_id uuid, p_delta integer, p_order_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;          -- serveur (IPN/crons)
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN RETURN true; END IF;
  -- l'utilisateur dépense ses propres points
  IF p_delta <= 0 AND p_user_id = auth.uid() THEN RETURN true; END IF;
  IF p_delta > 0 THEN
    -- earn crédité par le vendeur de la commande à son acheteur
    IF EXISTS (SELECT 1 FROM public.orders o
               WHERE o.id::text = p_order_id AND o.vendor_id = auth.uid() AND o.buyer_id = p_user_id) THEN
      RETURN true;
    END IF;
    -- bonus sur soi si l'appelant est un filleul (parrainé)
    IF p_user_id = auth.uid()
       AND EXISTS (SELECT 1 FROM public.ambassador_referrals ar WHERE ar.referred_user_id = auth.uid()) THEN
      RETURN true;
    END IF;
    -- crédit à l'ambassadeur (parrain) du filleul (appelant)
    IF EXISTS (SELECT 1 FROM public.ambassador_referrals ar
               JOIN public.ambassadors a ON a.id = ar.ambassador_id
               WHERE ar.referred_user_id = auth.uid() AND a.user_id = p_user_id) THEN
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END; $$;

-- ── Surcharge A : (uuid, integer, text, uuid) RETURNS json ───────────────────
CREATE OR REPLACE FUNCTION public.add_loyalty_points(p_user_id uuid, p_delta integer, p_reason text DEFAULT 'order'::text, p_order_id uuid DEFAULT NULL::uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_points integer; v_total_earned integer; v_total_redeemed integer;
BEGIN
  IF NOT public.nx_loyalty_authorized(p_user_id, p_delta, p_order_id::text) THEN
    RETURN json_build_object('ok', false, 'error', 'non autorisé');
  END IF;
  INSERT INTO loyalty_points (user_id, points, total_earned, total_redeemed, updated_at)
  VALUES (p_user_id, GREATEST(0, p_delta), GREATEST(0, p_delta), 0, now())
  ON CONFLICT (user_id) DO UPDATE SET
    points = GREATEST(0, loyalty_points.points + p_delta),
    total_earned = CASE WHEN p_delta > 0 THEN loyalty_points.total_earned + p_delta ELSE loyalty_points.total_earned END,
    total_redeemed = CASE WHEN p_delta < 0 THEN loyalty_points.total_redeemed + ABS(p_delta) ELSE loyalty_points.total_redeemed END,
    updated_at = now()
  RETURNING points, total_earned, total_redeemed INTO v_points, v_total_earned, v_total_redeemed;
  INSERT INTO loyalty_history (user_id, delta, reason, order_id, balance_after, created_at)
  VALUES (p_user_id, p_delta, p_reason, p_order_id, v_points, now());
  RETURN json_build_object('ok', true, 'points', v_points, 'total_earned', v_total_earned, 'total_redeemed', v_total_redeemed);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END; $function$;

-- ── Surcharge B : (uuid, uuid, integer, text) RETURNS integer ────────────────
CREATE OR REPLACE FUNCTION public.add_loyalty_points(p_user_id uuid, p_order_id uuid, p_amount_xof integer, p_reason text DEFAULT 'order'::text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_points integer; v_existing integer;
BEGIN
  IF EXISTS (SELECT 1 FROM loyalty_history WHERE order_id = p_order_id AND reason = p_reason) THEN
    SELECT points INTO v_existing FROM loyalty_points WHERE user_id = p_user_id;
    RETURN COALESCE(v_existing, 0);
  END IF;
  v_points := GREATEST(1, ROUND(p_amount_xof / 100 * 5));
  IF NOT public.nx_loyalty_authorized(p_user_id, v_points, p_order_id::text) THEN
    RAISE EXCEPTION 'points non autorisés';
  END IF;
  INSERT INTO loyalty_points (user_id, points, total_earned, updated_at)
  VALUES (p_user_id, v_points, v_points, now())
  ON CONFLICT (user_id) DO UPDATE SET
    points = loyalty_points.points + v_points,
    total_earned = loyalty_points.total_earned + v_points, updated_at = now();
  INSERT INTO loyalty_history (id, user_id, delta, reason, order_id, created_at)
  VALUES (gen_random_uuid(), p_user_id, v_points, p_reason, p_order_id, now());
  RETURN v_points;
END; $function$;

-- ── Surcharge C : (uuid, integer, text, text, text) RETURNS jsonb — appelée par le front ─
CREATE OR REPLACE FUNCTION public.add_loyalty_points(p_user_id uuid, p_delta integer, p_reason text DEFAULT 'order'::text, p_order_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_row loyalty_points%ROWTYPE;
BEGIN
  IF NOT public.nx_loyalty_authorized(p_user_id, p_delta, p_order_id) THEN
    RAISE EXCEPTION 'points non autorisés';
  END IF;
  INSERT INTO loyalty_points (user_id, points, total_earned, total_redeemed)
  VALUES (p_user_id, GREATEST(0, p_delta),
          CASE WHEN p_delta > 0 THEN p_delta ELSE 0 END,
          CASE WHEN p_delta < 0 THEN ABS(p_delta) ELSE 0 END)
  ON CONFLICT (user_id) DO UPDATE SET
    points = GREATEST(0, loyalty_points.points + p_delta),
    total_earned = loyalty_points.total_earned + CASE WHEN p_delta > 0 THEN p_delta ELSE 0 END,
    total_redeemed = loyalty_points.total_redeemed + CASE WHEN p_delta < 0 THEN ABS(p_delta) ELSE 0 END,
    updated_at = now()
  RETURNING * INTO v_row;
  INSERT INTO loyalty_history (user_id, delta, reason, order_id, note)
  VALUES (p_user_id, p_delta, p_reason, p_order_id, p_note);
  RETURN jsonb_build_object('points', v_row.points, 'total_earned', v_row.total_earned,
    'total_redeemed', v_row.total_redeemed, 'delta', p_delta,
    'can_redeem', v_row.points >= 500, 'fcfa_value', FLOOR(v_row.points::DECIMAL / 100));
END; $function$;

-- ── Verrouillage RLS : plus d'insert/ALL client direct (tout passe par les RPC) ─
DROP POLICY IF EXISTS loyalty_service_all     ON public.loyalty_points;
DROP POLICY IF EXISTS system_inserts_loyalty  ON public.loyalty_points;
-- lecture de son propre solde conservée (loyalty_select_own / loyalty_own / loyalty_points_select_own)

COMMIT;
