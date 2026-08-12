// functions/api/admin/promote-prospect.js
// POST /api/admin/promote-prospect — promeut un ou plusieurs prospects (table CRM
// `prospects`) en VRAIS comptes, DEPUIS le tableau de bord admin du site.
//
// Réservé aux ADMINS (requireAdmin). Réplique la logique de l'outil nexus_importer.html
// (onglet ②) mais côté serveur : la création de comptes Auth exige la SERVICE ROLE KEY,
// qui vit UNIQUEMENT côté serveur (env.SUPABASE_SERVICE_KEY) — jamais dans le navigateur.
//
// Body : { ids: [uuid, ...], password? }   (max 8 par appel — limite de sous-requêtes CF)
// ⚠️ Chaque prospect = ~4 sous-requêtes (createUser + profiles + fiche + update prospect).
//   La limite Cloudflare Workers est de 50 sous-requêtes/invocation (palier standard).
//   8 × ~4 = ~32 (+ overhead requireAdmin/SELECT) reste sous 50. NE PAS remonter ce plafond
//   sans réduire le nombre de sous-requêtes par prospect, sinon « Too many subrequests »
//   fait échouer la fin du lot (comptes non créés ET prospects jamais marqués `promoted`).
// Pour chaque prospect :
//   1. Compte Auth (email confirmé, pas d'email de validation)   → auth.users
//   2. Flags de profil (is_pro / is_courier / is_breeder) + géo   → profiles
//   3. Fiche métier (pros status='hidden' / couriers status='pending')  → pros | couriers
//   4. Marque le prospect promu (status='promoted', promoted_user_id)   → prospects
// Vendeur : pas de fiche (le trigger handle_new_user pose profiles.status='pending'
// → apparaît dans « Vendeurs en attente »). Pro : status='hidden' → « Modération NEXUS Pro ».
import { options, json, err, requireAdmin, supabase } from '../_lib/utils.js';

// Mapping type de compte → rôle Auth + flags + fiche (aligné sur nexus_importer.html).
const CFG = {
  pro:     { authRole: 'buyer',  flags: { is_pro: true },     geo: true,  fiche: 'pros' },
  courier: { authRole: 'buyer',  flags: { is_courier: true }, geo: true,  fiche: 'couriers' },
  breeder: { authRole: 'buyer',  flags: { is_breeder: true }, geo: true,  fiche: null },
  vendor:  { authRole: 'vendor', flags: {},                   geo: false, fiche: null },
  custom:  { authRole: 'buyer',  flags: {},                   geo: false, fiche: null },
};

