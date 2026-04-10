-- ============================================================
-- NEXUS Market — Fonctions RPC manquantes
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- ── 1. Décrémenter le stock lors d'une commande ──────────────
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INT)
RETURNS void AS $$
  UPDATE products
  SET stock = GREATEST(stock - qty, 0)
  WHERE id = product_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 2. Incrémenter le stock lors d'une annulation ────────────
CREATE OR REPLACE FUNCTION increment_stock(product_id UUID, qty INT)
RETURNS void AS $$
  UPDATE products
  SET stock = stock + qty
  WHERE id = product_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 3. Vérification ──────────────────────────────────────────
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('decrement_stock', 'increment_stock');
