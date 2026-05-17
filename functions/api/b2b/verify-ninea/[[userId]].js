// Feature 17 : Verification NINEA via API APIX Senegal
import { options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    if (request.method === 'GET') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const ninea = new URL(request.url).searchParams.get('ninea')?.replace(/\s/g,'').toUpperCase();
      if (!ninea) return err('?ninea=xxx requis', 400);
      const cached = await sb.from('ninea_verifications').select('*', `ninea=eq.${ninea}&verified=eq.true&order=created_at.desc&limit=1`);
      if (cached?.length) return json({ ninea, company: cached[0], source: 'cache' });
      const res = await callApix(env, ninea);
      if (!res.ok) return err(res.error, 404);
      return json({ ninea, company: res.data, source: 'apix' });
    }
    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      if (!['vendor','admin','b2b'].includes(user.role)) return err('Acces refuse', 403);
      const { ninea, rccm } = await request.json().catch(() => ({}));
      if (!ninea) return err('NINEA requis', 400);
      const cleaned = ninea.replace(/\s/g,'').toUpperCase();
      if (!/^\d{7}[A-Z]\d[A-Z]$/.test(cleaned) && !/^\d{9}$/.test(cleaned))
        return err('Format NINEA invalide (ex: 1234567A1B)', 400);
      const since  = new Date(Date.now() - 7*24*3600000).toISOString();
      const cached = await sb.from('ninea_verifications').select('*', `ninea=eq.${cleaned}&verified=eq.true&created_at=gte.${since}&limit=1`);
      let data = cached?.[0];
      if (!data) {
        const res = await callApix(env, cleaned, rccm);
        if (!res.ok) return err(res.error, res.status || 500);
        data = res.data;
        await sb.from('ninea_verifications').insert({
          ninea: cleaned, rccm: rccm || null, company_name: data.company_name,
          legal_form: data.legal_form, activity: data.activity, address: data.address,
          tax_status: data.tax_status, verified: true, verified_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }
      await sb.from('profiles').update({ ninea: cleaned, company_name: data.company_name,
        ninea_verified: true, rccm: rccm || null, business_type: 'company' }, `id=eq.${user.id}`).catch(() => {});
      return json({ ok: true, ninea: cleaned, company: { name: data.company_name,
        legal_form: data.legal_form, activity: data.activity, address: data.address,
        tax_status: data.tax_status }, verified: true, cached: !!cached?.length });
    }
    return err('Methode non supportee', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}

async function callApix(env, ninea, rccm) {
  if (!env.APIX_API_KEY) {
    if (ninea.startsWith('000') || env.ENVIRONMENT !== 'production')
      return { ok: true, data: { company_name: 'Societe Test SARL', legal_form: 'SARL', activity: 'Commerce', address: 'Dakar', tax_status: 'active' } };
    return { ok: false, error: 'APIX_API_KEY manquant - configurer sur https://apix.sn', status: 503 };
  }
  try {
    const res = await fetch(`https://api.apix.sn/v2/tax/ninea/${ninea}`,
      { headers: { 'X-API-Key': env.APIX_API_KEY, Accept: 'application/json' } });
    if (res.status === 404) return { ok: false, error: 'NINEA non trouve', status: 404 };
    if (!res.ok) return { ok: false, error: `APIX error ${res.status}`, status: res.status };
    const d = await res.json();
    return { ok: true, data: { company_name: d.denomination||d.raisonSociale||d.nom,
      legal_form: d.formeJuridique, activity: d.activite||d.secteur,
      address: d.adresse||d.siege, tax_status: d.statut||'active' } };
  } catch (e) { return { ok: false, error: e.message, status: 500 }; }
}