-- ═══════════════════════════════════════════════════════════════════════════
-- NEXUS Market — Migration : Programme de fidélité
-- À exécuter dans Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Table principale des soldes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points          integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  total_earned    integer NOT NULL DEFAULT 0,   -- cumulatif à vie
  total_redeemed  integer NOT NULL DEFAULT 0,   -- cumulatif utilisé
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_points_user_unique UNIQUE (user_id)
);

-- ── 2. Table historique des transactions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta       integer NOT NULL,                  -- positif = gain, négatif = dépense
  reason      text NOT NULL,                     -- 'order', 'redeem', 'referral', 'bonus', 'manual'
  order_id    text,                              -- référence commande si applicable
  note        text,                              -- message libre
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loyalty_history_user_id_idx ON public.loyalty_history (user_id, created_at DESC);

-- ── 3. Trigger updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loyalty_points_updated_at ON public.loyalty_points;
CREATE TRIGGER loyalty_points_updated_at
  BEFORE UPDATE ON public.loyalty_points
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Fonction atomique d'ajout de points ────────────────────────────────
-- Utilisée par la Netlify Function pour éviter les race conditions
CREATE OR REPLACE FUNCTION public.add_loyalty_points(
  p_user_id  uuid,
  p_delta    integer,
  p_reason   text DEFAULT 'order',
  p_order_id text DEFAULT NULL,
  p_note     text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_new_points    integer;
  v_total_earned  integer;
  v_total_redeemed integer;
BEGIN
  -- Upsert atomique du solde
  INSERT INTO public.loyalty_points (user_id, points, total_earned, total_redeemed)
  VALUES (
    p_user_id,
    GREATEST(0, p_delta),
    CASE WHEN p_delta > 0 THEN p_delta ELSE 0 END,
    CASE WHEN p_delta < 0 THEN ABS(p_delta) ELSE 0 END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    points         = GREATEST(0, loyalty_points.points + p_delta),
    total_earned   = loyalty_points.total_earned   + CASE WHEN p_delta > 0 THEN p_delta ELSE 0 END,
    total_redeemed = loyalty_points.total_redeemed + CASE WHEN p_delta < 0 THEN ABS(p_delta) ELSE 0 END,
    updated_at     = now()
  RETURNING points, total_earned, total_redeemed
  INTO v_new_points, v_total_earned, v_total_redeemed;

  -- Enregistrement dans l'historique
  INSERT INTO public.loyalty_history (user_id, delta, reason, order_id, note)
  VALUES (p_user_id, p_delta, p_reason, p_order_id, p_note);

  RETURN json_build_object(
    'points',         v_new_points,
    'total_earned',   v_total_earned,
    'total_redeemed', v_total_redeemed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. RLS (Row Level Security) ────────────────────────────────────────────
ALTER TABLE public.loyalty_points  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_history ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur lit et modifie uniquement ses propres données
CREATE POLICY "loyalty_points_select_own"
  ON public.loyalty_points FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "loyalty_points_upsert_own"
  ON public.loyalty_points FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "loyalty_points_update_own"
  ON public.loyalty_points FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "loyalty_history_select_own"
  ON public.loyalty_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "loyalty_history_insert_own"
  ON public.loyalty_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- La fonction add_loyalty_points est SECURITY DEFINER : elle contourne RLS
-- pour les écritures depuis le backend (Netlify Function avec service key)
GRANT EXECUTE ON FUNCTION public.add_loyalty_points TO service_role;
GRANT EXECUTE ON FUNCTION public.add_loyalty_points TO authenticated;

-- Accès aux tables pour la clé service (Netlify Functions)
GRANT ALL ON public.loyalty_points  TO service_role;
GRANT ALL ON public.loyalty_history TO service_role;
GRANT SELECT, INSERT ON public.loyalty_points  TO authenticated;
GRANT SELECT, INSERT ON public.loyalty_history TO authenticated;

-- ── 6. Vue admin (optionnelle) ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.loyalty_leaderboard AS
SELECT
  lp.user_id,
  p.name,
  p.email,
  lp.points,
  lp.total_earned,
  lp.total_redeemed,
  lp.updated_at
FROM public.loyalty_points lp
JOIN public.profiles p ON p.id = lp.user_id
ORDER BY lp.points DESC
LIMIT 100;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — Vérification : SELECT * FROM loyalty_points LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════════════
