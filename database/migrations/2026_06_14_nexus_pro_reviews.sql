-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Avis & notation des professionnels « NEXUS Pro » 🔧⭐
--
--  Un client connecté note un pro (1 à 5) + commentaire libre. Contrairement aux
--  avis produit, il n'y a pas d'achat sur la plateforme → pas de notion « vérifié »,
--  mais : authentification requise, 1 avis par (pro, utilisateur), auto-avis interdit.
--  La note moyenne (`pros.rating_avg`) et le nombre d'avis (`pros.rating_count`)
--  sont recalculés CÔTÉ SERVEUR à chaque avis.
--
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
--  Dépend de la migration 2026_06_14_nexus_pros.sql (table `pros`).
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS public.pro_reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name  text,
  rating     integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pro_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_reviews_pro ON public.pro_reviews(pro_id, created_at DESC);

-- ─── RLS : lecture publique, écriture = propriétaire de l'avis ────────────────
ALTER TABLE public.pro_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pro_reviews_select_public ON public.pro_reviews;
CREATE POLICY pro_reviews_select_public ON public.pro_reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS pro_reviews_modify_own ON public.pro_reviews;
CREATE POLICY pro_reviews_modify_own ON public.pro_reviews
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
--  RPC submit_pro_review(pro_id, rating, comment)
--    Upsert de l'avis du client courant + recalcul agrégats sur `pros`.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_pro_review(
  p_pro_id  uuid,
  p_rating  integer,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text;
  v_owner   uuid;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth'); END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rating');
  END IF;

  -- Le pro doit exister ; on interdit l'auto-évaluation.
  SELECT user_id INTO v_owner FROM public.pros WHERE id = p_pro_id;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_owner = v_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_review'); END IF;

  SELECT name INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.pro_reviews (pro_id, user_id, user_name, rating, comment)
  VALUES (p_pro_id, v_uid, COALESCE(v_name, 'Client'), p_rating, NULLIF(p_comment, ''))
  ON CONFLICT (pro_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()
  RETURNING id INTO v_id;

  UPDATE public.pros
     SET rating_avg   = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM public.pro_reviews WHERE pro_id = p_pro_id), 0),
         rating_count = (SELECT count(*) FROM public.pro_reviews WHERE pro_id = p_pro_id),
         updated_at   = now()
   WHERE id = p_pro_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_pro_review(uuid, integer, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  FIN — avis NEXUS Pro. Lecture des avis : SELECT direct sur pro_reviews
--  (RLS lecture publique) ; écriture via submit_pro_review.
-- ════════════════════════════════════════════════════════════════════════════
