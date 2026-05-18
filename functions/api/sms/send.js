/**
 * POST /api/sms/send
 * Envoie un SMS via le provider configuré (Twilio par défaut, fallback Orange API).
 *
 * Body : { phone: "+221xxxxxxxx", message: "...", template?: "order_confirmation" }
 *
 * Variables d'env :
 *   SMS_PROVIDER       — "twilio" | "orange" | "simulate"
 *   TWILIO_SID
 *   TWILIO_TOKEN
 *   TWILIO_FROM
 *   ORANGE_CLIENT_ID
 *   ORANGE_CLIENT_SECRET
 *   ORANGE_SENDER_ADDR — ex: "tel:+221700000000"
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON invalide' }, 400);
  }

  const { phone, message } = body;
  if (!phone || !message) {
    return json({ error: 'phone et message obligatoires' }, 400);
  }

  // Validation format E.164
  if (!/^\+\d{8,15}$/.test(phone)) {
    return json({ error: 'Numéro invalide (format E.164 attendu : +221XXXXXXXXX)' }, 400);
  }

  const provider = (env.SMS_PROVIDER || 'simulate').toLowerCase();

  // ── Mode simulation (utile en dev / preview) ─────────────────────────────
  if (provider === 'simulate') {
    console.log(`[SMS SIM] → ${phone}: ${message}`);
    return json({ ok: true, simulated: true, provider: 'simulate' });
  }

  // ── Twilio ───────────────────────────────────────────────────────────────
  if (provider === 'twilio') {
    if (!env.TWILIO_SID || !env.TWILIO_TOKEN || !env.TWILIO_FROM) {
      return json({ error: 'Twilio non configuré' }, 503);
    }
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            To: phone,
            From: env.TWILIO_FROM,
            Body: message
          })
        }
      );
      const data = await res.json();
      if (!res.ok) {
        return json({ error: data.message || 'Échec Twilio', code: data.code }, 502);
      }
      return json({ ok: true, provider: 'twilio', sid: data.sid });
    } catch (e) {
      return json({ error: 'Twilio injoignable', detail: e.message }, 502);
    }
  }

  // ── Orange SMS API (Sénégal) ─────────────────────────────────────────────
  if (provider === 'orange') {
    if (!env.ORANGE_CLIENT_ID || !env.ORANGE_CLIENT_SECRET || !env.ORANGE_SENDER_ADDR) {
      return json({ error: 'Orange API non configuré' }, 503);
    }
    try {
      // 1. Récupérer un token OAuth2
      const tokenRes = await fetch('https://api.orange.com/oauth/v3/token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${env.ORANGE_CLIENT_ID}:${env.ORANGE_CLIENT_SECRET}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) return json({ error: 'Auth Orange échouée' }, 502);

      // 2. Envoyer le SMS
      const senderAddr = env.ORANGE_SENDER_ADDR; // ex: "tel:+221700000000"
      const recipientAddr = `tel:${phone}`;
      const smsRes = await fetch(
        `https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(senderAddr)}/requests`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            outboundSMSMessageRequest: {
              address: [recipientAddr],
              senderAddress: senderAddr,
              outboundSMSTextMessage: { message }
            }
          })
        }
      );
      const smsData = await smsRes.json();
      if (!smsRes.ok) {
        return json({ error: 'Échec Orange', detail: smsData }, 502);
      }
      return json({ ok: true, provider: 'orange' });
    } catch (e) {
      return json({ error: 'Orange API injoignable', detail: e.message }, 502);
    }
  }

  return json({ error: `Provider SMS inconnu : ${provider}` }, 503);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
