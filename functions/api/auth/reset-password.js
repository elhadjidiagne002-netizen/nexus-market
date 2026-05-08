import { CORS, options, json, err, supabase } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const { email } = await request.json();
    if (!email) return err('Email manquant', 400);

    const sb = supabase(env);

    // Vérifier si l'utilisateur existe
    const { data: user, error: userError } = await sb
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError) throw userError;
    if (!user) return err('Utilisateur non trouvé', 404);

    // Ici, vous devriez envoyer un email de réinitialisation (ex: via SendGrid, Mailgun, etc.)
    // Exemple avec un service fictif :
    const resetToken = crypto.randomUUID();
    const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Stocker le token en base de données (à adapter selon votre implémentation)
    const { error: tokenError } = await sb
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token: resetToken,
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 heure
        used: false
      });

    if (tokenError) throw tokenError;

    // TODO: Envoyer l'email avec le lien de réinitialisation
    // Exemple: await sendEmail(user.email, 'Réinitialisation du mot de passe', `Cliquez ici: ${resetLink}`);

    return json({
      success: true,
      message: 'Un email de réinitialisation a été envoyé (simulation).'
    });

  } catch (error) {
    return err(error.message, error.status || 500);
  }
}
