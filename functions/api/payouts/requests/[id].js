import { CORS, options, json, err, supabase, requireAdmin } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const body = await request.json();
    const sb = supabase(env);
    const updates = { status: body.status };
    if (body.adminNote) updates.admin_note = body.adminNote;
    if (body.status === 'paid') updates.processed_at = new Date().toISOString();
    const updated = await sb.from('payout_requests').update(updates, `id=eq.${params.id}`);
    const payout = Array.isArray(updated) ? updated[0] : updated;
    if (payout?.vendor_id) {
      await sb.from('notifications').insert({
        user_id: payout.vendor_id,
        type: body.status === 'paid' ? 'success' : body.status === 'rejected' ? 'warning' : 'info',
        title: `Retrait ${body.status === 'paid' ? 'payé' : body.status === 'rejected' ? 'refusé' : 'mis à jour'}`,
        message: body.adminNote || `Votre demande de retrait de ${payout.amount} EUR est ${body.status}.`,
      }).catch(() => {});
    }
    return json(payout);
  } catch (e) { return err(e.message, e.status || 500); }
}