const digits = (p) => String(p || '').replace(/\D/g, '');
function slugify(name) {
  return String(name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
}
function genEmail(p) {
  if (p.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return p.email.trim().toLowerCase();
  const slug = slugify(p.name), d4 = digits(p.phone).slice(-4);
  if (slug) return `${slug}${d4 ? '.' + d4 : ''}@nexusmarket.sn`;
  if (d4) return `prospect.${d4}@nexusmarket.sn`;
  return `prospect.${Math.random().toString(36).slice(2, 8)}@nexusmarket.sn`;
}

// Création (ou récupération) d'un compte Auth via l'API admin REST (service key).
async function ensureAuthUser(env, sb, { email, password, meta }) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
  });
  const b = await res.json().catch(() => ({}));
  if (res.ok && b && b.id) return { uid: b.id, created: true };
  // Déjà inscrit → retrouver l'uid par email (profiles.email est unique et fiable).
  if (res.status === 422 || /already been registered|already exists|duplicate/i.test(b?.msg || b?.error_description || b?.message || '')) {
    const rows = await sb.from('profiles').select('id', `email=eq.${encodeURIComponent(email)}`).catch(() => null);
    if (rows && rows[0]) return { uid: rows[0].id, created: false };
  }
  throw new Error(b?.msg || b?.error_description || b?.message || `Auth ${res.status}`);
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const [admin, authErr] = await requireAdmin(request, env);
  if (authErr) return authErr;

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean).map(String) : [];
  if (!ids.length) return err('Aucun prospect (ids requis)', 400);
  if (ids.length > 8) return err('Maximum 8 prospects par appel (limite de sous-requêtes Cloudflare)', 400);
  const password = (typeof body?.password === 'string' && body.password.length >= 6)
    ? body.password : (env.PROSPECT_DEFAULT_PASSWORD || 'Nexus@2024');

  const sb = supabase(env);

  // Charger les prospects demandés.
  let prospects;
  try {
    const inList = ids.map(encodeURIComponent).join(',');
    prospects = await sb.from('prospects').select('*', `id=in.(${inList})`);
  } catch (e) {
    if (/prospects.*(does not exist|schema cache)|pgrst205/i.test(e.message || ''))
      return err("La table `prospects` n'existe pas encore (lancez le SQL de l'importateur, étape 1).", 424);
    return err('Lecture des prospects impossible : ' + e.message, 502);
  }
  if (!prospects?.length) return err('Prospects introuvables', 404);

  const results = [];
  let ok = 0, skip = 0, fail = 0;

  for (const p of prospects) {
    const type = p.account_type || 'custom';
    const c = CFG[type] || CFG.custom;
    try {
      if (p.status === 'promoted' && p.promoted_user_id) { results.push({ id: p.id, name: p.name, status: 'skip', reason: 'déjà promu' }); skip++; continue; }
      if (c.fiche === 'pros' && !(p.profession && String(p.profession).trim())) { results.push({ id: p.id, name: p.name, status: 'skip', reason: 'profession requise' }); skip++; continue; }

      const email = genEmail(p);
      const { uid, created } = await ensureAuthUser(env, sb, {
        email, password,
        meta: { name: p.name || '', phone: p.phone || '', role: c.authRole, imported: true, account_type: type, profession: p.profession || '' },
      });

      // Flags de profil + géo (UPDATE — le trigger handle_new_user a créé la ligne).
      const upd = { ...c.flags };
      if (c.geo && p.lat != null && p.lng != null) {
        upd.current_lat = p.lat; upd.current_lng = p.lng; upd.location_updated_at = new Date().toISOString();
      }
      if (Object.keys(upd).length) {
        await sb.from('profiles').update(upd, `id=eq.${encodeURIComponent(uid)}`).catch((e) => { throw new Error('profiles: ' + e.message); });
      }

      // Fiche métier.
      if (c.fiche === 'pros') {
        // NB: la table `pros` n'a PAS de lat/lng — la géo vit sur profiles.current_lat/lng
        // (écrite plus haut via c.geo) et se propage à profiles.geolocation via le trigger
        // sync_profile_geolocation → c'est ce que lit nearby_pros. Insérer lat/lng ici
        // échoue ("column pros.lat absente").
        // status='active' : la promotion est faite par l'ADMIN depuis son dashboard (=validation)
        // → le pro est directement visible dans la recherche. L'admin peut le « Masquer »
        // ensuite depuis « Modération NEXUS Pro » si besoin.
        // phone NULL si vide : un index unique sur phone rejette deux '' mais accepte plusieurs NULL.
        const fiche = { user_id: uid, profession: p.profession, name: p.name || '', phone: p.phone || null, city: p.city || null, status: 'active', disponible: true };
        await sb.from('pros').upsert(fiche, 'user_id').catch((e) => { throw new Error('pros: ' + e.message); });
      } else if (c.fiche === 'couriers') {
        const fiche = { user_id: uid, name: p.name || '', phone: p.phone || null, status: 'pending', zones: ['Dakar'], vehicle_type: 'moto' };
        await sb.from('couriers').upsert(fiche, 'user_id').catch((e) => { throw new Error('couriers: ' + e.message); });
      }

      // Marquer le prospect promu.
      await sb.from('prospects').update(
        { status: 'promoted', promoted_user_id: uid, email, updated_at: new Date().toISOString() },
        `id=eq.${encodeURIComponent(p.id)}`,
      ).catch(() => {});

      results.push({ id: p.id, name: p.name, status: 'ok', email, account_type: type, created });
      ok++;
    } catch (e) {
      results.push({ id: p.id, name: p.name, status: 'error', error: String(e.message || e) });
      fail++;
    }
  }

  return json({ ok: true, promoted: ok, skipped: skip, failed: fail, password, results });
}
