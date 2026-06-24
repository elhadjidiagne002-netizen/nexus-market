-- 2026_06_24_profile_privilege_protection.sql
-- ============================================================================
-- [SÉCURITÉ CRITIQUE] Escalade de privilèges vers 'admin' via la table profiles.
-- ============================================================================
-- Deux vecteurs corrigés :
--   1. UPDATE direct : la policy RLS profiles_update_own avait WITH CHECK = NULL,
--      donc Postgres réutilisait le USING (auth.uid()=id). Un utilisateur pouvait
--      faire  supabase.from('profiles').update({role:'admin'}).eq('id', monId)
--      depuis la console et devenir admin (accès total).
--   2. Signup metadata : handle_new_user() copiait raw_user_meta_data->>'role'
--      tel quel, donc  signUp({ options:{ data:{ role:'admin' } } })  créait un
--      profil admin à l'inscription.
--
-- Flux légitimes PRÉSERVÉS : édition de profil (name/avatar/phone/address),
-- "devenir éleveur" (is_breeder + position, côté client), inscription
-- vendeur/coursier (rôle posé par handle_new_user, statut pending pour vendeur),
-- validations/écritures par l'admin (is_admin()) et par le backend (service_role).

-- ── Fix #1 : handle_new_user — whitelist du rôle (jamais 'admin') + statut sûr ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role', 'buyer');
BEGIN
  -- Whitelist stricte : tout rôle hors liste (dont 'admin') retombe sur 'buyer'.
  IF v_role NOT IN ('buyer','buyer_pro','vendor','courier','pro','breeder') THEN
    v_role := 'buyer';
  END IF;
  INSERT INTO public.profiles (
    id, email, name, owner_name, phone, role, status,
    shop_name, shop_category, ninea, rc, address, avatar, created_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'owner_name', NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    v_role,
    -- Statut JAMAIS issu des métadonnées (anti auto-approbation). Vendeur = pending.
    CASE WHEN v_role = 'vendor' THEN 'pending' ELSE 'active' END,
    COALESCE(NEW.raw_user_meta_data->>'shopName', NEW.raw_user_meta_data->>'shop_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'shopCategory', NEW.raw_user_meta_data->>'shop_category', ''),
    COALESCE(NEW.raw_user_meta_data->>'ninea', ''),
    COALESCE(NEW.raw_user_meta_data->>'rc', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar', ''),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ── Fix #2 : trigger anti-escalade sur profiles (INSERT + UPDATE) ─────────────
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Appelants privilégiés : backend (service_role) et admins.
  -- ⚠️ NE PAS utiliser current_user : en SECURITY DEFINER il vaut le PROPRIÉTAIRE
  -- (postgres) et laisserait donc TOUT passer. On s'appuie sur auth.role() (claim
  -- JWT) et is_admin(), exactement comme le trigger protect_profile_columns existant.
  IF COALESCE(auth.role(), '') = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Colonnes admin-only : réversion silencieuse aux valeurs existantes.
    -- (name/avatar/phone/address/is_breeder/position restent modifiables.)
    NEW.role            := OLD.role;
    NEW.status          := OLD.status;
    NEW.admin_approved  := OLD.admin_approved;
    NEW.commission_rate := OLD.commission_rate;
  ELSE  -- INSERT direct côté client (hors handle_new_user) : on clampe aussi.
    IF NEW.role NOT IN ('buyer','buyer_pro','vendor','courier','pro','breeder') THEN
      NEW.role := 'buyer';
    END IF;
    NEW.admin_approved := false;
    IF NEW.status = 'approved' THEN
      NEW.status := CASE WHEN NEW.role = 'vendor' THEN 'pending' ELSE 'active' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileges();
