-- ═══════════════════════════════════════════════════════════════════
-- NEXUS Market — SQL Patch v1.1
-- À exécuter dans Supabase SQL Editor
-- Complète sql_fix_final.sql (si déjà exécuté)
-- OU à ajouter à la fin de sql_fix_final.sql si pas encore fait
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- [FIX 5] password_hash NOT NULL → nullable
-- ─────────────────────────────────────────────────────────────────────
-- Pourquoi : quand un utilisateur se connecte via Supabase Auth (sans backend),
-- le profil est reconstruit depuis auth.user_metadata SANS password_hash.
-- L'upsert échouait avec "NOT NULL constraint" → l'utilisateur ne pouvait pas se connecter.

ALTER TABLE public.profiles
  ALTER COLUMN password_hash DROP NOT NULL;

-- Ajouter une valeur par défaut vide pour les nouveaux profils Supabase Auth
ALTER TABLE public.profiles
  ALTER COLUMN password_hash SET DEFAULT '';

-- ─────────────────────────────────────────────────────────────────────
-- Vérification
-- ─────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name = 'password_hash';

-- Résultat attendu : is_nullable = YES, column_default = ''
