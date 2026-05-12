import { CORS, options, json, err } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    if (!env.FCM_SERVER_KEY) {
      return err('FCM_SERVER_KEY non configuré', 500);
    }

    const { to, notification, data } = await request.json();
    if (!to || !notification) {
      return err('Paramètres manquants: to et notification sont requis', 400);
    }

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${env.FCM_SERVER_KEY}`
      },
      body: JSON.stringify({
        to: to,
        notification: notification,
        data: data || {}
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return err(`Erreur FCM: ${errorData.error || 'Inconnu'}`, 500);
    }

    return json({
      success: true,
      message: 'Notification push envoyée avec succès'
    });

  } catch (error) {
    return err(error.message, 500);
  }
}