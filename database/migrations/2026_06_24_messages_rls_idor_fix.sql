-- 2026_06_24_messages_rls_idor_fix.sql
-- ============================================================================
-- [SÉCURITÉ CRITIQUE] IDOR sur les messages privés.
-- ============================================================================
-- La policy messages_service_all était cmd=ALL, qual=true MAIS appliquée au rôle
-- {public} (au lieu de {service_role}). Comme les policies RLS sont permissives,
-- elle écrasait tout → N'IMPORTE QUEL utilisateur pouvait LIRE, MODIFIER et
-- SUPPRIMER tous les messages privés entre n'importe quels utilisateurs.
--
-- Correctif : restreindre cette policy au rôle service_role (backend). Les
-- policies user-scoped EXISTANTES reprennent la main pour les utilisateurs :
--   messages_select_own / messages_update_own : auth.uid() = from_id OR to_id
--   messages_insert : with_check from_id = auth.uid()
--   messages_delete_forbidden : DELETE interdit (qual false)
DROP POLICY IF EXISTS "messages_service_all" ON public.messages;
CREATE POLICY "messages_service_all" ON public.messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
