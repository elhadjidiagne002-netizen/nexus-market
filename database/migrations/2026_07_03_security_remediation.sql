-- =====================================================================
-- REMÉDIATION SÉCURITÉ — Audit 2026-07-03
-- Fuite de PII / données admin vers le rôle `anon` (visiteurs anonymes).
--
-- ⚠️ À RELIRE avant exécution sur la prod (projet pqcqbstbdujzaclsiosv).
--    Appliquer par blocs, tester la vitrine publique après le bloc B.
--    Tout est réversible (GRANT inverse) sauf le remplacement de vues.
--
-- Contexte vérifié en prod le 2026-07-03 :
--   · anon lit profiles → 8 vendeurs approuvés AVEC email + téléphone.
--   · 22 vues SECURITY DEFINER exposées à anon/authenticated (bypass RLS).
--   · anon a SELECT sur orders/profiles/payout_requests, DELETE sur orders.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOC A — Verrouiller les 22 vues admin (SECURITY DEFINER)
-- Ces vues contournent le RLS. Aucune ne doit être lisible par anon.
-- Réversible : re-GRANT SELECT ... TO ... si besoin.
-- NB : `vendor_profiles` est traitée à part (Bloc C) car elle sert la
--      vitrine publique — ne PAS la révoquer ici.
-- ---------------------------------------------------------------------
REVOKE ALL ON
  public.payout_requests_admin,
  public.v_invoices_summary,
  public.search_popular,
  public.b2b_buyers_admin,
  public.loyalty_leaderboard,
  public.v_vendor_stock_dashboard,
  public.category_boost_revenue,
  public.logs_summary_24h,
  public.logs_recent_errors,
  public.v_buyer_pro_admin,
  public.affiliate_stats,
  public.flash_sales_revenue,
  public.ad_revenue,
  public.delivery_revenue,
  public.api_revenue,
  public.b2b_priority_revenue,
  public.pending_vendors,
  public.pending_approvals,
  public.vendor_daily_metrics,
  public.insurance_leads_kpi,
  public.nexus_table_sizes
FROM anon, authenticated;

-- Option recommandée en complément : passer ces vues en SECURITY INVOKER
-- (Postgres 15+) pour qu'elles respectent le RLS de l'appelant.
-- Décommenter si vous voulez les garder accessibles au service_role uniquement :
-- ALTER VIEW public.payout_requests_admin SET (security_invoker = true);
-- (répéter par vue si souhaité)


-- ---------------------------------------------------------------------
-- BLOC B — Retirer les grants d'écriture/lecture trop larges au niveau
-- table. Le code backend utilise la SERVICE KEY (bypass RLS) ; anon /
-- authenticated ne doivent JAMAIS écrire directement ces tables.
-- ⚠️ Vérifier que le frontend n'écrit pas orders via anon-key en direct
--    (il passe par les CF Functions → OK). Tester un checkout après.
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders          FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payout_requests FROM anon, authenticated;
-- profiles : garder UPDATE (RLS = auth.uid()=id) ; retirer DELETE/TRUNCATE.
REVOKE DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;


-- ---------------------------------------------------------------------
-- BLOC C — Colonnes vitrine vendeur SANS PII
-- Problème : la policy `profiles_vendor_public` (role=vendor AND approved)
-- expose TOUTE la ligne, email + téléphone inclus, à anon.
-- PostgREST respecte les GRANT colonne par colonne. On retire le SELECT
-- global de anon sur profiles et on ne redonne que les colonnes publiques.
--
-- ⚠️ IMPACT FRONTEND : si le code lit `profiles.email` / `profiles.phone`
--    en tant que visiteur non connecté, ça cassera (c'est le but : ces
--    champs ne doivent pas être publics). Un utilisateur connecté lit
--    toujours SA propre ligne complète (policy profiles_own_read).
--    → Tester la page vitrine vendeur + fiche produit avant/après.
--
-- Adapter la liste des colonnes « sûres » à votre schéma réel.
-- ---------------------------------------------------------------------
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, name, role, status, shop_name, shop_category, bio,
  logo, avatar, opening_hours, return_policy, created_at
) ON public.profiles TO anon;
-- (email, phone, whatsapp_number, adresse, etc. : volontairement EXCLUS)

-- `authenticated` conserve SELECT complet mais le RLS filtre déjà :
-- profiles_own_read (sa ligne) + profiles_commission_vendor_read.
-- Si vous voulez aussi masquer email/phone des AUTRES vendeurs aux
-- utilisateurs connectés, appliquer le même schéma de GRANT colonnes à
-- `authenticated` (attention à ne pas casser la lecture de sa propre ligne
-- — préférer dans ce cas une vue dédiée `me` / `vendor_public`).


-- ---------------------------------------------------------------------
-- BLOC D — vendor_profiles (vue vitrine) sans email/phone
-- Recréer la vue publique en retirant email, phone, whatsapp_number.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vendor_profiles AS
SELECT p.id, p.name, p.shop_name, p.shop_category, p.bio,
       p.logo, p.avatar, p.opening_hours, p.return_policy, p.status, p.created_at,
       count(pr.id) AS product_count,
       (COALESCE(avg(pr.rating), 0::numeric))::numeric(3,1) AS avg_rating,
       count(pr.id) FILTER (WHERE pr.active = true) AS active_product_count
FROM profiles p
LEFT JOIN products pr ON pr.vendor_id = p.id
WHERE p.role = 'vendor' AND p.status <> 'banned'
GROUP BY p.id;
-- Cette vue peut rester lisible par anon (aucune PII désormais) :
GRANT SELECT ON public.vendor_profiles TO anon, authenticated;


-- ---------------------------------------------------------------------
-- BLOC E — Durcissements Auth / advisors (à faire aussi côté dashboard)
-- ---------------------------------------------------------------------
-- 1. Activer "Leaked password protection" : Dashboard → Auth → Policies.
-- 2. Corriger les 13 policies `always_true` : les auditer une par une
--    (SELECT * FROM pg_policies WHERE qual = 'true') et remplacer par une
--    condition réelle (auth.uid()=..., role, is_admin()).
-- 3. Table avec RLS activé sans policy (deny-all involontaire) : identifier
--    via l'advisor `rls_enabled_no_policy` et ajouter la policy attendue.
-- 4. search_path mutable (67 fonctions) : ALTER FUNCTION ... SET search_path = ''.
--
-- Vérification finale (doit renvoyer 0 ligne sensible) :
--   SET ROLE anon;
--   SELECT count(email) FROM public.profiles;          -- attendu : erreur/0
--   SELECT count(*) FROM public.payout_requests_admin; -- attendu : permission denied
--   RESET ROLE;
-- =====================================================================
