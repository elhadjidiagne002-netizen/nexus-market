-- ============================================================================
-- Correction : comptes "vendeur" fantômes issus de la prospection en masse
-- ============================================================================
-- Constat (audit du backup Nexus_Backup_2026-08-26T12-25-32 vs prospects) :
-- 423 des 432 profils role='vendor' (98%) ne sont PAS de vrais vendeurs
-- inscrits : ce sont des contacts de prospection (agences immobilières,
-- garages/mécaniciens, loueurs de matériel, transporteurs, vendeurs de
-- carreaux/pneus/batteries/pièces moto/verre auto, épiceries bio...) importés
-- en masse le 2026-08-11/12 via prospects.promoted_user_id — jamais de vraie
-- inscription (password_hash vide, jamais connectés), et ZÉRO produit, ZÉRO
-- commande. 294 d'entre eux ont même status='approved' → visibles publiquement
-- comme vendeurs actifs alors que ce sont des coquilles vides.
-- Exemple signalé par l'utilisateur : agences immobilières (ATLAS IMMO
-- Sénégal, Ilios Groupe Immobilier, Saloum Immobilier...) inscrites comme
-- vendeurs — confirmé, et généralisé à 12 autres métiers du même import.
-- Répartition détaillée : sql/../comptes_vendeurs_fantomes_prospection.csv
-- (423 lignes, généré depuis ce même audit).
--
-- Root cause probable : certaines de ces entreprises apparaissent dans DEUX
-- fichiers de prospection différents avec un account_type différent (ex.
-- "DAROU SALAM CARREAUX" à la fois carreleur/pro ET vendeur de carreaux) ;
-- lors de la double promotion, le profil dédupliqué par téléphone a hérité
-- du rôle vendor sans jamais qu'un vrai compte ne soit créé derrière.
--
-- Correction : repasse ces comptes fantômes en role='buyer' (rôle neutre,
-- déjà le défaut de 2373/3170 profils). Ne touche PAS :
--   - la table prospects (garde l'historique de promotion tel quel) ;
--   - is_pro / is_courier / is_breeder / is_rescuer (annuaires métiers
--     légitimes qui fonctionnent par design sans connexion, cf. table `pros`) ;
--   - les 9 vrais comptes vendeur (ont un produit, une commande, ou une
--     vraie connexion — vérifiés non concernés par ce script).
--
-- Idempotent : le périmètre est recalculé sur l'état ACTUEL des tables au
-- moment de l'exécution (pas une liste d'UUID figée sur le backup) — rejouer
-- ce script ne fait rien si déjà appliqué (la clause WHERE role='vendor' ne
-- retrouve alors plus aucune ligne fantôme).
-- ============================================================================

-- Étape 1 (vérification avant correction) — à exécuter d'abord pour contrôler
-- le périmètre exact au moment de l'exécution :
--
-- SELECT p.id, p.name, p.email, p.phone, p.status, p.admin_approved,
--        pr.profession, pr.source
-- FROM public.profiles p
-- JOIN public.prospects pr ON pr.promoted_user_id = p.id
-- WHERE p.role = 'vendor'
--   AND (p.password_hash IS NULL OR p.password_hash = '')
--   AND p.last_login IS NULL
--   AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.vendor_id = p.id)
--   AND NOT EXISTS (SELECT 1 FROM public.orders x WHERE x.vendor_id = p.id)
-- ORDER BY pr.profession, p.name;

-- Étape 2 (correction) :
-- Le trigger trg_protect_profile (protect_profile_columns(), sql/2026_06_21_rls_hardening.sql)
-- interdit de changer `role` sauf pour service_role ou is_admin(). Le SQL Editor / l'API
-- Management n'a pas de JWT (auth.role() = NULL) → on se déclare service_role le temps de
-- CETTE transaction (chemin privilégié prévu par le trigger).
-- ⚠️ set_config(..., true) est LOCAL À LA TRANSACTION : deux instructions top-level
-- séparées (SELECT set_config puis UPDATE) peuvent tourner sur deux transactions/
-- connexions différentes selon le pooler (Supavisor en mode transaction) et perdre le
-- bypass entre les deux → erreur "Modification non autorisée...". Il FAUT donc tout
-- exécuter dans le MÊME bloc PL/pgSQL (une seule instruction), exactement comme le fait
-- déjà sql/2026_08_12_depanneurs_insert_promote.sql pour la même raison.
DO $$
DECLARE
  n_corrected int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true); -- variante ancienne d'auth.role()

  WITH ghost_vendors AS (
    SELECT p.id
    FROM public.profiles p
    JOIN public.prospects pr ON pr.promoted_user_id = p.id
    WHERE p.role = 'vendor'
      AND (p.password_hash IS NULL OR p.password_hash = '')
      AND p.last_login IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.vendor_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.orders x WHERE x.vendor_id = p.id)
  )
  UPDATE public.profiles
  SET role = 'buyer'
  WHERE id IN (SELECT id FROM ghost_vendors);

  GET DIAGNOSTICS n_corrected = ROW_COUNT;
  RAISE NOTICE 'Comptes vendeur fantômes corrigés (role -> buyer) : %', n_corrected;
END $$;

-- Étape 3 (contrôle après correction) — doit renvoyer 0 ligne :
-- SELECT count(*) FROM public.profiles p
-- JOIN public.prospects pr ON pr.promoted_user_id = p.id
-- WHERE p.role = 'vendor'
--   AND (p.password_hash IS NULL OR p.password_hash = '')
--   AND p.last_login IS NULL
--   AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.vendor_id = p.id)
--   AND NOT EXISTS (SELECT 1 FROM public.orders x WHERE x.vendor_id = p.id);
