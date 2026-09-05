// functions/api/admin/waha-session.js → /api/admin/waha-session
// Réparation de la session WAHA (fournisseur WhatsApp de SECOURS).
//
// POURQUOI : `GET /api/whatsapp` remontait `wahaSession: 404 Session not found`
// (constaté 2026-09-05) — le secours était donc mort sans que rien ne le
// signale, alors que Green API est le seul fournisseur restant. WAHA tourne sur
// Render : le disque y est éphémère, un redémarrage de l'instance efface la
// session appairée. Elle doit alors être RECRÉÉE puis RÉ-APPAIRÉE par un scan
// de QR code depuis le téléphone.
//
// Ce que cet endpoint peut faire (côté serveur, avec WAHA_API_KEY) :
//   ?action=list    → sessions présentes sur le serveur WAHA
//   ?action=status  → état détaillé de la session configurée
//   ?action=start   → crée et/ou démarre la session (POST)
//   ?action=qr      → renvoie le QR à scanner (image PNG en base64)
//   ?action=stop    → arrête la session (POST) — pour repartir de zéro
//
// Ce qu'il ne peut PAS faire : scanner le QR. C'est une action physique sur le
// téléphone qui porte le compte WhatsApp — personne d'autre ne peut la faire,
// et c'est très bien ainsi (sinon n'importe qui pourrait appairer le compte).
//
// ⚠ Réservé admin (requireAdmin) : appairer un compte WhatsApp est une action
// sensible, elle ne doit jamais être exposée publiquement — contrairement au
// diagnostic en lecture seule de /api/whatsapp.
import { requireAdmin, isInternalCall, json, err, options } from '../_lib/utils.js';

export async function onRequestOptions() { return options(); }

function wahaConf(env) {
  const base = (env.WAHA_BASE_URL || '').replace(/\/+$/, '');
  const key = env.WAHA_API_KEY;
  const session = env.WAHA_SESSION || 'default';
  return { base, key, session, ok: !!(base && key) };
}

async function waha(env, path, { method = 'GET', body } = {}) {
  const { base, key } = wahaConf(env);
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { httpStatus: r.status, ok: r.ok, data };
}

