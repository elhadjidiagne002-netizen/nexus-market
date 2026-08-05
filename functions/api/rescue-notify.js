// functions/api/rescue-notify.js → POST /api/rescue-notify
// Endpoint INTERNE (X-Internal-Secret) : notifications WhatsApp du vertical
// NEXUS Dépannage Auto (SOS panne). Appelé par les RPC SQL du fichier
// sql/2026_08_04_nexus_depannage_auto.sql (net.http_post best-effort, ne
// bloque jamais la cascade/l'action si l'envoi échoue).
// `kind` sélectionne l'événement (WA_DEFAULTS de _lib/notify.js) et les
// destinataires. Mirroir de order-email.js/offer-email.js/low-stock-email.js.
import { isInternalCall, json, err, options } from './_lib/utils.js';
import { sendEventNotification, resolveAdminContact } from './_lib/notify.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  if (!isInternalCall(request, env)) return json({ ok: false, skipped: 'not_internal' }, 401);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { kind } = body || {};

  const fcfa = (n) => (n != null && isFinite(Number(n)) ? Number(n).toLocaleString('fr-FR') + ' FCFA' : '');

  switch (kind) {
    case 'offer_new': {
      const { rescuer_phone, location_label, rescuer_payout } = body;
      if (!rescuer_phone) return json({ ok: true, skipped: 'no_recipient' });
      const r = await sendEventNotification(env, 'rescue_offer_new', { phone: rescuer_phone }, {
        location_label: location_label || 'Position du véhicule',
        rescuer_payout: fcfa(rescuer_payout),
      });
      return json({ ok: true, result: r });
    }
    case 'accepted': {
      const { requester_phone, rescuer_name, rescuer_phone } = body;
      if (!requester_phone) return json({ ok: true, skipped: 'no_recipient' });
      const r = await sendEventNotification(env, 'rescue_accepted', { phone: requester_phone }, {
        rescuer_name: rescuer_name || 'Un dépanneur',
        rescuer_phone: rescuer_phone || '',
      });
      return json({ ok: true, result: r });
    }
    case 'no_rescuer': {
      const { requester_phone } = body;
      if (!requester_phone) return json({ ok: true, skipped: 'no_recipient' });
      const r = await sendEventNotification(env, 'rescue_no_rescuer', { phone: requester_phone }, {});
      return json({ ok: true, result: r });
    }
    case 'en_route': {
      const { requester_phone, rescuer_name } = body;
      if (!requester_phone) return json({ ok: true, skipped: 'no_recipient' });
      const r = await sendEventNotification(env, 'rescue_en_route', { phone: requester_phone }, {
        rescuer_name: rescuer_name || 'Le dépanneur',
      });
      return json({ ok: true, result: r });
    }
    case 'arrived': {
      const { requester_phone, rescuer_name } = body;
      if (!requester_phone) return json({ ok: true, skipped: 'no_recipient' });
      const r = await sendEventNotification(env, 'rescue_arrived', { phone: requester_phone }, {
        rescuer_name: rescuer_name || 'Le dépanneur',
      });
      return json({ ok: true, result: r });
    }
    case 'completed': {
      const { requester_phone, rescuer_phone, payout_fcfa } = body;
      const [rRequester, rRescuer] = await Promise.all([
        requester_phone
          ? sendEventNotification(env, 'rescue_completed', { phone: requester_phone }, {}).catch(() => null)
          : Promise.resolve(null),
        rescuer_phone
          ? sendEventNotification(env, 'rescue_completed_rescuer', { phone: rescuer_phone }, {
              payout_fcfa: fcfa(payout_fcfa),
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      return json({ ok: true, requester: rRequester, rescuer: rRescuer });
    }
    case 'cancelled': {
      const { rescuer_phone } = body;
      if (!rescuer_phone) return json({ ok: true, skipped: 'no_recipient' });
      const r = await sendEventNotification(env, 'rescue_cancelled_rescuer', { phone: rescuer_phone }, {});
      return json({ ok: true, result: r });
    }
    case 'admin_new_rescuer': {
      const { rescuer_name, rescuer_phone } = body;
      const admin = await resolveAdminContact(env);
      if (!admin.email && !admin.phone) return json({ ok: true, skipped: 'no_admin_contact' });
      const r = await sendEventNotification(env, 'admin_new_rescuer', { email: admin.email, phone: admin.phone }, {
        rescuer_name: rescuer_name || 'Nouveau dépanneur',
        rescuer_phone: rescuer_phone || '',
      });
      return json({ ok: true, result: r });
    }
    default:
      return json({ ok: false, error: 'kind inconnu' }, 400);
  }
}
