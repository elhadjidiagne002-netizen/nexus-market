/**
 * NEXUS Market — Cron : CAMPAGNE WHATSAPP EN GOUTTE-À-GOUTTE
 * ──────────────────────────────────────────────────────────────────────────
 * Envoie un PETIT lot de messages à chaque passage, puis s'arrête. Appelé une
 * fois par heure par .github/workflows/cron.yml — la campagne progresse donc
 * toute seule, sans intervention.
 *
 * POURQUOI CE JOB : 3618 prospects avec téléphone, 53 messages envoyés depuis
 * le début du projet. L'envoi manuel depuis le dashboard ne passe pas à
 * l'échelle (constaté 2026-09-05).
 *
 * ⚠ LA CONTRAINTE N'EST PAS LE QUOTA GREEN API, C'EST WHATSAPP.
 * Un numéro qui envoie en masse à des gens qui ne l'ont jamais contacté se fait
 * bannir — on perd alors le numéro ET l'instance. D'où :
 *   • un plafond par passage (hourly_limit, défaut 10) ET sur 24 h glissantes
 *     (daily_limit, défaut 80) ;
 *   • une fenêtre horaire (8 h-19 h) : personne n'écrit à 3 h du matin ;
 *   • un délai aléatoire entre deux messages (jamais de cadence métronomique) ;
 *   • un DISJONCTEUR : si trop d'échecs dans le lot, la campagne passe en
 *     'stopped' et n'envoie plus rien tant qu'un humain n'a pas regardé.
 *   • le respect de wa_opt_outs (un « STOP » vaut pour toutes les campagnes).
 *
 * Une campagne naît en `status='paused'` : ce job ne fait RIEN tant qu'un
 * humain ne l'a pas passée à 'running'. Déployer ce fichier n'envoie donc
 * aucun message.
 *
 * Déclenchement :
 *   GET https://nexusmarket.sn/cron/wa-campaign?token=CRON_SECRET
 *   (+ &dry=1 pour simuler : sélectionne et rend compte SANS rien envoyer)
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET (ou
 *             NEXUS_WA_SECRET), + un fournisseur WhatsApp (GREEN_API_… / WAHA_…).
 * ──────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../api/_lib/utils.js';
import { sendWhatsAppDirect } from '../api/_lib/wa-send.js';

const jsonR = (d, s = 200) => new Response(JSON.stringify(d, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });

// Au-delà de ce taux d'échec sur un lot d'au moins MIN_FOR_BREAKER messages, on
// coupe : un pic d'erreurs est le premier signe d'un numéro en train d'être
// restreint. Mieux vaut s'arrêter tôt que finir banni.
const FAILURE_RATE_BREAKER = 0.5;
const MIN_FOR_BREAKER = 4;

// Délai aléatoire entre deux envois (ms). Une cadence régulière est un signal
// d'automatisation ; l'irrégularité imite un humain qui écrit.
const GAP_MIN_MS = 4000;
const GAP_MAX_MS = 15000;

// ── Réessai des échecs ──────────────────────────────────────────────────────
// Toutes les pannes ne se valent pas. Retenter un numéro qui n'existe pas sur
// WhatsApp ne réussira JAMAIS : cela gaspille le budget quotidien et aggrave
// le signal « envois vers des numéros absents », celui-là même qui fait
// classer un compte comme spam. On ne remet donc en file que les échecs
// TRANSITOIRES : fournisseur injoignable, quota mensuel, erreur serveur.
const MAX_ATTEMPTS = 3;
// Attente croissante avant chaque nouvelle tentative. Réessayer à l'heure
// suivante ne sert à rien : si le fournisseur est en panne ou en quota, il le
// sera encore. Indices = numéro de la tentative déjà effectuée.
const RETRY_BACKOFF_H = [3, 12];

function isTransientFailure(res) {
  const status = res && res.httpStatus;
  if (status) {
    // 466 = quota mensuel Green API (se réinitialise), 408/429 = charge,
    // 5xx = panne serveur. Tout autre 4xx désigne la requête elle-même
    // (numéro invalide, absent de WhatsApp) : inutile d'insister.
    if (status === 466 || status === 408 || status === 429) return true;
    return status >= 500;
  }
  // Pas de statut HTTP : erreur réseau côté Worker (fetch qui a levé).
  return /injoignable|timeout|network|fetch failed/i.test(String(res && res.error || ''));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = () => GAP_MIN_MS + Math.floor(Math.random() * (GAP_MAX_MS - GAP_MIN_MS));

// Le helper `supabase()` LÈVE sur réponse non-OK. Sans filet, une erreur base
// interromprait le lot APRÈS un envoi : la cible resterait `pending` et
// recevrait le message une seconde fois à l'heure suivante — un doublon chez
// une vraie personne, le pire défaut possible ici. D'où :
//   • `safe()` pour les lectures : un échec dégrade, il n'interrompt pas ;
//   • `markSafe()` avec réessai pour l'écriture du statut APRÈS envoi, qui est
//     la seule écriture dont la perte crée un doublon.
async function safe(fn, fallback = null) {
  try { return await fn(); } catch (_) { return fallback; }
}
async function markSafe(sb, id, patch, out) {
  for (let i = 0; i < 3; i++) {
    try { return await sb.from('wa_campaign_targets').update(patch, `id=eq.${id}`); }
    catch (e) {
      if (i === 2) {
        out.errors.push(`CRITIQUE : statut non enregistré pour ${id} (${String(e && e.message || e)}) `
          + `— risque de renvoi à l'heure suivante.`);
        return null;
      }
      await sleep(500 * (i + 1));
    }
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const secret = env.CRON_SECRET || env.NEXUS_WA_SECRET;
  if (!secret || token !== secret) return jsonR({ error: 'Non autorisé — ?token=requis' }, 401);
  return jsonR(await run(env, { dry: url.searchParams.get('dry') === '1' }));
}

export default { async scheduled(event, env, ctx) { ctx.waitUntil(run(env, {})); } };

// Préfixes mobiles sénégalais. Un fixe (33…) n'a pas WhatsApp : l'envoi échoue
// à coup sûr. Constaté en préparant la 1re campagne : 1176 cibles sur 2828
// (42 %) étaient des fixes. Sans ce filtre, le disjoncteur sautait en
// permanence — et surtout, un fort taux d'envois vers des numéros absents de
// WhatsApp est précisément le signal qui fait classer un compte comme spam.
const MOBILE_PREFIXES = ['70', '75', '76', '77', '78'];

function isSenegalMobile(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const local = d.startsWith('221') ? d.slice(3) : d;
  return local.length === 9 && MOBILE_PREFIXES.includes(local.slice(0, 2));
}

/**
 * Formule d'adresse. Prendre le 1er mot comme « prénom » marche pour une
 * personne (« Fall », « Niang » — usage courant au Sénégal) mais produit des
 * absurdités pour une raison sociale : « Bonjour Dakar » pour « Dakar Rapid
 * Pare-Brise », « Bonjour Immobilière », « Bonjour SAHEL ». Constaté sur la
 * campagne pilote AVANT tout envoi.
 * Règle retenue : un nom en un seul mot est traité comme un nom de personne ;
 * un nom composé est une entreprise, qu'on salue en entier.
 */
