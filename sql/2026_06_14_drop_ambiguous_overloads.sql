-- ============================================================================
-- Lève l'ambiguïté PostgREST sur 2 RPC (séquelle dérive text↔uuid) — Audit 2026-06-14
--
-- Problème : 2 surcharges de MÊME arité + mêmes noms de paramètres, ne différant
-- que par le type de p_order_id (text vs uuid). Appelées via PostgREST avec des
-- paramètres nommés, elles déclenchent « Could not choose the best candidate
-- function » → l'appel échoue silencieusement (erreurs avalées côté code).
--
-- Décision (vérifiée) : on garde la variante TEXT (retour jsonb) et on supprime
-- la variante UUID, car :
--   • add_loyalty_points : le code lit `result.points` → exige le retour jsonb
--     (la variante uuid renvoyait un simple integer). order_id reçu = uuid string,
--     casté implicitement vers loyalty_history.order_id (uuid). 0 appelant SQL interne.
--   • cancel_order_release_stock : les commandes ont `products` peuplé (clé `id`)
--     et `items` VIDE ; la variante text lit `products`/`id` (correct) tandis que
--     la variante uuid lisait `items`/`productId` (ne restituait jamais le stock).
--     Le code attend aussi `already_cancelled`, renvoyé par la seule variante text.
-- ============================================================================

DROP FUNCTION IF EXISTS public.add_loyalty_points(uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.cancel_order_release_stock(uuid);
