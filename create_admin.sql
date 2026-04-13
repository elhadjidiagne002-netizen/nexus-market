-- ═══════════════════════════════════════════════════════════════
-- NEXUS Market — Création compte Admin dans Supabase
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── ÉTAPE 1 : Créer l'utilisateur dans Supabase Auth ───────────
-- Cette fonction crée le compte dans auth.users avec le mot de passe
-- Elle contourne la confirmation email (email_confirm = true)

SELECT auth.create_user(
  '{"email": "admin@nexus.sn", "password": "NexusAdmin2024!", "email_confirm": true}'::jsonb
);

-- ─── ÉTAPE 2 : Créer/mettre à jour le profil admin ───────────────
-- Récupère l'UUID généré par Supabase Auth et crée le profil

INSERT INTO public.profiles (
  id,
  email,
  password_hash,
  name,
  role,
  status,
  avatar
)
SELECT
  id,
  'admin@nexus.sn',
  '',                -- password_hash vide (auth gérée par Supabase)
  'Admin NEXUS',
  'admin',
  'active',
  'AD'
FROM auth.users
WHERE email = 'admin@nexus.sn'
ON CONFLICT (email) DO UPDATE SET
  role   = 'admin',
  status = 'active',
  name   = 'Admin NEXUS',
  avatar = 'AD';

-- ─── Vérification ────────────────────────────────────────────────
SELECT
  p.id,
  p.email,
  p.name,
  p.role,
  p.status,
  u.created_at,
  u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.email = 'admin@nexus.sn';
