-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Badge « Vendeur de confiance » (calcul automatique)
--
--  Calcule un score de confiance par vendeur à partir de signaux objectifs et
--  pose un drapeau is_trusted, recalculé périodiquement (cron) — aucun arbitrage
--  manuel. Affiché sur la fiche vendeur et les cartes produit.
--
--  Critères (ET) pour le badge :
--    · ≥ 5 commandes livrées        (volume minimal)
--    · note moyenne ≥ 4,0 / 5       (satisfaction)
--    · taux de livraison ≥ 85 %     (fiabilité)
--    · taux de litige ≤ 10 %        (sérieux)
--    · ancienneté ≥ 14 jours        (anti-compte jetable)
--
--  Schéma réel (all_supabase.txt) : profiles(role,created_at),
--  orders(vendor_id,status), products(vendor_id,rating,reviews_count),
--  disputes(vendor_id).
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_trusted       boolean     DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_score      numeric     DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_computed_at timestamptz;

-- Lecture publique du badge : ajouter is_trusted/trust_score aux colonnes
-- exposées par la policy SELECT de profiles (déjà publique pour les vendeurs).

CREATE OR REPLACE FUNCTION public.recompute_vendor_trust()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v RECORD;
  v_total int; v_delivered int; v_disputes int;
  v_rate numeric; v_disp_rate numeric; v_rating numeric; v_age_days numeric;
  v_score numeric; v_trusted boolean; v_count int := 0;
BEGIN
  FOR v IN SELECT id, created_at FROM public.profiles WHERE role = 'vendor' LOOP
    SELECT
      count(*) FILTER (WHERE status <> 'pending_payment'),
      count(*) FILTER (WHERE status = 'delivered')
      INTO v_total, v_delivered
    FROM public.orders WHERE vendor_id = v.id;

    SELECT count(*) INTO v_disputes FROM public.disputes WHERE vendor_id = v.id;

    -- Note moyenne pondérée par le nb d'avis (produits notés du vendeur).
    SELECT COALESCE(
             SUM(rating * GREATEST(reviews_count, 0)) / NULLIF(SUM(GREATEST(reviews_count, 0)), 0),
             AVG(rating) FILTER (WHERE rating > 0)
           )
      INTO v_rating
    FROM public.products WHERE vendor_id = v.id;

    v_rate      := CASE WHEN v_total > 0 THEN v_delivered::numeric / v_total ELSE 0 END;
    v_disp_rate := CASE WHEN v_total > 0 THEN v_disputes::numeric  / v_total ELSE 0 END;
    v_rating    := COALESCE(v_rating, 0);
    v_age_days  := EXTRACT(EPOCH FROM (now() - COALESCE(v.created_at, now()))) / 86400.0;

    v_trusted := (v_delivered >= 5)
             AND (v_rating   >= 4.0)
             AND (v_rate     >= 0.85)
             AND (v_disp_rate <= 0.10)
             AND (v_age_days >= 14);

    -- Score 0–100 (indicatif) : note 40 % + fiabilité 30 % + absence litige 20 % + volume 10 %.
    v_score := round(
        (LEAST(v_rating, 5) / 5.0) * 40
      + v_rate * 30
      + (1 - LEAST(v_disp_rate, 1)) * 20
      + LEAST(v_delivered, 20) / 20.0 * 10
    );

    UPDATE public.profiles
       SET is_trusted = v_trusted, trust_score = v_score, trust_computed_at = now()
     WHERE id = v.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'vendors_evaluated', v_count, 'at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_vendor_trust() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_vendor_trust() TO service_role, authenticated;

-- Premier calcul immédiat.
SELECT public.recompute_vendor_trust();
