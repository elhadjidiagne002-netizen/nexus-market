// functions/api/b2b/verify-ninea/[[userId]].js — Feature 17 : Vérification NINEA via APIX
// POST /api/b2b/verify-ninea → vérifier un NINEA (body: { ninea, rccm })
// GET  /api/b2b/verify-ninea?ninea=xxx → lookup public
import { options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);

  try {
    // GET — lookup public
    if (request.method === 'GET') {
      const url   = new URL(request.url);
      const ninea = url.searchParams.get('ninea')?.replace(/\s/g, '').toUpperCase();
      if (!ninea) return err('ninea requis en paramètre', 400);

      const cached = await sb.from('ninea_verifications').select('*',
        `ninea=eq.${ninea}&verified=eq.true&order=created_at.desc&limit=1`
      );
      if (cached?.length) return json({ ninea, company: cached[0], source: 'cache' });

      const res = await callApix(env, ninea);
      if (!res.ok) return err(res.error, 404);
      return json({ ninea, company: res.data, source: 'apix' });
    }

    // POST — vérification et mise à jour profil
    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      if (!['vendor','admin','b2b'].includes(user.role)) return err('Accès refusé', 403);

      const body = await request.json().catch(() => ({}));
      const { ninea, rccm } = body;
      if (!ninea) return err('NINEA requis', 400);

      const cleaned = ninea.replace(/\s/g, '').toUpperCase();
      if (!/^\d{7}[A-Z]\d[A-Z]$/.test(cleaned) && !/^\d{9}$/.test(cleaned)) {
        return err('Format NINEA invalide (ex: 1234567A1B)', 400);
      }

      // Cache 7 jours
      const since  = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
      const cached = await sb.from('ninea_verifications').select('*',
        `ninea=eq.${cleaned}&verified=eq.true&created_at=gte.${since}&order=created_at.desc&limit=1`
      );

      let companyData;
      if (cached?.length) {
        companyData = cached[0];
      } else {
        const res = await callApix(env, cleaned, rccm);
        if (!res.ok) return err(res.error, res.status || 500);
        companyData = res.data;

        await sb.from('ninea_verifications').insert({
          ninea: cleaned, rccm: rccm || null,
          company_name:  companyData.company_name,
          legal_form:    companyData.legal_form,
          activity:      companyData.activity,
          address:       companyData.address,
          tax_status:    companyData.tax_status,
          verified:      true,
          verified_at:   new Date().toISOString(),
          created_at:    new Date().toISOString(),
        }).catch(() => {});
      }

      // Mettre à jour le profil
      await sb.from('profiles').update({
        ninea:         cleaned,
        company_name:  companyData.company_name,
        ninea_verified: true,
        rccm:          rccm || null,
        business_type: 'company',
      }, `id=eq.${user.id}`).catch(() => {});

      return json({
        ok: true, ninea: cleaned,
        company: { name: companyData.company_name, legal_form: companyData.legal_form, activity: companyData.activity, address: companyData.address, tax_status: companyData.tax_status },
        verified: true, cached: !!cached?.length,
      });
    }

    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}

async function callApix(env, ninea, rccm) {
  if (!env.APIX_API_KEY) {
    // Mode développement : retourner des données fictives
    if (ninea.startsWith('000') || env.ENVIRONMENT !== 'production') {
      return { ok: true, data: { company_name: 'Société Test SARL', legal_form: 'SARL', activity: 'Commerce général', address: 'Dakar, Sénégal', tax_status: 'active' } };
    }
    return { ok: false, error: 'APIX_API_KEY non configuré. Obtenir sur https://apix.sn', status: 503 };
  }

  try {
    const res = await fetch(`https://api.apix.sn/v2/tax/ninea/${ninea}`, {
      headers: { 'X-API-Key': env.APIX_API_KEY, Accept: 'application/json' },
    });
    if (res.status === 404) return { ok: false, error: 'NINEA non trouvé dans le registre', status: 404 };
    if (!res.ok) return { ok: false, error: `APIX error ${res.status}`, status: res.status };
    const d = await res.json();
    return { ok: true, data: {
      company_name: d.denomination || d.raisonSociale || d.nom,
      legal_form:   d.formeJuridique || d.forme_juridique,
      activity:     d.activite || d.secteur,
      address:      d.adresse || d.siege,
      tax_status:   d.statut || 'active',
    }};
  } catch (e) { return { ok: false, error: e.message, status: 500 }; }
}
