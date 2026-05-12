import { CORS, options, json, err } from '../../../_lib/utils.js';
import nodemailer from 'nodemailer';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const { to, subject, html, text } = await request.json();
    if (!to || !subject || (!html && !text)) {
      return err('Paramètres manquants: to, subject, et html/text sont requis', 400);
    }

    // Configuration du transporteur Nodemailer
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true', // true pour 465, false pour les autres ports
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });

    // Envoyer l'email
    const info = await transporter.sendMail({
      from: `"Nexus Market" <${env.SMTP_FROM || 'noreply@nexus-market.com'}>`,
      to: to,
      subject: subject,
      text: text,
      html: html
    });

    return json({
      success: true,
      message: 'Email envoyé avec succès',
      messageId: info.messageId
    });

  } catch (error) {
    return err(error.message, 500);
  }
}