function greetingName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) return '';
  const mots = name.split(' ');
  if (mots.length === 1) return mots[0];
  return name.length <= 45 ? name : mots.slice(0, 3).join(' ');
}

/** Remplace les variables du gabarit par les données du prospect. */
function fillTemplate(tpl, t) {
  const prenom = greetingName(t.name);
  return String(tpl || '')
    .replace(/\{\{\s*nom\s*\}\}/gi, t.name || '')
    .replace(/\{\{\s*prenom\s*\}\}/gi, prenom)
    .replace(/\{\{\s*ville\s*\}\}/gi, t.city || 'votre ville')
    .replace(/\{\{\s*metier\s*\}\}/gi, t.profession || 'votre activité')
    // Nom absent : « Bonjour {{prenom}}, » deviendrait « Bonjour , ». On
    // recolle proprement plutôt que d'envoyer une ponctuation orpheline.
    .replace(/(Bonjour|Bonsoir|Salut)\s+,/gi, '$1,')
    .replace(/[ \t]{2,}/g, ' ')       // pas \s : les sauts de ligne du gabarit doivent survivre
    .trim();
}

async function run(env, { dry }) {
  const out = {
    run_at: new Date().toISOString(), dry: !!dry,
    campaign: null, sent: 0, failed: 0, skipped: 0, requeued: 0,
    remaining: null, scheduled_later: null, note: null, errors: [],
  };
  if (!env.SUPABASE_SERVICE_KEY) return { ...out, note: 'SUPABASE_SERVICE_KEY manquante' };

  const sb = supabase(env);

  // 1. Une seule campagne active à la fois : deux campagnes en parallèle
  //    doubleraient le débit réel et donc le risque de bannissement.
  const camps = await safe(() => sb.from('wa_campaigns').select('*', 'status=eq.running&order=created_at.asc&limit=1'), []);
  const camp = Array.isArray(camps) && camps[0];
  if (!camp) return { ...out, note: 'Aucune campagne en cours (status=running).' };
  out.campaign = { id: camp.id, name: camp.name };

  // 2. Fenêtre horaire (Dakar = UTC, pas de décalage ni d'heure d'été).
  const hour = new Date().getUTCHours();
  if (hour < camp.send_hour_min || hour >= camp.send_hour_max) {
    return { ...out, note: `Hors fenêtre d'envoi (${camp.send_hour_min}h-${camp.send_hour_max}h, il est ${hour}h UTC).` };
  }

  // 3. Plafond sur 24 h glissantes — le vrai garde-fou. Le plafond horaire seul
  //    ne suffit pas : un rattrapage de crons manqués pourrait tout envoyer d'un coup.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // `sent_at` récupéré en plus de l'id : la même lecture sert au plafond 24 h
  // ET à l'espacement entre lots, plutôt que deux requêtes.
  const sent24 = await safe(() => sb.from('wa_campaign_targets').select('id,sent_at',
    `campaign_id=eq.${camp.id}&status=eq.sent&sent_at=gte.${since}&limit=1000`), null);
  // Si ce comptage échoue, le plafond 24 h n'est plus garanti : on s'abstient
  // plutôt que d'envoyer à l'aveugle.
  if (sent24 === null) return { ...out, note: 'Comptage 24 h indisponible — envoi suspendu par prudence.' };
  const already = Array.isArray(sent24) ? sent24.length : 0;
  const budget = Math.min(camp.hourly_limit, Math.max(0, camp.daily_limit - already));
  if (budget <= 0) {
    return { ...out, note: `Plafond quotidien atteint (${already}/${camp.daily_limit} sur 24 h).` };
  }

  /* [CADENCE 2026-09-05] L'espacement entre lots est imposé ICI, pas par le
     planificateur. GitHub Actions déclenche ses créneaux de façon erratique
     (constaté : créneau de 10:00 exécuté à 13:12, runs à 00:29/01:05/05:04…).
     Compter sur sa ponctualité produisait soit une campagne à l'arrêt, soit
     deux lots coup sur coup si deux runs tombaient rapprochés.
     Conséquence : le job peut être rattaché au créneau le plus fréquent — un
     passage trop tôt ne fait rien, un créneau manqué est rattrapé au suivant. */
  const gapMin = Number(camp.min_gap_minutes) > 0 ? Number(camp.min_gap_minutes) : 50;
  const lastSent = (Array.isArray(sent24) ? sent24 : [])
    .map(r => Date.parse(r.sent_at || '') || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  if (lastSent > 0) {
    const ecouleMin = Math.floor((Date.now() - lastSent) / 60000);
    if (ecouleMin < gapMin) {
      return { ...out, note: `Lot precedent il y a ${ecouleMin} min ; attente de ${gapMin} min entre deux lots.` };
    }
  }

  // 4. Le lot à traiter.
  // `next_attempt_at` null (jamais tentée) OU déjà échue : sans ce filtre, une
  // cible remise en file repartirait immédiatement au passage suivant et la
  // temporisation ne servirait à rien.
  const nowIsoSel = new Date().toISOString();
  const targets = await safe(() => sb.from('wa_campaign_targets').select('*',
    `campaign_id=eq.${camp.id}&status=eq.pending`
    + `&or=(next_attempt_at.is.null,next_attempt_at.lte.${nowIsoSel})`
    + `&order=next_attempt_at.asc.nullsfirst,created_at.asc&limit=${budget}`), null);
  if (targets === null) return { ...out, note: 'Lecture de la file impossible — rien envoyé.' };
  if (!Array.isArray(targets) || !targets.length) {
    // ⚠ Aucune cible DUE ne veut pas dire aucune cible RESTANTE : des échecs
    // transitoires peuvent être reprogrammés plus tard. Marquer 'done' ici les
    // abandonnerait définitivement. On ne clôt que si la file est vraiment vide.
    const later = await safe(() => sb.from('wa_campaign_targets').select('id',
      `campaign_id=eq.${camp.id}&status=eq.pending&limit=1000`), null);
    const nbLater = Array.isArray(later) ? later.length : null;
    if (nbLater === 0 && !dry) {
      await safe(() => sb.from('wa_campaigns').update({ status: 'done', updated_at: new Date().toISOString() }, `id=eq.${camp.id}`));
      return { ...out, remaining: 0, note: 'File vide — campagne terminée.' };
    }
    return { ...out, remaining: nbLater, scheduled_later: nbLater,
      note: nbLater === null
        ? 'Aucune cible due ; reste indéterminé (lecture impossible) — campagne laissée ouverte.'
        : `Aucune cible due maintenant ; ${nbLater} en attente de leur heure de réessai.` };
  }

  // 5. Liste noire : un « STOP » vaut pour toutes les campagnes.
  const phones = targets.map(t => t.phone).filter(Boolean);
  const optRows = phones.length
    ? await safe(() => sb.from('wa_opt_outs').select('phone',
        `phone=in.(${phones.map(p => `"${String(p).replace(/"/g, '')}"`).join(',')})&limit=1000`), null)
    : [];
  // Si la liste noire est illisible, on ne devine pas : écrire à quelqu'un qui a
  // demandé l'arrêt est pire que de rater un passage de cron.
  if (optRows === null) return { ...out, note: "Liste d'opt-out illisible — envoi suspendu par prudence." };
  const optedOut = new Set(optRows.map(r => r.phone));

  let failures = 0, attempts = 0;
  for (const t of targets) {
    const nowIso = new Date().toISOString();

    if (optedOut.has(t.phone)) {
      out.skipped++;
      if (!dry) await safe(() => sb.from('wa_campaign_targets').update({ status: 'opted_out' }, `id=eq.${t.id}`));
      continue;
    }

    // Filet de sécurité : même si la file a été remplie sans filtrer, on
    // n'envoie jamais vers un non-mobile (échec garanti + signal spam).
    if (!isSenegalMobile(t.phone)) {
      out.skipped++;
      if (!dry) await safe(() => sb.from('wa_campaign_targets').update(
        { status: 'skipped', error_msg: 'numero non mobile (pas de WhatsApp)' }, `id=eq.${t.id}`));
      continue;
    }

    const message = fillTemplate(camp.template, t);
    if (!message) {
      out.skipped++;
      if (!dry) await safe(() => sb.from('wa_campaign_targets').update({ status: 'skipped', error_msg: 'message vide' }, `id=eq.${t.id}`));
      continue;
    }

    if (dry) { out.sent++; continue; }   // simulation : rien n'est envoyé

    attempts++;
    let res;
    try {
      res = await sendWhatsAppDirect(env, { phone: t.phone, message });
    } catch (e) {
      res = { ok: false, error: String(e && e.message || e) };
    }

    if (res && res.ok) {
      out.sent++;
      await markSafe(sb, t.id, { status: 'sent', sent_at: nowIso, attempts: (t.attempts || 0) + 1 }, out);
    } else {
      out.failed++; failures++;
      const msg = String((res && res.error) || 'échec inconnu').slice(0, 300);
      out.errors.push(msg);
      const tries = (t.attempts || 0) + 1;
      const retriable = isTransientFailure(res) && tries < MAX_ATTEMPTS;
      if (retriable) {
        // Reste 'pending' mais invisible jusqu'à next_attempt_at.
        const waitH = RETRY_BACKOFF_H[Math.min(tries - 1, RETRY_BACKOFF_H.length - 1)];
        const when = new Date(Date.now() + waitH * 3600 * 1000).toISOString();
        out.requeued++;
        await markSafe(sb, t.id, {
          status: 'pending', attempts: tries, next_attempt_at: when,
          error_msg: `${msg} — nouvelle tentative dans ${waitH} h (${tries}/${MAX_ATTEMPTS})`,
        }, out);
      } else {
        await markSafe(sb, t.id, {
          status: 'failed', attempts: tries,
          error_msg: msg + (isTransientFailure(res) ? ` — abandon après ${tries} tentatives` : ' — échec définitif (non retentable)'),
        }, out);
      }
    }

    // Journal partagé avec le reste du système (panneau admin WhatsApp).
    try {
      await sb.from('whatsapp_logs').insert({
        phone: t.phone, message, template: 'campaign',
        status: (res && res.ok) ? 'sent' : 'failed',
        error_msg: (res && res.ok) ? null : String((res && res.error) || '').slice(0, 300),
        context: { campaign_id: camp.id, target_id: t.id },
      });
    } catch (_) { /* le journal ne doit jamais bloquer l'envoi */ }

    // Disjoncteur : on coupe AVANT d'avoir grillé le numéro.
    if (attempts >= MIN_FOR_BREAKER && (failures / attempts) >= FAILURE_RATE_BREAKER) {
      await safe(() => sb.from('wa_campaigns').update(
        { status: 'stopped', updated_at: nowIso }, `id=eq.${camp.id}`));
      out.note = `DISJONCTEUR : ${failures}/${attempts} échecs → campagne passée en 'stopped'. `
        + `Vérifier l'état du numéro avant de relancer.`;
      break;
    }

    await sleep(jitter());
  }

  const rest = await safe(() => sb.from('wa_campaign_targets').select('id',
    `campaign_id=eq.${camp.id}&status=eq.pending&limit=5000`), null);
  out.remaining = Array.isArray(rest) ? rest.length : null;
  return out;
}
