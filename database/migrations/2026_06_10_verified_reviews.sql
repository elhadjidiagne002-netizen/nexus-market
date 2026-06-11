-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Avis VÉRIFIÉS avec photo/vidéo
--
--  Un avis est « Achat vérifié » s'il provient d'un acheteur ayant une commande
--  LIVRÉE contenant le produit. La vérification est faite CÔTÉ SERVEUR (RPC
--  SECURITY DEFINER) — le client ne peut pas se déclarer vérifié lui-même.
--  Les photos/vidéo sont stockées dans le bucket Storage `nexus-images`.
--
--  Schéma reviews (all_supabase) : id, product_id, user_id, user_name, rating,
--  comment, helpful, created_at, UNIQUE(product_id,user_id).
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS verified  boolean DEFAULT false;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS images    text[];
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS order_id  text;

-- ── submit_review : insère/maj l'avis + calcule `verified` côté serveur ───────
CREATE OR REPLACE FUNCTION public.submit_review(
  p_product_id uuid, p_rating int, p_comment text DEFAULT NULL,
  p_images text[] DEFAULT '{}', p_video text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text; v_order text; v_verified boolean := false; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth'); END IF;
  IF p_rating < 1 OR p_rating > 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rating'); END IF;

  SELECT name INTO v_name FROM public.profiles WHERE id = v_uid;

  -- Commande LIVRÉE de cet acheteur contenant ce produit → achat vérifié.
  SELECT o.id INTO v_order
    FROM public.orders o
   WHERE o.buyer_id = v_uid
     AND o.status = 'delivered'
     AND o.products @> jsonb_build_array(jsonb_build_object('id', p_product_id::text))
   ORDER BY o.created_at DESC
   LIMIT 1;
  v_verified := (v_order IS NOT NULL);

  -- Limite à 4 photos ; vidéo unique.
  IF p_images IS NOT NULL AND array_length(p_images, 1) > 4 THEN
    p_images := p_images[1:4];
  END IF;

  INSERT INTO public.reviews (product_id, user_id, user_name, rating, comment, images, video_url, order_id, verified)
  VALUES (p_product_id, v_uid, COALESCE(v_name, 'Client'), p_rating, NULLIF(p_comment, ''), p_images, p_video, v_order, v_verified)
  ON CONFLICT (product_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating, comment = EXCLUDED.comment,
        images = EXCLUDED.images, video_url = EXCLUDED.video_url,
        order_id = EXCLUDED.order_id, verified = EXCLUDED.verified,
        created_at = now()
  RETURNING id INTO v_id;

  -- Recalcule la note moyenne + le nombre d'avis du produit.
  UPDATE public.products
     SET rating = COALESCE((SELECT round(avg(rating)::numeric, 1) FROM public.reviews WHERE product_id = p_product_id), 0),
         reviews_count = (SELECT count(*) FROM public.reviews WHERE product_id = p_product_id)
   WHERE id = p_product_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'verified', v_verified);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_review(uuid, int, text, text[], text) TO authenticated;
