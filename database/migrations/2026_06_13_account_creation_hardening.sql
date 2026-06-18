-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — DURCISSEMENT DE LA CRÉATION DE COMPTE (profiles)
--
--  Analyse du backup 2026-06-12 + tests live. Imperfections corrigées :
--
--  1. FUITE CRITIQUE (prouvée via la clé anon publique) : n'importe qui pouvait
--     lire `email` + `password_hash` (bcrypt) de tous les vendeurs approuvés, et
--     potentiellement iban/bank/wave/orange/ninea/rc. Le RLS protège les LIGNES
--     mais pas les COLONNES → toutes les colonnes sortaient.
--       · password_hash : vestige de l'auth custom abandonnée (Supabase Auth gère
--         les mots de passe dans auth.users). Données déjà PURGÉES (UPDATE NULL).
--       · On REVOQUE l'accès SELECT du rôle `anon` aux colonnes sensibles
--         (identité/finances). Les lectures publiques de vendeur n'utilisent que
--         des colonnes sûres (id,name,shop_name,phone,whatsapp_number,avatar…),
--         donc rien ne casse ; `authenticated` garde l'accès (lecture de SON
--         propre profil + admin), borné par le RLS.
--
--  2. POLICY INSERT EN DOUBLE : profiles_insert_own ET profiles_insert_self
--     (logique identique auth.uid()=id) → on en supprime une.
--
--  3. PERTE DE DONNÉES À L'INSCRIPTION VENDEUR : le trigger handle_new_user ne
--     copiait PAS depuis user_metadata les champs paiement/contact (iban,
--     bank_name, wave_phone, orange_phone, structure_type, payment_method,
--     shop_desc, whatsapp_number, vehicle_type). Avec la confirmation email
--     activée, ces champs étaient perdus (aucune session pour l'UPSERT front).
--     → trigger enrichi (ON CONFLICT DO NOTHING conservé : idempotent).
--
--  Idempotent. À exécuter dans Supabase → SQL Editor (rôle postgres).
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ── 1a. Purge défensive des hash résiduels (déjà fait, rejouable) ─────────────
UPDATE public.profiles SET password_hash = NULL
 WHERE password_hash IS NOT NULL AND password_hash <> '';

-- ── 1b. Couper l'accès du rôle ANON aux colonnes sensibles ────────────────────
--   anon = clé publique présente dans le bundle frontend → accessible à tous.
--   On retire les colonnes d'identité/finances ; les colonnes « vitrine » du
--   vendeur restent lisibles (contact public volontaire : phone, whatsapp_number).
REVOKE SELECT (
  password_hash, email, iban, bank_name, wave_phone, orange_phone,
  ninea, rc, payout_destination, payout_method, payment_method,
  address, github_id, github_login
) ON public.profiles FROM anon;

-- ── 2. Supprimer la policy INSERT en double ───────────────────────────────────
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
-- (on conserve profiles_insert_own : WITH CHECK (auth.uid() = id))

-- ── 3. Trigger handle_new_user enrichi (persiste tous les champs metadata) ────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id, email, name, owner_name, phone, role, status,
    shop_name, shop_category, shop_desc, ninea, rc, address, avatar,
    whatsapp_number, wave_phone, orange_phone, iban, bank_name,
    structure_type, payment_method, vehicle_type, created_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(m->>'name',''),
    COALESCE(m->>'owner_name', m->>'full_name',''),
    COALESCE(m->>'phone',''),
    COALESCE(m->>'role','buyer'),
    CASE WHEN COALESCE(m->>'role','buyer') = 'vendor'
         THEN 'pending' ELSE COALESCE(m->>'status','active') END,
    COALESCE(m->>'shopName', m->>'shop_name',''),
    COALESCE(m->>'shopCategory', m->>'shop_category',''),
    COALESCE(m->>'shopDesc', m->>'shop_desc',''),
    COALESCE(m->>'ninea',''),
    COALESCE(m->>'rc',''),
    COALESCE(m->>'address',''),
    COALESCE(m->>'avatar',''),
    COALESCE(m->>'whatsapp_number', m->>'whatsapp',''),
    COALESCE(m->>'wave_phone',''),
    COALESCE(m->>'orange_phone',''),
    COALESCE(m->>'iban',''),
    COALESCE(m->>'bank_name',''),
    COALESCE(m->>'structure_type',''),
    COALESCE(m->>'payment_method',''),
    COALESCE(m->>'vehicle_type', m->>'courier_vehicle',''),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Le trigger lui-même (sur auth.users) existe déjà ; on ne recrée que la fonction.

-- ── Vérification (à lire après exécution) ─────────────────────────────────────
-- SELECT has_column_privilege('anon','public.profiles','email','SELECT')  AS anon_email,   -- attendu false
--        has_column_privilege('anon','public.profiles','name','SELECT')   AS anon_name;     -- attendu true
