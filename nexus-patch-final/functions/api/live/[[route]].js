// functions/api/live/[[route]].js — Feature 26 : Messagerie live Supabase Realtime
// POST /api/live/sessions              → créer/rejoindre une session
// GET  /api/live/sessions              → mes sessions
// GET  /api/live/sessions/[id]         → détail
// POST /api/live/sessions/[id]/message → envoyer
// GET  /api/live/sessions/[id]/messages → historique
// POST /api/live/sessions/[id]/read    → marquer lu
// POST /api/live/sessions/[id]/typing  → indicateur frappe
import { options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb    = supabase(env);
  const route = Array.isArray(params?.route) ? params.route : (params?.route ? [params.route] : []);
  const m     = request.method;

  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;

    // POST /api/live/sessions
    if (m === 'POST' && (!route.length || route[0] === 'sessions') && route.length <= 1) {
      return createSession(request, user, sb, env);
    }
    // GET /api/live/sessions
    if (m === 'GET' && (!route.length || route[0] === 'sessions') && route.length <= 1) {
      return getSessions(user, sb, env);
    }
    // GET /api/live/sessions/[id]
    if (m === 'GET' && route[0] === 'sessions' && route[1] && !route[2]) {
      return getSession(route[1], user, sb, env);
    }
    // POST /api/live/sessions/[id]/message
    if (m === 'POST' && route[0] === 'sessions' && route[1] && route[2] === 'message') {
      return sendMessage(route[1], request, user, sb);
    }
    // GET /api/live/sessions/[id]/messages
    if (m === 'GET' && route[0] === 'sessions' && route[1] && route[2] === 'messages') {
      return getMessages(route[1], user, request, sb);
    }
    // POST /api/live/sessions/[id]/read
    if (m === 'POST' && route[0] === 'sessions' && route[1] && route[2] === 'read') {
      return markRead(route[1], user, sb);
    }
    // POST /api/live/sessions/[id]/typing
    if (m === 'POST' && route[0] === 'sessions' && route[1] && route[2] === 'typing') {
      return sendTyping(route[1], request, user, sb, env);
    }

    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, e.status || 500); }
}

async function createSession(request, user, sb, env) {
  const body = await request.json().catch(() => ({}));
  const { participantId, context = 'chat', contextId } = body;
  if (!participantId) return err('participantId requis', 400);

  // Session existante ?
  const existing = await sb.from('live_sessions').select('*',
    `or=(and(participant_a=eq.${user.id},participant_b=eq.${participantId}),and(participant_a=eq.${participantId},participant_b=eq.${user.id}))&status=eq.active&limit=1`
  );
  if (existing?.length) {
    return json({ session: existing[0], realtime: realtimeConfig(existing[0].id, env), joined: true });
  }

  const session = await sb.from('live_sessions').insert({
    participant_a: user.id, participant_b: participantId,
    context, context_id: contextId || null, status: 'active',
    unread_count_a: 0, unread_count_b: 0,
    last_message_at: new Date().toISOString(), created_at: new Date().toISOString(),
  });
  const s = Array.isArray(session) ? session[0] : session;

  // Notifier
  await sb.from('notifications').insert({
    user_id: participantId, type: 'live_session_started',
    title: '💬 Nouveau message', message: `${user.name || 'Quelqu\'un'} vous a écrit`,
    metadata: { session_id: s.id, from: user.id },
    created_at: new Date().toISOString(),
  }).catch(() => {});

  return json({ session: s, realtime: realtimeConfig(s.id, env), joined: false }, 201);
}

async function getSessions(user, sb) {
  const sessions = await sb.from('live_sessions').select('*',
    `or=(participant_a=eq.${user.id},participant_b=eq.${user.id})&status=eq.active&order=last_message_at.desc&limit=50`
  ) || [];
  return json(sessions.map(s => ({
    ...s,
    unread_count: s.participant_a === user.id ? s.unread_count_a : s.unread_count_b,
  })));
}

