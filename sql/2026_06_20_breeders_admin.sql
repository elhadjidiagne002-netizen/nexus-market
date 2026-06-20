-- 2026_06_20_breeders_admin.sql
-- Gestion admin des éleveurs NEXUS (flag profiles.is_breeder, posé par le module
-- Local & Élevage « Devenir éleveur »). Deux RPC SECURITY DEFINER réservées aux
-- comptes admin, consommées par AdminDashboard → onglet « 🐏 Éleveurs ».
--
-- ⚠️ À exécuter APRÈS 2026_06_09_local_and_breeding.sql, sur la base Supabase
--    déployée (SQL Editor ou psql). Idempotent / rejouable.

BEGIN;

-- Liste des éleveurs (admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_list_breeders()
RETURNS TABLE (
  id          uuid,
  name        text,
  shop_name   text,
  phone       text,
  current_lat double precision,
  current_lng double precision,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p.id, p.name, p.shop_name, p.phone, p.current_lat, p.current_lng, p.created_at
  FROM public.profiles p
  WHERE p.is_breeder = true
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  ORDER BY p.created_at DESC NULLS LAST;
$$;

-- Activer / retirer le statut éleveur d'un utilisateur (admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_set_breeder(p_user_id uuid, p_is_breeder boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;
  UPDATE public.profiles SET is_breeder = COALESCE(p_is_breeder, false) WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_breeders()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_breeder(uuid, boolean)     TO authenticated;

COMMIT;
