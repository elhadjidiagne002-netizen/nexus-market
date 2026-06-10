-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — CORRECTIONS issues de l'audit du backup 2026-06-10T23-43-15
--
--  Constats (sur données réelles du backup) :
--   1. orders.status = 'pending' (12 lignes) — valeur HORS enum documenté
--      {pending_payment, processing, in_transit, delivered, cancelled}.
--   2. orders.payment_status = 'pending' sur TOUTES les commandes, y compris 3
--      LIVRÉES → une commande livrée doit être payée (impact payout/reporting).
--   3. notifications.type = 'new_vendor' (2) — hors contrainte documentée
--      {order,offer,message,return,vendor,system,dispute} (cf. CLAUDE.md §2).
--   4. profiles.is_courier = false pour TOUS les coursiers (index géo partiel
--      inutile ; incohérence avec la table couriers).
--   5. server_logs : 3 483 lignes, jamais purgées (le cron cleanup ne les cible
--      pas) → croissance non bornée.
--   6. 12 produits sur 17 SANS vendor_id → orphelins (absents des boutiques,
--      non rattachables au vendeur / badge confiance / Pro).  ⚠️ revue manuelle.
--
--  Idempotent et SANS perte. Sections « ⚠️ » à relire avant exécution.
--  À exécuter dans Supabase → SQL Editor (rôle postgres).
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ── 1. Normaliser le statut des commandes ────────────────────────────────────
UPDATE public.orders SET status = 'pending_payment'
 WHERE status = 'pending';

-- ── 2. Commande LIVRÉE ⇒ payée (cohérence payout / fidélité / reporting) ──────
--    Sûr : une livraison effectuée implique un paiement encaissé (ou COD remis).
UPDATE public.orders SET payment_status = 'paid'
 WHERE status = 'delivered' AND payment_status <> 'paid';

-- ── 3. Normaliser les types de notification hors contrainte ──────────────────
UPDATE public.notifications SET type = 'vendor'
 WHERE type = 'new_vendor';
-- (autres valeurs parasites éventuelles → 'system' pour ne pas casser l'UI)
UPDATE public.notifications SET type = 'system'
 WHERE type NOT IN ('order','offer','message','return','vendor','system','dispute');

-- ── 4. Marquer comme coursiers les profils présents dans la table couriers ───
--    Réactive l'index GIST partiel idx_profiles_courier_geo (WHERE is_courier).
UPDATE public.profiles p SET is_courier = true
  FROM public.couriers c
 WHERE c.user_id = p.id AND p.is_courier IS DISTINCT FROM true;

-- ── 5. Purge des logs serveur > 14 jours + à AJOUTER au cron cleanup ─────────
DELETE FROM public.server_logs WHERE created_at < now() - interval '14 days';
-- ➕ Dans functions/cron/cleanup.js, ajouter :
--    await del('server_logs', `created_at=lt.${ago(14)}`, 'server_logs_14d');

-- ── 6. ⚠️ Produits orphelins (sans vendor_id) — DIAGNOSTIC (lecture seule) ───
--    Impossible de deviner le bon vendeur automatiquement. Lister puis décider :
--    (a) rattacher à un vendeur connu, ou (b) désactiver en attendant.
-- SELECT id, name, category, price, vendor_name, active FROM public.products WHERE vendor_id IS NULL;
--
--    (a) Rattacher à un vendeur précis (remplacer l'UUID) :
-- UPDATE public.products SET vendor_id = '<UUID_VENDEUR>' WHERE vendor_id IS NULL;
--    (b) OU masquer du catalogue jusqu'à régularisation :
-- UPDATE public.products SET active = false WHERE vendor_id IS NULL;

-- ── 7. ⚠️ (OPTIONNEL) Ré-affirmer les contraintes d'intégrité ────────────────
--    À n'activer qu'après normalisation (sections 1 & 3) ET vérification qu'aucun
--    code n'insère d'autres valeurs. Décommenter pour appliquer.
-- ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
-- ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
--   CHECK (status IN ('pending_payment','processing','in_transit','delivered','cancelled'));
-- ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
--   CHECK (type IN ('order','offer','message','return','vendor','system','dispute'));

-- ── Vérification post-correction ─────────────────────────────────────────────
-- SELECT status, count(*) FROM public.orders GROUP BY status;
-- SELECT payment_status, count(*) FROM public.orders WHERE status='delivered' GROUP BY payment_status;
-- SELECT type, count(*) FROM public.notifications GROUP BY type;
-- SELECT count(*) AS produits_orphelins FROM public.products WHERE vendor_id IS NULL;
