// Feature 26 : Messagerie live Supabase Realtime
import { options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb    = supabase(env);
  const route = Array.isArray(params?.route) ? params.route : (params?.route ? [params.route] : []);
  const m     = request.method;
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const seg0 = route[0]; const seg1 = route[1]; const seg2 = route[2];
    if (seg0 === 'sessions' || !seg0) {
      if (!seg1) {
        if (m === 'GET') {
          const data = await sb.from('live_sessions').select('*',
            `or=(participant_a=eq.${user.id},participant_b=eq.${user.id})&status=eq.active&order=last_message_at.desc&limit=50`) || [];
          return json(data.map(s => ({ ...s, unread_count: s.participant_a===user.id ? s.unread_count_a : s.unread_count_b })));
        }
        if (m === 'POST') {
          const { participantId, context='chat', contextId } = await request.json().catch(() => ({}));
          if (!participantId) return err('participantId requis', 400);
          const ex = await sb.from('live_sessions').select('*',
            `or=(and(participant_a=eq.${user.id},participant_b=eq.${participantId}),and(participant_a=eq.${participantId},participant_b=eq.${user.id}))&status=eq.active&limit=1`);
          if (ex?.length) return json({ session: ex[0], realtime: rt(ex[0].id, env), joined: true });
          const s = await sb.from('live_sessions').insert({ participant_a: user.id, participant_b: participantId,
            context, context_id: contextId||null, status:'active', unread_count_a:0, unread_count_b:0,
            last_message_at: new Date().toISOString(), created_at: new Date().toISOString() });
          const sess = Array.isArray(s) ? s[0] : s;
          await sb.from('notifications').insert({ user_id: participantId, type:'live_session_started',
            title:'💬 Nouveau message', message:`${user.name||'Quelqu'un'} vous a écrit`,
            metadata:{session_id:sess.id,from:user.id}, created_at: new Date().toISOString() }).catch(()=>{});
          return json({ session: sess, realtime: rt(sess.id, env), joined: false }, 201);
        }
      }
      if (seg1) {
        if (!seg2 && m==='GET') {
          const data = await sb.from('live_sessions').select('*',`id=eq.${seg1}&or=(participant_a=eq.${user.id},participant_b=eq.${user.id})`);
          if (!data?.length) return err('Session introuvable', 404);
          return json({ session: data[0], realtime: rt(seg1, env) });
        }
        if (seg2==='message' && m==='POST') {
          const sessions = await sb.from('live_sessions').select('*',`id=eq.${seg1}&or=(participant_a=eq.${user.id},participant_b=eq.${user.id})&status=eq.active`);
          if (!sessions?.length) return err('Session inactive', 404);
          const sess = sessions[0]; const isA = sess.participant_a===user.id;
          const recipId = isA ? sess.participant_b : sess.participant_a;
          const { text, type='text', mediaUrl, replyToId } = await request.json().catch(() => ({}));
          if (!text?.trim() && !mediaUrl) return err('text ou mediaUrl requis', 400);
          const msg = await sb.from('live_messages').insert({ session_id:seg1, sender_id:user.id, recipient_id:recipId,
            text:text?.trim()||null, type, media_url:mediaUrl||null, reply_to_id:replyToId||null,
            read:false, created_at: new Date().toISOString() });
          await sb.from('live_sessions').update({ last_message_at: new Date().toISOString(),
            last_message: text?.slice(0,100)||'📎',
            [isA?'unread_count_b':'unread_count_a']: ((isA?sess.unread_count_b:sess.unread_count_a)||0)+1 }, `id=eq.${seg1}`);
          return json(Array.isArray(msg) ? msg[0] : msg, 201);
        }
        if (seg2==='messages' && m==='GET') {
          const limit = parseInt(new URL(request.url).searchParams.get('limit')||'50');
          const before = new URL(request.url).searchParams.get('before');
          const filter = `session_id=eq.${seg1}${before?`&created_at=lt.${before}`:''}&order=created_at.desc&limit=${limit}`;
          const msgs = await sb.from('live_messages').select('*', filter) || [];
          await sb.from('live_messages').update({ read:true, read_at: new Date().toISOString() },
            `session_id=eq.${seg1}&recipient_id=eq.${user.id}&read=eq.false`).catch(()=>{});
          return json({ messages: msgs.reverse(), has_more: msgs.length===limit });
        }
        if (seg2==='read' && m==='POST') {
          await sb.from('live_messages').update({ read:true, read_at: new Date().toISOString() },
            `session_id=eq.${seg1}&recipient_id=eq.${user.id}&read=eq.false`).catch(()=>{});
          const sessions = await sb.from('live_sessions').select('participant_a',`id=eq.${seg1}`);
          if (sessions?.length) {
            const isA = sessions[0].participant_a===user.id;
            await sb.from('live_sessions').update({ [isA?'unread_count_a':'unread_count_b']:0 }, `id=eq.${seg1}`).catch(()=>{});
          }
          return json({ ok: true });
        }
        if (seg2==='typing' && m==='POST') {
          const { isTyping=true } = await request.json().catch(() => ({}));
          await sb.from('typing_status').upsert({ session_id:seg1, user_id:user.id, is_typing:isTyping,
            updated_at: new Date().toISOString() }, 'session_id,user_id').catch(()=>{});
          return json({ ok: true });
        }
      }
    }
    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, e.status || 500); }
}

function rt(sessionId, env) {
  return { url: `${env.SUPABASE_URL}/realtime/v1`, key: env.SUPABASE_ANON_KEY,
    channels: [{ name:`live_messages:${sessionId}`, table:'live_messages', filter:`session_id=eq.${sessionId}`, events:['INSERT'] },
      { name:`typing:${sessionId}`, table:'typing_status', filter:`session_id=eq.${sessionId}`, events:['INSERT','UPDATE'] }] };
}
