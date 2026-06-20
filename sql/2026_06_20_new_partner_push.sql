-- 2026_06_20_new_partner_push.sql
-- Notifications PUSH automatiques aux admins quand un nouveau PRO (NEXUS Pro) ou
-- un nouvel ÉLEVEUR s'inscrit. On insère une notification in-app pour chaque admin ;
-- le trigger existant `trg_push_on_notification` (2026_06_12_push_on_notification_trigger.sql)
-- se charge d'envoyer le Web Push. Aucun envoi HTTP ici.
--
-- ⚠️ À exécuter APRÈS 2026_06_14_nexus_pros.sql, 2026_06_09_local_and_breeding.sql
--    et 2026_06_12_push_on_notification_trigger.sql. Idempotent / rejouable.

BEGIN;

-- ─── Nouveau professionnel (INSERT dans pros = 1ère inscription ; les MAJ via
--     pro_register passent par ON CONFLICT DO UPDATE → ne déclenchent pas ce trigger).
CREATE OR REPLACE FUNCTION public._notify_admins_new_pro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT a.id, 'system',
         '🔧 Nouveau professionnel NEXUS Pro',
         COALESCE(NULLIF(NEW.name, ''), 'Un artisan')
           || ' — ' || COALESCE(NEW.profession, 'métier non précisé')
           || CASE WHEN COALESCE(NEW.city, '') <> '' THEN ' (' || NEW.city || ')' ELSE '' END
           || ' vient de s''inscrire. À modérer dans Admin → Pros.',
         '/'
  FROM public.profiles a
  WHERE a.role = 'admin';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- ne jamais bloquer l'inscription du pro
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_pro ON public.pros;
CREATE TRIGGER trg_notify_admins_new_pro
  AFTER INSERT ON public.pros
  FOR EACH ROW EXECUTE FUNCTION public._notify_admins_new_pro();

-- ─── Nouvel éleveur (profiles.is_breeder passe de false/null → true).
CREATE OR REPLACE FUNCTION public._notify_admins_new_breeder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.is_breeder = true AND COALESCE(OLD.is_breeder, false) = false THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT a.id, 'system',
           '🐏 Nouvel éleveur NEXUS',
           COALESCE(NULLIF(NEW.shop_name, ''), NULLIF(NEW.name, ''), 'Un éleveur')
             || ' vient d''activer son profil éleveur. À voir dans Admin → Éleveurs.',
           '/'
    FROM public.profiles a
    WHERE a.role = 'admin';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_breeder ON public.profiles;
CREATE TRIGGER trg_notify_admins_new_breeder
  AFTER UPDATE OF is_breeder ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._notify_admins_new_breeder();

COMMIT;
