import { CORS, options, json, err, supabase, requireAuth, sendEmail } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (!['vendor','admin'].includes(user.role)) return err('Accès refusé', 403);
    const body = await request.json();
    const sb = supabase(env);
    const updated = await sb.from('return_requests').update(
      { status: body.status, admin_notes: body.adminNotes },
      `id=eq.${params.id}`
    );
    const ret = Array.isArray(updated) ? updated[0] : updated;
    // Notifier l'acheteur
    if (ret?.buyer_id) {
      await sb.from('notifications').insert({
        user_id: ret.buyer_id,
        type: body.status === 'approved' ? 'success' : body.status === 'rejected' ? 'warning' : 'info',
        title: `Retour ${body.status === 'approved' ? 'approuvé' : body.status === 'rejected' ? 'refusé' : 'mis à jour'}`,
        message: body.adminNotes || `Votre demande de retour a été ${body.status}.`,
      }).catch(() => {});
    }
    return json(ret);
  } catch (e) { return err(e.message, e.status || 500); }
}


