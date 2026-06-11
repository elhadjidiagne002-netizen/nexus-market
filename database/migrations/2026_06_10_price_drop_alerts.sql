-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Alertes BAISSE DE PRIX (extension de stock_alerts)
--
--  En plus du « retour en stock », on notifie l'acheteur quand le prix d'un
--  produit qu'il suit (alerte ou favori) BAISSE sous le prix au moment où il
--  s'est abonné. Anti-spam : on ne renotifie que si le prix descend ENCORE plus
--  bas que la dernière alerte (last_notified_price).
--
--  Schéma stock_alerts (all_supabase) : id, user_id, product_id, notified,
--  notified_at, user_email, created_at. On ajoute le prix de référence.
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

ALTER TABLE public.stock_alerts ADD COLUMN IF NOT EXISTS price_at_subscribe  numeric;
ALTER TABLE public.stock_alerts ADD COLUMN IF NOT EXISTS last_notified_price numeric;

-- Backfill : pour les abonnements existants, fixer le prix de référence au prix
-- courant du produit (pas d'alerte rétroactive intempestive).
UPDATE public.stock_alerts a
   SET price_at_subscribe = p.price
  FROM public.products p
 WHERE a.product_id = p.id
   AND a.price_at_subscribe IS NULL;
