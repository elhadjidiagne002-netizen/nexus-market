// scripts/promote-prospects.mjs
// Promeut EN MASSE les prospects (table CRM `prospects`) en vrais comptes, directement
// depuis Supabase — équivalent CLI du panneau admin « Prospects » / de l'onglet ② de
// nexus_importer.html. Crée les comptes Auth (API admin), pose les flags de profil + géo,
// crée la fiche métier (pros 'active' / couriers 'pending'), marque le prospect 'promoted'.
//
// Identifiants (SECRETS — jamais committés) :
//   SUPABASE_URL          (déf. https://pqcqbstbdujzaclsiosv.supabase.co)
//   SUPABASE_SERVICE_KEY  (Service Role Key — Settings → API → service_role) — REQUISE
//
// Usage :
//   # PowerShell — TOUT promouvoir (tous les prospects non encore promus) :
//   $env:SUPABASE_SERVICE_KEY="eyJ..."; node scripts/promote-prospects.mjs
//   # simuler d'abord (aucune écriture) :
//   node scripts/promote-prospects.mjs --dry-run
//   # options
//   node scripts/promote-prospects.mjs --type pro            # ne promouvoir que les pros
//   node scripts/promote-prospects.mjs --status new          # forcer un statut précis
//   node scripts/promote-prospects.mjs --limit 50 --throttle 150 --password "Nexus@2024"
//
// NB : ce script tourne sur TA machine (Node), PAS sur Cloudflare Workers → il n'a
//   AUCUNE limite de sous-requêtes. C'est LE moyen de promouvoir des centaines de
//   prospects d'un coup (le panneau admin du site est plafonné à 8/appel par la limite CF).

const REF = 'pqcqbstbdujzaclsiosv';
const URL = (process.env.SUPABASE_URL || `https://${REF}.supabase.co`).replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || arg('service-key');
if (!KEY) { console.error('❌ SUPABASE_SERVICE_KEY manquante (env ou --service-key).'); process.exit(1); }

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0) return ['dry-run'].includes(name) ? true : process.argv[i + 1];
  return process.argv.includes('--' + name) ? true : def;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Mapping type → rôle Auth + flags + fiche (aligné sur functions/api/admin/promote-prospect.js).
const CFG = {
  pro:     { authRole: 'buyer',  flags: { is_pro: true },     geo: true,  fiche: 'pros' },
  courier: { authRole: 'buyer',  flags: { is_courier: true }, geo: true,  fiche: 'couriers' },
  rescuer: { authRole: 'buyer',  flags: { is_rescuer: true, rescuer_status: 'available' }, geo: true, fiche: 'rescuers' },
  breeder: { authRole: 'buyer',  flags: { is_breeder: true }, geo: true,  fiche: null },
  vendor:  { authRole: 'vendor', flags: {},                   geo: false, fiche: null },
  custom:  { authRole: 'buyer',  flags: {},                   geo: false, fiche: null },
};