export async function onRequestGet({ request, env }) {
  /* Deux appelants autorisés, tous deux de confiance équivalente :
     • un ADMIN authentifié (JWT) — requireAdmin renvoie un TUPLE
       [user, errResponse], PAS une Response : tester `instanceof Response`
       ne bloquerait personne (bug attrapé à la relecture) ;
     • un appel INTERNE porteur de X-Internal-Secret — permet de piloter la
       réparation depuis pg_net/pg_cron, sans jeton admin. Ce secret est
       server-only : quiconque le détient a déjà un accès complet, la surface
       d'attaque n'est donc pas élargie. Même motif que /api/notify-user. */
  if (!isInternalCall(request, env)) {
    const [, denied] = await requireAdmin(request, env);
    if (denied) return denied;
  }

  const conf = wahaConf(env);
  if (!conf.ok) return err('WAHA non configuré (WAHA_BASE_URL / WAHA_API_KEY manquantes).', 503);

  const action = new URL(request.url).searchParams.get('action') || 'status';

  try {
    if (action === 'list') {
      // Utile quand la session semble « absente » : elle peut exister sous un
      // autre nom que WAHA_SESSION (source classique du 404).
      const res = await waha(env, '/api/sessions');
      return json({ action, session_attendue: conf.session, ...res });
    }

    if (action === 'status') {
      const res = await waha(env, `/api/sessions/${encodeURIComponent(conf.session)}`);
      return json({
        action, session: conf.session, ...res,
        aide: res.httpStatus === 404
          ? "Session absente : appeler ?action=start, puis ?action=qr et scanner le QR depuis WhatsApp (Appareils connectés → Connecter un appareil)."
          : undefined,
      });
    }

    if (action === 'qr') {
      // WAHA renvoie le QR en image. On le transmet en base64 : le JSON reste
      // lisible depuis n'importe quel client, sans dépendre d'un rendu binaire.
      const { base, key, session } = conf;
      const r = await fetch(`${base}/api/${encodeURIComponent(session)}/auth/qr?format=image`, {
        headers: { 'X-Api-Key': key },
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return json({
          action, httpStatus: r.status, ok: false, detail: t.slice(0, 400),
          aide: "Pas de QR disponible. La session doit être démarrée (?action=start) et en état SCAN_QR_CODE. Si elle est déjà WORKING, il n'y a rien à scanner.",
        }, r.status === 404 ? 404 : 502);
      }
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return json({
        action, session, ok: true,
        qr_data_url: 'data:image/png;base64,' + btoa(bin),
        mode_emploi: "Ouvrir cette data-URL dans un navigateur, puis dans WhatsApp : Paramètres → Appareils connectés → Connecter un appareil, et scanner. Le QR expire vite : régénérer si besoin.",
      });
    }

    return err(`Action inconnue : ${action}. Attendu : list | status | qr (GET), start | stop (POST).`, 400);
  } catch (e) {
    // 500 et NON 502 : Cloudflare remplace le corps de toute réponse 502 par sa
    // propre page HTML, le vrai message n'arriverait jamais à l'appelant.
    return err('WAHA injoignable : ' + String(e && e.message || e), 500);
  }
}

export async function onRequestPost({ request, env }) {
  /* Deux appelants autorisés, tous deux de confiance équivalente :
     • un ADMIN authentifié (JWT) — requireAdmin renvoie un TUPLE
       [user, errResponse], PAS une Response : tester `instanceof Response`
       ne bloquerait personne (bug attrapé à la relecture) ;
     • un appel INTERNE porteur de X-Internal-Secret — permet de piloter la
       réparation depuis pg_net/pg_cron, sans jeton admin. Ce secret est
       server-only : quiconque le détient a déjà un accès complet, la surface
       d'attaque n'est donc pas élargie. Même motif que /api/notify-user. */
  if (!isInternalCall(request, env)) {
    const [, denied] = await requireAdmin(request, env);
    if (denied) return denied;
  }

  const conf = wahaConf(env);
  if (!conf.ok) return err('WAHA non configuré (WAHA_BASE_URL / WAHA_API_KEY manquantes).', 503);

  const action = new URL(request.url).searchParams.get('action') || 'start';

  try {
    if (action === 'stop') {
      const res = await waha(env, `/api/sessions/${encodeURIComponent(conf.session)}/stop`, { method: 'POST' });
      return json({ action, session: conf.session, ...res });
    }

    if (action === 'start') {
      // WAHA a changé d'API selon les versions : sur les récentes on CRÉE la
      // session (POST /api/sessions) puis on la démarre ; sur les anciennes,
      // POST /api/sessions/start suffit. On tente les deux plutôt que d'imposer
      // une version — le serveur est auto-hébergé et peut être mis à jour.
      const created = await waha(env, '/api/sessions', {
        method: 'POST',
        body: { name: conf.session, start: true },
      });

      let started = null;
      if (!created.ok) {
        started = await waha(env, '/api/sessions/start', {
          method: 'POST', body: { name: conf.session },
        });
      }

      const status = await waha(env, `/api/sessions/${encodeURIComponent(conf.session)}`);
      return json({
        action, session: conf.session,
        creation: { httpStatus: created.httpStatus, ok: created.ok, data: created.data },
        demarrage_repli: started ? { httpStatus: started.httpStatus, ok: started.ok, data: started.data } : null,
        etat_final: status,
        suite: (status.data && status.data.status === 'WORKING')
          ? "Session déjà appairée : rien à scanner."
          : "Appeler ?action=qr et scanner le QR depuis WhatsApp (Appareils connectés → Connecter un appareil).",
      });
    }

    return err(`Action inconnue : ${action}. Attendu : start | stop (POST).`, 400);
  } catch (e) {
    return err('WAHA injoignable : ' + String(e && e.message || e), 500);
  }
}
