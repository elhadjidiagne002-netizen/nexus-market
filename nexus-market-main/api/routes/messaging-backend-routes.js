// ══════════════════════════════════════════════════════════════════════════════
// NEXUS Market — Messagerie Backend v4.0.0
// Routes Express à ajouter dans server.js
//
// INTÉGRATION :
//   Remplacer les routes /api/messages existantes (lignes ~1993-2038) par ce fichier.
//   Coller le contenu entre les routes existantes et ─── NOTIFICATIONS ───
//
// SQL SUPABASE À EXÉCUTER (une seule fois) :
//   → Voir section "SQL MIGRATION" en bas de ce fichier
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// STORE DE FRAPPE (in-memory, sans base de données)
// Stocke l'état "en train d'écrire" avec TTL de 4 secondes.
// Sur Render/Railway avec multiple instances, utiliser Redis à la place.
// Pour usage mono-instance (recommandé), cette approche est suffisante.
// ══════════════════════════════════════════════════════════════════════════════
const _typingStore = new Map(); // convId → { userId, userName, updatedAt }
const TYPING_TTL_MS = 4000;

// Nettoyage périodique des entrées expirées (toutes les 10 secondes)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _typingStore.entries()) {
    if (now - val.updatedAt > TYPING_TTL_MS * 2) _typingStore.delete(key);
  }
}, 10000);

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/conversations
// Retourne toutes les conversations de l'utilisateur avec métadonnées :
//   - Dernier message
//   - Compte de messages non lus
//   - Profil de l'interlocuteur
// Optimisé : une seule requête Supabase via GROUP BY (RPC Postgres)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages/conversations', verifyToken, async (req, res) => {
  try {
    const uid = req.user.id;

    // Récupérer tous les messages impliquant l'utilisateur
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('id, from_id, from_name, to_id, to_name, text, read, read_at, created_at')
      .or(`from_id.eq.${uid},to_id.eq.${uid}`)
      .is('deleted_for', null) // Exclure les messages supprimés globalement
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Construire la carte des conversations côté serveur
    const convMap = new Map();
    const partnerIds = new Set();

    for (const m of (msgs || [])) {
      const otherId   = m.from_id === uid ? m.to_id   : m.from_id;
      const otherName = m.from_id === uid ? m.to_name : m.from_name;
      const cid = [uid, otherId].sort().join('::');

      if (!convMap.has(cid)) {
        convMap.set(cid, { id: cid, otherId, otherName, lastMessage: m, unread: 0 });
        partnerIds.add(otherId);
      }

      // Compter les non-lus reçus
      if (m.to_id === uid && !m.read) {
        convMap.get(cid).unread++;
      }
    }

    // Récupérer les profils des interlocuteurs en une seule requête
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email, role, avatar')
      .in('id', [...partnerIds]);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const conversations = [...convMap.values()]
      .sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at))
      .map(c => ({ ...c, profile: profileMap[c.otherId] || null }));

    res.json(conversations);
  } catch (e) {
    Logger.error('messages', 'conversations.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages
// Récupère les messages d'une conversation (avec pagination par curseur).
//
// Query params :
//   with   (string) : userId de l'interlocuteur pour filtrer par conversation
//   after  (ISO)    : Curseur — ne charger que les messages après cette date
//   before (ISO)    : Curseur inverse — pour charger l'historique paginé
//   limit  (int)    : Nombre de messages max (défaut: 50, max: 100)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages', verifyToken, async (req, res) => {
  try {
    const uid = req.user.id;
    const { with: withUser, after, before, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 100);

    let query = supabase
      .from('messages')
      .select(`
        id, from_id, from_name, to_id, to_name, text, read, read_at,
        reply_to_id, reply_to_text, attachments, reactions, deleted_for, created_at
      `);

    // Filtrer par conversation ou par utilisateur
    if (withUser) {
      query = query.or(
        `and(from_id.eq.${uid},to_id.eq.${withUser}),` +
        `and(from_id.eq.${withUser},to_id.eq.${uid})`
      );
    } else {
      query = query.or(`from_id.eq.${uid},to_id.eq.${uid}`);
    }

    // Curseur temporel
    if (after) {
      query = query.gt('created_at', after);
      query = query.order('created_at', { ascending: true });
    } else if (before) {
      query = query.lt('created_at', before);
      query = query.order('created_at', { ascending: false }); // tri inversé pour obtenir les N plus récents avant "before"
    } else {
      query = query.order('created_at', { ascending: true });
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    // Filtrer les messages supprimés pour cet utilisateur
    const result = (data || [])
      .filter(m => !(m.deleted_for || []).includes(uid))
      .map(m => ({
        ...m,
        deleted_for: undefined, // Ne pas exposer la liste complète
        _deleted_for_me: (m.deleted_for || []).includes(uid)
      }));

    // Si before → réinverser pour retourner en ordre chronologique
    if (before) result.reverse();

    res.json(result);
  } catch (e) {
    Logger.error('messages', 'list.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/messages
// Envoyer un nouveau message.
//
// Body :
//   toId         (string, requis)  : ID du destinataire
//   text         (string, requis)  : Contenu du message
//   replyToId    (string, optionnel): ID du message auquel on répond
//   replyToText  (string, optionnel): Texte cité (dénormalisé pour perf)
//   attachment   (object, optionnel): { type:'image', url, name }
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/messages', verifyToken, async (req, res) => {
  const { toId, text, replyToId, replyToText, attachment } = req.body;

  if (!toId)   return res.status(400).json({ error: 'toId requis' });
  if (!text && !attachment) return res.status(400).json({ error: 'text ou attachment requis' });
  if (text && text.length > 4000) return res.status(400).json({ error: 'Message trop long (max 4000 caractères)' });

  // Validation de l'attachment
  if (attachment) {
    if (!['image', 'file'].includes(attachment.type))
      return res.status(400).json({ error: 'Type de pièce jointe invalide' });
    if (!attachment.url || typeof attachment.url !== 'string')
      return res.status(400).json({ error: 'URL de pièce jointe requise' });
  }

  try {
    // Vérifier que le destinataire existe
    const { data: recipient, error: recipErr } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', toId)
      .single();

    if (recipErr || !recipient)
      return res.status(404).json({ error: 'Destinataire introuvable' });

    const row = {
      from_id:       req.user.id,
      from_name:     req.user.name,
      to_id:         toId,
      to_name:       recipient.name,
      text:          text ? text.trim() : '',
      read:          false,
      read_at:       null,
      reply_to_id:   replyToId   || null,
      reply_to_text: replyToText || null,
      attachments:   attachment ? [attachment] : null,
      reactions:     null,
      deleted_for:   null,
    };

    const { data, error } = await supabase
      .from('messages')
      .insert(row)
      .select()
      .single();

    if (error) throw error;

    // Notifications en parallèle (non bloquant)
    Promise.all([
      pushNotification(toId, {
        type:    'message',
        title:   `💬 Message de ${req.user.name}`,
        message: (text || '').slice(0, 100) || '📎 Pièce jointe',
        link:    `/messages/${req.user.id}`,
      }),
      sendEmail({
        to:      recipient.email,
        ...emailTemplates.newMessage(req.user.name, text || '(Pièce jointe)')
      }).catch(() => {}),
    ]).catch(e => Logger.warn('messages', 'notify.error', e.message));

    Logger.info('messages', 'sent', `Message ${req.user.name} → ${recipient.name}`, {
      userId: req.user.id, meta: { toId, hasAttachment: !!attachment, hasReply: !!replyToId }
    });

    res.status(201).json(data);
  } catch (e) {
    Logger.error('messages', 'send.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/unread-count
// Retourne le nombre total de messages non lus pour l'utilisateur.
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages/unread-count', verifyToken, async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_id', req.user.id)
      .eq('read', false);

    if (error) throw error;
    res.json({ count: count || 0, userId: req.user.id });
  } catch (e) {
    res.status(500).json({ error: e.message, count: 0 });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/messages/read
// Marquer tous les messages d'un expéditeur comme lus.
//
// Body :
//   fromId (string, optionnel) : Si fourni, marque uniquement les messages de cet expéditeur
//                                Sinon, marque TOUS les messages reçus non lus
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/api/messages/read', verifyToken, async (req, res) => {
  try {
    const { fromId } = req.body;
    const now = new Date().toISOString();

    let query = supabase
      .from('messages')
      .update({ read: true, read_at: now })
      .eq('to_id', req.user.id)
      .eq('read', false);

    if (fromId) query = query.eq('from_id', fromId);

    const { error, count } = await query.select('id', { count: 'exact', head: true });
    // Note: Supabase ne retourne pas count sur update, on fait sans
    await query;

    res.json({ ok: true, markedAt: now });
  } catch (e) {
    Logger.error('messages', 'read.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/messages/:id/react
// Ajouter ou retirer une réaction emoji sur un message.
// Toggle : si la réaction existe déjà pour cet utilisateur, elle est retirée.
//
// Body :
//   emoji (string, requis) : L'emoji de la réaction
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/api/messages/:id/react', verifyToken, async (req, res) => {
  const { emoji } = req.body;
  if (!emoji || typeof emoji !== 'string' || emoji.length > 8)
    return res.status(400).json({ error: 'Emoji invalide' });

  try {
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('id, from_id, to_id, reactions')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !msg)
      return res.status(404).json({ error: 'Message introuvable' });

    // Vérifier que l'utilisateur est participant à ce message
    if (msg.from_id !== req.user.id && msg.to_id !== req.user.id)
      return res.status(403).json({ error: 'Non autorisé' });

    const reactions = { ...(msg.reactions || {}) };
    if (!reactions[emoji]) reactions[emoji] = [];

    const idx = reactions[emoji].indexOf(req.user.id);
    if (idx >= 0) {
      reactions[emoji].splice(idx, 1); // Retirer
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(req.user.id); // Ajouter
    }

    const { data, error } = await supabase
      .from('messages')
      .update({ reactions: Object.keys(reactions).length > 0 ? reactions : null })
      .eq('id', req.params.id)
      .select('id, reactions')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    Logger.error('messages', 'react.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/messages/:id/delete
// Suppression douce d'un message pour l'utilisateur courant uniquement.
// Le message reste visible pour l'autre participant.
//
// Body :
//   userId (string) : L'ID de l'utilisateur qui supprime (doit être req.user.id)
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/api/messages/:id/delete', verifyToken, async (req, res) => {
  try {
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('id, from_id, to_id, deleted_for')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !msg)
      return res.status(404).json({ error: 'Message introuvable' });

    if (msg.from_id !== req.user.id && msg.to_id !== req.user.id)
      return res.status(403).json({ error: 'Non autorisé' });

    const deletedFor = [...(msg.deleted_for || [])];
    if (!deletedFor.includes(req.user.id)) deletedFor.push(req.user.id);

    const { error } = await supabase
      .from('messages')
      .update({ deleted_for: deletedFor })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true, deletedFor });
  } catch (e) {
    Logger.error('messages', 'delete.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/messages/typing
// Signaler que l'utilisateur est en train d'écrire dans une conversation.
// Le client doit appeler cet endpoint toutes les ~3s tant qu'il écrit.
// Le signal expire automatiquement après TYPING_TTL_MS (4s).
//
// Body :
//   convId (string, requis) : ID de la conversation (format: "userId1::userId2" trié)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/messages/typing', verifyToken, async (req, res) => {
  const { convId } = req.body;
  if (!convId || typeof convId !== 'string')
    return res.status(400).json({ error: 'convId requis' });

  // Vérifier que l'utilisateur est bien participant à cette conversation
  const parts = convId.split('::');
  if (!parts.includes(req.user.id))
    return res.status(403).json({ error: 'Non autorisé' });

  _typingStore.set(convId, {
    userId:    req.user.id,
    userName:  req.user.name,
    updatedAt: Date.now(),
  });

  res.json({ ok: true, expiresIn: TYPING_TTL_MS });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/typing/:convId
// Vérifier si l'autre participant d'une conversation est en train d'écrire.
// Le client devrait appeler cet endpoint toutes les 1.5-2s pendant une conversation active.
//
// Réponse :
//   { isTyping: bool, userId: string|null, userName: string|null, updatedAt: number|null }
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages/typing/:convId', verifyToken, async (req, res) => {
  const { convId } = req.params;
  const parts = convId.split('::');

  // Vérifier que l'utilisateur est bien participant
  if (!parts.includes(req.user.id))
    return res.status(403).json({ error: 'Non autorisé' });

  const entry = _typingStore.get(convId);

  // Retourner le statut de FRAPPE uniquement si c'est l'autre participant
  if (!entry || entry.userId === req.user.id) {
    return res.json({ isTyping: false, userId: null, userName: null, updatedAt: null });
  }

  const isStillTyping = Date.now() - entry.updatedAt < TYPING_TTL_MS;
  if (!isStillTyping) _typingStore.delete(convId);

  res.json({
    isTyping:  isStillTyping,
    userId:    entry.userId,
    userName:  entry.userName,
    updatedAt: entry.updatedAt,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/search
// Rechercher dans tous les messages de l'utilisateur.
//
// Query params :
//   q      (string, requis) : Terme de recherche (min 2 caractères)
//   withId (string, optionnel) : Limiter la recherche à une conversation
//   limit  (int) : Résultats max (défaut: 20)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages/search', verifyToken, async (req, res) => {
  const { q, withId, limit: rawLimit } = req.query;
  if (!q || q.length < 2)
    return res.status(400).json({ error: 'Terme de recherche trop court (min 2 caractères)' });

  const limit = Math.min(parseInt(rawLimit) || 20, 50);

  try {
    let query = supabase
      .from('messages')
      .select('id, from_id, from_name, to_id, to_name, text, read, created_at')
      .or(`from_id.eq.${req.user.id},to_id.eq.${req.user.id}`)
      .ilike('text', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (withId) {
      query = query.or(
        `and(from_id.eq.${req.user.id},to_id.eq.${withId}),` +
        `and(from_id.eq.${withId},to_id.eq.${req.user.id})`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SQL MIGRATION — À exécuter dans l'éditeur SQL Supabase (une seule fois)
// ══════════════════════════════════════════════════════════════════════════════
//
// -- Nouvelles colonnes sur la table messages existante
// ALTER TABLE messages
//   ADD COLUMN IF NOT EXISTS reply_to_id    uuid REFERENCES messages(id) ON DELETE SET NULL,
//   ADD COLUMN IF NOT EXISTS reply_to_text  text,
//   ADD COLUMN IF NOT EXISTS attachments    jsonb,
//   ADD COLUMN IF NOT EXISTS reactions      jsonb,
//   ADD COLUMN IF NOT EXISTS deleted_for    uuid[],
//   ADD COLUMN IF NOT EXISTS read_at        timestamptz;
//
// -- Index de performance
// CREATE INDEX IF NOT EXISTS idx_messages_from_to
//   ON messages(from_id, to_id, created_at DESC);
//
// CREATE INDEX IF NOT EXISTS idx_messages_to_unread
//   ON messages(to_id, read) WHERE read = false;
//
// CREATE INDEX IF NOT EXISTS idx_messages_text_search
//   ON messages USING gin(to_tsvector('french', text));
//
// -- Politique RLS : chaque utilisateur ne voit que SES messages
// -- (Si RLS pas encore configurée sur messages)
// ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
//
// CREATE POLICY "messages_select_own" ON messages
//   FOR SELECT USING (auth.uid() = from_id OR auth.uid() = to_id);
//
// CREATE POLICY "messages_insert_own" ON messages
//   FOR INSERT WITH CHECK (auth.uid() = from_id);
//
// CREATE POLICY "messages_update_own" ON messages
//   FOR UPDATE USING (auth.uid() = from_id OR auth.uid() = to_id);
//
// -- Fonction pour compter les conversations (optionnel, pour analytics)
// CREATE OR REPLACE FUNCTION count_user_conversations(p_user_id uuid)
// RETURNS integer AS $$
//   SELECT COUNT(DISTINCT
//     CASE
//       WHEN from_id = p_user_id THEN to_id
//       ELSE from_id
//     END
//   )
//   FROM messages
//   WHERE from_id = p_user_id OR to_id = p_user_id;
// $$ LANGUAGE sql STABLE;
//
// ── FIN DU FICHIER ──────────────────────────────────────────────────────────
