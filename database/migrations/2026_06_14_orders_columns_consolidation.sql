-- ============================================================================
-- Consolidation des colonnes `orders` — montant & legacy
-- Audit : docs/audit-orders-amounts-2026-06-14.md (2026-06-14, prod live)
--
-- ⚠️  À VALIDER AVANT EXÉCUTION — données financières.
--     NE PAS exécuter sans accord explicite. Aucune valeur monétaire n'est
--     réécrite ici (canonique retenu : `total`, en EUR). On ne fait que
--     supprimer des colonnes mortes/redondantes.
--
-- PRÉREQUIS CODE (cf. §3-C de l'audit) — déployer AVANT l'étape 2 :
--   public/index.html:16892-16899  →  total: r.total ?? r.amount_eur ?? 0
--                                      products: r.products ?? r.items ?? []
--   (sinon le drop de amount_eur transforme un 0 silencieux en undefined ;
--    et casse la lecture correcte des 14 commandes anciennes.)
--
-- Recommandé aussi (non bloquant pour les drops) : §3-B (paytech-webhook.js:142,
--   division erronée) et §3-A (libellés « FCFA » sur des montants EUR).
--
-- Rollback : un DROP COLUMN est irréversible (perte de schéma). Les valeurs
--   perdues sont soit nulles (order_total, amount_fcfa), soit des miroirs exacts
--   (canceled_at = cancelled_at, amount_eur = total à l'ère ancienne, user_id
--   couvert par buyer_id, id_old auto-généré sans signification). Prendre un
--   backup logique de `orders` avant exécution si une réversibilité est exigée.
-- ============================================================================

BEGIN;

-- Garde-fous : ces assertions doivent passer sur le live au moment de l'exécution.
-- (Si l'une échoue → STOP, ré-auditer : un usage non prévu est apparu.)
DO $$
DECLARE
  n_total_null    int;
  n_order_total   int;
  n_amount_fcfa   int;
  n_uid_only      int;   -- user_id renseigné sans buyer_id
  n_cancel_diverge int;  -- canceled_at différent de cancelled_at
BEGIN
  SELECT count(*) FILTER (WHERE total IS NULL),
         count(order_total),
         count(amount_fcfa),
         count(*) FILTER (WHERE user_id IS NOT NULL AND buyer_id IS NULL),
         count(*) FILTER (WHERE canceled_at IS NOT NULL
                            AND (cancelled_at IS NULL OR cancelled_at <> canceled_at))
    INTO n_total_null, n_order_total, n_amount_fcfa, n_uid_only, n_cancel_diverge
    FROM orders;

  IF n_total_null  > 0 THEN RAISE EXCEPTION 'STOP: % ligne(s) avec total NULL — total ne peut pas être canonique', n_total_null; END IF;
  IF n_order_total > 0 THEN RAISE EXCEPTION 'STOP: order_total non vide (% lignes) — ré-auditer', n_order_total; END IF;
  IF n_amount_fcfa > 0 THEN RAISE EXCEPTION 'STOP: amount_fcfa non vide (% lignes) — ré-auditer', n_amount_fcfa; END IF;
  IF n_uid_only    > 0 THEN RAISE EXCEPTION 'STOP: % ligne(s) user_id sans buyer_id — migrer buyer_id d''abord', n_uid_only; END IF;
  IF n_cancel_diverge > 0 THEN RAISE EXCEPTION 'STOP: % ligne(s) canceled_at != cancelled_at — réconcilier d''abord', n_cancel_diverge; END IF;
END $$;

-- ── Étape 1 : drops sûrs (0 ligne informative / 0 usage code) ────────────────
ALTER TABLE orders DROP COLUMN IF EXISTS order_total;   -- 0 ligne peuplée, jamais écrite
ALTER TABLE orders DROP COLUMN IF EXISTS amount_fcfa;   -- 0 ligne peuplée, jamais écrite
ALTER TABLE orders DROP COLUMN IF EXISTS id_old;        -- text NOT NULL def gen_random_uuid(), référencée nulle part
ALTER TABLE orders DROP COLUMN IF EXISTS canceled_at;   -- miroir exact de cancelled_at (2 lignes identiques)
ALTER TABLE orders DROP COLUMN IF EXISTS user_id;       -- doublon de buyer_id, aucune écriture, fallback lecture seul

-- ── Étape 2 : drop du miroir EUR legacy ─────────────────────────────────────
-- ⚠️ GATÉ (2026-06-14) : NON exécuté tant que index.html:16895 lit `r.amount_eur`.
--    Dropper maintenant afficherait un CA vendeur à 0 pour les commandes ≥ 2026-05-21.
--    → Décommenter cette ligne UNIQUEMENT après déploiement du correctif §3-C.
-- ALTER TABLE orders DROP COLUMN IF EXISTS amount_eur;    -- = total (ère ancienne) / 0 (récente), miroir mort

-- ── Étape 3 (optionnelle) : durcir le canonique ─────────────────────────────
-- 0 NULL constaté sur le live ; verrouille l'invariant « toute commande a un montant ».
-- ALTER TABLE orders ALTER COLUMN total SET NOT NULL;

COMMIT;

-- Vérification post-migration :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='orders'
--     AND column_name IN ('order_total','amount_fcfa','id_old','canceled_at','user_id','amount_eur');
--   -- doit renvoyer 0 ligne.
