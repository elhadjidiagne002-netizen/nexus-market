// ═══════════════════════════════════════════════════════════════════════════
// GasTon 360 — Health Check Endpoint  v2
// Fichier : app/api/health/route.js
//
// Vérifie : Supabase DB · Supabase Storage · Stripe · EmailJS · Env vars
// URL     : https://nexus-market-md360.vercel.app/api/health
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// ── Constantes projet ────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://pqcqbstbdujzaclsiosv.supabase.co';
const SUPABASE_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/health
// ═══════════════════════════════════════════════════════════════════════════
export async function GET() {
  const start    = Date.now();
  const services = {};

  // ── 1. Base de données Supabase ──────────────────────────────────────────
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

    const [p, pr, o] = await Promise.all([
      supabase.from('profiles').select('id').limit(1),
      supabase.from('products').select('id').limit(1),
      supabase.from('orders').select('id').limit(1),
    ]);

    const dbError = p.error || pr.error || o.error;
    services.database       = dbError ? 'error' : 'ok';
    services.database_url   = SUPABASE_URL;
    services.tables_checked = ['profiles', 'products', 'orders'];
    if (dbError) services.database_error = dbError.message;
  } catch (err) {
    services.database       = 'error';
    services.database_error = err.message;
  }

  // ── 2. Supabase Storage ──────────────────────────────────────────────────
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);
    const { data: buckets, error } = await supabase.storage.listBuckets();
    const names = (buckets || []).map(b => b.name);

    services.storage         = !error && names.includes('products');
    services.storage_buckets = names;
    services.storage_avatars = names.includes('avatars');
    if (error) services.storage_error = error.message;
  } catch (err) {
    services.storage       = false;
    services.storage_error = err.message;
  }

  // ── 3. Stripe ────────────────────────────────────────────────────────────
  const stripePub    = process.env.NEXT_PUBLIC_STRIPE_KEY || '';
  const stripeSecret = process.env.STRIPE_SECRET_KEY      || '';
  const stripeWH     = process.env.STRIPE_WEBHOOK_SECRET  || '';

  services.stripe = (
    (stripePub.startsWith('pk_test_') || stripePub.startsWith('pk_live_')) &&
    (stripeSecret.startsWith('sk_test_') || stripeSecret.startsWith('sk_live_'))
  );
  services.stripe_mode       = stripePub.startsWith('pk_live_') ? 'live' : 'test';
  services.stripe_webhook_ok = stripeWH.startsWith('whsec_');
  services.stripe_pub_prefix = stripePub.slice(0, 14) + '...' || '—';

  // Ping API Stripe pour valider la clé secrète
  if (stripeSecret) {
    try {
      const r = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${stripeSecret}` },
        signal:  AbortSignal.timeout(5000),
      });
      services.stripe_api = r.ok ? 'ok' : `http_${r.status}`;
    } catch {
      services.stripe_api = 'timeout';
    }
  }

  // ── 4. Email — EmailJS ───────────────────────────────────────────────────
  const emailjsServiceId = process.env.EMAILJS_SERVICE_ID  || 'service_84yfkgf';
  const emailjsPublicKey = process.env.EMAILJS_PUBLIC_KEY  || 'WSBntSTWdh5d9usZC';
  const templateOrder    = process.env.EMAILJS_TEMPLATE_ORDER || 'template_t075pts';
  const templateReset    = process.env.EMAILJS_TEMPLATE_RESET || 'template_rmydvxg';

  services.email                = !!(emailjsServiceId && emailjsPublicKey);
  services.email_provider       = 'emailjs';
  services.email_service_id     = emailjsServiceId;
  services.email_template_order = templateOrder;
  services.email_template_reset = templateReset;
  services.email_from           = process.env.EMAIL_FROM || 'admin@nexus.sn';

  // ── 5. Variables d'environnement critiques ───────────────────────────────
  const required = {
    NEXT_PUBLIC_SUPABASE_URL:      !!SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:     !!SUPABASE_SVC_KEY,
    NEXT_PUBLIC_STRIPE_KEY:        !!stripePub,
    STRIPE_SECRET_KEY:             !!stripeSecret,
    STRIPE_WEBHOOK_SECRET:         !!stripeWH,
    EMAILJS_SERVICE_ID:            !!emailjsServiceId,
    EMAILJS_PUBLIC_KEY:            !!emailjsPublicKey,
  };

  const missingEnv = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  services.env_ok      = missingEnv.length === 0;
  services.missing_env = missingEnv;
  services.env_count   = `${Object.keys(required).length - missingEnv.length}/${Object.keys(required).length} OK`;

  // ── 6. Infos projet ──────────────────────────────────────────────────────
  services.project = {
    name:    process.env.NEXT_PUBLIC_MARKET_NAME || 'GasTon 360',
    url:     process.env.NEXT_PUBLIC_APP_URL     || 'https://nexus-market-md360.vercel.app',
    admin:   process.env.ADMIN_EMAIL             || 'admin@nexus.sn',
    github:  'https://github.com/elhadjidiagne002-netizen/nexus-market',
    version: '3.0',
  };

  // ── Statut global ────────────────────────────────────────────────────────
  const allOk =
    services.database === 'ok' &&
    services.storage  &&
    services.stripe   &&
    services.email    &&
    services.env_ok;

  return new Response(
    JSON.stringify({
      status:     allOk ? 'OK' : 'DEGRADED',
      timestamp:  new Date().toISOString(),
      latency_ms: Date.now() - start,
      services,
    }),
    {
      status: 200,
      headers: {
        'Content-Type':                 'application/json',
        'Cache-Control':                'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    }
  );
}

// Preflight CORS — nécessaire pour les appels depuis le guide HTML
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
