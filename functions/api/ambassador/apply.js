// functions/api/ambassador/apply.js
import { adminClient, requireAuth, requireAdmin, handle, ok, err } from '../_lib/supabase.js';

const RATES = {
  bronze:   0.05,
  silver:   0.07,
  gold:     0.10,
  platinum: 0.12,
};

export const onRequest = handle(async ({ request, env }) => {
  const sb  = adminClient(env);
  const url = new URL(request.url);

  // ── PATCH /api/ambassador/apply?id=xxx&action=approve|reject ────────────
  if (request.method === 'PATCH') {
    const { user } = await requireAdmin(env, request);
    const id     = url.searchParams.get('id');
    const action = url.searchParams.get('action');

    if (!id || !['approve', 'reject'].includes(action)) {
      return err('id et action requis (approve|reject)', 400);
    }

    const body = await request.json().catch(() => ({}));

    const { data: amb, error } = await sb
      .from('ambassadors')
      .update({
        active:         action === 'approve',
        status:         action === 'approve' ? 'active' : 'rejected',
        activated_at:   action === 'approve' ? new Date().toISOString() : null,
        rejection_note: body.note || null,
      })
      .eq('id', id)
      .select()
      .single()
      .catch(e => ({ data: null, error: e }));

    if (error) return err(error.message, 500);

    const isApproved = action === 'approve';
    await sb.from('notifications').insert({
      user_id:    amb.user_id,
      type:       isApproved ? 'ambassador_approved' : 'ambassador_rejected',
      title:      isApproved ? 'Candidature approuvée !' : 'Candidature refusée',
      message:    isApproved
        ? `Bienvenue ! Votre code ambassadeur : ${amb.code}`
        : (body.note || 'Votre candidature n\'a pas été retenue.'),
      metadata:   { ambassador_id: id },
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return ok({ success: true, ambassador: amb, action });
  }

  // ── POST /api/ambassador/apply — Soumettre une candidature ──────────────
  if (request.method === 'POST') {
    const { user } = await requireAuth(env, request);

    const { data: existing } = await sb
      .from('ambassadors')
      .select('id,status')
      .eq('user_id', user.id)
      .single()
      .catch(() => ({ data: null }));

    if (existing) {
      return err(`Candidature déjà soumise (statut : ${existing.status})`, 409);
    }

    const { motivation, social_links, phone } = await request.json().catch(() => ({}));

    if (!motivation || motivation.trim().length < 20) {
      return err('La motivation est requise (minimum 20 caractères)', 400);
    }

    const namePart = (user.name || user.email || 'USER')
      .replace(/[^a-zA-Z]/g, '')
      .toUpperCase()
      .slice(0, 5) || 'NXS';

    const code = `${namePart}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const { data: amb, error } = await sb
      .from('ambassadors')
      .insert({
        user_id:         user.id,
        code,
        level:           'bronze',
        status:          'pending',
        active:          false,
        total_earned:    0,
        total_sales:     0,
        total_referrals: 0,
        commission_rate: RATES.bronze,
        motivation:      motivation.trim(),
        social_links:    social_links || {},
        phone:           phone || null,
        applied_at:      new Date().toISOString(),
      })
      .select()
      .single()
      .catch(e => ({ data: null, error: e }));

    if (error) return err('Erreur lors de la soumission : ' + error.message, 500);

    return ok(
      { success: true, ambassador: amb, message: 'Candidature soumise ! Réponse sous 48h.' },
      201
    );
  }

  // ── GET /api/ambassador/apply?status=pending — Liste des candidatures ───
  if (request.method === 'GET') {
    const { user } = await requireAdmin(env, request);
    const status = url.searchParams.get('status') || 'pending';

    const { data } = await sb
      .from('ambassadors')
      .select('id,code,level,status,motivation,applied_at,user_id')
      .eq('status', status)
      .order('applied_at', { ascending: true })
      .catch(() => ({ data: [] }));

    return ok({ applications: data || [], total: (data || []).length });
  }

  return err('Méthode non autorisée', 405);
});
