import { CORS, options, json, err, supabase, requireAdmin, sendEmail } from '../../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const { approved, reason } = await request.json();
    const sb = supabase(env);
    const pending = await sb.from('pending_vendors').select('*', `id=eq.${params.vendorId}`);
    if (!pending?.length) return err('Demande introuvable', 404);
    const vendor = pending[0];

    if (approved) {
      // Créer le compte Auth Supabase
      const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: vendor.email, password: vendor.password || crypto.randomUUID(), email_confirm: true }),
      });
      const user = await authRes.json();
      if (!authRes.ok) return err(user.message || 'Erreur création compte', authRes.status);
      // Créer le profil vendeur
      await sb.from('profiles').insert({
        id: user.id, email: vendor.email, name: vendor.name, role: 'vendor', status: 'active',
        shop_name: vendor.name, shop_category: vendor.category, shop_desc: vendor.shop_desc,
        phone: vendor.phone, payment_method: vendor.payment_method,
        orange_phone: vendor.orange_phone, wave_phone: vendor.wave_phone, iban: vendor.iban,
        bank_name: vendor.bank_name, ninea: vendor.ninea, rc: vendor.rc,
        owner_name: vendor.owner_name || vendor.name, commission_rate: 15,
      });
    }

    await sb.from('pending_vendors').update({ status: approved ? 'approved' : 'rejected', admin_note: reason }, `id=eq.${params.vendorId}`);

    await sendEmail(env, {
      to: vendor.email,
      subject: approved ? 'Votre boutique NEXUS est approuvée !' : 'Votre demande d\'inscription',
      html: approved
        ? `<h2>Félicitations ${vendor.name} !</h2><p>Votre boutique a été approuvée. Connectez-vous sur NEXUS Market pour commencer à vendre.</p>`
        : `<h2>Bonjour ${vendor.name}</h2><p>Votre demande n'a pas été retenue. Raison : ${reason || 'non précisée'}.</p>`,
    });

    return json({ success: true, approved });
  } catch (e) { return err(e.message, e.status || 500); }
}
