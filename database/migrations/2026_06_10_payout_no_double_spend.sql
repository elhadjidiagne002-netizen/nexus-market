-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Anti double-retrait (SÉCURITÉ #10)
--
--  PROBLÈME : payout-request.js vérifie le solde PUIS insère, sans atomicité.
--  Deux requêtes concurrentes voient le solde plein → le vendeur peut retirer
--  plus que son solde (double-spend / race TOCTOU).
--
--  CORRECTIF : un index UNIQUE PARTIEL garantit qu'un vendeur n'a qu'UNE seule
--  demande « en vol » (pending/processing) à la fois. Lors d'une course entre
--  deux requêtes concurrentes, un seul INSERT réussit ; l'autre viole l'index
--  (23505) et est rejeté proprement par le code (HTTP 409). Le double-spend par
--  concurrence devient impossible.
--
--  ⚠️ Si des doublons « en vol » existent DÉJÀ, la création de l'index échouera.
--  Exécuter d'abord le diagnostic, résoudre les doublons, puis créer l'index.
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- Diagnostic (lecture seule) : vendeurs avec >1 demande en vol (à nettoyer avant).
-- SELECT vendor_id, count(*) AS inflight
-- FROM public.payout_requests
-- WHERE status IN ('pending','processing')
-- GROUP BY vendor_id HAVING count(*) > 1;

-- Un seul retrait pending/processing par vendeur.
CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_one_inflight_per_vendor
  ON public.payout_requests (vendor_id)
  WHERE status IN ('pending', 'processing');
