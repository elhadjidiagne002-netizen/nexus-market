-- 2026_06_21_public_chat_v2.sql
-- Chat communautaire NEXUS v2 : salons multiples, réponses, réactions, modération.
-- Idempotent. À exécuter dans Supabase → SQL Editor, puis activer la Réplication
-- (Database → Replication) pour les tables public_chat et public_chat_reactions.

BEGIN;

-- ── Extension de public_chat (créée par le module v1) ───────────────────────
CREATE TABLE IF NOT EXISTS public.public_chat (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname   text NOT NULL,
  text       text NOT NULL,
  user_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS room       text NOT NULL DEFAULT 'general';
ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS avatar     text;
ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS reply_to   uuid;
ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS reply_nick text;
ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS reply_text text;
ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS deleted    boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_public_chat_room_created
  ON public.public_chat (room, created_at DESC);

ALTER TABLE public.public_chat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_chat_read   ON public.public_chat;
DROP POLICY IF EXISTS public_chat_insert ON public.public_chat;
CREATE POLICY public_chat_read   ON public.public_chat FOR SELECT USING (true);
CREATE POLICY public_chat_insert ON public.public_chat FOR INSERT WITH CHECK (true);
-- Modération : l'auteur peut soft-supprimer son message ; l'admin tout message.
DROP POLICY IF EXISTS public_chat_update_mod ON public.public_chat;
CREATE POLICY public_chat_update_mod ON public.public_chat FOR UPDATE
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- ── Réactions emoji ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_chat_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.public_chat(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  client_id  text NOT NULL,         -- identifiant anonyme (localStorage)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, emoji, client_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON public.public_chat_reactions (message_id);

ALTER TABLE public.public_chat_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_reactions_read   ON public.public_chat_reactions;
DROP POLICY IF EXISTS chat_reactions_insert ON public.public_chat_reactions;
DROP POLICY IF EXISTS chat_reactions_delete ON public.public_chat_reactions;
CREATE POLICY chat_reactions_read   ON public.public_chat_reactions FOR SELECT USING (true);
CREATE POLICY chat_reactions_insert ON public.public_chat_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY chat_reactions_delete ON public.public_chat_reactions FOR DELETE USING (true);

COMMIT;

-- Après exécution : Database → Replication → cocher public_chat (et reactions si
-- vous voulez le temps réel des réactions via postgres_changes ; sinon le module
-- utilise un broadcast Realtime, qui ne nécessite pas la réplication).