async function getSession(id, user, sb, env) {
  const sessions = await sb.from('live_sessions').select('*',
    `id=eq.${id}&or=(participant_a=eq.${user.id},participant_b=eq.${user.id})`
  );
  if (!sessions?.length) return err('Session introuvable', 404);
  return json({ session: sessions[0], realtime: realtimeConfig(id, env) });
}

async function sendMessage(id, request, user, sb) {
  const sessions = await sb.from('live_sessions').select('*', `id=eq.${id}&or=(participant_a=eq.${user.id},participant_b=eq.${user.id})&status=eq.active`);
  if (!sessions?.length) return err('Session introuvable ou inactive', 404);
  const session = sessions[0];
  const recipientId = session.participant_a === user.id ? session.participant_b : session.participant_a;
  const isA = session.participant_a === user.id;

  const { text, type = 'text', mediaUrl, replyToId } = await request.json().catch(() => ({}));
  if (!text?.trim() && !mediaUrl) return err('text ou mediaUrl requis', 400);

  const msg = await sb.from('live_messages').insert({
    session_id: id, sender_id: user.id, recipient_id: recipientId,
    text: text?.trim() || null, type, media_url: mediaUrl || null,
    reply_to_id: replyToId || null, read: false,
    created_at: new Date().toISOString(),
  });

  // Mettre à jour session
  await sb.from('live_sessions').update({
    last_message_at: new Date().toISOString(),
    last_message: text?.slice(0, 100) || (type === 'image' ? '📷 Photo' : '📎 Fichier'),
    [isA ? 'unread_count_b' : 'unread_count_a']: (isA ? session.unread_count_b : session.unread_count_a || 0) + 1,
  }, `id=eq.${id}`);

  return json(Array.isArray(msg) ? msg[0] : msg, 201);
}

async function getMessages(id, user, request, sb) {
  const sessions = await sb.from('live_sessions').select('id', `id=eq.${id}&or=(participant_a=eq.${user.id},participant_b=eq.${user.id})`);
  if (!sessions?.length) return err('Session introuvable', 404);

  const url    = new URL(request.url);
  const limit  = parseInt(url.searchParams.get('limit') || '50');
  const before = url.searchParams.get('before');
  const filter = `session_id=eq.${id}${before ? `&created_at=lt.${before}` : ''}&order=created_at.desc&limit=${limit}`;

  const messages = await sb.from('live_messages').select('*', filter) || [];

  // Marquer comme lu
  await sb.from('live_messages').update({ read: true, read_at: new Date().toISOString() }, `session_id=eq.${id}&recipient_id=eq.${user.id}&read=eq.false`).catch(() => {});

  return json({ messages: messages.reverse(), has_more: messages.length === limit });
}

async function markRead(id, user, sb) {
  const sessions = await sb.from('live_sessions').select('participant_a', `id=eq.${id}`);
  if (!sessions?.length) return err('Session introuvable', 404);
  const isA = sessions[0].participant_a === user.id;

  await sb.from('live_messages').update({ read: true, read_at: new Date().toISOString() }, `session_id=eq.${id}&recipient_id=eq.${user.id}&read=eq.false`).catch(() => {});
  await sb.from('live_sessions').update({ [isA ? 'unread_count_a' : 'unread_count_b']: 0 }, `id=eq.${id}`).catch(() => {});

  return json({ ok: true });
}

async function sendTyping(id, request, user, sb, env) {
  const { isTyping = true } = await request.json().catch(() => ({}));
  // Upsert typing_status — Realtime le diffuse aux abonnés
  await sb.from('typing_status').upsert({ session_id: id, user_id: user.id, is_typing: isTyping, updated_at: new Date().toISOString() }, 'session_id,user_id').catch(() => {});
  return json({ ok: true });
}

function realtimeConfig(sessionId, env) {
  return {
    url: `${env.SUPABASE_URL}/realtime/v1`,
    key: env.SUPABASE_ANON_KEY,
    channels: [
      { name: `live_messages:${sessionId}`, table: 'live_messages', filter: `session_id=eq.${sessionId}`, events: ['INSERT'] },
      { name: `typing:${sessionId}`, table: 'typing_status', filter: `session_id=eq.${sessionId}`, events: ['INSERT','UPDATE'] },
    ],
  };
}
