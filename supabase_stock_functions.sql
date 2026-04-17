-- ============================================================
-- NEXUS Market — Gestion atomique du stock
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. check_and_reserve_stock ────────────────────────────────
-- Vérifie et décrémente le stock de plusieurs produits en une
-- seule transaction atomique (évite la race condition).
-- Retourne une table avec le résultat pour chaque produit.
-- En cas de rupture sur un seul produit, toute la transaction
-- est annulée (ROLLBACK automatique via EXCEPTION).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_and_reserve_stock(
  p_items JSONB  -- [{"product_id": "uuid", "quantity": 2}, ...]
)
RETURNS TABLE (
  product_id  UUID,
  product_name TEXT,
  requested   INT,
  available   INT,
  success     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item        JSONB;
  v_id        UUID;
  v_qty       INT;
  v_stock     INT;
  v_name      TEXT;
  v_has_error BOOLEAN := FALSE;
  error_msgs  TEXT    := '';
BEGIN
  -- Vérification préalable (sans modifier le stock)
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id  := (item->>'product_id')::UUID;
    v_qty := (item->>'quantity')::INT;

    SELECT stock, name INTO v_stock, v_name
    FROM products
    WHERE id = v_id AND active = TRUE
    FOR UPDATE;  -- lock la ligne pour éviter la lecture sale

    IF NOT FOUND THEN
      RETURN QUERY SELECT v_id, 'Produit introuvable'::TEXT, v_qty, 0, FALSE;
      v_has_error := TRUE;
    ELSIF v_stock < v_qty THEN
      RETURN QUERY SELECT v_id, v_name, v_qty, v_stock, FALSE;
      v_has_error := TRUE;
    ELSE
      RETURN QUERY SELECT v_id, v_name, v_qty, v_stock, TRUE;
    END IF;
  END LOOP;

  -- Si au moins un produit est en rupture → rollback implicite
  IF v_has_error THEN
    RAISE EXCEPTION 'STOCK_INSUFFICIENT: Certains articles ne sont plus disponibles en quantité suffisante.';
  END IF;

  -- Tous les articles sont disponibles → décrémentation atomique
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id  := (item->>'product_id')::UUID;
    v_qty := (item->>'quantity')::INT;

    UPDATE products
    SET stock = stock - v_qty,
        updated_at = NOW()
    WHERE id = v_id
      AND stock >= v_qty;  -- double vérification (sécurité supplémentaire)

    IF NOT FOUND THEN
      RAISE EXCEPTION 'STOCK_RACE: Le stock a changé pendant la transaction pour le produit %.', v_id;
    END IF;
  END LOOP;

END;
$$;


-- ── 2. release_stock ─────────────────────────────────────────
-- Re-crédite le stock lors d'une annulation ou d'un échec de
-- paiement. Sûr à appeler plusieurs fois (idempotent via
-- order_stock_released).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION release_stock(
  p_items JSONB  -- [{"product_id": "uuid", "quantity": 2}, ...]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item JSONB;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock = stock + (item->>'quantity')::INT,
        updated_at = NOW()
    WHERE id = (item->>'product_id')::UUID;
  END LOOP;
END;
$$;


-- ── 3. increment_stock (compatibilité avec l'existant) ────────
-- Remplace l'ancienne version pour être cohérent avec release_stock.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_stock(
  product_id UUID,
  qty        INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET stock = stock + qty,
      updated_at = NOW()
  WHERE id = product_id;
END;
$$;


-- ── 4. get_product_stocks ─────────────────────────────────────
-- Lecture des stocks en une seule requête (utilisé par le
-- frontend pour vérifier la disponibilité avant checkout).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stocks(p_ids UUID[])
RETURNS TABLE (id UUID, stock INT, active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
STABLE  -- ne modifie pas les données → peut être mis en cache
AS $$
  SELECT id, stock, active
  FROM products
  WHERE id = ANY(p_ids);
$$;


-- ── Permissions ───────────────────────────────────────────────
-- Ces fonctions sont SECURITY DEFINER → s'exécutent avec les
-- droits du propriétaire (service_role), pas ceux de l'appelant.
-- On autorise seulement authenticated + anon à les appeler.
REVOKE ALL ON FUNCTION check_and_reserve_stock(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_stock(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_product_stocks(UUID[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION check_and_reserve_stock(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION release_stock(JSONB)           TO service_role;
GRANT EXECUTE ON FUNCTION get_product_stocks(UUID[])     TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_stock(UUID, INT)     TO service_role;


-- ── Index pour les performances ────────────────────────────────
-- Le FOR UPDATE dans check_and_reserve_stock lock par PK — déjà indexé.
-- Index sur vendor_id pour les requêtes de stats stock vendeur.
CREATE INDEX IF NOT EXISTS idx_products_vendor_stock
  ON products(vendor_id, stock)
  WHERE active = TRUE;