const H = (extra = {}) => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra });
async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1${path}`, { ...opts, headers: H(opts.headers) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error((body && body.message) || r.statusText), { status: r.status });
  return body;
}
const digits = (p) => String(p || '').replace(/\D/g, '');
function slugify(n) { return String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, ''); }
function genEmail(p) {
  // On ignore l'email-placeholder non-unique 'prospect_@...' (sinon des entreprises
  // distinctes fusionnent sur un seul compte). Uniquifieur déterministe = id du prospect.
  const stored = String(p.email || '').trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(stored) && !/^prospect_?@/.test(stored)) return stored;
  const s = slugify(p.name), d4 = digits(p.phone).slice(-4);
  const uniq = d4 || String(p.id || '').replace(/-/g, '').slice(0, 6) || Math.random().toString(36).slice(2, 8);
  if (s) return `${s}.${uniq}@nexusmarket.sn`;
  return `prospect.${uniq}@nexusmarket.sn`;
}
async function ensureAuthUser(email, password, meta) {
  const res = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: H(), body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }) });
  const b = await res.json().catch(() => ({}));
  if (res.ok && b && b.id) return { uid: b.id, created: true };
  if (res.status === 422 || /registered|already exists|duplicate/i.test(b?.msg || b?.message || b?.error_description || '')) {
    const rows = await rest(`/profiles?select=id&email=eq.${encodeURIComponent(email)}`).catch(() => null);
    if (rows && rows[0]) return { uid: rows[0].id, created: false };
  }
  throw new Error(b?.msg || b?.error_description || b?.message || `Auth ${res.status}`);
}

async function main() {
  const type = arg('type');                         // filtre optionnel : pro|vendor|courier|rescuer|breeder|custom
  const status = arg('status', '');                 // '' (défaut) = TOUT ce qui n'est pas déjà promu
  const limit = parseInt(arg('limit', '100000'), 10) || 100000;
  const dry = arg('dry-run', false);
  const throttle = Math.max(0, parseInt(arg('throttle', '120'), 10) || 0);
  const password = arg('password') || process.env.PROSPECT_DEFAULT_PASSWORD || 'Nexus@2024';

  // Charger les prospects (pagination par 1000). Par défaut : tous les non-promus
  // (status<>promoted) → « tout promouvoir ». --status <valeur> force un statut précis.
  const statusFilter = status ? `status=eq.${encodeURIComponent(status)}` : `status=neq.promoted`;
  let prospects = [], from = 0;
  const filt = [`select=*`, statusFilter, type ? `account_type=eq.${encodeURIComponent(type)}` : '', `order=created_at.asc`].filter(Boolean).join('&');
  while (prospects.length < limit) {
    const page = await rest(`/prospects?${filt}&limit=1000&offset=${from}`).catch((e) => {
      if (/prospects.*(does not exist|schema cache)|pgrst205/i.test(e.message)) { console.error('❌ Table `prospects` absente. Lance d\'abord le SQL de création (importateur étape 1).'); process.exit(1); }
      throw e;
    });
    prospects.push(...page); from += 1000;
    if (page.length < 1000) break;
  }
  prospects = prospects.slice(0, limit);

  console.log(`=== PROMOTION ${dry ? '(DRY-RUN — aucune écriture)' : ''} ===`);
  console.log(`Base : ${URL} · ${prospects.length} prospect(s) [status=${status || 'non-promus'}${type ? ', type=' + type : ''}]`);
  if (!prospects.length) { console.log('Rien à promouvoir.'); return; }

  let ok = 0, skip = 0, err = 0, i = 0;
  for (const p of prospects) {
    i++;
    const t = p.account_type || 'custom';
    const c = CFG[t] || CFG.custom;
    const tag = `[${i}/${prospects.length}] ${p.name || '(sans nom)'} (${t})`;
    try {
      if (p.status === 'promoted' && p.promoted_user_id) { console.log(`  ⊘ ${tag} : déjà promu`); skip++; continue; }
      if (c.fiche === 'pros' && !(p.profession && String(p.profession).trim())) { console.log(`  ⊘ ${tag} : profession requise`); skip++; continue; }
      const email = genEmail(p);
      if (dry) { console.log(`  • ${tag} → ${email} · role=${c.authRole}${c.fiche ? ' · fiche ' + c.fiche : ''}`); ok++; continue; }

      const { uid, created } = await ensureAuthUser(email, password, { name: p.name || '', phone: p.phone || '', role: c.authRole, imported: true, account_type: t, profession: p.profession || '' });

      const upd = { ...c.flags };
      if (c.geo && p.lat != null && p.lng != null) { upd.current_lat = p.lat; upd.current_lng = p.lng; upd.location_updated_at = new Date().toISOString(); }
      if (Object.keys(upd).length) await rest(`/profiles?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', body: JSON.stringify(upd) }).catch((e) => { throw new Error('profiles: ' + e.message); });

      // couriers.phone (et parfois pros.phone) est NOT NULL + UNIQUE → téléphone-repère
      // unique si le prospect n'a pas de numéro (évite null/'' en doublon).
      const ph = (p.phone && String(p.phone).trim()) || ('na-' + String(uid).replace(/-/g, '').slice(0, 8));
      if (c.fiche === 'pros') {
        // status 'active' (visible direct) ; PAS de lat/lng ici (colonnes absentes → géo sur profiles).
        const fiche = { user_id: uid, profession: p.profession, name: p.name || '', phone: ph, city: p.city || null, status: 'active', disponible: true };
        await rest(`/pros?on_conflict=user_id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(fiche) }).catch((e) => { throw new Error('pros: ' + e.message); });
      } else if (c.fiche === 'couriers') {
        const fiche = { user_id: uid, name: p.name || '', phone: ph, status: 'pending', zones: ['Dakar'], vehicle_type: 'moto' };
        await rest(`/couriers?on_conflict=user_id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(fiche) }).catch((e) => { throw new Error('couriers: ' + e.message); });
      } else if (c.fiche === 'rescuers') {
        // Dépanneur (NEXUS Dépannage). phone nullable/non-unique → pas de repère. specialties par défaut = mechanic.
        const fiche = { user_id: uid, name: p.name || '', phone: (p.phone && String(p.phone).trim()) || null, specialties: ['mechanic'], is_available: true, status: 'active' };
        await rest(`/rescuers?on_conflict=user_id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(fiche) }).catch((e) => { throw new Error('rescuers: ' + e.message); });
      }

      await rest(`/prospects?id=eq.${encodeURIComponent(p.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'promoted', promoted_user_id: uid, email, updated_at: new Date().toISOString() }) }).catch(() => {});
      console.log(`  ✓ ${tag} → ${email}${created ? ' (créé)' : ' (réutilisé)'}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${tag} : ${e.message || e}`); err++;
    }
    if (throttle) await sleep(throttle);
  }
  console.log(`\nTerminé : ${ok} ${dry ? 'simulés' : 'promus'}, ${skip} ignorés, ${err} erreurs.`);
  if (!dry) console.log(`Mot de passe des comptes : ${password}`);
}

main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
