// supabase/functions/stripe-webhook/index.ts
// Edge Function Supabase — Webhook Stripe (paiements)
// Déployer : npx supabase functions deploy stripe-webhook

import { serve }       from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe           from 'https://esm.sh/stripe@13.0.0?target=deno';

const stripe    = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
const sb        = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

serve(async (req) => {
    const body      = await req.text();
    const signature = req.headers.get('stripe-signature') ?? '';

    let event: Stripe.Event;
    try {
        event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
    } catch (err) {
        console.error('Webhook signature invalide:', err.message);
        return new Response(JSON.stringify({ error: 'Signature invalide' }), { status: 400 });
    }

    switch (event.type) {
        case 'payment_intent.succeeded': {
            const pi     = event.data.object as Stripe.PaymentIntent;
            const orderId = pi.metadata?.order_id;

            if (orderId) {
                await sb.from('orders').update({
                    payment_status: 'paid',
                    payment_ref:    pi.id,
                    status:         'confirmed'
                }).eq('stripe_payment_intent', pi.id);

                console.log(`✅ Paiement confirmé pour commande ${orderId}`);
            }
            break;
        }

        case 'payment_intent.payment_failed': {
            const pi      = event.data.object as Stripe.PaymentIntent;
            const orderId = pi.metadata?.order_id;

            if (orderId) {
                await sb.from('orders').update({
                    payment_status: 'failed',
                    status:         'cancelled',
                    cancel_reason:  'Paiement échoué'
                }).eq('stripe_payment_intent', pi.id);
            }
            break;
        }

        case 'charge.refunded': {
            const charge  = event.data.object as Stripe.Charge;
            const piId    = charge.payment_intent as string;

            await sb.from('orders').update({
                payment_status: 'refunded',
                status:         'refunded'
            }).eq('stripe_payment_intent', piId);
            break;
        }
    }

    return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
    });
});
