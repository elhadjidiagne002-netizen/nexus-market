// supabase/functions/send-notification/index.ts
// Edge Function — envoi notification + email via EmailJS
// Déployer : npx supabase functions deploy send-notification
// Appelée par les triggers PostgreSQL via pg_net (ou directement depuis le backend)

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface NotificationPayload {
    user_id:  string;
    type:     string;
    title:    string;
    message:  string;
    link?:    string;
    data?:    Record<string, unknown>;
    email?:   { to: string; subject: string; template_id: string; variables: Record<string, string> };
}

serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // Vérifier le secret interne
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const payload: NotificationPayload = await req.json();

        // 1. Insérer la notification en base
        const { data: notif, error } = await sb
            .from('notifications')
            .insert({
                user_id: payload.user_id,
                type:    payload.type,
                title:   payload.title,
                message: payload.message,
                link:    payload.link,
                data:    payload.data ?? {}
            })
            .select()
            .single();

        if (error) throw error;

        // 2. Envoyer un email si demandé (via EmailJS REST API)
        if (payload.email && Deno.env.get('EMAILJS_PUBLIC_KEY')) {
            await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id:  Deno.env.get('EMAILJS_SERVICE_ID'),
                    template_id: payload.email.template_id,
                    user_id:     Deno.env.get('EMAILJS_PUBLIC_KEY'),
                    template_params: {
                        to_email: payload.email.to,
                        subject:  payload.email.subject,
                        ...payload.email.variables
                    }
                })
            }).catch(e => console.warn('EmailJS error:', e.message));
        }

        return new Response(JSON.stringify({ ok: true, id: notif.id }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        console.error('Notification error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});
