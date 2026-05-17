-- ============================================================
-- NEXUS Market -- Programme de fidelite
-- Exécuter APRES nexus_v2_migrations.sql
-- ============================================================

-- Points fidelite par utilisateur
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points         INTEGER NOT NULL DEFAULT 0,
  total_earned   INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_user ON public.loyalty_points(user_id);

-- Historique des points
CREATE TABLE IF NOT EXISTS public.loyalty_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL DEFAULT 'order',
  order_id   UUID REFERENCES public.orders(id),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_user ON public.loyalty_history(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_date ON public.loyalty_history(created_at);

-- Fonction atomique pour crediter/debiter des points
CREATE OR REPLACE FUNCTION public.add_loyalty_points(
  p_user_id  UUID,
  p_delta    INTEGER,
  p_reason   TEXT DEFAULT 'order',
  p_order_id UUID DEFAULT NULL,
  p_note     TEXT DEFAULT NULL
)
RETURNS INTEGER AS \$\$
DECLARE
  v_new_points INTEGER;
BEGIN
  INSERT INTO public.loyalty_points (user_id, points, total_earned, total_redeemed)
  VALUES (p_user_id,
    GREATEST(0, p_delta),
    GREATEST(0, p_delta),
    0)
  ON CONFLICT (user_id) DO UPDATE
    SET points       = GREATEST(0, loyalty_points.points + p_delta),
        total_earned = CASE WHEN p_delta > 0
                            THEN loyalty_points.total_earned + p_delta
                            ELSE loyalty_points.total_earned END,
        total_redeemed = CASE WHEN p_delta < 0
                              THEN loyalty_points.total_redeemed + ABS(p_delta)
                              ELSE loyalty_points.total_redeemed END,
        updated_at   = NOW()
  RETURNING points INTO v_new_points;

  INSERT INTO public.loyalty_history (user_id, delta, reason, order_id, note)
  VALUES (p_user_id, p_delta, p_reason, p_order_id, p_note);

  RETURN v_new_points;
END;
\$\$ LANGUAGE plpgsql;