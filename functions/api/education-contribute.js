// functions/api/education-contribute.js → POST /api/education-contribute
//
// [NEXUS ÉDUCATION 2026-08-27] Permet à un utilisateur connecté (contributeur)
// ou à l'admin d'ajouter un cours/document au module NEXUS Éducation.
// - Auth obligatoire (Bearer token) — pas de contribution anonyme, pour garder
//   un responsable identifiable par soumission (cf. certification de licence).
// - Le fichier est TOUJOURS uploadé (jamais un simple lien externe) : cohérent
//   avec la décision produit "héberger des copies, uniquement contenu CC/
//   domaine public" (cf. sql/2026_08_27_educational_downloads.sql) — un lien
//   externe ne serait pas une copie hébergée et échapperait à toute vérif.
// - Upload en base64 dans le JSON (pas de multipart en Workers) — plafonné à
//   12 Mo décodés, seul %PDF (vrai PDF, vérifié aux octets magiques) accepté.
// - Contribution d'un non-admin → active=false/moderated=false (attente de
//   revue admin, RÉUTILISE le panneau "Produits" existant qui gère déjà les
//   produits inactifs — pas de nouvelle UI admin nécessaire). Contribution
//   admin → publiée immédiatement.
import { handle, requireAuth, ok, err } from './_lib/supabase.js';

const MAX_BYTES = 12 * 1024 * 1024; // 12 Mo décodés
const COVER_BASE = 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/educational/covers/';
const SUBJECT_COVER_RULES = [
  [/math/i, 'mathematiques.jpg'],
  [/physi/i, 'physique.jpg'],
  [/chim/i, 'chimie.jpg'],
  [/histoire|g[ée]o/i, 'histoire-geo.jpg'],
  [/fran[çc]ais/i, 'francais.jpg'],
  [/philo/i, 'philosophie.jpg'],
  [/anglais|english/i, 'anglais.jpg'],
  [/bio|svt/i, 'svt-biologie.jpg'],
  [/[ée]conomie/i, 'economie.jpg'],
  [/informatique|algo/i, 'informatique.jpg'],
  [/droit/i, 'droit.jpg'],
  [/espagnol/i, 'espagnol.jpg'],
  [/allemand/i, 'allemand.jpg'],
  [/latin/i, 'latin.jpg'],
];
function coverFor(subject) {
  const s = String(subject || '');
  const hit = SUBJECT_COVER_RULES.find(([re]) => re.test(s));
  return COVER_BASE + (hit ? hit[1] : 'mathematiques.jpg');
}

function base64ToBytes(b64) {
  const bin = atob(b64.replace(/^data:.*;base64,/, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== 'POST') return err('POST uniquement', 405);
  const { user } = await requireAuth(env, request);

  const body = await request.json().catch(() => null);
  if (!body) return err('JSON invalide', 400);

  const title = String(body.title || '').trim().slice(0, 140);
  const subject = String(body.subject || '').trim().slice(0, 60);
  const level = String(body.level || '').trim().slice(0, 20);
  const description = String(body.description || '').trim().slice(0, 1000);
  const license = String(body.license || '').trim().slice(0, 60);
  const licenseUrl = String(body.licenseUrl || '').trim().slice(0, 300);
  const source = String(body.source || '').trim().slice(0, 100);
  const sourceUrl = String(body.sourceUrl || '').trim().slice(0, 300);
  const fileBase64 = body.fileBase64 ? String(body.fileBase64) : '';

  if (!title || !subject || !level || !description) return err('Titre, matière, niveau et description sont requis.', 400);
  if (!['college', 'lycee', 'universite'].includes(level)) return err('Niveau invalide.', 400);
  if (!license || !licenseUrl) return err('La licence et son lien sont requis (ex. CC BY-SA 4.0).', 400);
  if (!source || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return err('La source et son URL sont requises.', 400);
  if (!fileBase64) return err('Le fichier PDF est requis (pas de simple lien externe).', 400);

  let bytes;
  try { bytes = base64ToBytes(fileBase64); } catch (_) { return err('Fichier illisible (base64 invalide).', 400); }
  if (bytes.length > MAX_BYTES) return err('Fichier trop volumineux (max 12 Mo).', 400);
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== '%PDF') return err('Seuls les fichiers PDF sont acceptés.', 400);

  const key = `products/educational/contributions/${crypto.randomUUID()}.pdf`;
  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  const upRes = await fetch(`${SB_URL}/storage/v1/object/nexus-images/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, 'Content-Type': 'application/pdf' },
    body: bytes,
  });
  if (!upRes.ok) return err('Échec de l\'upload du fichier.', 502);
  const fileUrl = `${SB_URL}/storage/v1/object/public/nexus-images/${key}`;

  const isAdmin = user.role === 'admin';
  const row = {
    name: title,
    category: 'Éducation',
    price: 0.01,
    stock: 999999,
    description: `${description} Source : ${source}. Licence : ${license}.`,
    image_url: coverFor(subject),
    file_url: fileUrl,
    vendor_id: user.id,
    vendor_name: user.name || 'Contributeur NEXUS',
    active: isAdmin,
    moderated: isAdmin,
    is_educational: true,
    educational_specs: {
      level, subject, source, source_url: sourceUrl, license, license_url: licenseUrl,
      contributed_by: user.id, contributor_role: user.role, file_type: 'pdf',
    },
  };
  const { data, error } = await user_sb_insert(env, row);
  if (error) return err('Échec de l\'enregistrement : ' + error, 500);

  return ok({ ok: true, id: data?.id, pending: !isAdmin });
});

async function user_sb_insert(env, row) {
  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${SB_URL}/rest/v1/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); return { error: t.slice(0, 300) }; }
  const rows = await res.json().catch(() => []);
  return { data: rows[0] };
}
