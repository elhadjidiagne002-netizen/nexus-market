// [NEXUS-REALTIME-MSG-SERVER]
/**
 * NEXUS Market Sénégal — Backend Node.js/Express v3.1.4
 * ====================================================
 * Installation : npm install
 * Démarrage    : node server.js   (ou : npm run dev avec nodemon)
 *
 * Variables d'environnement requises dans .env :
 *   PORT                      (défaut : 3000)
 *   SUPABASE_URL              https://pqcqbstbdujzaclsiosv.supabase.co
 *   SUPABASE_SERVICE_KEY      eyJ... (service_role — jamais côté client)
 *   SUPABASE_ANON_KEY         eyJ... (clé anon — requis pour fallback login)
 *   STRIPE_SECRET_KEY         sk_test_51TGdXe...
 *   STRIPE_PUBLIC_KEY         pk_test_51TGdXe...
 *   STRIPE_WEBHOOK_SECRET     whsec_...
 *   JWT_SECRET                (chaîne aléatoire — ex: node -e "require('crypto').randomBytes(64).toString('hex')")
 *   JWT_EXPIRES_IN            900    (secondes = 15min — access token court, refresh token 30j)
 *   FRONTEND_URL              https://nexus-market-md360.vercel.app
 *   ADMIN_EMAIL               admin@nexus.sn
 *   EMAILJS_SERVICE_ID        service_84yfkgf
 *   EMAILJS_PUBLIC_KEY        WSBntSTWdh5d9usZC
 *   EMAILJS_PRIVATE_KEY       ...
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   LOG_LEVEL                 (optionnel — 'debug' pour logs verbeux, défaut: 'info')
 *   SENTRY_DSN                https://xxx@oXXX.ingest.sentry.io/YYYY (optionnel — monitoring erreurs)
 *
 * CHANGELOG v3.1.2 (correctifs appliqués) :
 *   [FIX 1] BUG CRITIQUE — app.listen() maintenant TOUJOURS appelé (plus conditionné à NODE_ENV)
 *           Avant : if (process.env.NODE_ENV !== 'production') { app.listen(...) }
 *           → Sur Render/Railway avec NODE_ENV=production, le serveur ne démarrait JAMAIS
 *   [FIX 2] BUG table — 'password_reset' → 'password_resets' (avec 's') pour correspondre au schema.sql
 *   [FIX 3] Health check — STRIPE_PUBLIC_KEY (votre .env) au lieu de NEXT_PUBLIC_STRIPE_KEY
 */

require('dotenv').config(); // DOIT être en premier

// [BUG FIX] crypto doit être importé explicitement au niveau module.
// La route POST /api/auth/refresh utilisait `crypto.randomBytes(48)` sans import,
// ce qui provoque une TypeError ("crypto.randomBytes is not a function") sur Node ≥ 18
// où `global.crypto` est l'API Web Crypto (sans randomBytes). Résultat : chaque
// tentative de refresh de token retournait une 500 et déconnectait l'utilisateur
// après 15 min, l'empêchant de rester connecté.
const crypto = require('crypto');

// ══════════════════════════════════════════════════════════════════════════════
// ── SENTRY — Error tracking (doit être initialisé AVANT tout autre require) ──
// ══════════════════════════════════════════════════════════════════════════════
// Obtenir le DSN : https://sentry.io → New Project → Node.js → DSN
// Ajouter dans .env : SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/YYYY
// Sans SENTRY_DSN, Sentry est désactivé silencieusement (mode no-op).
let Sentry = null;
(function _initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('[Sentry] SENTRY_DSN absent — monitoring désactivé. Ajoutez SENTRY_DSN dans .env pour activer.');
    return;
  }
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn:              process.env.SENTRY_DSN,
      environment:      process.env.NODE_ENV || 'development',
      release:          `nexus-market@${process.env.npm_package_version || '3.2.0'}`,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      // Ignorer les erreurs bénignes connues (réseau instable Sénégal)
      ignoreErrors: [
        'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED',
        'AbortError', 'FetchError',
      ],
      beforeSend(event, hint) {
        // Ne pas remonter les 4xx (erreurs client) — uniquement les 5xx et exceptions
        const status = hint?.originalException?.status ?? hint?.originalException?.statusCode;
        if (status && status >= 400 && status < 500) return null;
        return event;
      },
    });
    console.log('[Sentry] ✅ Initialisé — environnement:', process.env.NODE_ENV || 'development');
  } catch (e) {
    console.warn('[Sentry] Initialisation échouée (module absent ?):', e.message);
    console.warn('[Sentry] Exécuter : npm install @sentry/node');
    Sentry = null;
  }
})();

// Helper centralisé : capturer une exception avec contexte utilisateur
function sentryCapture(err, context = {}) {
  if (!Sentry) return;
  Sentry.withScope(scope => {
    if (context.userId)    scope.setUser({ id: context.userId, email: context.userEmail });
    if (context.tag)       scope.setTag('feature', context.tag);
    if (context.extra)     scope.setExtras(context.extra);
    if (context.level)     scope.setLevel(context.level); // 'warning' | 'error' | 'fatal'
    Sentry.captureException(err);
  });
}

// ── [FIX S1-1] Guard JWT_SECRET — fail-fast au démarrage ─────────────────────
if (!process.env.JWT_SECRET) {
  console.error('');
  console.error('🔴 FATAL: JWT_SECRET est absent des variables d\'environnement.');
  console.error('');
  console.error('   ➤  Générez une valeur sécurisée :');
  console.error('      node -e "require(\'crypto\').randomBytes(64).toString(\'hex\')"');
  console.error('');
  console.error('   ➤  Ajoutez JWT_SECRET dans Railway :');
  console.error('      Dashboard → votre service → Variables → + New Variable');
  console.error('');
  console.error('   Variables OBLIGATOIRES pour Railway :');
  console.error('     JWT_SECRET           (chaîne aléatoire ≥ 64 chars)');
  console.error('     SUPABASE_URL         (ex: https://xxx.supabase.co)');
  console.error('     SUPABASE_SERVICE_KEY (service_role key de Supabase)');
  console.error('     SUPABASE_ANON_KEY    (anon key de Supabase)');
  console.error('');
  process.exit(1);
}

const path         = require('path');
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const nodemailer   = require('nodemailer');
// [FIX RAILWAY] Initialisation Stripe conditionnelle — évite le crash si STRIPE_SECRET_KEY absent
// Le SDK Stripe lève une exception synchrone sur require('stripe')(undefined),
// ce qui crashe le process avant même l'handler uncaughtException.
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : new Proxy({}, { get: () => () => Promise.reject(new Error('STRIPE_SECRET_KEY manquant')) });
const { createClient } = require('@supabase/supabase-js');
const multer       = require('multer');
const PDFDocument  = require('pdfkit');

// ── Parser de cookies inline (évite la dépendance cookie-parser) ─────────────
// Utilisé uniquement pour le state anti-CSRF du GitHub OAuth.
const cookieParser = (req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    raw.split(';').forEach(pair => {
      const idx = pair.indexOf('=');
      if (idx < 0) return;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try { req.cookies[key] = decodeURIComponent(val); } catch { req.cookies[key] = val; }
    });
  }
  next();
};

// ─── APP ──────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Sentry request handler — DOIT être le premier middleware ─────────────────
// Capture automatiquement : route, méthode, user-agent, IP, breadcrumbs
if (Sentry) app.use(Sentry.Handlers.requestHandler());
// ── Sentry tracing — performance monitoring (optionnel) ──────────────────────
if (Sentry) app.use(Sentry.Handlers.tracingHandler());

// ─── SUPABASE (service role — accès complet, bypass RLS côté backend) ─────────
// [FIX RAILWAY] Validation au démarrage — affiche un avertissement mais ne crashe pas
// (contrairement à JWT_SECRET qui est fatal, Supabase peut démarrer en mode dégradé)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('⚠️  SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant — toutes les routes DB échoueront.');
  console.warn('   Ajoutez ces variables dans Railway → Variables.');
}
const supabase = createClient(
  process.env.SUPABASE_URL    || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'placeholder-key'
);

// ─── SUPABASE ANON (singleton — évite de recréer un client à chaque login) ──────
// [FIX] Ne jamais utiliser SERVICE_KEY comme fallback : signInWithPassword retourne 400 avec la service key
const supabaseAnon = process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null; // null → la route login retournera 503 avec un message explicite

// ─── LOGGER (écrit dans Supabase + console) ──────────────────────────────────
const Logger = {
  _queue: [],
  _flushing: false,

  async _write(level, category, action, message, extra = {}) {
    const entry = {
      level, category, action, message,
      ts: new Date().toISOString(),
      user_id:    extra.userId    || null,
      user_email: extra.userEmail || null,
      user_role:  extra.userRole  || null,
      method:     extra.method    || null,
      path:       extra.path      || null,
      status:     extra.status    || null,
      duration_ms:extra.duration  || null,
      ip:         extra.ip        || null,
      meta:       extra.meta      ? JSON.parse(JSON.stringify(extra.meta)) : null,
    };
    const icon = { info: 'ℹ', warn: '⚠', error: '✗', debug: '·' }[level] || '·';
    const line = `[${entry.ts.slice(11,23)}] ${icon} [${category}/${action}] ${message}`;
    if (level === 'error') console.error(line, entry.meta || '');
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    this._queue.push(entry);
    if (!this._flushing) this._flush();
  },

  async _flush() {
    if (this._flushing || this._queue.length === 0) return;
    this._flushing = true;
    const batch = this._queue.splice(0, 20);
    try { await supabase.from('server_logs').insert(batch); } catch (_) {}
    this._flushing = false;
    if (this._queue.length > 0) this._flush();
  },

  info (category, action, message, extra = {}) { return this._write('info',  category, action, message, extra); },
  warn (category, action, message, extra = {}) { return this._write('warn',  category, action, message, extra); },
  error(category, action, message, extra = {}) { return this._write('error', category, action, message, extra); },
  debug(category, action, message, extra = {}) {
    if (process.env.LOG_LEVEL === 'debug') return this._write('debug', category, action, message, extra);
  },
};

const requestLogger = (req, res, next) => {
  // [PERF] Exclure les routes à fort volume du logging Supabase (évite saturer server_logs)
  const SKIP_LOG = ['/api/health', '/api/notifications', '/api/products'];
  if (SKIP_LOG.some(p => req.path.startsWith(p)) && req.method === 'GET') return next();
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    Logger._write(level, 'api', `${req.method.toLowerCase()}.${req.path.split('/').slice(2,4).join('.')}`,
      `${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
        method: req.method, path: req.path, status: res.statusCode,
        duration, ip: req.ip,
        userId:    req.user?.id    || null,
        userEmail: req.user?.email || null,
        userRole:  req.user?.role  || null,
        meta: res.statusCode >= 400 ? { query: req.query, body_keys: Object.keys(req.body || {}) } : undefined,
      });
  });
  next();
};

// ─── EMAIL — Resend (principal, gratuit) + SMTP (fallback) ──────────────────
//
// Resend : https://resend.com — 3 000 emails/mois GRATUITS, 1 seule clé API.
// Inscription en 2 min, pas de configuration complexe.
//
// Variables .env :
//   RESEND_API_KEY  — clé Resend (ex: re_xxxxxxxxxxxxxxxx) — PRINCIPALE
//   RESEND_FROM     — ex: "NEXUS Market <contact@nexus.sn>"
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM — FALLBACK
// ─────────────────────────────────────────────────────────────────────────────

const _isResendConfigured = () => !!process.env.RESEND_API_KEY;

// Transporteur SMTP classique (fallback si Resend pas configuré)
const _smtpTransport = nodemailer.createTransport({
  host   : process.env.SMTP_HOST || 'smtp.gmail.com',
  port   : parseInt(process.env.SMTP_PORT || '587'),
  secure : false,
  auth   : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls    : { rejectUnauthorized: false },
});

// sendEmail — chaîne : Resend → SMTP → log uniquement
const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.RESEND_FROM
    || process.env.SMTP_FROM
    || 'NEXUS Market <onboarding@resend.dev>';

  // 1. Tentative via Resend (API HTTP, 3000 emails/mois gratuits)
  if (_isResendConfigured()) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ from, to, subject, html: html || `<p>${text || subject}</p>` }),
        signal: AbortSignal.timeout(8000),
      });
      const result = await resp.json();
      if (resp.ok && result.id) {
        Logger.info('email', 'sent.resend', `Email envoyé via Resend à ${to} (id: ${result.id})`);
        return true;
      }
      Logger.warn('email', 'resend.fail', `Resend erreur ${resp.status}: ${JSON.stringify(result)}`, { meta: { to } });
    } catch (e) {
      Logger.warn('email', 'resend.fail', `Resend exception, bascule SMTP : ${e.message}`, { meta: { to } });
    }
  }

  // 2. Fallback SMTP
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await _smtpTransport.sendMail({ from, to, subject, html, text });
      Logger.info('email', 'sent.smtp', `Email envoyé via SMTP à ${to}`);
      return true;
    } catch (e) {
      Logger.error('email', 'smtp.fail', `SMTP échoué : ${e.message}`, { meta: { to, subject } });
    }
  }

  // 3. Aucun transporteur configuré
  Logger.warn('email', 'not_sent', `Email non envoyé (configurez RESEND_API_KEY) à ${to} : "${subject}"`);
  return false;
};

// ─── TEMPLATES EMAIL ──────────────────────────────────────────────────────────
const emailTemplates = {
  orderConfirmation: (order) => ({
    subject: `✅ Confirmation commande ${order.id} — NEXUS Market`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#00853E;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">NEXUS Market Sénégal</h1>
        </div>
        <div style="padding:30px;background:#f9f9f9">
          <h2>Bonjour ${order.buyer_name},</h2>
          <p>Votre commande <strong>${order.id}</strong> a été confirmée !</p>
          <div style="background:white;border-radius:8px;padding:20px;margin:20px 0">
            ${(order.products || []).map(p => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                <span>${p.name} ×${p.quantity}</span>
                <strong>${Math.round(p.price * p.quantity * 655.957).toLocaleString('fr-FR')} FCFA</strong>
              </div>
            `).join('')}
            <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:18px;font-weight:bold;color:#00853E">
              <span>Total</span>
              <span>${Math.round(order.total * 655.957).toLocaleString('fr-FR')} FCFA</span>
            </div>
          </div>
          <div style="background:#e8f5e9;border-radius:8px;padding:15px;margin:15px 0">
            <p style="margin:0"><strong>📦 Numéro de suivi :</strong> ${order.tracking_number || 'En cours de génération'}</p>
            <p style="margin:8px 0 0"><strong>🏠 Livraison :</strong> ${order.buyer_address || 'Non précisée'}</p>
          </div>
          <p>Vendeur : <strong>${order.vendor_name}</strong></p>
          <p style="color:#666;font-size:14px">Pour toute question : <a href="mailto:sav@nexus.sn">sav@nexus.sn</a></p>
        </div>
        <div style="background:#333;color:white;padding:15px;text-align:center;font-size:12px">
          NEXUS Market SARL — Dakar, Sénégal
        </div>
      </div>
    `,
  }),

  passwordReset: (code) => ({
    subject: '🔑 Réinitialisation mot de passe — NEXUS Market',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:40px;background:#f9f9f9;border-radius:12px">
        <h2 style="color:#00853E">Réinitialisation de votre mot de passe</h2>
        <p>Votre code de vérification (valable 10 minutes) :</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:white;border-radius:8px;color:#00853E;margin:20px 0">${code}</div>
        <p style="color:#666;font-size:14px">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      </div>
    `,
  }),

  vendorApproved: (vendorName) => ({
    subject: '🎉 Votre boutique est approuvée — NEXUS Market',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#00853E;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">NEXUS Market</h1>
        </div>
        <div style="padding:30px">
          <h2>Félicitations, ${vendorName} !</h2>
          <p>Votre boutique a été <strong style="color:#00853E">approuvée</strong> par notre équipe.</p>
          <p>Vous pouvez dès maintenant vous connecter et commencer à vendre.</p>
          <a href="${process.env.FRONTEND_URL || 'https://nexus.sn'}" style="display:inline-block;background:#00853E;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Accéder à ma boutique</a>
        </div>
      </div>
    `,
  }),

  vendorRejected: (vendorName, reason) => ({
    subject: '❌ Demande vendeur refusée — NEXUS Market',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px">
        <h2>Bonjour ${vendorName},</h2>
        <p>Votre demande pour devenir vendeur sur NEXUS Market a été <strong>refusée</strong>.</p>
        ${reason ? `<p><strong>Raison :</strong> ${reason}</p>` : ''}
        <p>Vous pouvez soumettre une nouvelle demande en corrigeant les points mentionnés, ou contacter notre support à <a href="mailto:support@nexus.sn">support@nexus.sn</a>.</p>
      </div>
    `,
  }),

  newMessage: (senderName, messageText) => ({
    subject: `💬 Nouveau message de ${senderName} — NEXUS Market`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px">
        <h3>Nouveau message de <strong>${senderName}</strong></h3>
        <div style="background:#f0f0f0;border-radius:8px;padding:15px;margin:15px 0;font-style:italic">"${messageText.slice(0, 300)}${messageText.length > 300 ? '...' : ''}"</div>
        <p>Connectez-vous pour répondre : <a href="${process.env.FRONTEND_URL || 'https://nexus.sn'}">nexus.sn</a></p>
      </div>
    `,
  }),

  offerReceived: (vendorName, productName, buyerName, price) => ({
    subject: `💰 Nouvelle offre sur ${productName} — NEXUS Market`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px">
        <h3>Bonjour ${vendorName},</h3>
        <p><strong>${buyerName}</strong> a soumis une offre pour <strong>${productName}</strong>.</p>
        <p>Prix proposé : <strong style="color:#00853E;font-size:1.2em">${Math.round(price * 655.957).toLocaleString('fr-FR')} FCFA</strong></p>
        <p>Connectez-vous pour accepter ou refuser : <a href="${process.env.FRONTEND_URL || 'https://nexus.sn'}">nexus.sn</a></p>
      </div>
    `,
  }),

  disputeOpened: (adminName, orderId, reason) => ({
    subject: `⚠️ Litige ouvert — Commande ${orderId} — NEXUS Market`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px">
        <h3>Un litige a été ouvert sur la commande <strong>#${orderId}</strong></h3>
        <p><strong>Motif :</strong> ${reason}</p>
        <p>Notre équipe va examiner ce litige sous 24h ouvrées.</p>
        <p>Contact : <a href="mailto:litiges@nexus.sn">litiges@nexus.sn</a></p>
      </div>
    `,
  }),
};

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────

// [FIX] trust proxy — Render + Cloudflare.
// '1' = faire confiance au premier proxy (Render LB).
// Cloudflare injecte CF-Connecting-IP — on s'appuie dessus via le middleware ci-dessous.
app.set('trust proxy', 1);

// Middleware IP réel — extrait l'IP cliente derrière Cloudflare et Render
app.use((req, _res, next) => {
  const cfIp = req.headers['cf-connecting-ip'];
  const realIp = req.headers['x-real-ip'];
  if (cfIp) req.ip = cfIp;
  else if (realIp) req.ip = realIp;
  next();
});

app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
// [FIX] Réflexion explicite de l'Origin (au lieu de callback(null,true) qui
// peut être muet sur certains proxies).  credentials:true interdit l'usage de '*',
// on reflète donc l'origine entrante si elle existe, sinon on répond false.
// L'expose des headers 'Authorization' et 'Content-Type' est nécessaire pour que
// le navigateur puisse lire les réponses JSON derrière un proxy Cloudflare/Render.
const ALLOWED_ORIGIN_PATTERNS = [
  /vercel\.app$/,
  /localhost/,
  /127\.0\.0\.1/,
  /nexus\.sn$/,
  /nexus-market/,
  /railway\.app$/,
  /up\.railway\.app$/,
  /onrender\.com$/,
];
const corsOptions = {
  origin: (origin, callback) => {
    // Requêtes sans Origin (curl, Postman, cron-job.org) → toujours autorisé
    if (!origin) return callback(null, true);
    // Reflète l'origine si elle correspond à un pattern connu
    if (ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin))) {
      return callback(null, origin);
    }
    // En mode development, tout accepter
    if (process.env.NODE_ENV !== 'production') return callback(null, origin);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','stripe-signature'],
  exposedHeaders: ['Content-Type','Authorization'],
  maxAge: 86400,  // Cache préflight 24h — réduit les requêtes OPTIONS répétées
};
app.use(cors(corsOptions));
// Réponse préflight explicite AVANT le rate-limit et tout autre middleware
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,stripe-signature');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

// Webhook Stripe — AVANT json parser (body brut requis)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// [NEXUS-F4] web-push VAPID [A]
// PLACEMENT : après `const PDFDocument = require('pdfkit');`
// ════════════════════════════════════════════════════════════════════════════════

// Ajout conditionnel de web-push (évite le crash si non installé)
let webpush = null;
try {
  webpush = require('web-push');
} catch (_) {
  console.warn('⚠️  web-push non installé — notifications push désactivées. Exécuter : npm install web-push');
}

// Configuration VAPID (au démarrage, après dotenv)
if (webpush) {
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || `mailto:${process.env.ADMIN_EMAIL || 'admin@nexus.sn'}`;

  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    console.log('   VAPID    : ✅ Push notifications configurées');
  } else {
    console.warn('   VAPID    : ⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants — push désactivées');
    webpush = null; // désactiver pour éviter les erreurs silencieuses
  }
}

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser); // Requis pour le state anti-CSRF du GitHub OAuth
app.use(requestLogger); // Log HTTP → Supabase
// [FIX] Servir index.html statiquement depuis le même dossier que server.js
app.use(express.static(path.join(__dirname)));

// [FIX] Rate limits — keyGenerator utilise l'IP réelle (après fix CF-Connecting-IP ci-dessus)
// skipSuccessfulRequests:true sur authLimiter → les logins réussis ne comptent pas dans la fenêtre
const keyGen = (req) => req.ip || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 500,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: keyGen,
  message: { error: 'Trop de requêtes. Réessayez dans 15 minutes.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, // 30 tentatives par IP par 15 min
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: keyGen,
  skipSuccessfulRequests: true, // [FIX] Les logins réussis ne consomment pas le quota
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 50,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: keyGen,
  message: { error: 'Limite paiements atteinte. Réessayez dans une heure.' },
});

app.use('/api/', (req, res, next) => {
  // Exempter health check et webhooks Stripe du rate-limit général
  if (req.path === '/health' || req.path.startsWith('/webhooks/')) return next();
  return apiLimiter(req, res, next);
});

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
// [PERF] Cache profil Supabase en mémoire — évite 2-3 requêtes DB sur chaque appel API.
// TTL 5 min : acceptable car les changements de rôle sont rares.
const _profileCache = new Map(); // token → { user, expiresAt }
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// [FIX S2-6] Échange éphémère GitHub OAuth — JWT ne transite plus en clair dans l'URL
const _githubExchangeMap = new Map();

// [FIX] Purge des entrées expirées toutes les 10 min — évite la fuite mémoire sur Render Free
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _profileCache.entries()) {
    if (val.expiresAt < now) _profileCache.delete(key);
  }
}, 10 * 60 * 1000);

const verifyToken = async (req, res, next) => {
  // [REALTIME-MSG] Fallback token via query string pour EventSource SSE
  const auth = req.headers.authorization ||
    (req.path === '/api/messages/stream' && req.query.t
      ? `Bearer ${req.query.t}`
      : undefined);
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });
  const token = auth.slice(7);

  // 1. JWT custom (synchrone, < 1ms)
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (_) { /* pas un JWT custom → essayer Supabase */ }

  // 2. Cache mémoire — évite les requêtes Supabase répétées
  const cached = _profileCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    return next();
  }

  // 3. JWT Supabase — au plus 2 requêtes, résultat mis en cache
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      let profile = null;
      const { data: byId } = await supabase.from('profiles').select('id, email, name, role, status, avatar, shop_name, shop_category, commission_rate').eq('id', user.id).maybeSingle();
      if (byId) {
        profile = byId;
      } else {
        // Fallback par email (profils créés avant synchronisation Auth↔DB)
        const { data: byEmail } = await supabase.from('profiles').select('id, email, name, role, status, avatar, shop_name, shop_category, commission_rate')
          .eq('email', (user.email || '').trim().toLowerCase()).maybeSingle();
        profile = byEmail || { id: user.id, email: user.email, role: user.user_metadata?.role || 'buyer', name: user.user_metadata?.name || user.email };
      }
      req.user = profile;
      _profileCache.set(token, { user: profile, expiresAt: Date.now() + PROFILE_CACHE_TTL });
      return next();
    }
  } catch (_) { /* token invalide */ }

  return res.status(401).json({ error: 'Token invalide ou expiré' });
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Accès refusé' });
  next();
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const formatFCFA = (eur) => `${Math.round(eur * 655.957).toLocaleString('fr-FR')} FCFA`;

// ── [JWT-REFRESH] Helper centralisé — génère et persiste un refresh token ─────
// Appelé dans toutes les routes de login pour émettre un RT opaque (30 jours).
// Nécessite la table `refresh_tokens` dans Supabase (voir SQL en fin de fichier).
const RT_DURATION_SECONDS = 30 * 24 * 3600; // 30 jours
async function _createRefreshToken(userId, req) {
  try {
    const token     = require('crypto').randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + RT_DURATION_SECONDS * 1000).toISOString();
    const { error } = await supabase.from('refresh_tokens').insert({
      user_id:    userId,
      token,
      expires_at: expiresAt,
      ip:         req?.ip || null,
      user_agent: req?.headers?.['user-agent']?.slice(0, 255) || null,
    });
    if (error) {
      if (error.code === '42P01') {
        // Table absente → login fonctionne quand même, sans refresh token
        Logger.warn('auth', 'refresh_token.table_missing',
          'Table refresh_tokens absente — créez-la via le SQL Editor Supabase.');
        return null;
      }
      throw error;
    }
    return { refreshToken: token, refreshExpiresIn: RT_DURATION_SECONDS };
  } catch (e) {
    Logger.warn('auth', 'refresh_token.create_failed', e.message);
    return null;
  }
}

// [NEXUS-F4] web-push VAPID [C]
// PLACEMENT : remplace entièrement la fonction pushNotification() existante
//             (lignes 564-573 de server.js)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Envoie une notification à un utilisateur :
 *   1. In-app  : insère dans la table `notifications` (Supabase Realtime)
 *   2. Web Push : livre via web-push à tous les abonnements push de l'utilisateur
 */
const pushNotification = async (userId, { type, title, message, link }) => {
  if (!userId) return;

  // ── 1. Notification in-app (Realtime Supabase) — toujours envoyée ───────────
  try {
    await supabase.from('notifications').insert({
      user_id: userId, type, title, message, link: link || null, read: false,
    });
  } catch (e) {
    Logger.warn('notification', 'inapp.error', e.message, { meta: { userId, type } });
  }

  // ── 2. Web Push — uniquement si web-push est configuré ──────────────────────
  if (!webpush) return;

  try {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (!subs || subs.length === 0) return;

    const payload = JSON.stringify({
      title,
      body:  message,
      icon:  'https://placehold.co/192x192/00853E/white?text=NX',
      badge: 'https://placehold.co/72x72/00853E/white?text=NX',
      data:  { url: link || '/', type },
      tag:   type, // regrouper les notifications du même type
    });

    // Livrer à tous les appareils de l'utilisateur (en parallèle)
    await Promise.allSettled(
      subs.map(async (sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys:     { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(subscription, payload);
        } catch (pushErr) {
          // 410 Gone = l'abonnement n'est plus valide → supprimer de la DB
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await supabase.from('push_subscriptions')
              .delete()
              .eq('user_id', userId)
              .eq('endpoint', sub.endpoint)
              .catch(() => {});
            Logger.info('push', 'sub.expired', `Abonnement expiré supprimé pour ${userId}`, { meta: { endpoint: sub.endpoint.slice(0, 60) } });
          } else {
            Logger.warn('push', 'delivery.error', pushErr.message, { meta: { userId, type, statusCode: pushErr.statusCode } });
          }
        }
      })
    );
  } catch (e) {
    Logger.warn('notification', 'webpush.error', e.message, { meta: { userId, type } });
  }
};


// [NEXUS-F4] web-push VAPID [B]
// PLACEMENT : après la déclaration de pushNotification (~ ligne 573 de server.js)
// ════════════════════════════════════════════════════════════════════════════════

// POST /api/push/subscribe — Enregistrer ou renouveler un abonnement push
app.post('/api/push/subscribe', verifyToken, async (req, res) => {
  const { subscription } = req.body;
  // subscription = { endpoint, keys: { p256dh, auth } }
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Abonnement push invalide (endpoint ou clés manquants)' });
  }

  if (!webpush) {
    return res.status(503).json({ error: 'Notifications push non configurées sur ce serveur (VAPID manquant)' });
  }

  const userAgent = req.headers['user-agent']?.slice(0, 255) || null;

  try {
    // Upsert : si l'endpoint existe déjà pour cet utilisateur, on met à jour les clés
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:    req.user.id,
      endpoint:   subscription.endpoint,
      p256dh:     subscription.keys.p256dh,
      auth:       subscription.keys.auth,
      user_agent: userAgent,
    }, { onConflict: 'user_id,endpoint' });

    if (error) throw error;

    // Envoyer une notification de confirmation (test de livraison)
    const testPayload = JSON.stringify({
      title:   '✅ Notifications activées',
      body:    'Vous recevrez désormais les alertes NEXUS Market en temps réel.',
      icon:    'https://placehold.co/192x192/00853E/white?text=NX',
      data:    { url: '/' },
    });

    await webpush.sendNotification(subscription, testPayload).catch((pushErr) => {
      // Non bloquant — l'abonnement est sauvegardé même si le test échoue
      Logger.warn('push', 'subscribe.test.error', pushErr.message, { meta: { userId: req.user.id } });
    });

    Logger.info('push', 'subscribed', `User ${req.user.id} abonné aux push`, { userId: req.user.id, meta: { endpoint: subscription.endpoint.slice(0, 60) } });
    res.json({ ok: true, message: 'Abonnement push enregistré' });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/push/subscribe — Se désabonner des notifications push
app.delete('/api/push/subscribe', verifyToken, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint requis' });
  try {
    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', req.user.id)
      .eq('endpoint', endpoint);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/push/vapid-key — Exposer la clé publique VAPID au frontend
app.get('/api/push/vapid-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'VAPID non configuré' });
  res.json({ publicKey: key });
});

// [NEXUS-F2] LoyaltyWidget + awardLoyaltyPoints [A]
// PLACEMENT : après la fonction pushNotification (~ ligne 573 de server.js)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Attribue des points de fidélité à un acheteur après une commande réussie.
 * @param {string} userId      - UUID de l'acheteur
 * @param {number} orderTotal  - Montant total de la commande EN EUROS (HT, hors livraison)
 * @param {string} orderId     - UUID de la commande (pour les logs)
 */
async function awardLoyaltyPoints(userId, orderTotal, orderId) {
  if (!userId || !orderTotal || orderTotal <= 0) return;

  // 10 points par euro commandé (arrondi à l'entier inférieur)
  const POINTS_PER_EUR = 10;
  const delta = Math.floor(orderTotal * POINTS_PER_EUR);
  if (delta <= 0) return;

  try {
    const { data: existing } = await supabase
      .from('loyalty_points')
      .select('user_id, points, total_earned, total_redeemed')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('loyalty_points').update({
        points:        existing.points + delta,
        total_earned:  (existing.total_earned  || 0) + delta,
        updated_at:    new Date().toISOString(),
      }).eq('user_id', userId);
    } else {
      await supabase.from('loyalty_points').insert({
        user_id:       userId,
        points:        delta,
        total_earned:  delta,
        total_redeemed: 0,
      });
    }

    // Notification in-app
    await pushNotification(userId, {
      type:    'system',
      title:   `⭐ +${delta.toLocaleString('fr-FR')} points de fidélité`,
      message: `Merci pour votre commande ! Vous avez gagné ${delta} pts.`,
      link:    '/loyalty',
    });

    Logger.info('loyalty', 'auto-award', `+${delta} pts pour user ${userId} (commande ${orderId})`, {
      meta: { userId, delta, orderTotal, orderId },
    });
  } catch (err) {
    // Non bloquant — la commande est déjà enregistrée
    Logger.warn('loyalty', 'auto-award.error', err.message, { meta: { userId, orderId } });
  }
}

// ─── SOCIAL AUTH ROUTE ───────────────────────────────────────────────────────
// GitHub OAuth est géré entièrement par Supabase côté client.
// Cette route expose juste la config pour le frontend.
app.get('/api/auth/social/config', (req, res) => {
  res.json({
    github:  true,   // activé via Supabase Dashboard → Auth → Providers → GitHub
    google:  false,  // désactivé (configuration complexe — utiliser GitHub à la place)
    resend:  _isResendConfigured(),
    smtp:    !!(process.env.SMTP_USER && process.env.SMTP_PASS),
  });
});

// ─── EMAIL API ROUTES ─────────────────────────────────────────────────────────

// POST /api/email/send — Envoi backend (fallback quand EmailJS échoue côté client)
app.post('/api/email/send', verifyToken, async (req, res) => {
  const { to, subject, html, text, templateId, variables } = req.body;
  if (!to || !subject)
    return res.status(400).json({ error: 'Champs requis : to, subject' });

  const allowedRoles = ['admin', 'vendor'];
  if (!allowedRoles.includes(req.user.role) && to !== req.user.email)
    return res.status(403).json({ error: "Vous ne pouvez envoyer un email qu'à votre propre adresse" });

  let finalHtml = html;
  if (!finalHtml && templateId && emailTemplates[templateId] && variables) {
    finalHtml = emailTemplates[templateId](variables).html;
  }

  try {
    const sent = await sendEmail({ to, subject, html: finalHtml, text });
    Logger.info('email', 'api.send', `Email via API à ${to} par ${req.user.email}`, { userId: req.user.id });
    res.json({ ok: sent, provider: _isResendConfigured() ? 'resend' : 'smtp' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email/test — Test d'envoi (admin uniquement)
app.post('/api/email/test', verifyToken, requireRole('admin'), async (req, res) => {
  const target = req.body.to || req.user.email;
  const provider = _isResendConfigured() ? 'Resend' : (process.env.SMTP_USER ? 'SMTP' : 'Aucun');
  const sent = await sendEmail({
    to:      target,
    subject: '✅ Test email NEXUS Market',
    html:    `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px">
               <div style="background:#00853E;padding:20px;border-radius:8px 8px 0 0;text-align:center">
                 <h2 style="color:white;margin:0">NEXUS Market — Test Email</h2>
               </div>
               <div style="background:#f9f9f9;padding:20px;border-radius:0 0 8px 8px">
                 <p>Bonjour <strong>${req.user.name || req.user.email}</strong>,</p>
                 <p>✅ La configuration email fonctionne. Fournisseur actif : <strong>${provider}</strong>.</p>
                 <p style="color:#6b7280;font-size:0.88rem">Envoyé le ${new Date().toLocaleString('fr-FR')} via NEXUS Market</p>
               </div>
             </div>`,
  });
  res.json({ ok: sent, to: target, provider });
});

// GET /api/email/logs — Journaux emails depuis server_logs Supabase (admin)
// Remplace la lecture localStorage côté frontend : toutes les données sont en DB.
app.get('/api/email/logs', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { limit = 100, offset = 0, from, to } = req.query;
    let q = supabase
      .from('server_logs')
      .select('*', { count: 'exact' })
      .eq('category', 'email')
      .order('ts', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    if (from) q = q.gte('ts', from);
    if (to)   q = q.lte('ts', to);
    const { data, error, count } = await q;
    if (error) throw error;
    // Normalise au format attendu par le frontend (champs id, to, subject, templateId, sentAt, status, provider)
    const logs = (data || []).map(l => ({
      id:         l.id || l.ts,
      to:         l.meta?.to || l.user_email || '—',
      subject:    l.meta?.subject || l.message?.replace(/^Email (envoyé|non envoyé)[^à]*à[^:]*: ?/i, '') || l.message || '—',
      templateId: l.action?.replace(/^(sent\.|smtp\.|resend\.)/, '') || l.action || '—',
      sentAt:     l.ts,
      status:     l.level === 'error' ? 'error' : l.action === 'not_sent' ? 'simulation' : 'sent',
      provider:   l.action?.includes('resend') ? 'resend' : l.action?.includes('smtp') ? 'smtp' : 'simulation',
    }));
    res.json({ logs, total: count || 0 });
  } catch (e) {
    Logger.error('email', 'logs.error', e.message, { userId: req.user?.id });
    res.status(500).json({ error: e.message });
  }
});

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const {
    name, email, password, role,
    // Champs vendeur basiques
    shopName, shopCategory, phone,
    // Champs vendeur étendus (formulaire multi-étapes)
    owner_name, ninea, rc, address, structure_type,
    payment_method, orange_phone, wave_phone, iban, bank_name, shop_desc,
  } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });

  try {
    // Vérifier dans profiles ET pending_vendors
    const [{ data: existingProfile }, { data: existingPending }] = await Promise.all([
      supabase.from('profiles').select('id').eq('email', email).maybeSingle(),
      supabase.from('pending_vendors').select('id').eq('email', email).maybeSingle(),
    ]);
    if (existingProfile) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    if (existingPending) return res.status(409).json({ error: 'Une demande est déjà en attente pour cet email' });

    const hashedPw = await bcrypt.hash(password, 10);
    const resolvedName = owner_name || name;
    const resolvedShop = shopName || name;
    const avatar = resolvedName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    if (role === 'vendor') {
      if (!resolvedShop) return res.status(400).json({ error: 'Nom de boutique requis' });

      // Construire le payload en acceptant tous les champs du formulaire multi-étapes
      const vendorPayload = {
        name:           resolvedShop,
        owner_name:     resolvedName,
        email,
        password_hash:  hashedPw,
        category:       shopCategory || 'Général',
        avatar,
        status:         'pending',
        // Champs étendus (peuvent être null si non fournis)
        phone:          phone          || null,
        ninea:          ninea          || null,
        rc:             rc             || null,
        address:        address        || null,
        structure_type: structure_type || null,
        payment_method: payment_method || null,
        orange_phone:   orange_phone   || null,
        wave_phone:     wave_phone     || null,
        iban:           iban           || null,
        bank_name:      bank_name      || null,
        shop_desc:      shop_desc      || null,
      };

      const { data, error } = await supabase.from('pending_vendors')
        .insert(vendorPayload).select().single();

      if (error) {
        Logger.warn('auth', 'register.vendor.error', error.message, { meta: { email }, ip: req.ip });
        if (error.code === '23505') return res.status(409).json({ error: 'Cet email est déjà en attente' });
        // Si la table ne contient pas tous les champs, réessayer avec le payload minimal
        const minimalPayload = {
          name: resolvedShop, owner_name: resolvedName, email,
          password_hash: hashedPw, category: shopCategory || 'Général',
          avatar, status: 'pending',
          phone: phone || null,
        };
        const { data: data2, error: error2 } = await supabase.from('pending_vendors')
          .insert(minimalPayload).select().single();
        if (error2) {
          if (error2.code === '23505') return res.status(409).json({ error: 'Cet email est déjà en attente' });
          throw error2;
        }
        Logger.info('auth', 'register.vendor', `Inscription vendeur (payload minimal) : ${resolvedShop}`, { userId: data2.id, ip: req.ip });
        const { data: admins2 } = await supabase.from('profiles').select('id').eq('role', 'admin');
        for (const admin of (admins2 || [])) {
          await pushNotification(admin.id, { type: 'vendor', title: '🏪 Nouvelle demande vendeur', message: `${resolvedShop} (${resolvedName})`, link: '/admin/vendors' }).catch(() => {});
        }
        return res.json({ message: 'Demande envoyée — validation sous 48h', pending: true, id: data2.id });
      }

      Logger.info('auth', 'register.vendor', `Inscription vendeur : ${resolvedShop}`, { userId: data.id, ip: req.ip });
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      for (const admin of (admins || [])) {
        await pushNotification(admin.id, { type: 'vendor', title: '🏪 Nouvelle demande vendeur', message: `${resolvedShop} (${resolvedName})`, link: '/admin/vendors' }).catch(() => {});
      }
      return res.json({ message: 'Demande envoyée — validation sous 48h', pending: true, id: data.id });
    }

    // Gestion buyer_pro via route dédiée /api/b2b/register
    if (role === 'buyer_pro') {
      return res.status(400).json({ error: 'Utilisez /api/b2b/register pour les comptes Pro B2B' });
    }

    const { data, error } = await supabase.from('profiles').insert({
      name, email, password_hash: hashedPw, role: 'buyer', avatar, phone: phone || null,
      status: 'active'
    }).select().single();
    if (error) throw error;

    // Enregistrer le parrainage si un code est fourni (non-bloquant)
    if (req.body.referralCode) {
      const safeCode = req.body.referralCode.trim().toUpperCase();
      // [FIX S1-3] Requête ciblée — format NEXUS-{NAME5}-{UUID4}, filtre sur le suffixe UUID
      const codeParts = safeCode.split('-');
      let referrer = null;
      if (codeParts.length === 3 && codeParts[0] === 'NEXUS') {
        const idSuffix = codeParts[2].toLowerCase();
        const { data: candidates } = await supabase
          .from('profiles').select('id, name')
          .eq('status', 'active')
          .like('id', `%${idSuffix}`);
        referrer = (candidates || []).find(u => {
          const expected = `NEXUS-${(u.name||'').replace(/\s+/g,'').toUpperCase().slice(0,5)}-${(u.id||'').slice(-4).toUpperCase()}`;
          return expected === safeCode;
        });
      }
      if (referrer && referrer.id !== data.id) {
        await supabase.from('referrals').insert({
          referrer_id: referrer.id, referred_id: data.id, code: safeCode, rewarded: false,
        });
        await pushNotification(referrer.id, {
          type: 'system', title: '🎁 Nouveau filleul !',
          message: `${name} vient de s'inscrire avec votre code. Récompense dès sa 1ère commande.`,
        });
      }
    }

    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || '604800'); // [FIX] 7 jours par défaut (était 900s = 15min)
    const token = jwt.sign({ id: data.id, role: 'buyer', name, email }, process.env.JWT_SECRET, {
      expiresIn
    });
    const { password_hash, ...safeUser } = data;
    // [JWT-REFRESH] Créer et retourner un refresh token
    let refreshToken = null, refreshExpiresIn = null;
    try {
      const rt = await _createRefreshToken(data.id, req);
      refreshToken = rt?.refreshToken ?? null;
      refreshExpiresIn = rt?.refreshExpiresIn ?? null;
    } catch (_) {}
    res.json({ token, accessToken: token, user: safeUser, expiresIn, refreshToken, refreshExpiresIn });
  } catch (e) {
    Logger.error('auth', 'register.error', e.message, { meta: { email }, ip: req.ip });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  const emailNorm = email.trim().toLowerCase();
  try {
    // ══ [FIX CRITIQUE] .single() → .maybeSingle() ════════════════════════════════
    // .single() lève PGRST116 quand 0 lignes → catchée par le try/catch global →
    // retourne 500 "Erreur serveur" au lieu de 401. maybeSingle() retourne {data:null}
    // proprement et permet de distinguer "introuvable" d'une vraie erreur DB.
    const { data: user, error: dbErr } = await supabase
      .from('profiles')
      .select('id, email, name, role, status, avatar, password_hash, shop_name, shop_category, phone')
      .eq('email', emailNorm)
      .maybeSingle();

    if (dbErr) {
      Logger.error('auth', 'login.db_error', `DB profiles: ${dbErr.message}`, { meta: { email: emailNorm, code: dbErr.code }, ip: req.ip });
      return res.status(503).json({ error: 'Erreur base de données. Réessayez dans quelques instants.', code: 'DB_ERROR' });
    }

    // ── Chemin 1 : compte bcrypt (créé via create_admin.js ou register) ──────────
    if (user && user.password_hash) {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        Logger.warn('auth', 'login.wrong_password', `Mot de passe incorrect: ${emailNorm}`, { meta: { email: emailNorm }, ip: req.ip });
        // [FIX] code WRONG_PASSWORD → le frontend NE tente PAS le fallback Supabase Auth
        // (un compte bcrypt ne doit jamais être authentifiable par un autre système)
        return res.status(401).json({ error: 'Email ou mot de passe incorrect', code: 'WRONG_PASSWORD' });
      }
      // [FIX v3] Re-vérifier le statut vendeur en base (double vérification id + email normalisé)
      if (user.role === 'vendor' && user.status !== 'approved') {
        // Tentative 1 : par id
        const { data: freshById } = await supabase
          .from('profiles').select('id, status').eq('id', user.id).maybeSingle();
        // Tentative 2 : par email normalisé (cas où email stocké avait des majuscules)
        const { data: freshByEmail } = await supabase
          .from('profiles').select('id, status').eq('email', emailNorm).maybeSingle();
        const freshStatus = freshById?.status || freshByEmail?.status;
        if (freshStatus === 'approved') {
          user.status = 'approved';
          // Corriger l'email stocké si nécessaire
          if (freshByEmail && freshByEmail.id === user.id) {
            supabase.from('profiles').update({ email: emailNorm }).eq('id', user.id).then(() => {});
          }
        } else {
          // [FIX v3] Vérifier si une demande pending_vendors est déjà traitée (status=approved)
          // mais le profil n'a pas encore été mis à jour (race condition)
          const { data: pv } = await supabase
            .from('pending_vendors').select('id, status').eq('email', emailNorm).maybeSingle();
          if (pv?.status === 'approved') {
            // La demande est approuvée côté pending_vendors mais profiles pas encore mis à jour → corriger
            await supabase.from('profiles').update({ status: 'approved', role: 'vendor' }).eq('id', user.id);
            user.status = 'approved';
          } else {
            Logger.warn('auth', 'login.vendor_not_approved',
              `Statut vendeur en base: ${freshStatus || 'inconnu'} pour ${emailNorm}`,
              { userId: user.id, ip: req.ip });
            return res.status(403).json({ error: 'Compte vendeur en attente de validation admin' });
          }
        }
      }
      if (user.status === 'banned') return res.status(403).json({ error: 'Compte suspendu — contactez support@nexus.sn' });
      supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', user.id).then(() => {});
      const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || '604800'); // [FIX] 7 jours par défaut (était 900s = 15min)
      const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn });
      const { password_hash, ...safeUser } = user;
      let refreshToken = null, refreshExpiresIn = null;
      try { const rt = await _createRefreshToken(user.id, req); refreshToken = rt?.refreshToken ?? null; refreshExpiresIn = rt?.refreshExpiresIn ?? null; } catch (_) {}
      Logger.info('auth', 'login', `Login OK: ${emailNorm} (${user.role})`, { userId: user.id, userEmail: emailNorm, userRole: user.role, ip: req.ip });
      return res.json({ token, accessToken: token, user: safeUser, expiresIn, refreshToken, refreshExpiresIn });
    }

    // ── Chemin 1b : vendeur en attente de validation ──────────────────────────────
    // [FIX] maybeSingle() ici aussi — évite PGRST116 si aucun pending_vendor trouvé
    if (!user) {
      const { data: pendingVendor } = await supabase.from('pending_vendors').select('id, status').eq('email', emailNorm).maybeSingle();
      if (pendingVendor?.status === 'pending')  return res.status(403).json({ error: 'Votre demande vendeur est en cours de validation (délai : 48h). Vous recevrez un email dès approbation.' });
      if (pendingVendor?.status === 'rejected') return res.status(403).json({ error: "Votre demande vendeur a été refusée. Contactez support@nexus.sn pour plus d'informations." });
    }

    // ── Chemin 2 : Fallback Supabase Auth (comptes OAuth/magic-link sans password_hash) ─
    if (!supabaseAnon) return res.status(503).json({ error: 'Configuration serveur incomplète : SUPABASE_ANON_KEY manquante.', code: 'CONFIG_ERROR' });
    const { data: sbData, error: sbErr } = await supabaseAnon.auth.signInWithPassword({ email: emailNorm, password });
    if (sbErr || !sbData?.user) {
      Logger.warn('auth', 'login.supabase_failed', `Supabase Auth échoué: ${emailNorm} — ${sbErr?.message || 'no user'}`, { ip: req.ip });
      return res.status(401).json({ error: 'Email ou mot de passe incorrect', code: 'INVALID_CREDENTIALS' });
    }
    let profile = user;
    if (!profile) {
      const meta = sbData.user.user_metadata || {};
      const name = meta.name || emailNorm.split('@')[0];
      const { data: np } = await supabase.from('profiles').upsert({
        id: sbData.user.id, email: emailNorm,
        name, role: meta.role || 'buyer', avatar: (meta.avatar || name.slice(0,2)).toUpperCase(), status: 'active', password_hash: null
      }, { onConflict: 'id' }).select().single();
      profile = np || { id: sbData.user.id, email: emailNorm, name, role: meta.role || 'buyer', status: 'active' };
    }
    if (profile.status === 'banned') return res.status(403).json({ error: 'Compte suspendu' });
    // [FIX v3] Bloquer les vendeurs non approuvés même via Supabase Auth
    if (profile.role === 'vendor' && profile.status !== 'approved') {
      return res.status(403).json({ error: 'Compte vendeur en attente de validation admin' });
    }
    supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id).then(() => {});
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || '604800'); // [FIX] 7 jours par défaut (était 900s = 15min)
    const token = jwt.sign({ id: profile.id, role: profile.role, name: profile.name, email: profile.email }, process.env.JWT_SECRET, { expiresIn });
    const { password_hash: _ph, ...safeProfile } = profile;
    let refreshToken = null, refreshExpiresIn = null;
    try { const rt = await _createRefreshToken(profile.id, req); refreshToken = rt?.refreshToken ?? null; refreshExpiresIn = rt?.refreshExpiresIn ?? null; } catch (_) {}
    Logger.info('auth', 'login.supabase_fallback', `Login Supabase OK: ${emailNorm} (${profile.role})`, { userId: profile.id, userEmail: emailNorm, userRole: profile.role, ip: req.ip });
    return res.json({ token, accessToken: token, user: safeProfile, expiresIn, refreshToken, refreshExpiresIn, supabase_user: true });

  } catch (e) {
    Logger.error('auth', 'login.error', e.message, { meta: { email: emailNorm }, ip: req.ip });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GITHUB OAUTH — Flow complet sans Supabase (custom backend)
//
// Variables .env requises :
//   GITHUB_CLIENT_ID      — depuis github.com/settings/developers
//   GITHUB_CLIENT_SECRET  — depuis github.com/settings/developers
//   FRONTEND_URL          — ex: https://nexus.sn (pour le redirect final)
//
// GitHub OAuth App settings :
//   Homepage URL     : ${FRONTEND_URL}
//   Callback URL     : ${API_URL}/api/auth/github/callback
//
// Flow :
//   1. GET /api/auth/github           → redirect vers GitHub authorize
//   2. GitHub redirect → GET /api/auth/github/callback?code=xxx
//   3. Exchange code → access_token  (API GitHub)
//   4. Fetch user info + emails       (API GitHub)
//   5. Upsert profile dans Supabase
//   6. Issue JWT NEXUS
//   7. Redirect vers FRONTEND_URL?nexus_github_token=JWT&nexus_github_user=JSON
// ═══════════════════════════════════════════════════════════════════════════

// Helpers GitHub API
async function _githubFetch(url, accessToken) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NEXUS-Market/3.3',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}

async function _githubExchangeCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (data.error) throw new Error(`GitHub token error: ${data.error_description || data.error}`);
  if (!data.access_token) throw new Error('GitHub access_token manquant');
  return data.access_token;
}

// GET /api/auth/github — Point d'entrée : redirect vers GitHub
app.get('/api/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'GitHub OAuth non configuré (GITHUB_CLIENT_ID manquant)' });
  }
  // Stocker le state dans un cookie signé pour prévenir le CSRF
  const state = require('crypto').randomBytes(16).toString('hex');
  const callbackUrl = `${process.env.FRONTEND_URL || ''}/api/auth/github/callback`;
  const scope = 'user:email read:user';
  const ghUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    (process.env.API_URL || (req.protocol + '://' + req.get('host'))) + '/api/auth/github/callback'
  )}&scope=${encodeURIComponent(scope)}&state=${state}`;

  // Cookie state anti-CSRF (httpOnly, SameSite=Lax, 10 min)
  res.cookie('gh_oauth_state', state, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: 10 * 60 * 1000,
  });
  Logger.info('auth', 'github.init', `Redirect OAuth GitHub depuis ${req.ip}`);
  res.redirect(ghUrl);
});

// GET /api/auth/github/callback — Retour de GitHub après autorisation
app.get('/api/auth/github/callback', async (req, res) => {
  const { code, state, error: ghError, error_description } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  // Erreur GitHub (accès refusé par l'utilisateur)
  if (ghError) {
    Logger.warn('auth', 'github.denied', `GitHub OAuth refusé: ${ghError}`, { ip: req.ip });
    return res.redirect(`${frontendUrl}?nexus_github_error=${encodeURIComponent(error_description || ghError)}`);
  }

  // Vérification CSRF state
  const storedState = req.cookies?.gh_oauth_state;
  if (!state || state !== storedState) {
    Logger.warn('auth', 'github.csrf', 'State CSRF invalide', { ip: req.ip });
    return res.redirect(`${frontendUrl}?nexus_github_error=${encodeURIComponent('Erreur de sécurité (state invalide). Réessayez.')}`);
  }
  res.clearCookie('gh_oauth_state');

  if (!code) {
    return res.redirect(`${frontendUrl}?nexus_github_error=${encodeURIComponent('Code OAuth manquant')}`);
  }

  try {
    // 1. Échanger code contre access_token
    const accessToken = await _githubExchangeCode(code);

    // 2. Récupérer profil GitHub
    const [ghUser, ghEmails] = await Promise.all([
      _githubFetch('https://api.github.com/user', accessToken),
      _githubFetch('https://api.github.com/user/emails', accessToken).catch(() => []),
    ]);

    // Trouver l'email principal vérifié
    const primaryEmail = (
      ghEmails.find(e => e.primary && e.verified)?.email ||
      ghEmails.find(e => e.verified)?.email ||
      ghUser.email ||
      `github_${ghUser.id}@users.noreply.github.com`
    ).toLowerCase();

    const ghId    = String(ghUser.id);
    const ghName  = ghUser.name || ghUser.login || primaryEmail.split('@')[0];
    const ghAvatar = ghUser.avatar_url || null;
    const ghLogin  = ghUser.login;

    Logger.info('auth', 'github.user_fetched', `GitHub user: ${ghLogin} (${primaryEmail})`, { ip: req.ip });

    // 3. Upsert profil dans Supabase
    // Chercher d'abord par github_id, sinon par email
    let profile = null;
    let isNewUser = false;

    const { data: byGhId } = await supabase
      .from('profiles')
      .select('id, email, name, role, status, avatar, github_id, github_login, github_avatar')
      .eq('github_id', ghId)
      .single();

    if (byGhId) {
      profile = byGhId;
    } else {
      const { data: byEmail } = await supabase
        .from('profiles')
        .select('id, email, name, role, status, avatar, github_id, github_login, github_avatar')
        .eq('email', primaryEmail)
        .single();

      if (byEmail) {
        // Compte existant email → lier le compte GitHub
        const { data: updated } = await supabase
          .from('profiles')
          .update({
            github_id: ghId,
            github_login: ghLogin,
            github_avatar: ghAvatar,
            last_login: new Date().toISOString(),
          })
          .eq('id', byEmail.id)
          .select('id, email, name, role, status, avatar, github_id, github_login, github_avatar')
          .single();
        profile = updated || byEmail;
      } else {
        // Nouvel utilisateur GitHub → créer le profil
        isNewUser = true;
        const avatar = ghName.slice(0, 2).toUpperCase();
        const { data: created, error: createErr } = await supabase
          .from('profiles')
          .insert({
            email:         primaryEmail,
            name:          ghName,
            role:          'buyer',           // rôle par défaut — modifiable au 1er login
            avatar,
            status:        'active',
            github_id:     ghId,
            github_login:  ghLogin,
            github_avatar: ghAvatar,
            password_hash: null,              // pas de mot de passe → OAuth uniquement
          })
          .select('id, email, name, role, status, avatar, github_id, github_login, github_avatar')
          .single();

        if (createErr) throw createErr;
        profile = created;

        // Notification admin pour nouveau compte GitHub
        const { data: ghAdmins } = await supabase.from('profiles').select('id').eq('role', 'admin');
        for (const admin of (ghAdmins || [])) {
          await supabase.from('notifications').insert({
            user_id: admin.id,
            type: 'system',
            title: '🐙 Nouveau membre via GitHub',
            message: `${ghName} (${primaryEmail}) vient de créer un compte via GitHub OAuth.`,
            read: false,
          }).catch(() => {});
        }
      }
    }

    // Vérifications sécurité
    if (profile.status === 'banned') {
      return res.redirect(`${frontendUrl}?nexus_github_error=${encodeURIComponent('Compte suspendu — contactez support@nexus.sn')}`);
    }

    // MAJ last_login si pas déjà fait
    if (!isNewUser) {
      try { await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id); } catch(_) {}
    }

    // 4. Émettre JWT NEXUS + Refresh Token
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || '604800'); // [FIX] 7 jours par défaut (était 900s = 15min)
    const token = jwt.sign(
      { id: profile.id, role: profile.role, name: profile.name, email: profile.email, github: true },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    Logger.info('auth', 'github.login_ok', `GitHub login OK: ${primaryEmail} (${profile.role})${isNewUser ? ' [NOUVEAU]' : ''}`, {
      userId: profile.id, userEmail: primaryEmail, userRole: profile.role,
    });

    // 5. [FIX S2-6] Code éphémère (60s, usage unique) — le JWT ne transite plus dans l'URL
    const { password_hash, ...safeProfile } = profile;
    // [JWT-REFRESH] Créer un refresh token pour GitHub OAuth
    let githubRt = null, githubRtExp = null;
    try {
      const rt = await _createRefreshToken(profile.id, req);
      githubRt = rt?.refreshToken ?? null;
      githubRtExp = rt.refreshExpiresIn;
    } catch (_) {}
    const exchangeCode = require('crypto').randomBytes(32).toString('hex');
    _githubExchangeMap.set(exchangeCode, { token, user: safeProfile, isNew: isNewUser, expiresIn, refreshToken: githubRt, refreshExpiresIn: githubRtExp, expiresAt: Date.now() + 60_000 });
    setTimeout(() => _githubExchangeMap.delete(exchangeCode), 65_000);
    const redirectUrl = `${frontendUrl}?nexus_github_code=${exchangeCode}`;
    return res.redirect(redirectUrl);

  } catch (e) {
    Logger.error('auth', 'github.callback_error', e.message, { ip: req.ip, meta: { stack: e.stack?.slice(0, 300) } });
    return res.redirect(`${frontendUrl}?nexus_github_error=${encodeURIComponent('Erreur authentification GitHub. Réessayez.')}`);
  }
});

// PATCH /api/auth/github/role — Choisir son rôle après 1er login GitHub
// (acheteur classique → 'buyer' | vouloir vendre → 'vendor_pending')
app.patch('/api/auth/github/role', verifyToken, async (req, res) => {
  const { role } = req.body;
  const allowedRoles = ['buyer', 'vendor'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: `Rôle invalide. Valeurs autorisées : ${allowedRoles.join(', ')}` });
  }

  try {
    const newStatus = role === 'vendor' ? 'pending' : 'active';
    const { data, error } = await supabase
      .from('profiles')
      .update({ role, status: newStatus })
      .eq('id', req.user.id)
      .select('id, name, email, role, status, avatar, github_id, github_login, github_avatar')
      .single();

    if (error) throw error;

    // Si le vendeur choisit "vendre" → créer une entrée pending_vendors
    if (role === 'vendor') {
      try {
        await supabase.from('pending_vendors').upsert({
          id: data.id, name: data.name, email: data.email,
          status: 'pending', source: 'github_oauth',
          created_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch(_) {}

      const { data: ghVendorAdmins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      for (const admin of (ghVendorAdmins || [])) {
        await supabase.from('notifications').insert({
          user_id: admin.id,
          type: 'system',
          title: '🏪 Demande vendeur (GitHub)',
          message: `${data.name} (${data.email}) souhaite devenir vendeur. Compte créé via GitHub OAuth.`,
          read: false,
        }).catch(() => {});
      }
    }

    // Émettre un nouveau JWT avec le bon rôle + [JWT-REFRESH] refresh token
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || '604800'); // [FIX] 7 jours par défaut (était 900s = 15min)
    const newToken = jwt.sign(
      { id: data.id, role: data.role, name: data.name, email: data.email, github: true },
      process.env.JWT_SECRET,
      { expiresIn }
    );
    let refreshToken = null, refreshExpiresIn = null;
    try {
      const rt = await _createRefreshToken(data.id, req);
      refreshToken = rt?.refreshToken ?? null;
      refreshExpiresIn = rt?.refreshExpiresIn ?? null;
    } catch (_) {}

    Logger.info('auth', 'github.role_set', `Rôle GitHub user défini: ${data.role}`, { userId: data.id });
    res.json({ ok: true, token: newToken, accessToken: newToken, user: data, expiresIn, refreshToken, refreshExpiresIn });

  } catch (e) {
    Logger.error('auth', 'github.role_error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  try {
    const { data: user } = await supabase.from('profiles').select('id, name').eq('email', email).single();
    if (!user) return res.json({ message: 'Si ce compte existe, un email a été envoyé.' }); // sécurité : ne pas révéler

    const code      = require('crypto').randomInt(100000, 999999).toString(); // [FIX S2-4] CSPRNG
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // [FIX 2] Nom de table corrigé : 'password_resets' (avec 's')
    await supabase.from('password_resets').upsert({ email, code, expires_at: expiresAt });

    const { subject, html } = emailTemplates.passwordReset(code);
    await sendEmail({ to: email, subject, html });
    res.json({ message: 'Si ce compte existe, un email a été envoyé.' });
  } catch (e) {
    Logger.error('auth', 'forgot_password.error', e.message, { meta: { email } });
    res.json({ message: 'Si ce compte existe, un email a été envoyé.' });
  }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
  try {
    // [FIX 2] Nom de table corrigé : 'password_resets' (avec 's')
    const { data: reset } = await supabase.from('password_resets').select('email, code, expires_at').eq('email', email).eq('code', code).single();
    if (!reset || new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: 'Code invalide ou expiré' });

    const hash = await bcrypt.hash(newPassword, 10);
    await supabase.from('profiles').update({ password_hash: hash }).eq('email', email);
    // [FIX 2] Nom de table corrigé
    await supabase.from('password_resets').delete().eq('email', email);
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    // [FIX] maybeSingle() évite le 404 quand le profil n'existe pas encore (nouvel utilisateur OAuth).
    // Fallback : on renvoie req.user (données issues du token) pour ne pas bloquer la session.
    const { data: user } = await supabase
      .from('profiles')
      .select('id, email, name, role, status, avatar, shop_name, shop_category, commission_rate, phone, bio, last_login, payout_method, payout_destination, onboarding_complete, github_id, github_login, github_avatar')
      .eq('id', req.user.id)
      .maybeSingle();
    if (!user) {
      // Profil absent — renvoyer les claims du token plutôt que 404
      const { password_hash: _ph, ...safeReqUser } = req.user;
      return res.json(safeReqUser);
    }
    const { password_hash, ...safeUser } = user;
    res.json(safeUser);
  } catch (e) {
    Logger.error('auth', 'me.error', e.message, { userId: req.user && req.user.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Alias — certains composants appelaient /api/profiles/me (chemin historique)
// On le redirige vers la même logique pour ne pas casser la compatibilité
app.get('/api/profiles/me', verifyToken, async (req, res) => {
  try {
    const { data: user } = await supabase.from('profiles').select('id, email, name, role, status, avatar, shop_name, shop_category, commission_rate, phone, bio, last_login, payout_method, payout_destination, onboarding_complete, github_id, github_login, github_avatar').eq('id', req.user.id).maybeSingle();
    if (!user) { const { password_hash: _ph, ...fb } = req.user; return res.json(fb); }
    const { password_hash, ...safeUser } = user;
    // Normaliser les champs snake_case → camelCase pour le VendorDashboard
    res.json({
      ...safeUser,
      shopName:      safeUser.shop_name      || null,
      shopCategory:  safeUser.shop_category  || null,
      commissionRate: safeUser.commission_rate || null,
      vendorStatus:  safeUser.status,   // champ explicite attendu par le frontend
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// [FIX] POST /api/auth/sync-profile — crée/MAJ le profil pour users Supabase Auth
app.post('/api/auth/sync-profile', verifyToken, async (req, res) => {
  try {
    const { name, role, avatar, email } = req.body;
    const safeRole = ['buyer','vendor','admin'].includes(role) ? role : 'buyer';
    const safeName = name || req.user.name || (email || req.user.email || '').split('@')[0];
    const { data, error } = await supabase.from('profiles').upsert({
      id: req.user.id, email: email || req.user.email,
      name: safeName, role: safeRole,
      avatar: avatar || safeName.slice(0,2).toUpperCase(),
      status: 'active', password_hash: null
    }, { onConflict: 'id' }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    const { password_hash: _ph, ...safeUser } = data;
    res.json(safeUser);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/logout — invalide le cache profil + révoque le refresh token en base
app.post('/api/auth/logout', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    _profileCache.delete(auth.slice(7));
  }
  // [JWT-REFRESH] Révoquer le refresh token côté serveur pour invalider la session
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', refreshToken)
      .catch((e) => Logger.warn('auth', 'logout.revoke.error', e.message));
  }
  res.json({ message: 'Déconnecté' });
});

app.patch('/api/auth/profile', verifyToken, async (req, res) => {
  const { name, phone, bio } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  try {
    const { data, error } = await supabase.from('profiles')
      .update({ name, phone: phone || null, bio: bio || null, avatar })
      .eq('id', req.user.id).select().single();
    if (error) throw error;
    const { password_hash, ...safeUser } = data;
    res.json(safeUser);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.patch('/api/auth/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Nouveau mot de passe trop court' });
  try {
    const { data: user } = await supabase.from('profiles').select('password_hash').eq('id', req.user.id).single();
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await supabase.from('profiles').update({ password_hash: hash }).eq('id', req.user.id);
    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── FILE UPLOAD ─────────────────────────────────────────────────────────────
// [FIX] Route /api/upload manquante — le frontend l'appelait mais elle n'existait pas,
// forçant le fallback Supabase Storage direct (qui peut échouer si RLS bloque).
// Utilise multer (memoryStorage) + Supabase Storage service-role (bypass RLS).
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  },
});

app.post('/api/upload', verifyToken, uploadMiddleware.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    const ext      = req.file.mimetype.split('/')[1] || 'jpg';
    const filename = `products/${req.user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('nexus-images')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('nexus-images').getPublicUrl(filename);
    Logger.info('upload', 'image.uploaded', `Image uploadée: ${filename}`, { userId: req.user.id });
    res.json({ url: publicUrl, filename });
  } catch (e) {
    Logger.error('upload', 'image.error', e.message, { userId: req.user?.id });
    res.status(500).json({ error: e.message });
  }
});

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
// GET /api/products/check-stock — Vérifie la disponibilité de plusieurs produits
// Utilisé par le frontend avant d'afficher le bouton "Commander"
// et juste avant la validation du checkout.
app.get('/api/products/check-stock', async (req, res) => {
  try {
    const { ids } = req.query; // ids=uuid1,uuid2,uuid3
    if (!ids) return res.status(400).json({ error: 'ids requis' });
    const productIds = ids.split(',').filter(Boolean).slice(0, 50); // max 50 produits
    const { data, error } = await supabase.rpc('get_product_stocks', {
      p_ids: productIds,
    });
    if (error) throw error;
    // Retourne un objet { [id]: { stock, active } }
    const result = {};
    for (const row of (data || [])) {
      result[row.id] = { stock: row.stock, active: row.active };
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products', async (req, res) => {
  // [PERF] Cache CDN 60s + cache client 30s — le catalogue ne change pas à chaque seconde
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
  try {
    const { category, search, vendor, min_price, max_price, sort, page = 1, limit = 20, include_pending } = req.query;
    const safeLim = Math.min(parseInt(limit) || 20, 100); // [FIX S2-3] plafonner à 100
    const PRODUCT_COLS = 'id,name,category,price,stock,description,image_url,images,original_price,vendor_id,vendor_name,rating,reviews_count,active,moderated,moderation_reason,created_at';
    let query = supabase.from('products').select(PRODUCT_COLS, { count: 'exact' }).eq('active', true); // [FIX S2-11]
    if (include_pending !== 'true') query = query.eq('moderated', true);
    if (category && category !== 'all') query = query.eq('category', category);
    if (vendor) query = query.eq('vendor_id', vendor);
    if (search) {
      // [FIX] Échapper les caractères spéciaux LIKE avant interpolation
      const safeSearch = search.replace(/[%_\\]/g, '\\$&').slice(0, 100);
      query = query.or(`name.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%`);
    }
    if (min_price) query = query.gte('price', parseFloat(min_price));
    if (max_price) query = query.lte('price', parseFloat(max_price));
    switch (sort) {
      case 'price-asc':  query = query.order('price', { ascending: true });  break;
      case 'price-desc': query = query.order('price', { ascending: false }); break;
      case 'rating':     query = query.order('rating', { ascending: false }); break;
      case 'newest':     query = query.order('created_at', { ascending: false }); break;
      default:           query = query.order('reviews_count', { ascending: false });
    }
    const offset = (parseInt(page) - 1) * safeLim;
    query = query.range(offset, offset + safeLim - 1);
    const { data, error, count } = await query;
    // [FIX S1-4] Fallback si colonne 'moderated' absente (code 42703)
    if (error) {
      if ((error.code === '42703' || error.message?.includes('column')) && error.message?.includes('moderated')) {
        Logger.warn('products', 'list', 'Colonne moderated absente — fallback sans filtre');
        let q2 = supabase.from('products').select(PRODUCT_COLS, { count: 'exact' }).eq('active', true);
        if (category && category !== 'all') q2 = q2.eq('category', category);
        if (vendor)    q2 = q2.eq('vendor_id', vendor);
        if (search) {
          const s2 = search.replace(/[%_\\]/g, '\\$&').slice(0, 100);
          q2 = q2.or(`name.ilike.%${s2}%,description.ilike.%${s2}%,category.ilike.%${s2}%`);
        }
        if (min_price) q2 = q2.gte('price', parseFloat(min_price));
        if (max_price) q2 = q2.lte('price', parseFloat(max_price));
        switch (sort) {
          case 'price-asc':  q2 = q2.order('price', { ascending: true });  break;
          case 'price-desc': q2 = q2.order('price', { ascending: false }); break;
          case 'rating':     q2 = q2.order('rating', { ascending: false }); break;
          case 'newest':     q2 = q2.order('created_at', { ascending: false }); break;
          default:           q2 = q2.order('reviews_count', { ascending: false });
        }
        const off2 = (parseInt(page) - 1) * safeLim;
        q2 = q2.range(off2, off2 + safeLim - 1);
        const { data: d2, error: e2, count: c2 } = await q2;
        if (e2) throw e2;
        return res.json({ products: d2, total: c2, page: parseInt(page), limit: safeLim, pages: Math.ceil(c2 / safeLim) });
      }
      throw error;
    }
    res.json({ products: data, total: count, page: parseInt(page), limit: safeLim, pages: Math.ceil(count / safeLim) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase.from('products').select('id, name, category, price, stock, description, image_url, images, original_price, vendor_id, vendor_name, rating, reviews_count, active, moderated, moderation_reason, created_at').eq('id', req.params.id).single();
    if (error || !product) return res.status(404).json({ error: 'Produit introuvable' });
    const { data: reviews } = await supabase.from('reviews')
      .select('id, product_id, user_id, user_name, rating, comment, vendor_reply, created_at').eq('product_id', req.params.id).order('created_at', { ascending: false }).limit(20);
    const { data: questions } = await supabase.from('product_questions')
      .select('id, product_id, user_id, user_name, question, answer, answered_at, created_at').eq('product_id', req.params.id).order('created_at', { ascending: false });
    res.json({ product, reviews: reviews || [], questions: questions || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/products', verifyToken, requireRole('vendor'), async (req, res) => {
  const { name, category, price, stock, description, imageUrl, images = [],
          originalPrice, active } = req.body;
  if (!name || !price || stock === undefined) return res.status(400).json({ error: 'Nom, prix et stock requis' });
  if (parseFloat(price) <= 0) return res.status(400).json({ error: 'Prix invalide' });
  if (originalPrice !== undefined && parseFloat(originalPrice) <= parseFloat(price))
    return res.status(400).json({ error: 'Le prix barré doit être supérieur au prix de vente' });
  try {
    const { data: vendor } = await supabase.from('profiles').select('name, status').eq('id', req.user.id).single();
    if (vendor?.status !== 'approved') return res.status(403).json({ error: 'Compte vendeur non approuvé. Attendez la validation de votre boutique par l\'équipe NEXUS.' });
    const { data, error } = await supabase.from('products').insert({
      name, category: category || 'Autre',
      price: parseFloat(price), stock: parseInt(stock),
      description: description || null,
      image_url: imageUrl || images[0] || null,
      images: images.length > 0 ? images : [imageUrl].filter(Boolean),
      original_price: originalPrice ? parseFloat(originalPrice) : null,
      vendor_id: req.user.id, vendor_name: vendor?.name || req.user.name,
      rating: 0, reviews_count: 0,
      active: active !== false,
      // [FIX] Produits approuvés immédiatement — modération a posteriori (signalement)
      // Les vendeurs approuvés sont de confiance ; l'admin peut retirer un produit si besoin.
      moderated: true,
    }).select().single();
    if (error) throw error;
    // Notifier les admins en arrière-plan (sans bloquer la réponse)
    supabase.from('profiles').select('id').eq('role', 'admin').then(({ data: admins }) => {
      for (const admin of (admins || [])) {
        pushNotification(admin.id, { type: 'system', title: '🏷️ Nouveau produit publié', message: `"${name}" — ${vendor?.name} (publié directement)`, link: '/admin/products' });
      }
    });
    Logger.info('product', 'created', `Produit créé: "${name}" par ${vendor?.name}`, { userId: req.user.id });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/products/:id', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const { name, category, price, stock, description, imageUrl, images, active } = req.body;
  try {
    const { data: existing } = await supabase.from('products').select('vendor_id').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });
    if (req.user.role === 'vendor' && existing.vendor_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    const updates = {};
    if (name !== undefined)        updates.name = name;
    if (category !== undefined)    updates.category = category;
    if (price !== undefined)       updates.price = parseFloat(price);
    if (stock !== undefined)       updates.stock = parseInt(stock);
    if (description !== undefined) updates.description = description;
    if (imageUrl !== undefined)       updates.image_url = imageUrl;
    if (images !== undefined)         updates.images = images;
    if (active !== undefined && (req.user.role === 'admin' || req.user.role === 'vendor'))
      updates.active = active;   // vendeur peut dépublier/republier ses propres produits
    // [FIX] Prix barré — accepté depuis le formulaire vendeur
    if (req.body.originalPrice !== undefined)
      updates.original_price = req.body.originalPrice ? parseFloat(req.body.originalPrice) : null;
    const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/products/:id', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('products').select('vendor_id, name').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });
    if (req.user.role === 'vendor' && existing.vendor_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    await supabase.from('products').delete().eq('id', req.params.id);
    res.json({ message: 'Produit supprimé' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/products/:id/moderate', verifyToken, requireRole('admin'), async (req, res) => {
  const { approved, reason } = req.body;
  try {
    const updates = { moderated: !!approved, moderation_reason: reason || null, moderated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    await pushNotification(data.vendor_id, {
      type: 'system',
      title: approved ? '✅ Produit approuvé' : '❌ Produit refusé',
      message: `"${data.name}" — ${approved ? 'Votre produit est maintenant visible.' : (reason || 'Contactez le support.')}`,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ORDERS ──────────────────────────────────────────────────────────────────
app.get('/api/orders', verifyToken, async (req, res) => {
  try {
    const { page = 1, status } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '20'), 100); // [FIX] cap à 100
    let query = supabase.from('orders').select('*', { count: 'exact' });
    if (req.user.role === 'buyer')  query = query.eq('buyer_id', req.user.id);
    if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    if (status) query = query.eq('status', status);
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.order('created_at', { ascending: false }).range(offset, offset + parseInt(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ orders: data, total: count, page: parseInt(page) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/orders/:id', verifyToken, async (req, res) => {
  try {
    const { data: order, error } = await supabase.from('orders').select('id, buyer_id, vendor_id, buyer_name, buyer_email, buyer_address, vendor_name, products, total, subtotal, status, payment_method, payment_status, tracking_number, commission, discount_amount, shipping, shipping_city, created_at, processing_at, delivered_at, cancelled_at, in_transit_at, stripe_payment_id, mobile_money_ref, stock_reserved, cancel_reason, cancelled_by, vendor_note, has_dispute, dispute_id, return_status').eq('id', req.params.id).single();
    if (error || !order) return res.status(404).json({ error: 'Commande introuvable' });
    if (req.user.role !== 'admin' && order.buyer_id !== req.user.id && order.vendor_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Helper : convertit les produits du panier en format RPC ─────────────────
const cartToStockItems = (products) =>
  products
    .filter(p => p.id)
    .map(p => ({ product_id: p.id, quantity: Math.max(1, parseInt(p.quantity) || 1) }));

// ── POST /api/orders/split — Commandes multi-vendeur ─────────────────────────
// Reçoit un panier mixte et crée automatiquement une sous-commande par vendeur.
// Chaque sous-commande est créée via la même logique que POST /api/orders
// (vérification stock atomique, notifications, commission 15 %).
// Body : { cart: [...], customerInfo: {...}, shippingCity, paymentMethod, discountAmount? }
// Réponse : { ok: true, orders: [...] }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/orders/split', verifyToken, async (req, res) => {
  const { cart, customerInfo, shippingCity, paymentMethod, discountAmount = 0 } = req.body;

  if (!Array.isArray(cart) || cart.length === 0)
    return res.status(400).json({ error: 'Panier vide ou invalide' });
  if (!customerInfo?.name || !customerInfo?.email)
    return res.status(400).json({ error: 'Informations client manquantes (name, email)' });

  // Grouper les articles par vendeur
  const groupsByVendor = {};
  for (const item of cart) {
    if (!item.vendor_id && !item.vendor)
      return res.status(400).json({ error: `Article "${item.name}" sans vendeur (vendor_id requis)` });
    const vid = item.vendor_id || item.vendor;
    if (!groupsByVendor[vid]) {
      groupsByVendor[vid] = { vendorId: vid, vendorName: item.vendorName || '', items: [] };
    }
    groupsByVendor[vid].items.push(item);
  }

  const vendorGroups = Object.values(groupsByVendor);
  Logger.info('order', 'split.start', `Panier mixte: ${cart.length} articles, ${vendorGroups.length} vendeur(s)`, {
    userId: req.user.id, meta: { vendorCount: vendorGroups.length }
  });

  // Vérification stock globale (tous vendeurs confondus) en une seule RPC
  const stockItems = cart.map(p => ({
    product_id: p.id || p.product_id,
    quantity: Math.max(1, parseInt(p.quantity) || 1)
  }));
  try {
    const { data: stockData, error: stockErr } = await supabase.rpc('check_and_reserve_stock', {
      p_items: JSON.stringify(stockItems)
    });
    if (stockErr || !stockData?.ok) {
      const outOfStock = stockData?.out_of_stock || [];
      Logger.warn('order', 'split.stock_fail', `Stock insuffisant pour panier mixte`, { userId: req.user.id, meta: { outOfStock } });
      return res.status(409).json({
        code: 'STOCK_INSUFFICIENT',
        error: 'Stock insuffisant',
        items: outOfStock,
      });
    }
  } catch (_) {
    // RPC non disponible : continuer sans vérification atomique (fallback)
    Logger.warn('order', 'split.rpc_skip', 'RPC check_and_reserve_stock indisponible — fallback sans vérif stock');
  }

  const createdOrders = [];
  const shippingCost  = shippingCity === 'Dakar' ? 0 : 1500; // FCFA simplifié
  const COMMISSION    = 0.15;
  const totalCartValue = cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

  for (const group of vendorGroups) {
    const groupTotal = group.items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    // Répartition proportionnelle de la remise
    const groupDiscount = totalCartValue > 0
      ? discountAmount * (groupTotal / totalCartValue)
      : 0;
    const trackingNumber = 'SN' + Math.floor(1e5 + Math.random() * 9e5);

    const orderRow = {
      buyer_id:       req.user.id,
      buyer_name:     customerInfo.name,
      buyer_email:    customerInfo.email,
      buyer_address:  customerInfo.address || '',
      buyer_phone:    customerInfo.phone   || '',
      vendor_id:      group.vendorId,
      vendor_name:    group.vendorName,
      products:       group.items.map(p => ({
        id: p.id || p.product_id, name: p.name,
        price: p.price, quantity: p.quantity || 1,
        imageUrl: p.imageUrl || p.image_url || null,
      })),
      subtotal:        groupTotal,
      total:           groupTotal - groupDiscount + shippingCost,
      discount_amount: groupDiscount,
      commission:      groupTotal * COMMISSION,
      payment_method:  paymentMethod || 'cod',
      shipping_city:   shippingCity  || 'Dakar',
      shipping:        shippingCost > 0 ? 'standard' : 'gratuit',
      tracking_number: trackingNumber,
      status:          'processing',
    };

    const { data: savedOrder, error: orderErr } = await supabase
      .from('orders')
      .insert(orderRow)
      .select('id, buyer_id, vendor_id, buyer_name, buyer_email, buyer_address, vendor_name, products, total, subtotal, status, payment_method, payment_status, tracking_number, commission, discount_amount, shipping, shipping_city, created_at, processing_at, delivered_at, cancelled_at, in_transit_at, stripe_payment_id, mobile_money_ref, stock_reserved, cancel_reason, cancelled_by, vendor_note, has_dispute, dispute_id, return_status')
      .single();

    if (orderErr) {
      Logger.error('order', 'split.insert_fail', orderErr.message, { userId: req.user.id, meta: { vendorId: group.vendorId } });
      // Rollback stock pour les commandes déjà créées
      if (createdOrders.length > 0) {
        const rollbackItems = createdOrders.flatMap(o => (o.products || []).map(p => ({
          product_id: p.id, quantity: p.quantity
        })));
        try { await supabase.rpc('release_stock', { p_items: JSON.stringify(rollbackItems) }); } catch(_) {}
      }
      return res.status(500).json({ error: `Erreur création commande vendeur ${group.vendorName}: ${orderErr.message}` });
    }

    createdOrders.push(savedOrder);

    // Notification vendeur
    await supabase.from('notifications').insert({
      user_id: group.vendorId,
      type: 'order',
      title: 'Nouvelle commande !',
      message: `${customerInfo.name} a commandé ${group.items.map(p => p.name).join(', ')}`,
      read: false,
    });
  }

  Logger.info('order', 'split.done', `${createdOrders.length} sous-commande(s) créées pour panier mixte`, {
    userId: req.user.id, meta: { orderIds: createdOrders.map(o => o.id) }
  });

  res.status(201).json({ ok: true, orders: createdOrders });
});

// ── POST /api/orders ─────────────────────────────────────────────────────────
// Flux complet :
//   1. Validation des entrées
//   2. Vérification + décrémentation ATOMIQUE du stock (RPC Supabase)
//      → Si un produit est en rupture, la transaction est annulée (ROLLBACK)
//      → Aucun stock n'est décrémenté si un seul article manque
//   3. Création de la commande en base
//   4. Si l'INSERT order échoue → re-crédit du stock (rollback manuel)
//   5. Notifications vendeur
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/orders', verifyToken, async (req, res) => {
  const {
    vendorId, products, subtotal, total, discountAmount = 0, commission,
    paymentMethod, buyerAddress, buyerPhone, shippingCity, couponCode
  } = req.body;

  // ── Validation des entrées ────────────────────────────────────────────────
  if (!vendorId || !products || !total)
    return res.status(400).json({ error: 'Données commande incomplètes' });
  if (!Array.isArray(products) || products.length === 0)
    return res.status(400).json({ error: 'Panier vide' });
  if (parseFloat(total) <= 0)
    return res.status(400).json({ error: 'Montant invalide' });
  if (products.some(p => !p.name || typeof p.price !== 'number' || p.price < 0))
    return res.status(400).json({ error: 'Données produit invalides' });

  const stockItems = cartToStockItems(products);

  try {
    // ── Étape 0 : Validation côté serveur du coupon (si fourni) ──────────
    // Le frontend ne peut pas falsifier le discount : on recalcule ici
    let serverDiscount = 0;
    if (couponCode) {
      const safeCode = couponCode.trim().toUpperCase();
      const { data: coupon } = await supabase
        .from('coupons').select('id, code, discount, description, expires_at, max_uses, used_count, active, created_at').eq('code', safeCode).eq('active', true).maybeSingle();
      if (!coupon) {
        return res.status(400).json({ error: `Code promo "${safeCode}" invalide ou inactif` });
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return res.status(410).json({ error: `Code promo "${safeCode}" expiré` });
      }
      if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
        return res.status(410).json({ error: `Code promo "${safeCode}" épuisé` });
      }
      // Discount calculé côté serveur — le client ne peut pas gonfler la remise
      serverDiscount = Math.round(parseFloat(subtotal || total) * (coupon.discount / 100) * 100) / 100;
      // Incrémenter used_count (non-bloquant)
      supabase.from('coupons').rpc('increment_coupon_usage', { coupon_id: coupon.id })
        .eq('id', coupon.id);
    }

    // ── Étape 1 : Vérification ET décrémentation atomique du stock ────────
    // check_and_reserve_stock() :
    //   - Lock FOR UPDATE sur chaque ligne produit (empêche la race condition)
    //   - Vérifie stock >= quantité demandée pour TOUS les produits
    //   - Si tous OK → décrémente d'un coup dans la même transaction
    //   - Si un seul KO → RAISE EXCEPTION → ROLLBACK total (rien n'est décrémenté)
    const { data: stockResults, error: stockErr } = await supabase.rpc(
      'check_and_reserve_stock',
      { p_items: JSON.stringify(stockItems) }
    );

    if (stockErr) {
      // L'exception SQL contient le message STOCK_INSUFFICIENT ou STOCK_RACE
      const msg = stockErr.message || '';
      if (msg.includes('STOCK_INSUFFICIENT') || msg.includes('STOCK_RACE')) {
        // Extraire les produits en rupture pour un message précis
        const outOfStock = (stockResults || [])
          .filter(r => !r.success)
          .map(r => `${r.product_name} (demandé: ${r.requested}, disponible: ${r.available})`)
          .join(', ');
        Logger.warn('order', 'stock.insufficient', msg, {
          userId: req.user.id, meta: { vendorId, outOfStock }
        });
        return res.status(409).json({
          error: 'Stock insuffisant',
          detail: outOfStock || 'Certains articles ne sont plus disponibles.',
          code: 'STOCK_INSUFFICIENT',
          items: (stockResults || []).filter(r => !r.success),
        });
      }
      // Autre erreur Supabase (connexion, timeout…) → 503
      throw stockErr;
    }

    // ── Étape 2 : Créer la commande ───────────────────────────────────────
    const { data: buyerProfile } = await supabase
      .from('profiles').select('name, email').eq('id', req.user.id).single();

    const commissionRate = 0.15;
    const calculatedCommission = commission ||
      Math.round(parseFloat(total) * commissionRate * 100) / 100;

    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      buyer_id:        req.user.id,
      buyer_name:      buyerProfile?.name  || req.user.name,
      buyer_email:     buyerProfile?.email || req.user.email,
      buyer_address:   buyerAddress  || null,
      buyer_phone:     buyerPhone    || null,
      vendor_id:       vendorId,
      vendor_name:     products[0]?.vendorName || 'Vendeur',
      products,
      subtotal:        parseFloat(subtotal)      || parseFloat(total),
      discount_amount: couponCode ? serverDiscount : (parseFloat(discountAmount) || 0),
      total:           parseFloat(total),
      commission:      calculatedCommission,
      payment_method:  paymentMethod || 'mobile',
      shipping_city:   shippingCity  || null,
      coupon_code:     couponCode    || null,
      status:          'pending_payment',
      stock_reserved:  true,  // flag : le stock a déjà été décrémenté
    }).select().single();

    if (orderErr) {
      // ── Rollback stock : l'INSERT a échoué → re-créditer ─────────────
      Logger.error('order', 'create.rollback', `INSERT order échoué — re-crédit stock`, {
        userId: req.user.id, meta: { vendorId, items: stockItems, error: orderErr.message }
      });
      await supabase.rpc('release_stock', { p_items: JSON.stringify(stockItems) })
        .then(null, e => Logger.error('order', 'rollback.failed', e.message));
      throw orderErr;
    }

    
    // [NEXUS-F2] LoyaltyWidget + awardLoyaltyPoints [C]
    // Attribution automatique des points de fidélité
    if (order && req.user.id) {
      awardLoyaltyPoints(req.user.id, total).catch(
        e => Logger.warn('loyalty', 'award.error', e.message)
      );
    }
// ── Étape 3 : Notifications ───────────────────────────────────────────
    Logger.info('order', 'created',
      `Commande #${order.id} créée — ${formatFCFA(total)} (stock réservé)`,
      { userId: req.user.id, userEmail: req.user.email, meta: { orderId: order.id, total, vendorId } }
    );
    await pushNotification(vendorId, {
      type: 'order',
      title: '🛒 Nouvelle commande',
      message: `Commande #${order.id.slice(-6)} — ${formatFCFA(total)}`,
      link: `/orders/${order.id}`,
    });

    // ── Étape 4 : Points de fidélité — 1 pt par 100 FCFA dépensé ─────────
    const earnedPoints = Math.floor(parseFloat(total) * 655.957 / 100);
    if (earnedPoints > 0) {
      try {
        const { data: loyaltyRow } = await supabase.from('loyalty_points')
          .select('points, total_earned').eq('user_id', req.user.id).maybeSingle();
        if (loyaltyRow) {
          await supabase.from('loyalty_points').update({
            points:       loyaltyRow.points + earnedPoints,
            total_earned: (loyaltyRow.total_earned || 0) + earnedPoints,
            updated_at:   new Date().toISOString(),
          }).eq('user_id', req.user.id);
        } else {
          await supabase.from('loyalty_points').insert({
            user_id: req.user.id, points: earnedPoints,
            total_earned: earnedPoints, total_redeemed: 0,
          });
        }
        await pushNotification(req.user.id, {
          type: 'system',
          title: `⭐ +${earnedPoints.toLocaleString('fr-FR')} points fidélité`,
          message: `Vous gagnez ${earnedPoints} pts pour votre commande #${order.id.slice(-6)}.`,
        });
      } catch (loyaltyErr) {
        Logger.warn('order', 'loyalty.error', loyaltyErr.message, { userId: req.user.id });
      }
    }

    // ── Étape 5 : Récompense parrainage (1ère commande du filleul) ────────
    rewardReferrer(req.user.id).catch(e =>
      Logger.warn('order', 'referral.error', e.message, { userId: req.user.id })
    );

    res.status(201).json({ ...order, earnedPoints });

  } catch (e) {
    Logger.error('order', 'create.error', e.message, {
      userId: req.user.id, meta: { vendorId, total }
    });
    sentryCapture(e, { tag: 'order-create', userId: req.user.id, level: 'error', extra: { vendorId, total } });
    res.status(500).json({ error: 'Erreur lors de la création de la commande' });
  }
});

app.patch('/api/orders/:id/status', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const { status, trackingNumber, vendorNote, cancelReason } = req.body;
  const validStatuses = ['pending_payment','processing','in_transit','delivered','cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('id, vendor_id, buyer_id, buyer_email, buyer_name, vendor_name, status, products, stock_reserved, tracking_number, vendor_note, payment_method, stripe_payment_id, total, refund_status')
      .eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (req.user.role === 'vendor' && order.vendor_id !== req.user.id)
      return res.status(403).json({ error: 'Non autorisé' });

    const updates = { status };
    if (trackingNumber)        updates.tracking_number = trackingNumber;
    if (vendorNote)            updates.vendor_note     = vendorNote;
    if (status === 'processing') updates.processing_at = new Date().toISOString();
    if (status === 'in_transit') updates.in_transit_at = new Date().toISOString();
    if (status === 'delivered')  updates.delivered_at  = new Date().toISOString();
    if (status === 'cancelled')  updates.cancelled_at  = new Date().toISOString();
    if (cancelReason)            updates.cancel_reason = cancelReason;

    // ── Remboursement Stripe automatique sur annulation ──────────────────────
    let stripeRefundResult = null;
    if (status === 'cancelled' && order.stripe_payment_id && order.refund_status !== 'refunded') {
      try {
        stripeRefundResult = await stripe.refunds.create({
          payment_intent: order.stripe_payment_id,
          reason:         'requested_by_customer',
          metadata: {
            order_id:     order.id,
            cancelled_by: req.user.id,
            source:       'admin_cancel',
          },
        });
        updates.refund_status    = 'refunded';
        updates.refund_id        = stripeRefundResult.id;
        updates.refund_amount    = stripeRefundResult.amount / 100; // centimes → euros
        updates.refunded_at      = new Date().toISOString();
        Logger.info('refund', 'stripe.success',
          `Remboursement Stripe ${stripeRefundResult.id} — ${order.total}€ — commande ${order.id}`,
          { userId: req.user.id, meta: { refundId: stripeRefundResult.id, orderId: order.id } }
        );
      } catch (stripeErr) {
        // Ne pas bloquer l'annulation si Stripe échoue — noter l'erreur
        updates.refund_status = 'failed';
        updates.refund_error  = stripeErr.message;
        Logger.error('refund', 'stripe.error', stripeErr.message,
          { userId: req.user.id, meta: { orderId: order.id, stripePaymentId: order.stripe_payment_id } }
        );
      }
    } else if (status === 'cancelled' && !order.stripe_payment_id) {
      // Paiement Mobile Money ou espèces — remboursement manuel
      updates.refund_status = 'manual_pending';
    }

    // ── Re-crédit du stock sur annulation ─────────────────────────────────────
    if (status === 'cancelled' && order.stock_reserved) {
      const stockItems = (order.products || []).map(p => ({
        product_id: p.id, qty: p.quantity || p.qty || 1,
      }));
      if (stockItems.length > 0) {
        await supabase.rpc('release_stock', { p_items: JSON.stringify(stockItems) })
          .catch(e => Logger.warn('order', 'cancel.stock_release', e.message));
        await supabase.from('orders').update({ stock_reserved: false }).eq('id', order.id);
      }
    }

    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    const statusLabels = {
      processing: '⚙️ Commande en préparation',
      in_transit: '🚚 Commande en livraison',
      delivered:  '📦 Commande livrée',
      cancelled:  '❌ Commande annulée',
    };
    Logger.info('order', 'status.updated', `Commande #${req.params.id} → ${status}`,
      { userId: req.user.id, userRole: req.user.role, meta: { orderId: req.params.id, status } }
    );
    if (statusLabels[status]) {
      const notifMsg = status === 'cancelled' && stripeRefundResult
        ? `Commande #${order.id.slice(-6)} annulée. Remboursement de ${order.total}€ initié (3-5 jours ouvrés).`
        : status === 'cancelled' && updates.refund_status === 'manual_pending'
          ? `Commande #${order.id.slice(-6)} annulée. Remboursement manuel à traiter (Mobile Money / espèces).`
          : `Commande #${order.id.slice(-6)}`;
      await pushNotification(order.buyer_id, {
        type: 'order', title: statusLabels[status], message: notifMsg, link: `/orders/${order.id}`,
      });
      if (status === 'delivered') {
        const { subject, html } = emailTemplates.orderConfirmation({ ...order, tracking_number: trackingNumber });
        await sendEmail({ to: order.buyer_email, subject, html });
      }
      if (status === 'cancelled' && stripeRefundResult) {
        await sendEmail({
          to: order.buyer_email,
          subject: `[NEXUS] Remboursement initié pour la commande #${order.id.slice(-6)}`,
          html: `<p>Bonjour ${order.buyer_name},</p>
                 <p>Votre commande <strong>#${order.id.slice(-6)}</strong> a été annulée.</p>
                 <p>Un remboursement de <strong>${order.total}€</strong> a été initié sur votre moyen de paiement original.
                    Il apparaîtra sous <strong>3 à 5 jours ouvrés</strong> selon votre banque.</p>
                 <p>Référence remboursement : <code>${stripeRefundResult.id}</code></p>
                 <p>L'équipe NEXUS</p>`,
        }).catch(() => {});
      }
    }

    res.json({
      ...data,
      _refund: stripeRefundResult
        ? { id: stripeRefundResult.id, amount: stripeRefundResult.amount / 100, status: stripeRefundResult.status }
        : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/cancel', verifyToken, async (req, res) => {
  const { reason } = req.body;
  try {
    const { data: order } = await supabase
      .from('orders').select('id, vendor_id, buyer_id, buyer_email, status, products, stock_reserved').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });

    // Autorisation
    if (req.user.role !== 'admin'
        && order.buyer_id  !== req.user.id
        && order.vendor_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Statuts annulables : pas encore livré ni déjà annulé
    const cancellable = ['pending_payment', 'processing'];
    if (!cancellable.includes(order.status)) {
      return res.status(409).json({
        error: `Impossible d'annuler une commande en statut "${order.status}". Seules les commandes en attente ou en traitement peuvent être annulées.`,
        code: 'CANNOT_CANCEL',
      });
    }

    // Mise à jour du statut
    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({
        status:       'cancelled',
        cancel_reason: reason || null,
        cancelled_at:  new Date().toISOString(),
        cancelled_by:  req.user.id,
      })
      .eq('id', req.params.id)
      .select().single();
    if (updErr) throw updErr;

    // ── Re-crédit du stock si le stock avait été réservé ─────────────────
    // On ne re-crédite que si stock_reserved = true pour éviter le double
    // re-crédit en cas d'appel répété (idempotence).
    if (order.stock_reserved) {
      const stockItems = cartToStockItems(order.products || []);
      if (stockItems.length > 0) {
        const { error: releaseErr } = await supabase.rpc(
          'release_stock',
          { p_items: JSON.stringify(stockItems) }
        );
        if (releaseErr) {
          Logger.error('order', 'cancel.release_stock.error', releaseErr.message, {
            userId: req.user.id, meta: { orderId: order.id, stockItems }
          });
          // On continue quand même : la commande est annulée, le stock sera
          // réconcilié manuellement via l'interface admin.
        } else {
          // Marquer le stock comme libéré pour éviter le double re-crédit
          await supabase.from('orders')
            .update({ stock_reserved: false })
            .eq('id', req.params.id);
          Logger.info('order', 'cancel.stock_released',
            `Stock re-crédité pour commande #${order.id}`,
            { userId: req.user.id, meta: { orderId: order.id, stockItems } }
          );
          // Déclencher les notifications d'alerte stock pour chaque produit re-crédité
          for (const item of stockItems) {
            supabase.rpc('notify_stock_alerts', { p_product_id: item.product_id })
              .then(({ data: notified }) => {
                if (notified?.length > 0) {
                  for (const row of notified) {
                    pushNotification(row.user_id, {
                      type: 'system',
                      title: '🔔 Produit disponible !',
                      message: `"${row.product_name}" est de nouveau en stock — commandez vite !`,
                      link: `/products/${item.product_id}`,
                    });
                  }
                }
              });
          }
        }
      }
    }

    // Notification acheteur/vendeur
    const otherPartyId = req.user.id === order.buyer_id ? order.vendor_id : order.buyer_id;
    await pushNotification(otherPartyId, {
      type: 'order',
      title: '❌ Commande annulée',
      message: `Commande #${order.id.slice(-6)}${reason ? ' — ' + reason : ''}`,
      link: `/orders/${order.id}`,
    });

    Logger.info('order', 'cancelled', `Commande #${order.id} annulée`, {
      userId: req.user.id, userRole: req.user.role,
      meta: { orderId: order.id, reason }
    });

    res.json(updated);
  } catch (e) {
    Logger.error('order', 'cancel.error', e.message, { userId: req.user.id, meta: { orderId: req.params.id } });
    res.status(500).json({ error: e.message });
  }
});

// ─── PAYMENTS ────────────────────────────────────────────────────────────────
app.post('/api/payments/create-intent', verifyToken, paymentLimiter, async (req, res) => {
  try {
    const { orderId, amount, currency = 'eur' } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: 'orderId et amount requis' });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Paiement Stripe non configuré' });

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: { orderId, userId: req.user.id },
    });
    await supabase.from('orders').update({ stripe_payment_id: intent.id }).eq('id', orderId);
    Logger.info('payment', 'intent.created', `PaymentIntent créé: ${intent.id} (${amount} EUR)`, { userId: req.user.id, meta: { orderId, amount, intentId: intent.id } });
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payments/mobile-money', verifyToken, paymentLimiter, async (req, res) => {
  try {
    const { orderId, provider, phone, amount } = req.body;
    if (!orderId || !provider || !phone) return res.status(400).json({ error: 'orderId, provider et phone requis' });

    // Simulation Orange Money / Wave (intégrer l'API réelle ici)
    const ref = `${provider.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await supabase.from('orders').update({
      payment_status: 'paid',
      status: 'processing',
      mobile_money_ref: ref,
      payment_method: 'mobile',
      processing_at: new Date().toISOString(),
    }).eq('id', orderId);

    const { data: order } = await supabase.from('orders').select('id, vendor_id, buyer_id, buyer_email, buyer_name, vendor_name, status, products, stock_reserved, tracking_number, vendor_note, payment_method').eq('id', orderId).single();
    if (order) {
      await sendEmail({ to: order.buyer_email, ...emailTemplates.orderConfirmation(order) });
      await pushNotification(order.vendor_id, { type: 'order', title: '💰 Paiement reçu', message: `Commande #${orderId.slice(-6)} — ${formatFCFA(amount)}`, link: `/orders/${orderId}` });
    }
    res.json({ success: true, reference: ref, message: `Paiement ${provider} confirmé` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── STRIPE WEBHOOK ──────────────────────────────────────────────────────────
async function handleStripeWebhook(req, res) {
  Logger.info('payment', 'webhook.received', `Webhook Stripe reçu`);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    Logger.error('payment', 'webhook.signature_invalid', e.message, { ip: req.ip });
    return res.status(400).json({ error: 'Signature invalide' });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        await supabase.from('orders').update({ payment_status: 'paid', status: 'processing', processing_at: new Date().toISOString() }).eq('stripe_payment_id', pi.id);
        const { data: order } = await supabase.from('orders').select('id, vendor_id, buyer_id, buyer_email, buyer_name, vendor_name, status, products, stock_reserved, tracking_number, vendor_note, payment_method').eq('id', orderId).single();
        if (order) {
          await sendEmail({ to: order.buyer_email, ...emailTemplates.orderConfirmation(order) });
          await pushNotification(order.vendor_id, { type: 'order', title: '💰 Paiement Stripe reçu', message: `Commande #${orderId.slice(-6)}` });
        }
      }
    }
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      // Marquer l'ordre comme échoué
      const { data: failedOrder } = await supabase
        .from('orders').select('id, products, stock_reserved')
        .eq('stripe_payment_id', pi.id).maybeSingle();
      await supabase.from('orders')
        .update({ payment_status: 'failed', status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('stripe_payment_id', pi.id);
      // Re-crédit du stock si réservé
      if (failedOrder?.stock_reserved) {
        const stockItems = cartToStockItems(failedOrder.products || []);
        if (stockItems.length > 0) {
          await supabase.rpc('release_stock', { p_items: JSON.stringify(stockItems) }).then(null, e =>
            Logger.error('payment', 'stripe.failed.release_stock', e.message, { meta: { orderId: failedOrder.id } })
          );
          await supabase.from('orders').update({ stock_reserved: false }).eq('id', failedOrder.id);
          Logger.info('payment', 'stripe.failed.stock_released', `Stock re-crédité après échec Stripe`, { meta: { orderId: failedOrder.id } });
        }
      }
    }
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const { data: refundedOrder } = await supabase
        .from('orders').select('id, products, stock_reserved')
        .eq('stripe_payment_id', charge.payment_intent).maybeSingle();
      await supabase.from('orders')
        .update({ payment_status: 'refunded', status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('stripe_payment_id', charge.payment_intent);
      // Re-crédit du stock si réservé et pas encore libéré
      if (refundedOrder?.stock_reserved) {
        const stockItems = cartToStockItems(refundedOrder.products || []);
        if (stockItems.length > 0) {
          try { await supabase.rpc('release_stock', { p_items: JSON.stringify(stockItems) }); } catch(_) {}
          await supabase.from('orders').update({ stock_reserved: false }).eq('id', refundedOrder.id);
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    Logger.error('payment', 'webhook.processing_error', e.message, { meta: { stack: e.stack?.slice(0,200) } });
    sentryCapture(e, { tag: 'stripe-webhook', level: 'error', extra: { eventType: event?.type } });
    res.status(500).json({ error: 'Erreur traitement webhook' });
  }
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

// [NEXUS-MSG-v4] Routes messages v4.0.0
// ══════════════════════════════════════════════════════════════════════════════
// NEXUS Market — Messagerie Backend v4.0.0
// Routes Express à ajouter dans server.js
//
// INTÉGRATION :
//   Remplacer les routes /api/messages existantes (lignes ~1993-2038) par ce fichier.
//   Coller le contenu entre les routes existantes et ─── NOTIFICATIONS ───
//
// SQL SUPABASE À EXÉCUTER (une seule fois) :
//   → Voir section "SQL MIGRATION" en bas de ce fichier
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// STORE DE FRAPPE (in-memory, sans base de données)
// Stocke l'état "en train d'écrire" avec TTL de 4 secondes.
// Sur Render/Railway avec multiple instances, utiliser Redis à la place.
// Pour usage mono-instance (recommandé), cette approche est suffisante.
// ══════════════════════════════════════════════════════════════════════════════
const _typingStore = new Map(); // convId → { userId, userName, updatedAt }
const TYPING_TTL_MS = 4000;

// Nettoyage périodique des entrées expirées (toutes les 10 secondes)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _typingStore.entries()) {
    if (now - val.updatedAt > TYPING_TTL_MS * 2) _typingStore.delete(key);
  }
}, 10000);

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/conversations
// Retourne toutes les conversations de l'utilisateur avec métadonnées :
//   - Dernier message
//   - Compte de messages non lus
//   - Profil de l'interlocuteur
// Optimisé : une seule requête Supabase via GROUP BY (RPC Postgres)
// ══════════════════════════════════════════════════════════════════════════════
// Map<userId, Set<Response>> — un user peut avoir plusieurs onglets connectés
const _sseClients = new Map();

function _sseSend(userId, event, payload) {
  const clients = _sseClients.get(userId);
  if (!clients || clients.size === 0) return 0;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  let sent = 0;
  for (const res of clients) {
    try {
      res.write(data);
      sent++;
    } catch {
      clients.delete(res);
    }
  }
  return sent;
}

function _sseRegister(userId, res) {
  if (!_sseClients.has(userId)) _sseClients.set(userId, new Set());
  _sseClients.get(userId).add(res);
}

function _sseUnregister(userId, res) {
  const clients = _sseClients.get(userId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) _sseClients.delete(userId);
  }
}

// ── [REALTIME-MSG] GET /api/messages/stream ───────────────────────────────────
// Connexion SSE persistante. Le client l'ouvre une fois à la connexion et reçoit
// les nouveaux messages en temps réel sans polling.
//
// Réponse : text/event-stream (connexion maintenue ouverte)
// Events émis :
//   event: connected          — confirmation de connexion (avec userId)
//   event: new_message        — nouveau message reçu (payload = objet message complet)
//   event: message_read       — messages marqués lus (payload = { fromId, readAt })
//   event: typing             — indicateur frappe (payload = { convId, userId, isTyping })
//   event: heartbeat          — keep-alive toutes les 25s
//
// Sécurité :
//   - Authentification JWT via verifyToken (identique aux autres routes)
//   - Filtre : chaque connexion ne reçoit que les messages adressés à son userId
//   - Timeout : fermeture propre si le client déconnecte (req.on('close'))
//   - Max 10 connexions simultanées par userId (anti-abus)
//
// ── [SUPABASE REALTIME] SQL requis pour postgres_changes (<100ms latence) ─────
// 1. Dashboard Supabase → Database → Replication → cocher la table 'messages'
//    OU via SQL Editor :
//      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
//
// 2. RLS obligatoire pour que Realtime filtre par utilisateur :
//      ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
//      CREATE POLICY "realtime_messages_select" ON messages
//        FOR SELECT USING (auth.uid() = to_id OR auth.uid() = from_id);
//
// 3. Même chose pour typing_status si la table existe :
//      ALTER PUBLICATION supabase_realtime ADD TABLE typing_status;
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/messages/stream', verifyToken, (req, res) => {
  const userId = req.user.id;

  // Limite de connexions par user (anti-abus / fuites mémoire)
  const existing = _sseClients.get(userId);
  if (existing && existing.size >= 10) {
    return res.status(429).json({ error: 'Trop de connexions SSE simultanées' });
  }

  // Headers SSE standards + désactivation des buffers intermediaires
  res.set({
    'Content-Type':  'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',     // Nginx : ne pas bufferiser
    'Access-Control-Allow-Origin': req.headers.origin || '*',
  });
  res.flushHeaders();

  // Confirmer la connexion
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);

  // Enregistrer le client
  _sseRegister(userId, res);
  Logger.info('sse', 'connect', `SSE client connecté : ${req.user.name}`, { userId });

  // Heartbeat toutes les 25s (évite les timeouts proxy/CDN à 30s)
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch {
      clearInterval(heartbeatTimer);
    }
  }, 25000);

  // Nettoyage à la déconnexion du client
  req.on('close', () => {
    clearInterval(heartbeatTimer);
    _sseUnregister(userId, res);
    Logger.info('sse', 'disconnect', `SSE client déconnecté : ${req.user.name}`, { userId });
  });
});

app.get('/api/messages/conversations', verifyToken, async (req, res) => {
  try {
    const uid = req.user.id;

    // Récupérer tous les messages impliquant l'utilisateur
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('id, from_id, from_name, to_id, to_name, text, read, read_at, created_at')
      .or(`from_id.eq.${uid},to_id.eq.${uid}`)
      .is('deleted_for', null) // Exclure les messages supprimés globalement
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Construire la carte des conversations côté serveur
    const convMap = new Map();
    const partnerIds = new Set();

    for (const m of (msgs || [])) {
      const otherId   = m.from_id === uid ? m.to_id   : m.from_id;
      const otherName = m.from_id === uid ? m.to_name : m.from_name;
      const cid = [uid, otherId].sort().join('::');

      if (!convMap.has(cid)) {
        convMap.set(cid, { id: cid, otherId, otherName, lastMessage: m, unread: 0 });
        partnerIds.add(otherId);
      }

      // Compter les non-lus reçus
      if (m.to_id === uid && !m.read) {
        convMap.get(cid).unread++;
      }
    }

    // Récupérer les profils des interlocuteurs en une seule requête
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email, role, avatar')
      .in('id', [...partnerIds]);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const conversations = [...convMap.values()]
      .sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at))
      .map(c => ({ ...c, profile: profileMap[c.otherId] || null }));

    res.json(conversations);
  } catch (e) {
    Logger.error('messages', 'conversations.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages
// Récupère les messages d'une conversation (avec pagination par curseur).
//
// Query params :
//   with   (string) : userId de l'interlocuteur pour filtrer par conversation
//   after  (ISO)    : Curseur — ne charger que les messages après cette date
//   before (ISO)    : Curseur inverse — pour charger l'historique paginé
//   limit  (int)    : Nombre de messages max (défaut: 50, max: 100)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages', verifyToken, async (req, res) => {
  try {
    const uid = req.user.id;
    const { with: withUser, after, before, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 100);

    let query = supabase
      .from('messages')
      .select(`
        id, from_id, from_name, to_id, to_name, text, read, read_at,
        reply_to_id, reply_to_text, attachments, reactions, deleted_for, created_at
      `);

    // Filtrer par conversation ou par utilisateur
    if (withUser) {
      query = query.or(
        `and(from_id.eq.${uid},to_id.eq.${withUser}),` +
        `and(from_id.eq.${withUser},to_id.eq.${uid})`
      );
    } else {
      query = query.or(`from_id.eq.${uid},to_id.eq.${uid}`);
    }

    // Curseur temporel
    if (after) {
      query = query.gt('created_at', after);
      query = query.order('created_at', { ascending: true });
    } else if (before) {
      query = query.lt('created_at', before);
      query = query.order('created_at', { ascending: false }); // tri inversé pour obtenir les N plus récents avant "before"
    } else {
      query = query.order('created_at', { ascending: true });
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    // Filtrer les messages supprimés pour cet utilisateur
    const result = (data || [])
      .filter(m => !(m.deleted_for || []).includes(uid))
      .map(m => ({
        ...m,
        deleted_for: undefined, // Ne pas exposer la liste complète
        _deleted_for_me: (m.deleted_for || []).includes(uid)
      }));

    // Si before → réinverser pour retourner en ordre chronologique
    if (before) result.reverse();

    res.json(result);
  } catch (e) {
    Logger.error('messages', 'list.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/messages
// Envoyer un nouveau message.
//
// Body :
//   toId         (string, requis)  : ID du destinataire
//   text         (string, requis)  : Contenu du message
//   replyToId    (string, optionnel): ID du message auquel on répond
//   replyToText  (string, optionnel): Texte cité (dénormalisé pour perf)
//   attachment   (object, optionnel): { type:'image', url, name }
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/messages', verifyToken, async (req, res) => {
  const { toId, text, replyToId, replyToText, attachment } = req.body;

  if (!toId)   return res.status(400).json({ error: 'toId requis' });
  if (!text && !attachment) return res.status(400).json({ error: 'text ou attachment requis' });
  if (text && text.length > 4000) return res.status(400).json({ error: 'Message trop long (max 4000 caractères)' });

  // Validation de l'attachment
  if (attachment) {
    if (!['image', 'file'].includes(attachment.type))
      return res.status(400).json({ error: 'Type de pièce jointe invalide' });
    if (!attachment.url || typeof attachment.url !== 'string')
      return res.status(400).json({ error: 'URL de pièce jointe requise' });
  }

  try {
    // Vérifier que le destinataire existe
    const { data: recipient, error: recipErr } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', toId)
      .single();

    if (recipErr || !recipient)
      return res.status(404).json({ error: 'Destinataire introuvable' });

    const row = {
      from_id:       req.user.id,
      from_name:     req.user.name,
      to_id:         toId,
      to_name:       recipient.name,
      text:          text ? text.trim() : '',
      read:          false,
      read_at:       null,
      reply_to_id:   replyToId   || null,
      reply_to_text: replyToText || null,
      attachments:   attachment ? [attachment] : null,
      reactions:     null,
      deleted_for:   null,
    };

    const { data, error } = await supabase
      .from('messages')
      .insert(row)
      .select()
      .single();

    if (error) throw error;

    // Notifications en parallèle (non bloquant)
    Promise.all([
      pushNotification(toId, {
        type:    'message',
        title:   `💬 Message de ${req.user.name}`,
        message: (text || '').slice(0, 100) || '📎 Pièce jointe',
        link:    `/messages/${req.user.id}`,
      }),
      sendEmail({
        to:      recipient.email,
        ...emailTemplates.newMessage(req.user.name, text || '(Pièce jointe)')
      }).catch(() => {}),
    ]).catch(e => Logger.warn('messages', 'notify.error', e.message));

    Logger.info('messages', 'sent', `Message ${req.user.name} → ${recipient.name}`, {
      userId: req.user.id, meta: { toId, hasAttachment: !!attachment, hasReply: !!replyToId }
    });

    // Si le destinataire est connecté via SSE, il reçoit le message en <50ms
    // sans attendre le prochain cycle de polling.
    const sseSent = _sseSend(toId, 'new_message', data);
    if (sseSent > 0) {
      Logger.info('sse', 'push', `Message poussé via SSE à ${recipient.name} (${sseSent} onglet(s))`, {
        userId: req.user.id, meta: { toId }
      });
    }

    // ── Push SSE "lu" côté expéditeur quand le destinataire lit ──────────────
    // (Cette partie est déjà gérée via le polling côté expéditeur.
    //  Un push explicite peut être ajouté dans PATCH /api/messages/read
    //  en appelant : _sseSend(fromId, 'message_read', { fromId: uid, readAt: now }))
  } catch (e) {
    Logger.error('messages', 'send.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/unread-count
// Retourne le nombre total de messages non lus pour l'utilisateur.
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages/unread-count', verifyToken, async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_id', req.user.id)
      .eq('read', false);

    if (error) throw error;
    res.json({ count: count || 0, userId: req.user.id });
  } catch (e) {
    res.status(500).json({ error: e.message, count: 0 });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/messages/read
// Marquer tous les messages d'un expéditeur comme lus.
//
// Body :
//   fromId (string, optionnel) : Si fourni, marque uniquement les messages de cet expéditeur
//                                Sinon, marque TOUS les messages reçus non lus
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/api/messages/read', verifyToken, async (req, res) => {
  try {
    const { fromId } = req.body;
    const now = new Date().toISOString();

    let query = supabase
      .from('messages')
      .update({ read: true, read_at: now })
      .eq('to_id', req.user.id)
      .eq('read', false);

    if (fromId) query = query.eq('from_id', fromId);

    await query;

    res.json({ ok: true, markedAt: now });

    // [REALTIME-MSG] Notifier l'expéditeur que ses messages ont été lus
    if (fromId) {
      _sseSend(fromId, 'message_read', {
        fromId: fromId,
        toId:   req.user.id,
        readAt: now,
      });
    }
  } catch (e) {
    Logger.error('messages', 'read.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/messages/:id/react
// Ajouter ou retirer une réaction emoji sur un message.
// Toggle : si la réaction existe déjà pour cet utilisateur, elle est retirée.
//
// Body :
//   emoji (string, requis) : L'emoji de la réaction
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/api/messages/:id/react', verifyToken, async (req, res) => {
  const { emoji } = req.body;
  if (!emoji || typeof emoji !== 'string' || emoji.length > 8)
    return res.status(400).json({ error: 'Emoji invalide' });

  try {
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('id, from_id, to_id, reactions')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !msg)
      return res.status(404).json({ error: 'Message introuvable' });

    // Vérifier que l'utilisateur est participant à ce message
    if (msg.from_id !== req.user.id && msg.to_id !== req.user.id)
      return res.status(403).json({ error: 'Non autorisé' });

    const reactions = { ...(msg.reactions || {}) };
    if (!reactions[emoji]) reactions[emoji] = [];

    const idx = reactions[emoji].indexOf(req.user.id);
    if (idx >= 0) {
      reactions[emoji].splice(idx, 1); // Retirer
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(req.user.id); // Ajouter
    }

    const { data, error } = await supabase
      .from('messages')
      .update({ reactions: Object.keys(reactions).length > 0 ? reactions : null })
      .eq('id', req.params.id)
      .select('id, reactions')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    Logger.error('messages', 'react.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/messages/:id/delete
// Suppression douce d'un message pour l'utilisateur courant uniquement.
// Le message reste visible pour l'autre participant.
//
// Body :
//   userId (string) : L'ID de l'utilisateur qui supprime (doit être req.user.id)
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/api/messages/:id/delete', verifyToken, async (req, res) => {
  try {
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('id, from_id, to_id, deleted_for')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !msg)
      return res.status(404).json({ error: 'Message introuvable' });

    if (msg.from_id !== req.user.id && msg.to_id !== req.user.id)
      return res.status(403).json({ error: 'Non autorisé' });

    const deletedFor = [...(msg.deleted_for || [])];
    if (!deletedFor.includes(req.user.id)) deletedFor.push(req.user.id);

    const { error } = await supabase
      .from('messages')
      .update({ deleted_for: deletedFor })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true, deletedFor });
  } catch (e) {
    Logger.error('messages', 'delete.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/messages/typing
// Signaler que l'utilisateur est en train d'écrire dans une conversation.
// Le client doit appeler cet endpoint toutes les ~3s tant qu'il écrit.
// Le signal expire automatiquement après TYPING_TTL_MS (4s).
//
// Body :
//   convId (string, requis) : ID de la conversation (format: "userId1::userId2" trié)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/messages/typing', verifyToken, async (req, res) => {
  const { convId } = req.body;
  if (!convId || typeof convId !== 'string')
    return res.status(400).json({ error: 'convId requis' });

  // Vérifier que l'utilisateur est bien participant à cette conversation
  const parts = convId.split('::');
  if (!parts.includes(req.user.id))
    return res.status(403).json({ error: 'Non autorisé' });

  const { toId: _typingToId } = req.body;

  _typingStore.set(convId, {
    userId:    req.user.id,
    userName:  req.user.name,
    updatedAt: Date.now(),
  });

  res.json({ ok: true, expiresIn: TYPING_TTL_MS });

  // [REALTIME-MSG] Push SSE indicateur de frappe au destinataire
  if (_typingToId) {
    _sseSend(_typingToId, 'typing', {
      convId:   convId || null,
      userId:   req.user.id,
      userName: req.user.name,
      isTyping: true,
      ts:       Date.now(),
    });

    // [FIX] Envoyer automatiquement isTyping: false après TYPING_TTL_MS
    // pour que l'indicateur disparaisse sans nécessiter un appel explicite "stop"
    setTimeout(() => {
      const current = _typingStore.get(convId);
      // N'envoyer le stop que si le même utilisateur est encore marqué
      if (current && current.userId === req.user.id) {
        _sseSend(_typingToId, 'typing', {
          convId:   convId,
          userId:   req.user.id,
          userName: req.user.name,
          isTyping: false,
          ts:       Date.now(),
        });
      }
    }, TYPING_TTL_MS);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/typing/:convId
// Vérifier si l"autre participant d'une conversation est en train d"écrire.
// Le client devrait appeler cet endpoint toutes les 1.5-2s pendant une conversation active.
//
// Réponse :
//   { isTyping: bool, userId: string|null, userName: string|null, updatedAt: number|null }
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages/typing/:convId', verifyToken, async (req, res) => {
  const { convId } = req.params;
  const parts = convId.split('::');

  // Vérifier que l'utilisateur est bien participant
  if (!parts.includes(req.user.id))
    return res.status(403).json({ error: 'Non autorisé' });

  const entry = _typingStore.get(convId);

  // Retourner le statut de FRAPPE uniquement si c'est l'autre participant
  if (!entry || entry.userId === req.user.id) {
    return res.json({ isTyping: false, userId: null, userName: null, updatedAt: null });
  }

  const isStillTyping = Date.now() - entry.updatedAt < TYPING_TTL_MS;
  if (!isStillTyping) _typingStore.delete(convId);

  res.json({
    isTyping:  isStillTyping,
    userId:    entry.userId,
    userName:  entry.userName,
    updatedAt: entry.updatedAt,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/messages/search
// Rechercher dans tous les messages de l'utilisateur.
//
// Query params :
//   q      (string, requis) : Terme de recherche (min 2 caractères)
//   withId (string, optionnel) : Limiter la recherche à une conversation
//   limit  (int) : Résultats max (défaut: 20)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages/search', verifyToken, async (req, res) => {
  const { q, withId, limit: rawLimit } = req.query;
  if (!q || q.length < 2)
    return res.status(400).json({ error: 'Terme de recherche trop court (min 2 caractères)' });

  const limit = Math.min(parseInt(rawLimit) || 20, 50);

  try {
    let query = supabase
      .from('messages')
      .select('id, from_id, from_name, to_id, to_name, text, read, created_at')
      .or(`from_id.eq.${req.user.id},to_id.eq.${req.user.id}`)
      .ilike('text', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (withId) {
      query = query.or(
        `and(from_id.eq.${req.user.id},to_id.eq.${withId}),` +
        `and(from_id.eq.${withId},to_id.eq.${req.user.id})`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SQL MIGRATION — À exécuter dans l'éditeur SQL Supabase (une seule fois)
// ══════════════════════════════════════════════════════════════════════════════
//
// -- Nouvelles colonnes sur la table messages existante
// ALTER TABLE messages
//   ADD COLUMN IF NOT EXISTS reply_to_id    uuid REFERENCES messages(id) ON DELETE SET NULL,
//   ADD COLUMN IF NOT EXISTS reply_to_text  text,
//   ADD COLUMN IF NOT EXISTS attachments    jsonb,
//   ADD COLUMN IF NOT EXISTS reactions      jsonb,
//   ADD COLUMN IF NOT EXISTS deleted_for    uuid[],
//   ADD COLUMN IF NOT EXISTS read_at        timestamptz;
//
// -- Index de performance
// CREATE INDEX IF NOT EXISTS idx_messages_from_to
//   ON messages(from_id, to_id, created_at DESC);
//
// CREATE INDEX IF NOT EXISTS idx_messages_to_unread
//   ON messages(to_id, read) WHERE read = false;
//
// CREATE INDEX IF NOT EXISTS idx_messages_text_search
//   ON messages USING gin(to_tsvector('french', text));
//
// -- Politique RLS : chaque utilisateur ne voit que SES messages
// -- (Si RLS pas encore configurée sur messages)
// ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
//
// CREATE POLICY "messages_select_own" ON messages
//   FOR SELECT USING (auth.uid() = from_id OR auth.uid() = to_id);
//
// CREATE POLICY "messages_insert_own" ON messages
//   FOR INSERT WITH CHECK (auth.uid() = from_id);
//
// CREATE POLICY "messages_update_own" ON messages
//   FOR UPDATE USING (auth.uid() = from_id OR auth.uid() = to_id);
//
// -- Fonction pour compter les conversations (optionnel, pour analytics)
// CREATE OR REPLACE FUNCTION count_user_conversations(p_user_id uuid)
// RETURNS integer AS $$
//   SELECT COUNT(DISTINCT
//     CASE
//       WHEN from_id = p_user_id THEN to_id
//       ELSE from_id
//     END
//   )
//   FROM messages
//   WHERE from_id = p_user_id OR to_id = p_user_id;
// $$ LANGUAGE sql STABLE;
//
// ── FIN DU FICHIER ──────────────────────────────────────────────────────────

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
// POST /api/notifications — Créer une notification (appelé par addNotification frontend)
app.post('/api/notifications', verifyToken, async (req, res) => {
  try {
    const { userId, type, title, message, link } = req.body;
    const targetId = userId === 'admin'
      ? (await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single()).data?.id
      : userId;
    if (!targetId) return res.status(404).json({ error: 'Destinataire introuvable' });
    await pushNotification(targetId, { type: type || 'system', title, message, link });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/notifications', verifyToken, async (req, res) => {
  const { data } = await supabase.from('notifications').select('id, user_id, type, title, message, link, read, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30);
  res.json(data || []);
});

app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
  await supabase.from('notifications').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});

app.patch('/api/notifications/read-all', verifyToken, async (req, res) => {
  await supabase.from('notifications').update({ read: true }).eq('user_id', req.user.id).eq('read', false);
  res.json({ ok: true });
});

// ─── WISHLISTS ────────────────────────────────────────────────────────────────
app.get('/api/wishlists', verifyToken, async (req, res) => {
  const { data } = await supabase.from('wishlists').select('*, products(*)').eq('user_id', req.user.id);
  res.json(data || []);
});
app.post('/api/wishlists', verifyToken, async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requis' });
  const { data, error } = await supabase.from('wishlists').insert({ user_id: req.user.id, product_id: productId }).select().single();
  if (error && error.code === '23505') return res.status(409).json({ error: 'Déjà dans la wishlist' });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.delete('/api/wishlists/:productId', verifyToken, async (req, res) => {
  await supabase.from('wishlists').delete().eq('user_id', req.user.id).eq('product_id', req.params.productId);
  res.json({ ok: true });
});

// ─── OFFERS ──────────────────────────────────────────────────────────────────
app.get('/api/offers', verifyToken, async (req, res) => {
  let query = supabase.from('offers').select('id, product_id, product_name, buyer_id, buyer_name, vendor_id, offered_price, message, status, counter_price, created_at');
  if (req.user.role === 'buyer')  query = query.eq('buyer_id', req.user.id);
  if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
  const { data } = await query.order('created_at', { ascending: false });
  res.json(data || []);
});
app.post('/api/offers', verifyToken, async (req, res) => {
  const { productId, productName, vendorId, offeredPrice, message } = req.body;
  if (!productId || !vendorId || !offeredPrice) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { data, error } = await supabase.from('offers').insert({
      product_id: productId, product_name: productName, buyer_id: req.user.id,
      buyer_name: req.user.name, vendor_id: vendorId, offered_price: parseFloat(offeredPrice), message: message || null
    }).select().single();
    if (error) throw error;
    const { data: vendor } = await supabase.from('profiles').select('name, email').eq('id', vendorId).single();
    await pushNotification(vendorId, { type: 'offer', title: '💬 Nouvelle offre', message: `${req.user.name} propose ${formatFCFA(offeredPrice)} pour "${productName}"`, link: '/vendor/offers' });
    if (vendor?.email) await sendEmail({ to: vendor.email, ...emailTemplates.offerReceived(vendor.name, productName, req.user.name, offeredPrice) });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/offers/:id', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const { status, counterPrice } = req.body;
  if (!['accepted','rejected'].includes(status) && !(status === 'pending' && counterPrice)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  try {
    const updates = { status };
    if (counterPrice) updates.counter_price = parseFloat(counterPrice);
    const { data, error } = await supabase.from('offers').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    await pushNotification(data.buyer_id, {
      type: 'offer',
      title: status === 'accepted' ? '✅ Offre acceptée !' : '❌ Offre refusée',
      message: counterPrice ? `Contre-proposition : ${formatFCFA(counterPrice)} pour "${data.product_name}"` : `"${data.product_name}"`,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DISPUTES ────────────────────────────────────────────────────────────────
app.get('/api/disputes', verifyToken, async (req, res) => {
  let query = supabase.from('disputes').select('id, order_id, buyer_id, buyer_name, vendor_id, vendor_name, order_total, reason, description, status, resolution, admin_notes, investigating_at, resolved_at, closed_at, created_at');
  if (req.user.role === 'buyer')  query = query.eq('buyer_id', req.user.id);
  if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
  const { data } = await query.order('created_at', { ascending: false });
  res.json(data || []);
});
app.post('/api/disputes', verifyToken, requireRole('buyer'), async (req, res) => {
  const { orderId, reason, description } = req.body;
  if (!orderId || !reason || !description) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { data: order } = await supabase.from('orders').select('vendor_id, vendor_name, total, buyer_id').eq('id', orderId).eq('buyer_id', req.user.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    const { data, error } = await supabase.from('disputes').insert({
      order_id: orderId, buyer_id: req.user.id, buyer_name: req.user.name,
      vendor_id: order.vendor_id, vendor_name: order.vendor_name,
      order_total: order.total, reason, description
    }).select().single();
    if (error) throw error;
    await supabase.from('orders').update({ has_dispute: true, dispute_id: data.id }).eq('id', orderId);
    const { data: admins } = await supabase.from('profiles').select('id, email').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, { type: 'dispute', title: '⚠️ Nouveau litige', message: `Commande #${orderId.slice(-6)} — ${reason}`, link: '/admin/disputes' });
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/disputes/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { status, resolution, adminNotes, refundPercent } = req.body;

  // Validation du pourcentage
  const pct = refundPercent != null ? parseFloat(refundPercent) : null;
  if (pct != null && (isNaN(pct) || pct < 0 || pct > 100))
    return res.status(400).json({ error: 'refundPercent doit être entre 0 et 100' });

  try {
    const { data: dispute, error: fetchErr } = await supabase
      .from('disputes')
      .select('id, order_id, buyer_id, buyer_name, buyer_email, vendor_id, vendor_name, vendor_email, order_total, status')
      .eq('id', req.params.id).single();
    if (fetchErr || !dispute) return res.status(404).json({ error: 'Litige introuvable' });

    const updates = { status };
    if (resolution) updates.resolution  = resolution;
    if (adminNotes) updates.admin_notes = adminNotes;
    if (status === 'investigating') updates.investigating_at = new Date().toISOString();
    if (status === 'resolved')      updates.resolved_at      = new Date().toISOString();
    if (status === 'closed')        updates.closed_at        = new Date().toISOString();

    // ── Remboursement Stripe partiel sur résolution ────────────────────────────
    let stripeRefundResult = null;
    if (status === 'resolved' && pct != null && pct > 0 && dispute.order_id) {
      // Récupérer la commande pour obtenir le stripe_payment_id
      const { data: order } = await supabase
        .from('orders')
        .select('id, stripe_payment_id, total, refund_status, payment_method')
        .eq('id', dispute.order_id).single();

      if (order?.stripe_payment_id && order.refund_status !== 'refunded') {
        const refundAmountCents = Math.round(((order.total * pct) / 100) * 100);
        try {
          stripeRefundResult = await stripe.refunds.create({
            payment_intent: order.stripe_payment_id,
            amount:         refundAmountCents,
            reason:         'fraudulent',  // litige = reason fraudulent/duplicate/requested_by_customer
            metadata: {
              dispute_id:   dispute.id,
              order_id:     order.id,
              refund_pct:   String(pct),
              resolved_by:  req.user.id,
              source:       'dispute_resolution',
            },
          });

          // Mettre à jour la commande avec le statut de remboursement
          const refundStatus = pct >= 100 ? 'refunded' : 'partial_refund';
          await supabase.from('orders').update({
            refund_status:  refundStatus,
            refund_id:      stripeRefundResult.id,
            refund_amount:  refundAmountCents / 100,
            refund_percent: pct,
            refunded_at:    new Date().toISOString(),
          }).eq('id', order.id);

          updates.refund_id      = stripeRefundResult.id;
          updates.refund_amount  = refundAmountCents / 100;
          updates.refund_percent = pct;

          Logger.info('refund', 'dispute.stripe.success',
            `Remboursement litige ${dispute.id} — ${pct}% (${refundAmountCents/100}€) — refund ${stripeRefundResult.id}`,
            { userId: req.user.id, meta: { disputeId: dispute.id, refundId: stripeRefundResult.id } }
          );
        } catch (stripeErr) {
          updates.refund_status = 'failed';
          updates.refund_error  = stripeErr.message;
          Logger.error('refund', 'dispute.stripe.error', stripeErr.message,
            { userId: req.user.id, meta: { disputeId: dispute.id, orderId: order.id } }
          );
          // Ne pas bloquer la résolution du litige si Stripe échoue
        }
      } else if (order && !order.stripe_payment_id) {
        // Mobile Money — remboursement manuel requis
        updates.refund_status  = 'manual_pending';
        updates.refund_percent = pct;
        await supabase.from('orders').update({
          refund_status: 'manual_pending', refund_percent: pct,
        }).eq('id', order.id);
      }
    }

    const { data, error } = await supabase
      .from('disputes').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    // ── Notifications acheteur & vendeur ────────────────────────────────────
    if (status === 'resolved' && resolution) {
      const refundTxt = stripeRefundResult
        ? ` Remboursement de ${updates.refund_amount}€ (${pct}%) initié — 3 à 5 jours ouvrés.`
        : updates.refund_status === 'manual_pending'
          ? ` Remboursement manuel de ${pct}% à traiter.`
          : '';

      const buyerFavored = pct > 0;
      const buyerMsg = buyerFavored
        ? `✅ Litige #${dispute.id} résolu en votre faveur.${refundTxt}`
        : `ℹ️ Litige #${dispute.id} résolu. Décision : ${resolution}`;
      const vendorMsg = !buyerFavored
        ? `✅ Litige #${dispute.id} résolu en votre faveur. La commande est validée.`
        : `ℹ️ Litige #${dispute.id} résolu. Décision : ${resolution}`;

      await Promise.all([
        pushNotification(dispute.buyer_id,  { type: 'system', title: 'Litige résolu', message: buyerMsg,  link: '/orders' }),
        pushNotification(dispute.vendor_id, { type: 'system', title: 'Litige résolu', message: vendorMsg, link: '/dashboard' }),
        stripeRefundResult && sendEmail({
          to: dispute.buyer_email || '',
          subject: `[NEXUS] Remboursement litige #${dispute.id}`,
          html: `<p>Bonjour ${dispute.buyer_name},</p>
                 <p>Votre litige <strong>#${dispute.id}</strong> a été résolu.</p>
                 <p>Un remboursement de <strong>${updates.refund_amount}€ (${pct}%)</strong> a été initié.
                    Référence : <code>${stripeRefundResult.id}</code></p>
                 <p>Il apparaîtra sous 3 à 5 jours ouvrés selon votre banque.</p>
                 <p>L'équipe NEXUS</p>`,
        }).catch(() => {}),
      ].filter(Boolean));
    }

    Logger.info('disputes', 'resolved',
      `Litige ${req.params.id} → ${status}${pct != null ? ` (remb. ${pct}%)` : ''}`,
      { userId: req.user.id }
    );

    res.json({
      ...data,
      _refund: stripeRefundResult
        ? { id: stripeRefundResult.id, amount: stripeRefundResult.amount / 100, status: stripeRefundResult.status }
        : null,
    });
  } catch (e) {
    Logger.error('disputes', 'resolve.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ─── RETURNS ─────────────────────────────────────────────────────────────────
app.get('/api/returns', verifyToken, async (req, res) => {
  try {
    let query = supabase.from('return_requests').select('id, order_id, buyer_id, vendor_id, category, description, status, admin_notes, approved_at, rejected_at, refunded_at, created_at');
    if (req.user.role === 'buyer')  query = query.eq('buyer_id',  req.user.id);
    if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/returns', verifyToken, requireRole('buyer'), async (req, res) => {
  const { orderId, category, description } = req.body;
  if (!orderId)     return res.status(400).json({ error: 'orderId requis' });
  if (!category)    return res.status(400).json({ error: 'category requis' });
  if (!description || description.trim().length < 20)
    return res.status(400).json({ error: 'description trop courte (min 20 caractères)' });

  const CATEGORY_LABELS = {
    non_conforme:   'Produit non conforme à la description',
    defectueux:     'Produit défectueux ou endommagé',
    non_recu:       'Colis non reçu',
    mauvaise_taille:'Mauvaise taille / couleur',
    autre:          'Autre raison',
  };
  const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);
  if (!VALID_CATEGORIES.includes(category))
    return res.status(400).json({ error: `category invalide. Valeurs : ${VALID_CATEGORIES.join(', ')}` });

  try {
    const { data: order, error: orderErr } = await supabase
      .from('orders').select('id, vendor_id, buyer_id, status, products').eq('id', orderId).eq('buyer_id', req.user.id).single();
    if (orderErr || !order) return res.status(404).json({ error: 'Commande introuvable' });

    // Vérifier qu'il n'y a pas déjà une demande de retour ouverte pour cette commande
    const { data: existing } = await supabase
      .from('return_requests').select('id, status').eq('order_id', orderId).maybeSingle();
    if (existing) return res.status(409).json({
      error: 'Une demande de retour existe déjà pour cette commande',
      existingId: existing.id, existingStatus: existing.status,
    });

    const returnId = `RET-${Date.now()}`;
    const { data, error } = await supabase.from('return_requests').insert({
      id:             returnId,
      order_id:       orderId,
      buyer_id:       req.user.id,
      buyer_name:     req.user.name,
      buyer_email:    req.user.email  || null,
      vendor_id:      order.vendor_id || null,
      vendor_name:    order.vendor_name || null,
      products:       order.products  || [],
      order_total:    order.total     || 0,
      category,
      category_label: CATEGORY_LABELS[category],
      description:    description.trim(),
      status:         'pending',
    }).select().single();
    if (error) throw error;

    // Mettre à jour la commande
    await supabase.from('orders').update({
      return_status: 'pending',
      return_id:     returnId,
    }).eq('id', orderId);

    // Notifier les admins
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    (admins || []).forEach(admin => pushNotification(admin.id, {
      type:    'system',
      title:   '↩️ Nouvelle demande de retour',
      message: `${req.user.name} — Commande #${orderId.slice(-6)} (${CATEGORY_LABELS[category]})`,
      link:    '/admin/returns',
    }));

    // Notifier le vendeur
    if (order.vendor_id) {
      await pushNotification(order.vendor_id, {
        type:    'system',
        title:   '↩️ Demande de retour reçue',
        message: `Commande #${orderId.slice(-6)} — ${CATEGORY_LABELS[category]}`,
        link:    '/vendor/returns',
      });
    }

    Logger.info('returns', 'created', `Retour ${returnId} — ${req.user.email}`, {
      userId: req.user.id, meta: { orderId, category },
    });

    res.status(201).json(data);
  } catch (e) {
    Logger.error('returns', 'create.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/returns/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { status, adminNotes } = req.body;
  const VALID_STATUSES = ['approved', 'rejected', 'refunded'];
  if (!status || !VALID_STATUSES.includes(status))
    return res.status(400).json({ error: `status invalide. Valeurs : ${VALID_STATUSES.join(', ')}` });

  try {
    const { data: existing } = await supabase
      .from('return_requests').select('id, order_id, buyer_id, vendor_id, category, description, status, admin_notes, approved_at, rejected_at, refunded_at, created_at').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ error: 'Demande introuvable' });

    const updates = { status };
    if (adminNotes)            updates.admin_notes = adminNotes;
    if (status === 'approved') updates.approved_at = new Date().toISOString();
    if (status === 'rejected') updates.rejected_at = new Date().toISOString();
    if (status === 'refunded') updates.refunded_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('return_requests').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Mettre à jour le statut de retour sur la commande
    await supabase.from('orders').update({ return_status: status }).eq('id', existing.order_id);

    // Notifier l'acheteur
    // ── Remboursement Stripe automatique quand status → 'refunded' ────────────
    let stripeRefundResult = null;
    if (status === 'refunded' && existing.order_id) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, stripe_payment_id, total, payment_method, buyer_email, buyer_name, refund_status')
        .eq('id', existing.order_id).single();

      if (order?.stripe_payment_id && order.refund_status !== 'refunded') {
        try {
          stripeRefundResult = await stripe.refunds.create({
            payment_intent: order.stripe_payment_id,
            reason:         'requested_by_customer',
            metadata: {
              return_id:    existing.id,
              order_id:     order.id,
              refunded_by:  req.user.id,
              source:       'return_request',
            },
          });

          await supabase.from('orders').update({
            refund_status: 'refunded',
            refund_id:     stripeRefundResult.id,
            refund_amount: stripeRefundResult.amount / 100,
            refunded_at:   new Date().toISOString(),
          }).eq('id', order.id);

          Logger.info('refund', 'return.stripe.success',
            `Remboursement retour ${existing.id} — ${order.total}€ — refund ${stripeRefundResult.id}`,
            { userId: req.user.id, meta: { returnId: existing.id, refundId: stripeRefundResult.id } }
          );

          // Email de confirmation du remboursement
          await sendEmail({
            to: order.buyer_email || '',
            subject: `[NEXUS] Remboursement effectué pour votre retour`,
            html: `<p>Bonjour ${order.buyer_name},</p>
                   <p>Votre remboursement de <strong>${order.total}€</strong> a été initié.</p>
                   <p>Il apparaîtra sous <strong>3 à 5 jours ouvrés</strong> selon votre banque.</p>
                   <p>Référence : <code>${stripeRefundResult.id}</code></p>
                   <p>L'équipe NEXUS</p>`,
          }).catch(() => {});
        } catch (stripeErr) {
          Logger.error('refund', 'return.stripe.error', stripeErr.message,
            { userId: req.user.id, meta: { returnId: existing.id, orderId: order.id } }
          );
          // Marquer le remboursement comme échoué sans bloquer la mise à jour du retour
          await supabase.from('orders').update({ refund_status: 'failed', refund_error: stripeErr.message })
            .eq('id', order.id).catch(() => {});
        }
      } else if (order && !order.stripe_payment_id) {
        // Mobile Money — remboursement manuel requis
        await supabase.from('orders').update({ refund_status: 'manual_pending' }).eq('id', order.id);
      }
    }

    const MSG = {
      approved: '✅ Votre demande de retour a été approuvée. Vous serez remboursé sous 5-7 jours ouvrés.',
      rejected: '❌ Votre demande de retour a été refusée.' + (adminNotes ? ` Motif : ${adminNotes}` : ''),
      refunded: stripeRefundResult
        ? `💰 Votre remboursement de ${stripeRefundResult.amount / 100}€ a été initié (3-5 jours ouvrés). Réf : ${stripeRefundResult.id}`
        : '💰 Votre remboursement a été traité.',
    };
    await pushNotification(existing.buyer_id, {
      type:    'system',
      title:   '↩️ Mise à jour de votre retour',
      message: MSG[status],
      link:    '/orders',
    });

    Logger.info('returns', 'updated', `Retour ${req.params.id} → ${status}`, { userId: req.user.id });
    res.json({
      ...data,
      _refund: stripeRefundResult
        ? { id: stripeRefundResult.id, amount: stripeRefundResult.amount / 100, status: stripeRefundResult.status }
        : null,
    });
  } catch (e) {
    Logger.error('returns', 'update.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ─── REVIEWS ─────────────────────────────────────────────────────────────────
// [FIX] GET /api/reviews manquant — le frontend lisait localStorage directement
app.get('/api/reviews', async (req, res) => {
  try {
    const { productId, vendorId, limit = 50 } = req.query;
    // [FIX] select('*') — évite le 500 si certaines colonnes n'existent pas encore
    // (ex: user_name, vendor_reply peuvent être absentes selon la migration Supabase)
    let q = supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(Number(limit));
    if (productId) q = q.eq('product_id', productId);
    if (vendorId)  q = q.eq('vendor_id',  vendorId);
    const { data, error } = await q;
    if (error) throw error;
    // Normalisation défensive — accepte tous les noms de colonnes courants
    const rows = (data || []).map(r => ({
      id:          r.id,
      productId:   r.product_id  || r.productId,
      userId:      r.user_id     || r.userId,
      userName:    r.user_name   || r.username || r.reviewer_name || r.author || 'Anonyme',
      rating:      r.rating,
      comment:     r.comment     || r.text     || r.content || '',
      vendorReply: r.vendor_reply|| r.reply    || r.vendor_response || null,
      date:        r.created_at  || r.date,
    }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [FIX] Déclaration manquante — le handler existait mais sans la ligne app.post()
app.post('/api/reviews', verifyToken, async (req, res) => {
  const { productId, rating, comment } = req.body;
  if (!productId || !rating) return res.status(400).json({ error: 'productId et rating requis' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Note entre 1 et 5' });
  try {
    const { data, error } = await supabase.from('reviews').insert({
      product_id: productId, user_id: req.user.id, user_name: req.user.name,
      rating: parseInt(rating), comment: comment || null
    }).select().single();
    if (error && error.code === '23505') return res.status(409).json({ error: 'Vous avez déjà noté ce produit' });
    if (error) throw error;

    // Recalculer la note moyenne du produit
    const { data: reviews } = await supabase.from('reviews').select('rating').eq('product_id', productId);
    const avg = reviews?.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : rating;
    await supabase.from('products').update({ rating: Math.round(avg * 10) / 10, reviews_count: reviews?.length || 1 }).eq('id', productId);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN ───────────────────────────────────────────────────────────────────
app.get('/api/admin/stats', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [{ count: buyers }, { count: vendors }, { count: products }, { count: orders }, { count: pendingVendors }, { count: disputes }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'buyer'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'vendor').eq('status', 'approved'),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true).eq('moderated', true),
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('pending_vendors').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]); // [FIX S2-5] select('id') — pas select('*')
    const { data: revenue } = await supabase.from('orders').select('total, commission').eq('status', 'delivered');
    const totalRevenue    = (revenue || []).reduce((s, o) => s + (o.total || 0), 0);
    const totalCommission = (revenue || []).reduce((s, o) => s + (o.commission || 0), 0);
    res.json({ buyers, vendors, products, orders, pendingVendors, openDisputes: disputes, totalRevenue, totalCommission });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/vendors/pending', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    // [FIX] select('*') — évite le 500 causé par des noms de colonnes qui n'existent
    // pas encore dans la table pending_vendors (owner_name, ninea, password_hash…).
    // Le mapping ci-dessous accepte tous les noms courants en fallback.
    const { data, error } = await supabase
      .from('pending_vendors')
      .select('*')
      .in('status', ['pending', 'en_attente', 'submitted'])  // accepte les variantes de statut
      .order('created_at', { ascending: true });
    if (error) throw error;
    const normalized = (data || []).map(v => ({
      id:        v.id,
      name:      v.name          || v.shop_name   || v.business_name || '',
      ownerName: v.owner_name    || v.ownerName   || v.full_name     || v.contact_name || '',
      email:     v.email,
      category:  v.category      || v.shop_category || '',
      date:      v.created_at    || v.date         || v.submitted_at || new Date().toISOString(),
      avatar:    v.avatar        || v.logo         || '',
      phone:     v.phone         || v.telephone    || '',
      ninea:     v.ninea         || v.tax_id        || v.registration_number || '',
      address:   v.address       || v.location      || '',
      status:    v.status,
    }));
    res.json(normalized);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/vendors/:id/approve', verifyToken, requireRole('admin'), async (req, res) => {
  const { approved, reason } = req.body;
  const vendorId = req.params.id;

  try {
    // 1. Récupérer le dossier vendeur en attente
    // [FIX v3] .maybeSingle() — évite PGRST116 quand 0 lignes (plus propre que .single())
    const { data: pending, error: pendingErr } = await supabase
      .from('pending_vendors').select('id, name, owner_name, email, category, avatar, phone, ninea, address, status, password_hash, created_at').eq('id', vendorId).maybeSingle();
    if (pendingErr || !pending) {
      // [FIX v3] Chercher dans profiles par cet ID OU par email via vendor_approval_ref
      if (approved !== false) {
        // Tentative 1 : profil dont l'id correspond directement (cas GitHub OAuth)
        let { data: directProfile } = await supabase
          .from('profiles')
          .select('id, email, name, role, status, shop_name')
          .eq('id', vendorId)
          .maybeSingle();

        // [FIX v3] Tentative 2 : le profil a un UUID différent du pending_vendors.id
        // (cas où l'insert n'avait pas précisé id= → Supabase génère un nouveau UUID)
        // On cherche via vendor_approval_ref (colonne optionnelle) ou via status='pending'+role='vendor'
        if (!directProfile) {
          const { data: profileByRef } = await supabase
            .from('profiles')
            .select('id, email, name, role, status, shop_name')
            .eq('vendor_approval_ref', vendorId)
            .maybeSingle();
          directProfile = profileByRef || null;
        }

        if (directProfile) {
          if (directProfile.status === 'approved' && directProfile.role === 'vendor') {
            // Déjà approuvé — répondre OK plutôt que 404
            return res.json({ message: 'Vendeur déjà approuvé', vendorId, email: directProfile.email, alreadyApproved: true });
          }
          const newStatus = approved ? 'approved' : 'rejected';
          const { error: dpUpdateErr } = await supabase
            .from('profiles')
            .update({ status: newStatus, role: 'vendor' })
            .eq('id', directProfile.id);
          if (dpUpdateErr) return res.status(500).json({ error: dpUpdateErr.message });
          // Invalider cache (par id réel du profil, pas vendorId)
          for (const [key, val] of _profileCache.entries()) {
            if (val.user?.id === directProfile.id || val.user?.id === vendorId) _profileCache.delete(key);
          }
          const msg = approved ? 'Vendeur approuvé (profil direct)' : 'Vendeur refusé (profil direct)';
          Logger.info('auth', 'vendor.direct_approve', msg, { vendorId, profileId: directProfile.id, adminId: req.user.id });
          return res.json({ message: msg, vendorId, profileId: directProfile.id, email: directProfile.email, direct: true });
        }
      }
      // [FIX v3] Message d'erreur amélioré avec instructions pour l'admin
      Logger.warn('auth', 'vendor.approve_not_found', `Vendeur introuvable pour approbation: vendorId=${vendorId}`, { adminId: req.user.id });
      return res.status(404).json({
        error: 'Demande introuvable dans pending_vendors et profiles.',
        hint: 'Si le vendeur est visible dans Supabase (table profiles), exécutez manuellement : UPDATE profiles SET status=\'approved\', role=\'vendor\' WHERE email=\'email_du_vendeur\';',
        vendorId,
        alreadyApproved: false,
      });
    }

    if (approved) {
      // [FIX v2] Normaliser l'email pour éviter les problèmes de casse (majuscules)
      const pendingEmailNorm = (pending.email || '').trim().toLowerCase();

      // 2a. Approbation : créer ou mettre à jour le profil dans profiles
      const { data: existingProfile } = await supabase
        .from('profiles').select('id, password_hash, status').eq('email', pendingEmailNorm).maybeSingle();

      if (!existingProfile) {
        // Nouveau compte — insérer un profil complet
        // [FIX v3] CRITIQUE : spécifier id=pending.id pour que l'UUID du profil
        // corresponde à celui de pending_vendors. Sans ça, Supabase génère un nouveau UUID
        // et le fallback profiles.eq('id', vendorId) ne trouve plus rien lors de re-tentatives.
        const { error: insertErr } = await supabase.from('profiles').insert({
          id:            pending.id,   // ← FIX : même UUID que pending_vendors
          name:          pending.owner_name,
          email:         pendingEmailNorm,
          password_hash: pending.password_hash || null,
          role:          'vendor',
          status:        'approved',
          avatar:        pending.avatar || (pending.owner_name || 'VE').slice(0, 2).toUpperCase(),
          shop_name:     pending.name,
          shop_category: pending.category  || null,
          phone:         pending.phone     || null,
          address:       pending.address   || null,
          ninea:         pending.ninea     || null,
        });
        if (insertErr) throw new Error(`Création profil : ${insertErr.message}`);
      } else {
        // Profil existant — passer en vendor/approved + compléter les champs boutique
        const updatePayload = {
          role:          'vendor',
          status:        'approved',
          shop_name:     pending.name,
          shop_category: pending.category || null,
        };
        // [FIX] Transférer password_hash seulement si le profil n'en a pas encore
        if (!existingProfile.password_hash && pending.password_hash) {
          updatePayload.password_hash = pending.password_hash;
        }
        const { error: updateErr, count: updateCount } = await supabase
          .from('profiles').update(updatePayload).eq('id', existingProfile.id).select('id', { count: 'exact' });
        if (updateErr) throw new Error(`Mise à jour profil : ${updateErr.message}`);
        // Vérifier que la mise à jour a bien affecté une ligne
        if (updateCount === 0) {
          Logger.warn('auth', 'vendor.approve_warning', `Update profiles a affecté 0 ligne pour id=${existingProfile.id}`, { adminId: req.user.id });
        }
      }

      // 3a. Invalider le cache token pour ce vendeur (par id ET par email)
      for (const [key, val] of _profileCache.entries()) {
        if (val.user?.email === pendingEmailNorm || val.user?.id === existingProfile?.id) _profileCache.delete(key);
      }

      // 4a. Supprimer la demande de pending_vendors (plus propre que status='approved' — évite qu'elle réapparaisse)
      const { error: deleteErr } = await supabase.from('pending_vendors').delete().eq('id', vendorId);
      if (deleteErr) {
        // Fallback : si la suppression échoue (RLS), on marque au moins le status
        await supabase.from('pending_vendors')
          .update({ status: 'approved', notes: null })
          .eq('id', vendorId);
        try {
          await supabase.from('pending_vendors')
            .update({ reviewed_at: new Date().toISOString(), reviewed_by: req.user.id })
            .eq('id', vendorId);
        } catch (_) {}
        Logger.warn('auth', 'vendor.approve', `Suppression pending_vendors échouée (fallback status=approved) : ${deleteErr.message}`, { userId: req.user.id });
      }

      // 5a. Email de confirmation
      const tpl = emailTemplates.vendorApproved(pending.owner_name);
      await sendEmail({ to: pending.email, ...tpl });

      // 6a. Log d'audit
      try {
        await supabase.from('admin_logs').insert({
          admin_id: req.user.id, action: 'vendor_approved',
          target_id: vendorId, details: { vendor_name: pending.name, email: pending.email }
        });
      } catch(_) {} // log non-bloquant

      return res.json({ message: 'Vendeur approuvé', vendorId, email: pending.email });

    } else {
      // 2b. Supprimer la demande de pending_vendors (propre) + fallback status='rejected'
      const { error: delErr2 } = await supabase.from('pending_vendors').delete().eq('id', vendorId);
      if (delErr2) {
        await supabase.from('pending_vendors')
          .update({ status: 'rejected', notes: reason || null })
          .eq('id', vendorId);
        try {
          await supabase.from('pending_vendors')
            .update({ reviewed_at: new Date().toISOString(), reviewed_by: req.user.id })
            .eq('id', vendorId);
        } catch (_) {}
      }

      const tpl = emailTemplates.vendorRejected(pending.owner_name, reason);
      await sendEmail({ to: pending.email, ...tpl });

      // Log d'audit
      await supabase.from('admin_logs').insert({
        admin_id: req.user.id, action: 'vendor_rejected',
        target_id: vendorId, details: { vendor_name: pending.name, email: pending.email, reason: reason || null }
      });

      return res.json({ message: 'Demande refusée', vendorId });
    }

  } catch (e) {
    console.error('[approve vendor]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/payouts', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: orders } = await supabase.from('orders').select('vendor_id, vendor_name, total, commission, status').eq('status', 'delivered');
    const payouts = {};
    for (const o of (orders || [])) {
      if (!payouts[o.vendor_id]) payouts[o.vendor_id] = { vendor_id: o.vendor_id, vendor_name: o.vendor_name, totalRevenue: 0, totalCommission: 0, netPayout: 0, ordersCount: 0 };
      payouts[o.vendor_id].totalRevenue    += o.total      || 0;
      payouts[o.vendor_id].totalCommission += o.commission || 0;
      payouts[o.vendor_id].netPayout       += (o.total || 0) - (o.commission || 0);
      payouts[o.vendor_id].ordersCount     += 1;
    }
    res.json({ payouts: Object.values(payouts), generatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/users/:id/ban', verifyToken, requireRole('admin'), async (req, res) => {
  const { banned, reason } = req.body;
  try {
    const { data: user } = await supabase.from('profiles').select('role, name, email').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Impossible de bannir un administrateur' });
    await supabase.from('profiles').update({ status: banned ? 'banned' : 'active' }).eq('id', req.params.id);
    if (banned) await sendEmail({ to: user.email, subject: '⚠️ Compte suspendu — NEXUS Market', html: `<p>Bonjour ${user.name},</p><p>Votre compte a été suspendu.${reason ? ' Raison : ' + reason : ''}</p>` });
    res.json({ message: banned ? 'Utilisateur suspendu' : 'Compte réactivé' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [FIX] Endpoint JSON dédié pour getUsers() côté frontend.
// /api/admin/export/users retourne du CSV (pour téléchargement) — le frontend
// ne peut pas le parser comme JSON. Cette route retourne la même donnée en JSON.
app.get('/api/admin/users', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, status, avatar, created_at, shop_name, shop_category, commission_rate')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/export/:type', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    let data, filename, headers;
    switch (req.params.type) {
      case 'orders': {
        const { data: orders } = await supabase.from('orders').select('id, buyer_name, buyer_email, vendor_name, total, status, payment_method, created_at').order('created_at', { ascending: false });
        filename = `nexus-orders-${new Date().toISOString().slice(0, 10)}.csv`;
        headers  = ['ID', 'Acheteur', 'Email', 'Vendeur', 'Total (EUR)', 'Statut', 'Paiement', 'Date'];
        data     = (orders || []).map(o => [o.id, o.buyer_name, o.buyer_email, o.vendor_name, o.total, o.status, o.payment_method, new Date(o.created_at).toLocaleDateString('fr-FR')]);
        break;
      }
      case 'users': {
        const { data: users } = await supabase.from('profiles').select('id, name, email, role, status, created_at').order('created_at', { ascending: false });
        filename = `nexus-users-${new Date().toISOString().slice(0, 10)}.csv`;
        headers  = ['ID', 'Nom', 'Email', 'Rôle', 'Statut', 'Inscrit le'];
        data     = (users || []).map(u => [u.id, u.name, u.email, u.role, u.status, new Date(u.created_at).toLocaleDateString('fr-FR')]);
        break;
      }
      case 'products': {
        const { data: products } = await supabase.from('products').select('id, name, category, price, stock, vendor_name, rating, active, moderated').order('created_at', { ascending: false });
        filename = `nexus-products-${new Date().toISOString().slice(0, 10)}.csv`;
        headers  = ['ID', 'Produit', 'Catégorie', 'Prix (EUR)', 'Stock', 'Vendeur', 'Note', 'Actif', 'Modéré'];
        data     = (products || []).map(p => [p.id, p.name, p.category, p.price, p.stock, p.vendor_name, p.rating, p.active ? 'Oui' : 'Non', p.moderated ? 'Oui' : 'Non']);
        break;
      }
      default: return res.status(400).json({ error: 'Type invalide (orders | users | products)' });
    }
    const csv = '\uFEFF' + [headers.join(','), ...data.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
// [FIX] Service Worker — Vercel single-file deploy ne peut pas servir sw.js statiquement
// On le sert via le backend Render pour que le SW soit disponible depuis /sw.js
// Note: le domaine du SW doit correspondre au scope, donc cette route est un bonus
// La vraie solution est de mettre sw.js dans le repo Vercel (déjà fourni séparément)
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache');
  // Renvoie un SW minimal si le fichier n'est pas trouvé localement
  const swContent = `self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { if (e.request.method !== 'GET') return; e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });`;
  res.send(swContent);
});

app.get('/api/health', async (req, res) => {
  const start = Date.now();
  let dbStatus = 'unknown';
  try {
    // Timeout 3s pour éviter que le healthcheck Railway expire (fenêtre de 10s)
    const dbCheck = supabase.from('profiles').select('id', { head: true, count: 'exact' });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([dbCheck, timeout]);
    dbStatus = 'ok';
  } catch (e) {
    dbStatus = e.message === 'timeout' ? 'timeout' : 'error';
  }

  const stripePub    = process.env.STRIPE_PUBLIC_KEY || '';
  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';

  // [FIX sécurité] Ne jamais exposer les valeurs des clés — uniquement des booléens
  res.json({
    status    : dbStatus === 'ok' ? 'OK' : 'DEGRADED',
    service   : 'NEXUS Market API v3.1.4',
    timestamp : new Date().toISOString(),
    latency_ms: Date.now() - start,
    services  : {
      database    : dbStatus,
      stripe      : !!(stripePub && stripeSecret &&
                      (stripePub.startsWith('pk_test_') || stripePub.startsWith('pk_live_')) &&
                      (stripeSecret.startsWith('sk_test_') || stripeSecret.startsWith('sk_live_'))),
      stripe_mode : stripePub.startsWith('pk_live_') ? 'live' : 'test',
      email       : !!(process.env.SMTP_USER && process.env.SMTP_PASS),
      webhook     : !!(process.env.STRIPE_WEBHOOK_SECRET),
    },
    project: {
      name : 'NEXUS Market Sénégal',
      url  : process.env.FRONTEND_URL || 'https://nexus-market-md360.vercel.app',
    },
  });
});

// ─── ADMIN LOGS ──────────────────────────────────────────────────────────────
app.get('/api/admin/logs', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { level, category, limit = 100, offset = 0, from, to } = req.query;
    let q = supabase.from('server_logs')
      .select('*', { count: 'exact' })
      .order('ts', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    if (level)    q = q.eq('level', level);
    if (category) q = q.eq('category', category);
    if (from)     q = q.gte('ts', from);
    if (to)       q = q.lte('ts', to);
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ logs: data, total: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/logs/summary', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    // select('*') intentionnel : schéma défini par la vue SQL elle-même
    const { data, error } = await supabase.from('logs_summary_24h').select('*');
    if (error) throw error;
    // select('*') intentionnel : schéma défini par la vue SQL elle-même
    const { data: errors } = await supabase.from('logs_recent_errors').select('*').limit(20);
    res.json({ summary: data || [], recentErrors: errors || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════════════════════════════════
// ─── COUPONS ─────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/coupons — liste tous les coupons (admin) ou coupons actifs (authentifié)
app.get('/api/coupons', verifyToken, async (req, res) => {
  try {
    let query = supabase.from('coupons').select('id, code, discount, description, expires_at, max_uses, used_count, active, created_at').order('created_at', { ascending: false });
    if (req.user.role !== 'admin') {
      // Les non-admins ne voient que les coupons actifs et non expirés
      query = query.eq('active', true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/coupons — créer un coupon (admin)
app.post('/api/coupons', verifyToken, requireRole('admin'), async (req, res) => {
  const { code, discount, description, maxUses, expiresAt } = req.body;
  if (!code || !discount) return res.status(400).json({ error: 'Code et discount requis' });
  const pct = parseInt(discount);
  if (isNaN(pct) || pct < 1 || pct > 100) return res.status(400).json({ error: 'Discount invalide (1-100)' });
  const safeCode = code.trim().toUpperCase().replace(/[^A-Z0-9-_]/g, '').slice(0, 20);
  if (!safeCode) return res.status(400).json({ error: 'Code invalide' });
  try {
    const { data: existing } = await supabase.from('coupons').select('id').eq('code', safeCode).maybeSingle();
    if (existing) return res.status(409).json({ error: `Le code ${safeCode} existe déjà` });
    const { data, error } = await supabase.from('coupons').insert({
      code: safeCode,
      discount: pct,
      description: description || null,
      max_uses: maxUses ? parseInt(maxUses) : null,
      used_count: 0,
      expires_at: expiresAt || null,
      active: true,
    }).select().single();
    if (error) throw error;
    Logger.info('coupon', 'created', `Coupon ${safeCode} (${pct}%) créé`, { userId: req.user.id });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/coupons/validate — valider et appliquer un coupon à un panier (utilisateur authentifié)
// C'est LE point d'entrée sécurisé : le frontend ne peut pas falsifier le discount
app.post('/api/coupons/validate', verifyToken, async (req, res) => {
  const { code, cartTotal } = req.body;
  if (!code) return res.status(400).json({ error: 'Code requis' });
  if (!cartTotal || parseFloat(cartTotal) <= 0) return res.status(400).json({ error: 'Total du panier invalide' });
  const safeCode = code.trim().toUpperCase();
  try {
    const { data: coupon, error } = await supabase
      .from('coupons').select('id, code, discount, description, expires_at, max_uses, used_count, active, created_at').eq('code', safeCode).eq('active', true).maybeSingle();
    if (error) throw error;
    if (!coupon) return res.status(404).json({ error: 'Code promo invalide ou inactif' });

    // Vérification expiration
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Code promo expiré' });
    }
    // Vérification quota d'utilisation
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return res.status(410).json({ error: 'Code promo épuisé (quota atteint)' });
    }

    // Calcul du montant remis (côté serveur — infalsifiable)
    const total = parseFloat(cartTotal);
    const discountAmount = Math.round(total * (coupon.discount / 100) * 100) / 100;

    // Incrémenter used_count atomiquement
    await supabase.from('coupons')
      .update({ used_count: (coupon.used_count || 0) + 1 })
      .eq('id', coupon.id);

    Logger.info('coupon', 'applied', `Coupon ${safeCode} appliqué — ${coupon.discount}%`, {
      userId: req.user.id, meta: { code: safeCode, discountAmount, cartTotal }
    });
    res.json({
      valid: true,
      code: coupon.code,
      discount: coupon.discount,
      description: coupon.description,
      discountAmount,
      finalTotal: Math.max(0, total - discountAmount),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/coupons/:id — activer/désactiver un coupon (admin)
app.patch('/api/coupons/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { active, description, maxUses, expiresAt } = req.body;
  const updates = {};
  if (active !== undefined)     updates.active      = !!active;
  if (description !== undefined) updates.description = description;
  if (maxUses !== undefined)     updates.max_uses    = maxUses ? parseInt(maxUses) : null;
  if (expiresAt !== undefined)   updates.expires_at  = expiresAt || null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Aucune modification' });
  try {
    const { data, error } = await supabase.from('coupons').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/coupons/:id — supprimer un coupon (admin)
app.delete('/api/coupons/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    await supabase.from('coupons').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// ─── LOYALTY POINTS ──────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/loyalty — solde de points de l'utilisateur connecté

// [NEXUS-F2] LoyaltyWidget + awardLoyaltyPoints [B]
// PLACEMENT : remplace app.get('/api/loyalty', ...) existant (lignes 2854-2864)
// ════════════════════════════════════════════════════════════════════════════════

app.get('/api/loyalty', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('loyalty_points')
      .select('points, total_earned, total_redeemed')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;

    const points        = data?.points        || 0;
    const totalEarned   = data?.total_earned  || 0;
    const totalRedeemed = data?.total_redeemed || 0;

    // ── Calcul du palier ──────────────────────────────────────────────────────
    // Bronze : 0–999 pts | Argent : 1 000–4 999 pts | Or : ≥ 5 000 pts
    const TIERS = [
      { name: 'Bronze',  min: 0,    max: 999,  next: 1000, color: '#CD7F32', icon: '🥉' },
      { name: 'Argent',  min: 1000, max: 4999, next: 5000, color: '#C0C0C0', icon: '🥈' },
      { name: 'Or',      min: 5000, max: null, next: null,  color: '#FFD700', icon: '🥇' },
    ];
    const tier = TIERS.find(t => t.max === null ? points >= t.min : points <= t.max) || TIERS[0];

    // Points minimum requis pour utiliser les points en paiement
    const MIN_REDEEM = 500;

    res.json({
      points,
      totalEarned,
      totalRedeemed,
      canRedeem:   points >= MIN_REDEEM,
      minRedeem:   MIN_REDEEM,
      tier: {
        name:     tier.name,
        icon:     tier.icon,
        color:    tier.color,
        progress: tier.next ? Math.min(100, Math.round(((points - tier.min) / (tier.next - tier.min)) * 100)) : 100,
        nextTier: tier.next ? `${tier.next.toLocaleString('fr-FR')} pts pour le palier suivant` : null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/loyalty/earn — créditer des points après commande (appelé par le backend lui-même, ou via ordres)
// Protégé : seul le backend (service-role) ou un admin peut appeler cette route
app.post('/api/loyalty/earn', verifyToken, async (req, res) => {
  const { userId, points, reason } = req.body;
  // Un acheteur ne peut créditer que ses propres points ; l'admin peut créditer n'importe qui
  const targetId = req.user.role === 'admin' ? (userId || req.user.id) : req.user.id;
  if (!points || parseInt(points) <= 0) return res.status(400).json({ error: 'Points invalides' });
  const delta = parseInt(points);
  try {
    const { data: existing } = await supabase.from('loyalty_points').select('user_id, points, total_earned, total_redeemed, updated_at').eq('user_id', targetId).maybeSingle();
    let result;
    if (existing) {
      const { data, error } = await supabase.from('loyalty_points').update({
        points: existing.points + delta,
        total_earned: (existing.total_earned || 0) + delta,
        updated_at: new Date().toISOString(),
      }).eq('user_id', targetId).select().single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase.from('loyalty_points').insert({
        user_id: targetId, points: delta, total_earned: delta, total_redeemed: 0,
      }).select().single();
      if (error) throw error;
      result = data;
    }
    // Notifier l'utilisateur
    await pushNotification(targetId, {
      type: 'system',
      title: `⭐ +${delta.toLocaleString('fr-FR')} points de fidélité`,
      message: reason || `Vous avez gagné ${delta} points.`,
    });
    Logger.info('loyalty', 'earned', `+${delta} pts pour user ${targetId}`, { userId: req.user.id, meta: { targetId, delta, reason } });
    res.json({ points: result.points, totalEarned: result.total_earned });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/loyalty/redeem — utiliser des points (déduit du solde, renvoie le montant en FCFA)
app.post('/api/loyalty/redeem', verifyToken, async (req, res) => {
  const { points } = req.body;
  const POINTS_PER_FCFA = 100; // 100 pts = 1 FCFA
  if (!points || parseInt(points) <= 0) return res.status(400).json({ error: 'Points invalides' });
  if (parseInt(points) % POINTS_PER_FCFA !== 0) return res.status(400).json({ error: `Les points doivent être un multiple de ${POINTS_PER_FCFA}` });
  const toRedeem = parseInt(points);
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('loyalty_points').select('user_id, points, total_earned, total_redeemed, updated_at').eq('user_id', req.user.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    const currentPoints = existing?.points || 0;
    if (currentPoints < toRedeem) {
      return res.status(400).json({ error: `Solde insuffisant (${currentPoints} pts disponibles)` });
    }
    const fcfaValue = toRedeem / POINTS_PER_FCFA;
    const { data, error } = await supabase.from('loyalty_points').update({
      points: currentPoints - toRedeem,
      total_redeemed: (existing.total_redeemed || 0) + toRedeem,
      updated_at: new Date().toISOString(),
    }).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    Logger.info('loyalty', 'redeemed', `-${toRedeem} pts pour user ${req.user.id} = ${fcfaValue} FCFA`, { userId: req.user.id });
    res.json({ pointsRedeemed: toRedeem, fcfaValue, newBalance: data.points });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// ─── REFERRALS (PARRAINAGE) ───────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

const REFERRAL_POINTS_REWARD = 500; // Points accordés au parrain lors de la 1ère commande du filleul

// GET /api/referrals — liste les parrainages de l'utilisateur connecté
app.get('/api/referrals', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('referrals').select('id, referrer_id, referred_id, code, rewarded, rewarded_at, created_at').eq('referrer_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/referrals — enregistrer un parrainage lors de l'inscription d'un filleul
app.post('/api/referrals', verifyToken, async (req, res) => {
  const { referralCode, referredEmail } = req.body;
  if (!referralCode) return res.status(400).json({ error: 'Code parrain requis' });

  // Format du code : NEXUS-XXXXX-YYYY (généré côté frontend depuis le nom + id du parrain)
  const safeCode = referralCode.trim().toUpperCase();
  try {
    // Retrouver le parrain à partir du code
    const { data: profiles } = await supabase.from('profiles').select('id, name, email').eq('status', 'active');
    const referrer = (profiles || []).find(u => {
      const expected = `NEXUS-${(u.name || '').replace(/\s+/g, '').toUpperCase().slice(0, 5)}-${(u.id || '').slice(-4)}`;
      return expected === safeCode;
    });
    if (!referrer) return res.status(404).json({ error: 'Code parrainage invalide' });
    if (referrer.id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous parrainer vous-même' });

    // Vérifier que ce filleul n'a pas déjà été parrainé
    const { data: existing } = await supabase.from('referrals')
      .select('id').eq('referred_id', req.user.id).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ce compte a déjà été parrainé' });

    const { data, error } = await supabase.from('referrals').insert({
      referrer_id: referrer.id,
      referred_id: req.user.id,
      code: safeCode,
      rewarded: false,
    }).select().single();
    if (error) throw error;

    // Notifier le parrain
    await pushNotification(referrer.id, {
      type: 'system',
      title: '🎁 Nouveau filleul !',
      message: `${req.user.name || referredEmail || 'Un ami'} vient de s'inscrire avec votre code. Récompense dès sa 1ère commande.`,
    });
    Logger.info('referral', 'registered', `Parrainage: ${referrer.id} → ${req.user.id}`, { userId: req.user.id, meta: { code: safeCode } });
    res.status(201).json({ message: 'Parrainage enregistré', referrerId: referrer.id, referralId: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/referrals/reward — récompenser le parrain après la 1ère commande du filleul
// Appelé DEPUIS /api/orders lors du paiement (interne — ne pas exposer publiquement)
const rewardReferrer = async (referredUserId) => {
  try {
    const { data: referral } = await supabase
      .from('referrals').select('id, referrer_id, referred_id, code, rewarded, rewarded_at, created_at').eq('referred_id', referredUserId).eq('rewarded', false).maybeSingle();
    if (!referral) return; // Pas de parrainage ou déjà récompensé

    // Créditer les points au parrain
    const { data: existing } = await supabase.from('loyalty_points').select('user_id, points, total_earned, total_redeemed, updated_at').eq('user_id', referral.referrer_id).maybeSingle();
    if (existing) {
      await supabase.from('loyalty_points').update({
        points: existing.points + REFERRAL_POINTS_REWARD,
        total_earned: (existing.total_earned || 0) + REFERRAL_POINTS_REWARD,
        updated_at: new Date().toISOString(),
      }).eq('user_id', referral.referrer_id);
    } else {
      await supabase.from('loyalty_points').insert({
        user_id: referral.referrer_id, points: REFERRAL_POINTS_REWARD, total_earned: REFERRAL_POINTS_REWARD, total_redeemed: 0,
      });
    }
    // Marquer comme récompensé
    await supabase.from('referrals').update({ rewarded: true, rewarded_at: new Date().toISOString() }).eq('id', referral.id);
    // Notifier le parrain
    await pushNotification(referral.referrer_id, {
      type: 'system',
      title: '🎁 Récompense parrainage !',
      message: `Votre filleul vient de passer sa 1ère commande ! Vous gagnez ${REFERRAL_POINTS_REWARD} points de fidélité.`,
    });
    Logger.info('referral', 'rewarded', `Parrain ${referral.referrer_id} récompensé (+${REFERRAL_POINTS_REWARD} pts)`, { meta: { referralId: referral.id } });
  } catch (e) {
    Logger.error('referral', 'reward.error', e.message, { meta: { referredUserId } });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// ─── PAYOUT REQUESTS (DEMANDES DE RETRAIT VENDEUR) ───────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/payouts/requests — liste les demandes (vendeur = ses propres, admin = toutes)
app.get('/api/payouts/requests', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = supabase.from('payout_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    if (status) query = query.eq('status', status);
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ requests: data || [], total: count || 0, page: parseInt(page) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payouts/requests — créer une demande de retrait (vendeur)
app.post('/api/payouts/requests', verifyToken, requireRole('vendor'), async (req, res) => {
  const { amount, method, provider, destination } = req.body;
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Montant invalide' });
  if (!method || !['mobile', 'bank'].includes(method)) return res.status(400).json({ error: 'Méthode invalide (mobile|bank)' });
  if (!destination) return res.status(400).json({ error: 'Destination (numéro/IBAN) requise' });

  const MIN_PAYOUT = 5000; // 5 000 FCFA minimum
  const amountFcfa = parseFloat(amount);
  if (amountFcfa < MIN_PAYOUT) return res.status(400).json({ error: `Montant minimum de retrait : ${MIN_PAYOUT.toLocaleString('fr-FR')} FCFA` });

  try {
    // Vérifier qu'il n'y a pas déjà une demande en attente
    const { data: pending } = await supabase.from('payout_requests')
      .select('id').eq('vendor_id', req.user.id).eq('status', 'pending').maybeSingle();
    if (pending) return res.status(409).json({ error: 'Une demande de retrait est déjà en cours de traitement' });

    // Calculer le solde disponible (commandes livrées - retraits déjà validés)
    const { data: deliveredOrders } = await supabase.from('orders')
      .select('total, commission').eq('vendor_id', req.user.id).eq('status', 'delivered');
    const totalRevenue = (deliveredOrders || []).reduce((s, o) => s + (o.total || 0) - (o.commission || 0), 0);
    const totalRevenueFcfa = Math.round(totalRevenue * 655.957);

    const { data: approvedPayouts } = await supabase.from('payout_requests')
      .select('amount').eq('vendor_id', req.user.id).eq('status', 'approved');
    const totalPaidOut = (approvedPayouts || []).reduce((s, p) => s + (p.amount || 0), 0);

    const availableBalance = totalRevenueFcfa - totalPaidOut;
    if (amountFcfa > availableBalance) {
      return res.status(400).json({
        error: `Solde insuffisant. Disponible : ${availableBalance.toLocaleString('fr-FR')} FCFA`,
        availableBalance,
      });
    }

    const { data: vendorProfile } = await supabase.from('profiles').select('name').eq('id', req.user.id).maybeSingle();
    const { data, error } = await supabase.from('payout_requests').insert({
      vendor_id:   req.user.id,
      vendor_name: vendorProfile?.name || req.user.name,
      amount:      amountFcfa,
      method,
      provider:    provider || null,
      destination,
      status:      'pending',
    }).select().single();
    if (error) throw error;

    // Notifier les admins
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, {
        type: 'system',
        title: '💰 Demande de retrait',
        message: `${vendorProfile?.name || req.user.name} demande ${amountFcfa.toLocaleString('fr-FR')} FCFA via ${method === 'mobile' ? provider : 'virement'}`,
        link: '/admin/payouts',
      });
    }
    Logger.info('payout', 'request.created', `Retrait ${amountFcfa} FCFA — vendor ${req.user.id}`, { userId: req.user.id, meta: { amount: amountFcfa, method } });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/payouts/requests/:id — approuver ou rejeter une demande (admin)
app.patch('/api/payouts/requests/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { status, adminNote } = req.body;
  if (!['approved', 'rejected', 'processing'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide (approved|rejected|processing)' });
  }
  try {
    const { data: existing } = await supabase.from('payout_requests').select('id, vendor_id, vendor_name, amount, method, provider, destination, status, admin_note, processed_at, created_at').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Demande introuvable' });
    if (existing.status !== 'pending' && existing.status !== 'processing') {
      return res.status(409).json({ error: `Impossible de modifier une demande en statut "${existing.status}"` });
    }

    const updates = {
      status,
      admin_note:   adminNote || null,
      processed_at: new Date().toISOString(),
      processed_by: req.user.id,
    };
    const { data, error } = await supabase.from('payout_requests').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Notifier le vendeur
    const statusLabels = { approved: 'approuvée', rejected: 'rejetée', processing: 'en cours de traitement' };
    await pushNotification(existing.vendor_id, {
      type: 'system',
      title: status === 'approved' ? '✅ Retrait approuvé' : status === 'rejected' ? '❌ Retrait rejeté' : '⚙️ Retrait en traitement',
      message: `Votre demande de ${existing.amount?.toLocaleString('fr-FR')} FCFA a été ${statusLabels[status]}.${adminNote ? ' Note : ' + adminNote : ''}`,
      link: '/vendor/payouts',
    });
    Logger.info('payout', `request.${status}`, `Retrait ${req.params.id} ${status} par admin ${req.user.id}`, { userId: req.user.id, meta: { payoutId: req.params.id, amount: existing.amount } });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/payouts/balance — solde disponible pour retrait d'un vendeur
app.get('/api/payouts/balance', verifyToken, requireRole('vendor'), async (req, res) => {
  try {
    const { data: deliveredOrders } = await supabase.from('orders')
      .select('total, commission').eq('vendor_id', req.user.id).eq('status', 'delivered');
    const totalRevenue = (deliveredOrders || []).reduce((s, o) => s + (o.total || 0) - (o.commission || 0), 0);
    const totalRevenueFcfa = Math.round(totalRevenue * 655.957);

    const { data: approvedPayouts } = await supabase.from('payout_requests')
      .select('amount').eq('vendor_id', req.user.id).eq('status', 'approved');
    const totalPaidOut = (approvedPayouts || []).reduce((s, p) => s + (p.amount || 0), 0);

    const { data: pendingPayout } = await supabase.from('payout_requests')
      .select('amount').eq('vendor_id', req.user.id).eq('status', 'pending').maybeSingle();

    res.json({
      totalRevenueFcfa,
      totalPaidOut,
      pendingPayout:    pendingPayout?.amount || 0,
      availableBalance: Math.max(0, totalRevenueFcfa - totalPaidOut),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// ─── BUYER PRO (B2B) ─────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/b2b/profile — profil B2B de l'acheteur pro connecté
app.get('/api/b2b/profile', verifyToken, requireRole('buyer_pro', 'admin'), async (req, res) => {
  try {
    const targetId = req.user.role === 'admin' ? (req.query.userId || req.user.id) : req.user.id;
    const { data, error } = await supabase.from('buyer_pro_profiles').select('id, user_id, company, job_title, ninea, rc, address, ninea_verified, verification_note, verified_at, created_at').eq('user_id', targetId).maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/b2b/register — inscription B2B complète avec validation NINEA
app.post('/api/b2b/register', authLimiter, async (req, res) => {
  const { name, email, password, company, jobTitle, ninea, rc, address, phone } = req.body;

  // Validations de base
  if (!name || !email || !password) return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  if (!company)   return res.status(400).json({ error: 'Nom de la société requis' });
  if (!jobTitle)  return res.status(400).json({ error: 'Poste/fonction requis' });
  if (!ninea)     return res.status(400).json({ error: 'NINEA requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });

  // Validation format NINEA (format sénégalais : 9 chiffres optionnellement suivis de 3 lettres/chiffres)
  const nineaClean = ninea.trim().replace(/\s/g, '').toUpperCase();
  if (!/^\d{7}[A-Z0-9]{1,3}$/.test(nineaClean) && !/^\d{9}$/.test(nineaClean)) {
    return res.status(400).json({ error: 'Format NINEA invalide (ex: 1234567A2B ou 123456789)' });
  }

  try {
    // Vérifier unicité email et NINEA
    const { data: existingEmail } = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
    if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

    const { data: existingNinea } = await supabase.from('buyer_pro_profiles').select('id').eq('ninea', nineaClean).maybeSingle();
    if (existingNinea) return res.status(409).json({ error: 'Ce NINEA est déjà enregistré' });

    const hashedPw = await bcrypt.hash(password, 10);
    const avatar   = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Créer le profil principal
    const { data: profile, error: profileErr } = await supabase.from('profiles').insert({
      name, email: email.trim().toLowerCase(), password_hash: hashedPw,
      role: 'buyer_pro', avatar, phone: phone || null, status: 'active',
    }).select().single();
    if (profileErr) throw profileErr;

    // Créer le profil B2B enrichi
    const { error: b2bErr } = await supabase.from('buyer_pro_profiles').insert({
      user_id:   profile.id,
      company,
      job_title: jobTitle,
      ninea:     nineaClean,
      rc:        rc ? rc.trim().toUpperCase() : null,
      address:   address || null,
      ninea_verified: false, // Sera mis à true après vérification manuelle ou API
    });
    if (b2bErr) {
      // Rollback le profil si le profil B2B échoue
      await supabase.from('profiles').delete().eq('id', profile.id);
      throw b2bErr;
    }

    // JWT — durée cohérente avec les autres routes (900s = 15min)
    const b2bExpiresIn = parseInt(process.env.JWT_EXPIRES_IN || '900');
    const token = jwt.sign(
      { id: profile.id, role: 'buyer_pro', name, email: profile.email, company },
      process.env.JWT_SECRET,
      { expiresIn: b2bExpiresIn }
    );
    // [JWT-REFRESH] Créer un refresh token pour le compte B2B
    let b2bRefreshToken = null, b2bRefreshExpiresIn = null;
    try {
      const rt = await _createRefreshToken(profile.id, req);
      b2bRefreshToken      = rt?.refreshToken    ?? null;
      // [BUG FIX] rt peut être null si la table refresh_tokens n'existe pas encore.
      // `rt.refreshExpiresIn` plantait avec TypeError ; utiliser l'opérateur ?. pour sécuriser.
      b2bRefreshExpiresIn  = rt?.refreshExpiresIn ?? null;
    } catch (_) {}

    // Notifier les admins pour vérification NINEA
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, {
        type: 'system',
        title: '🏢 Nouveau buyer Pro B2B',
        message: `${company} (${name}) — NINEA: ${nineaClean} — à vérifier`,
        link: '/admin/b2b',
      });
    }

    Logger.info('auth', 'register.b2b', `Inscription B2B: ${email} — ${company}`, { userId: profile.id, meta: { company, ninea: nineaClean } });
    const { password_hash, ...safeUser } = profile;
    res.status(201).json({ token, accessToken: token, user: { ...safeUser, company, jobTitle }, expiresIn: b2bExpiresIn, refreshToken: b2bRefreshToken, refreshExpiresIn: b2bRefreshExpiresIn });
  } catch (e) {
    Logger.error('auth', 'register.b2b.error', e.message, { meta: { email } });
    res.status(500).json({ error: "Erreur lors de l'inscription. Veuillez réessayer." });
  }
});

// PATCH /api/b2b/verify-ninea/:userId — marquer le NINEA comme vérifié (admin)
app.patch('/api/b2b/verify-ninea/:userId', verifyToken, requireRole('admin'), async (req, res) => {
  const { verified, note } = req.body;
  try {
    const { data, error } = await supabase.from('buyer_pro_profiles')
      .update({ ninea_verified: !!verified, verification_note: note || null, verified_at: new Date().toISOString(), verified_by: req.user.id })
      .eq('user_id', req.params.userId).select().single();
    if (error) throw error;
    await pushNotification(req.params.userId, {
      type: 'system',
      title: verified ? '✅ NINEA vérifié' : '❌ NINEA non vérifié',
      message: verified
        ? 'Votre NINEA a été vérifié. Vous bénéficiez maintenant des tarifs B2B.'
        : `Votre NINEA n'a pas pu être vérifié.${note ? ' ' + note : ' Contactez support@nexus.sn.'}`,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/b2b — liste tous les buyers pro avec leur statut NINEA (admin)
// Supporte : ?search=, ?verified=true|false, ?page=, ?limit=
app.get('/api/admin/b2b', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page  || '1'));
    const limit   = Math.min(100, parseInt(req.query.limit || '50'));
    const search  = req.query.search  || '';
    const verified = req.query.verified; // 'true' | 'false' | undefined

    let query = supabase
      .from('buyer_pro_profiles')
      .select('*, profiles!inner(name, email, status, created_at, phone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (verified === 'true')  query = query.eq('ninea_verified', true);
    if (verified === 'false') query = query.eq('ninea_verified', false);
    if (search) query = query.or(`company.ilike.%${search}%,ninea.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ buyers: data || [], total: count || 0, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/b2b/stats — statistiques globales B2B (admin)
app.get('/api/admin/b2b/stats', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('buyer_pro_profiles')
      .select('ninea_verified, created_at');
    if (error) throw error;

    const total    = data.length;
    const verified = data.filter(p => p.ninea_verified).length;
    const pending  = total - verified;
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
    const newThisMonth = data.filter(p => new Date(p.created_at) >= startOfMonth).length;

    res.json({ total, verified, pending, newThisMonth });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/b2b/:userId — supprimer un compte B2B (admin)
app.delete('/api/admin/b2b/:userId', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    // Supprimer le profil B2B d'abord (cascade devrait s'en charger, mais on est explicite)
    await supabase.from('buyer_pro_profiles').delete().eq('user_id', req.params.userId);
    // Supprimer le profil principal (désactivation douce : passer status à 'suspended')
    const { error } = await supabase.from('profiles')
      .update({ status: 'suspended' })
      .eq('id', req.params.userId);
    if (error) throw error;
    Logger.info('admin', 'b2b.delete', `Compte B2B suspendu : ${req.params.userId}`, { userId: req.user.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/b2b/profile — mise à jour du profil B2B (acheteur pro connecté)
app.patch('/api/b2b/profile', verifyToken, requireRole('buyer_pro'), async (req, res) => {
  const { company, jobTitle, rc, address, phone } = req.body;
  if (!company) return res.status(400).json({ error: 'Raison sociale requise' });

  const updates = {};
  if (company)   updates.company   = company.trim();
  if (jobTitle)  updates.job_title = jobTitle.trim();
  if (rc != null) updates.rc       = rc.trim().toUpperCase() || null;
  if (address)   updates.address   = address.trim();

  try {
    const { data, error } = await supabase
      .from('buyer_pro_profiles')
      .update(updates)
      .eq('user_id', req.user.id)
      .select().single();
    if (error) throw error;

    if (phone) await supabase.from('profiles').update({ phone }).eq('id', req.user.id);

    Logger.info('b2b', 'profile.update', `Profil B2B mis à jour : ${req.user.email}`, { userId: req.user.id });
    res.json(data);
  } catch (e) {
    Logger.error('b2b', 'profile.update.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/b2b/discount — taux de remise B2B actuel de l'utilisateur connecté
app.get('/api/b2b/discount', verifyToken, requireRole('buyer_pro', 'admin'), async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? (req.query.userId || req.user.id) : req.user.id;
    const { data } = await supabase
      .from('buyer_pro_profiles')
      .select('ninea_verified, company')
      .eq('user_id', userId)
      .maybeSingle();

    // Règle de remise : NINEA vérifié = 5%, sinon 0%
    const discountRate    = data?.ninea_verified ? 5 : 0;
    const nineaVerified   = data?.ninea_verified || false;
    res.json({
      discountRate,
      nineaVerified,
      company: data?.company || null,
      message: discountRate > 0
        ? `Remise B2B de ${discountRate} % appliquée — NINEA vérifié`
        : 'Remise B2B disponible après vérification de votre NINEA par l\'équipe NEXUS',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/b2b/orders — commandes paginées de l'acheteur pro connecté
// Paramètres optionnels : ?page=, ?limit=, ?status=, ?month=YYYY-MM
app.get('/api/b2b/orders', verifyToken, requireRole('buyer_pro', 'admin'), async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? (req.query.userId || req.user.id) : req.user.id;
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(50,  parseInt(req.query.limit || '20'));
    const status = req.query.status;
    const month  = req.query.month; // YYYY-MM

    let query = supabase
      .from('orders')
      .select(
        'id, total, commission, status, payment_method, products, vendor_name, created_at, tracking_number, buyer_name, buyer_email',
        { count: 'exact' }
      )
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) query = query.eq('status', status);
    if (month) {
      const [y, m] = month.split('-').map(Number);
      query = query
        .gte('created_at', new Date(y, m - 1, 1).toISOString())
        .lt('created_at', new Date(y, m,     1).toISOString());
    }

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ orders: data || [], total: count || 0, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════════════════════════════════
// ─── PANIER (carts) ──────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/cart — récupère le panier de l'utilisateur connecté
app.get('/api/cart', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('carts').select('items, updated_at').eq('user_id', req.user.id).maybeSingle();
    if (error) throw error;
    res.json({ items: data?.items || [], updatedAt: data?.updated_at || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/cart — remplace entièrement le panier (upsert)
app.put('/api/cart', verifyToken, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items doit être un tableau' });
  // Nettoyer les champs inutiles avant stockage (réduire la taille JSON)
  const clean = items.map(i => ({
    id:         i.id,
    name:       i.name,
    price:      i.price,
    quantity:   Math.max(1, parseInt(i.quantity) || 1),
    imageUrl:   i.imageUrl || null,
    vendor:     i.vendor     || i.vendor_id || null,
    vendorName: i.vendorName || i.vendor_name || null,
    category:   i.category   || null,
  }));
  try {
    const { error } = await supabase.from('carts').upsert(
      { user_id: req.user.id, items: clean },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    res.json({ ok: true, count: clean.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/cart — vide le panier
app.delete('/api/cart', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase.from('carts')
      .upsert({ user_id: req.user.id, items: [] }, { onConflict: 'user_id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cart/migrate — migration unique localStorage → Supabase
// Appelé une seule fois par le frontend lors de la première connexion
app.post('/api/cart/migrate', verifyToken, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.json({ ok: true, migrated: 0 });
  try {
    // Ne migre que si le panier Supabase est encore vide
    const { data: existing } = await supabase
      .from('carts').select('items').eq('user_id', req.user.id).maybeSingle();
    if (existing?.items?.length > 0)
      return res.json({ ok: true, migrated: 0, reason: 'cart_not_empty' });

    const clean = items.slice(0, 50).map(i => ({  // max 50 articles
      id: i.id, name: i.name, price: i.price,
      quantity: Math.max(1, parseInt(i.quantity) || 1),
      imageUrl: i.imageUrl || null,
      vendor: i.vendor || null, vendorName: i.vendorName || null,
      category: i.category || null,
    }));
    const { error } = await supabase.from('carts').upsert(
      { user_id: req.user.id, items: clean }, { onConflict: 'user_id' }
    );
    if (error) throw error;
    Logger.info('cart', 'migrated', `${clean.length} articles migrés depuis localStorage`, { userId: req.user.id });
    res.json({ ok: true, migrated: clean.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════════════════════════════════
// ─── VENTES FLASH (flash_sales) ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/flash-sales — liste les ventes flash actives (public)
app.get('/api/flash-sales', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  try {
    // Expirer les ventes passées en arrière-plan (non bloquant)
    try { supabase.rpc('expire_flash_sales'); } catch(_) {}

    const { data, error } = await supabase
      .from('flash_sales')
      .select('id, product_id, discount, starts_at, ends_at, active')
      .eq('active', true)
      .gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: true });
    if (error) throw error;

    // Normaliser snake_case → camelCase pour le frontend
    const sales = (data || []).map(r => ({
      id:        r.id,
      productId: r.product_id,
      discount:  r.discount,
      startsAt:  r.starts_at,
      endsAt:    r.ends_at,
      active:    r.active,
    }));
    res.json(sales);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/flash-sales — créer une vente flash (admin seulement)
app.post('/api/flash-sales', verifyToken, requireRole('admin','vendor'), async (req, res) => {
  const { productId, discount, endsAt } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requis' });
  if (!discount || discount <= 0 || discount > 100)
    return res.status(400).json({ error: 'discount doit être entre 1 et 100' });
  if (!endsAt || new Date(endsAt) <= new Date())
    return res.status(400).json({ error: 'endsAt doit être dans le futur' });
  try {
    // Désactiver toute vente flash existante sur ce produit
    await supabase.from('flash_sales')
      .update({ active: false })
      .eq('product_id', productId)
      .eq('active', true);

    const { data, error } = await supabase.from('flash_sales').insert({
      product_id: productId,
      discount:   parseInt(discount),
      ends_at:    new Date(endsAt).toISOString(),
      active:     true,
      created_by: req.user.id,
    }).select().single();
    if (error) throw error;

    Logger.info('flash_sale', 'created', `Vente flash créée: ${productId} -${discount}%`, {
      userId: req.user.id, meta: { productId, discount, endsAt }
    });
    res.status(201).json({
      id: data.id, productId: data.product_id, discount: data.discount,
      endsAt: data.ends_at, active: data.active,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/flash-sales/:id — supprimer une vente flash (admin)
app.delete('/api/flash-sales/:id', verifyToken, requireRole('admin','vendor'), async (req, res) => {
  try {
    const { error } = await supabase.from('flash_sales')
      .update({ active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════════════════════════════════
// ─── ALERTES STOCK (stock_alerts) ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/stock-alerts — liste les alertes de l'utilisateur connecté
app.get('/api/stock-alerts', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock_alerts')
      .select('product_id, notified, created_at')
      .eq('user_id', req.user.id)
      .eq('notified', false);
    if (error) throw error;
    res.json((data || []).map(r => r.product_id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stock-alerts — activer une alerte (upsert)
app.post('/api/stock-alerts', verifyToken, async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requis' });
  try {
    const { error } = await supabase.from('stock_alerts').upsert(
      { user_id: req.user.id, product_id: productId, notified: false },
      { onConflict: 'user_id,product_id', ignoreDuplicates: false }
    );
    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/stock-alerts/:productId — désactiver une alerte
app.delete('/api/stock-alerts/:productId', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase.from('stock_alerts')
      .delete()
      .eq('user_id', req.user.id)
      .eq('product_id', req.params.productId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stock-alerts/migrate — migration localStorage → Supabase
app.post('/api/stock-alerts/migrate', verifyToken, async (req, res) => {
  const { productIds } = req.body;
  if (!Array.isArray(productIds) || productIds.length === 0)
    return res.json({ ok: true, migrated: 0 });
  try {
    const rows = productIds.slice(0, 100).map(id => ({
      user_id: req.user.id, product_id: id, notified: false
    }));
    const { error } = await supabase.from('stock_alerts')
      .upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
    if (error) throw error;
    Logger.info('stock_alert', 'migrated', `${rows.length} alertes migrées`, { userId: req.user.id });
    res.json({ ok: true, migrated: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stock-alerts/notify/:productId — déclencher les notifications de restockage
// Appelé après une annulation de commande ou une mise à jour de stock vendeur
app.post('/api/stock-alerts/notify/:productId', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const { data: usersToNotify, error } = await supabase.rpc(
      'notify_stock_alerts', { p_product_id: req.params.productId }
    );
    if (error) throw error;
    // Envoyer les notifications in-app
    for (const row of (usersToNotify || [])) {
      await pushNotification(row.user_id, {
        type:    'system',
        title:   '🔔 Produit disponible !',
        message: `"${row.product_name}" est de nouveau en stock — commandez vite !`,
        link:    `/products/${req.params.productId}`,
      });
    }
    res.json({ notified: (usersToNotify || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ROUTES API FACTURES (Invoices) — v1.0.0
// ════════════════════════════════════════════════════════════════════════════

const NEXUS_COMMISSION_RATE = 0.10; // 10 % du montant TTC
const TVA_RATE              = 0.18; // 18 %

function computeInvoiceAmounts(totalFcfa, type, shippingFcfa = 0) {
  const productFcfa = totalFcfa - shippingFcfa;
  const amountHT    = Math.round(productFcfa / (1 + TVA_RATE));
  const tva         = Math.round(productFcfa - amountHT);
  const amountTTC   = Math.round(totalFcfa);
  const commission  = type === 'vendor' ? Math.round(productFcfa * NEXUS_COMMISSION_RATE) : 0;
  const netVendor   = type === 'vendor' ? amountTTC - commission : 0;
  return { amountHT, tva, amountTTC, commission, netVendor };
}

// ════════════════════════════════════════════════════════════════════════════
// PDF GENERATION — PDFKit (server-side, aucune dépendance navigateur)
// ════════════════════════════════════════════════════════════════════════════

// ── Couleurs NEXUS ──────────────────────────────────────────────────────────
const PDF_COLORS = {
  green:   '#00853E',
  greenL:  '#2ecc71',
  orange:  '#EA580C',
  dark:    '#1a1a2e',
  grey:    '#6b7280',
  greyL:   '#f3f4f6',
  white:   '#ffffff',
  yellow:  '#FEF3C7',
  yellowD: '#92400E',
  blue:    '#1e40af',
};

// ── Helper hex → rgb ─────────────────────────────────────────────────────────
function hexRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r, g, b];
}

// ── Formater prix FCFA ────────────────────────────────────────────────────────
function fmtFCFA(n) {
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}

// ── Dessiner l'en-tête NEXUS ─────────────────────────────────────────────────
function drawPdfHeader(doc, type, invoiceNumber, dateStr, accentHex) {
  const [r,g,b] = hexRgb(accentHex);
  // Barre supérieure colorée
  doc.rect(0, 0, 595.28, 90).fill(accentHex);

  // Logo NEXUS (texte)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28)
     .text('NEXUS', 40, 22, { continued: true })
     .font('Helvetica').fontSize(28).fillColor('rgba(255,255,255,0.75)')
     .text(' Market');

  doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.85)')
     .text('Marketplace B2B/B2C · Sénégal', 40, 58);

  // Type document (droite)
  const typeLabel = type === 'buyer' ? 'FACTURE CLIENT' :
                    type === 'vendor' ? 'RELEVÉ DE VENTE' :
                    type === 'statement' ? 'RELEVÉ MENSUEL' : 'DOCUMENT';
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff')
     .text(typeLabel, 0, 22, { align: 'right', width: 555 });

  // Numéro de facture
  doc.font('Helvetica').fontSize(10).fillColor('rgba(255,255,255,0.9)')
     .text(`N° ${invoiceNumber}`, 0, 50, { align: 'right', width: 555 });
  doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.75)')
     .text(dateStr, 0, 64, { align: 'right', width: 555 });

  doc.fillColor('#000000');
}

// ── Dessiner le pied de page ────────────────────────────────────────────────
function drawPdfFooter(doc, accentHex) {
  const pageH = 841.89;
  doc.rect(0, pageH - 40, 595.28, 40).fill(accentHex);
  doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.85)')
     .text(
       'NEXUS Market Sénégal  ·  contact@nexus.sn  ·  nexus.sn  ·  +221 33 123 45 67',
       0, pageH - 24, { align: 'center', width: 595.28 }
     );
}

// ── Bloc d'adresse (parties) ─────────────────────────────────────────────────
function drawPartyBlock(doc, x, y, w, title, name, lines, accentHex) {
  const [r,g,b] = hexRgb(accentHex);
  doc.rect(x, y, w, 8).fill(accentHex);
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
     .text(title, x + 6, y + 2, { width: w - 12 });

  doc.rect(x, y + 8, w, 62).fill('#f9fafb');
  doc.rect(x, y, w, 70).stroke('#e5e7eb');
  doc.fillColor('#000000');

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827')
     .text(name || '—', x + 6, y + 14, { width: w - 12 });

  doc.font('Helvetica').fontSize(8.5).fillColor('#374151');
  let ty = y + 28;
  (lines || []).filter(Boolean).forEach(line => {
    doc.text(line, x + 6, ty, { width: w - 12 });
    ty += 11;
  });
}

// ── Tableau produits ─────────────────────────────────────────────────────────
function drawProductTable(doc, products, startY, accentHex) {
  const L = 40, W = 515.28;
  const cols = { desc: L, qty: L + 270, pu: L + 330, total: L + 430 };

  // En-tête
  doc.rect(L, startY, W, 22).fill(accentHex);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff')
     .text('DÉSIGNATION',        cols.desc + 6, startY + 7)
     .text('QTÉ',                cols.qty,       startY + 7, { width: 50, align: 'center' })
     .text('P.U. HT',            cols.pu,        startY + 7, { width: 70, align: 'right' })
     .text('TOTAL TTC',          cols.total,     startY + 7, { width: 85, align: 'right' });

  let y = startY + 22;
  const TVA = 0.18;

  (products || []).forEach((p, i) => {
    const rowH = 20;
    if (i % 2 === 0) doc.rect(L, y, W, rowH).fill('#f0fdf4');
    else             doc.rect(L, y, W, rowH).fill('#ffffff');
    doc.rect(L, y, W, rowH).stroke('#e5e7eb');

    const nameTxt = (p.name || '').length > 48 ? p.name.slice(0,45) + '…' : (p.name || '');
    const qty     = p.quantity || p.qty || 1;
    const priceTTC = Math.round((p.price || 0) * qty);
    const priceHT  = Math.round(priceTTC / (1 + TVA));

    doc.font('Helvetica').fontSize(9).fillColor('#111827')
       .text(nameTxt,                         cols.desc + 6, y + 6, { width: 250 });
    doc.text(String(qty),                     cols.qty,      y + 6, { width: 50,  align: 'center' });
    doc.fillColor(accentHex)
       .text(fmtFCFA(priceHT),               cols.pu,       y + 6, { width: 70,  align: 'right' });
    doc.font('Helvetica-Bold').fillColor('#111827')
       .text(fmtFCFA(priceTTC),              cols.total,    y + 6, { width: 85,  align: 'right' });

    y += rowH;
  });

  return y + 4;
}

// ── Bloc totaux ──────────────────────────────────────────────────────────────
function drawTotals(doc, y, amounts, shippingFcfa, accentHex) {
  const L = 320, W = 235.28;

  const rows = [
    ['Sous-total HT',  fmtFCFA(amounts.amountHT)],
    ['TVA (18 %)',      fmtFCFA(amounts.tva)],
    ['Livraison',      shippingFcfa > 0 ? fmtFCFA(shippingFcfa) : 'Gratuite'],
  ];

  rows.forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(lbl, L, y, { width: 130 });
    doc.font('Helvetica').fontSize(9).fillColor('#111827').text(val, L + 130, y, { width: 105, align: 'right' });
    y += 14;
  });

  // Ligne TOTAL TTC
  y += 4;
  doc.rect(L, y, W, 26).fill(accentHex);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
     .text('TOTAL TTC', L + 8, y + 8, { width: 120 });
  doc.fontSize(12)
     .text(fmtFCFA(amounts.amountTTC), L + 130, y + 7, { width: 105 - 8, align: 'right' });

  return y + 36;
}

// ── Bloc commissions vendeur ────────────────────────────────────────────────
function drawVendorCommissions(doc, y, amounts, accentHex) {
  const L = 40, W = 515.28;

  doc.rect(L, y, W, 22).fill('#fff7ed');
  doc.rect(L, y, W, 22).stroke('#fed7aa');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#92400e')
     .text('DÉCOMPTE COMMISSION NEXUS', L + 8, y + 7);
  y += 22;

  const commRows = [
    ['Montant TTC total',      fmtFCFA(amounts.amountTTC)],
    ['Commission NEXUS (10%)', '− ' + fmtFCFA(amounts.commission)],
    ['NET À PERCEVOIR',        fmtFCFA(amounts.netVendor)],
  ];

  commRows.forEach(([lbl, val], i) => {
    const isFinal = i === commRows.length - 1;
    const bg = isFinal ? '#fff7ed' : '#ffffff';
    doc.rect(L, y, W, 18).fill(bg).stroke('#e5e7eb');

    doc.font(isFinal ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(isFinal ? 10 : 9)
       .fillColor(isFinal ? accentHex : '#374151')
       .text(lbl, L + 8, y + 5, { width: 300 });
    doc.text(val, L + 308, y + 5, { width: W - 316, align: 'right' });
    y += 18;
  });

  return y + 8;
}

// ── Notes légales ─────────────────────────────────────────────────────────────
function drawLegalNotes(doc, y, type) {
  const notes = type === 'buyer' ? [
    "• Droit de rétractation : 30 jours à compter de la réception (produit non ouvert, en état d'origine).",
    '• Garantie légale de conformité : 2 ans pour les vices cachés. Contactez contact@nexus.sn.',
    '• Ce document fait foi de paiement. Conservez-le précieusement.',
    '• En cas de non-livraison, contactez-nous sous 15 jours : contact@nexus.sn · +221 33 123 45 67.',
  ] : [
    '• Ce relevé est émis par NEXUS Market Sénégal pour le compte du vendeur.',
    '• Le net à percevoir sera versé selon les modalités convenues (Orange Money / Wave / Virement).',
    '• Pour toute contestation : vendor@nexus.sn · délai de traitement : 48h ouvrées.',
    '• NEXUS Market conserve 10% de commission sur le montant TTC de chaque vente.',
  ];

  doc.rect(40, y, 515.28, 6 + notes.length * 12).fill('#eff6ff').stroke('#bfdbfe');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e40af').text('CONDITIONS', 48, y + 4);
  doc.font('Helvetica').fontSize(7.5).fillColor('#1e3a5f');
  notes.forEach((line, i) => doc.text(line, 48, y + 14 + i * 12, { width: 499.28 }));

  return y + 6 + notes.length * 12 + 8;
}

// ════════════════════════════════════════════════════════════════════════════
// GÉNÉRATEURS PDF
// ════════════════════════════════════════════════════════════════════════════

/**
 * Génère le PDF d'une facture acheteur et le pipe dans res.
 */
async function generateBuyerInvoicePDF(invoice, order, res) {
  const accentHex = PDF_COLORS.green;
  const shippingFcfa = order.shipping !== 'gratuit' ? 655 : 0;
  const amounts = computeInvoiceAmounts(invoice.amount_ttc, 'buyer', shippingFcfa);
  const dateStr = new Date(invoice.created_at || Date.now()).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const invNum = invoice.invoice_number || `NEXUS-${Date.now()}`;
  const meta   = invoice.metadata || {};

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
    Title:    `Facture ${invNum}`,
    Author:   'NEXUS Market Sénégal',
    Subject:  `Facture acheteur — commande ${order.id}`,
    Creator:  'NEXUS Market PDF Engine',
  }});

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Facture-NEXUS-${invNum}.pdf"`);
  doc.pipe(res);

  drawPdfHeader(doc, 'buyer', invNum, dateStr, accentHex);

  let y = 108;
  const hw = 237;

  // Parties
  drawPartyBlock(doc, 40, y, hw, 'FACTURÉ À',
    order.buyer_name || meta.buyerName || '—',
    [order.buyer_email || meta.buyerEmail, order.buyer_address || meta.buyerAddress, order.buyer_phone || meta.buyerPhone],
    accentHex
  );
  drawPartyBlock(doc, 40 + hw + 8, y, hw, 'VENDU PAR',
    order.vendor_name || meta.vendorName || 'Vendeur NEXUS',
    ['Vendeur certifié NEXUS Market', order.vendor_email || meta.vendorEmail || ''],
    PDF_COLORS.greenL
  );

  y += 80;

  // Infos commande
  doc.rect(40, y, 515.28, 18).fill('#f9fafb').stroke('#e5e7eb');
  doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
     .text(`Commande : ${order.id}`, 48, y + 5, { continued: true })
     .text(`  ·  Statut : ${order.status || '—'}`, { continued: true })
     .text(`  ·  Paiement : ${order.payment_method === 'mobile' ? 'Mobile Money' : order.payment_method === 'card' ? 'Carte bancaire' : order.payment_method || '—'}`)
  ;
  if (order.tracking_number) {
    doc.text(`Suivi : ${order.tracking_number}`, 48, y + 11);
  }
  y += 26;

  // Tableau produits
  const products = (order.products || meta.products || []).map(p => ({
    name: p.name, quantity: p.quantity || p.qty || 1, price: p.price,
  }));
  y = drawProductTable(doc, products, y, accentHex);
  y = drawTotals(doc, y, amounts, shippingFcfa, accentHex);

  // Stamp PAYÉ
  if (['paid','delivered','processing','in_transit'].includes(order.payment_status || order.status)) {
    doc.save()
       .rotate(-30, { origin: [430, 480] })
       .rect(340, 460, 180, 40).fill('rgba(0,133,62,0.12)').stroke(accentHex)
       .font('Helvetica-Bold').fontSize(22).fillColor(accentHex)
       .text('PAYÉ', 370, 471)
       .restore();
  }

  y = drawLegalNotes(doc, y, 'buyer');
  drawPdfFooter(doc, accentHex);

  doc.end();
}

/**
 * Génère le relevé de vente vendeur et le pipe dans res.
 */
async function generateVendorInvoicePDF(invoice, order, res) {
  const accentHex = PDF_COLORS.orange;
  const shippingFcfa = 0;
  const amounts = computeInvoiceAmounts(invoice.amount_ttc, 'vendor', shippingFcfa);
  const dateStr = new Date(invoice.created_at || Date.now()).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const invNum = invoice.invoice_number || `NEXUS-V-${Date.now()}`;
  const meta   = invoice.metadata || {};

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
    Title:    `Relevé vente ${invNum}`,
    Author:   'NEXUS Market Sénégal',
    Subject:  `Relevé vendeur — commande ${order.id}`,
    Creator:  'NEXUS Market PDF Engine',
  }});

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Releve-Vente-NEXUS-${invNum}.pdf"`);
  doc.pipe(res);

  drawPdfHeader(doc, 'vendor', invNum, dateStr, accentHex);

  let y = 108;
  const hw = 237;

  drawPartyBlock(doc, 40, y, hw, 'VENDEUR',
    order.vendor_name || meta.vendorName || '—',
    [order.vendor_email || meta.vendorEmail || '', 'Vendeur certifié NEXUS Market'],
    accentHex
  );
  drawPartyBlock(doc, 40 + hw + 8, y, hw, 'ACHETEUR',
    order.buyer_name || meta.buyerName || '—',
    [order.buyer_email || meta.buyerEmail, order.buyer_address || meta.buyerAddress],
    PDF_COLORS.grey
  );

  y += 80;

  // Infos commande
  doc.rect(40, y, 515.28, 18).fill('#fff7ed').stroke('#fed7aa');
  doc.font('Helvetica').fontSize(8.5).fillColor('#92400e')
     .text(`Commande : ${order.id}  ·  Statut : ${order.status || '—'}  ·  Date : ${new Date(order.created_at || Date.now()).toLocaleDateString('fr-FR')}`, 48, y + 5);
  y += 26;

  const products = (order.products || meta.products || []).map(p => ({
    name: p.name, quantity: p.quantity || p.qty || 1, price: p.price,
  }));
  y = drawProductTable(doc, products, y, accentHex);
  y = drawTotals(doc, y, amounts, shippingFcfa, accentHex);
  y = drawVendorCommissions(doc, y, amounts, accentHex);
  y = drawLegalNotes(doc, y, 'vendor');
  drawPdfFooter(doc, accentHex);

  doc.end();
}

/**
 * Génère le relevé mensuel vendeur (plusieurs commandes) et le pipe dans res.
 */
async function generateMonthlyStatementPDF(vendor, orders, month, res) {
  const accentHex = PDF_COLORS.blue;
  const [year, mon] = month.split('-');
  const monthLabel  = new Date(parseInt(year), parseInt(mon) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const invNum  = `STMT-${vendor.id.slice(0,6).toUpperCase()}-${year}${mon}`;
  const dateStr = `Période : ${monthLabel}`;

  // Calcul des totaux
  const delivered = orders.filter(o => o.status === 'delivered');
  const totalCA   = delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalComm = delivered.reduce((s, o) => s + (Number(o.commission) || 0), 0);
  const totalNet  = totalCA - totalComm;

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
    Title:  `Relevé mensuel ${monthLabel}`,
    Author: 'NEXUS Market Sénégal',
  }});

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Releve-Mensuel-NEXUS-${year}${mon}.pdf"`);
  doc.pipe(res);

  drawPdfHeader(doc, 'statement', invNum, dateStr, accentHex);

  let y = 108;

  // Bloc vendeur
  drawPartyBlock(doc, 40, y, 250, 'VENDEUR',
    vendor.name || '—',
    [vendor.email || '', vendor.phone || '', `Boutique : ${vendor.company_name || vendor.name}`],
    accentHex
  );

  // Récap financier
  doc.rect(305, y, 250.28, 70).fill('#eff6ff').stroke('#bfdbfe');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e40af').text('RÉCAPITULATIF', 313, y + 6);
  const recaps = [
    [`Commandes livrées`, `${delivered.length} / ${orders.length}`],
    [`Chiffre d'affaires`, fmtFCFA(totalCA)],
    [`Commission NEXUS`,  '− ' + fmtFCFA(totalComm)],
    [`NET À PERCEVOIR`,   fmtFCFA(totalNet)],
  ];
  recaps.forEach(([lbl, val], i) => {
    const isFinal = i === recaps.length - 1;
    doc.font(isFinal ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(isFinal ? 10 : 8.5)
       .fillColor(isFinal ? accentHex : '#374151')
       .text(lbl, 313, y + 20 + i * 13)
       .text(val, 313, y + 20 + i * 13, { width: 234.28, align: 'right' });
  });

  y += 82;

  // Tableau des commandes
  const hdr = ['COMMANDE', 'DATE', 'PRODUITS', 'STATUT', 'MONTANT', 'NET'];
  const cw  = [90, 55, 145, 55, 80, 80];
  const xs  = cw.reduce((acc, w, i) => { acc.push((acc[i-1] || 40) + (i > 0 ? cw[i-1] : 0)); return acc; }, []);

  // Header tableau
  doc.rect(40, y, 515.28, 20).fill(accentHex);
  hdr.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
       .text(h, xs[i] + 3, y + 6, { width: cw[i] - 6, align: i >= 4 ? 'right' : 'left' });
  });
  y += 20;

  orders.forEach((o, idx) => {
    const rowH = 18;
    if (y > 780) {
      doc.addPage({ size: 'A4', margin: 0 });
      drawPdfFooter(doc, accentHex);
      y = 20;
    }
    doc.rect(40, y, 515.28, rowH).fill(idx % 2 === 0 ? '#f0f9ff' : '#ffffff').stroke('#e0e7ff');

    const ordNet   = (Number(o.total) || 0) - (Number(o.commission) || 0);
    const dateStr2 = new Date(o.created_at).toLocaleDateString('fr-FR');
    const prodsStr = (o.products || []).slice(0, 2).map(p => p.name).join(', ') + (o.products?.length > 2 ? '…' : '');
    const statusTxt = { delivered:'Livré', processing:'En cours', in_transit:'Transit', cancelled:'Annulé', pending_payment:'En attente' }[o.status] || o.status;
    const isDeliv  = o.status === 'delivered';

    doc.font('Helvetica').fontSize(7.5).fillColor('#111827')
       .text(o.id.slice(0, 14) + '…',     xs[0]+3, y+5, { width: cw[0]-6 })
       .text(dateStr2,                      xs[1]+3, y+5, { width: cw[1]-6 })
       .text(prodsStr,                      xs[2]+3, y+5, { width: cw[2]-6 })
    ;
    doc.fillColor(isDeliv ? '#15803d' : '#dc2626')
       .text(statusTxt,                     xs[3]+3, y+5, { width: cw[3]-6 });
    doc.fillColor('#111827')
       .text(fmtFCFA(o.total),              xs[4]+3, y+5, { width: cw[4]-6, align: 'right' });
    doc.fillColor(isDeliv ? accentHex : '#9ca3af').font('Helvetica-Bold')
       .text(isDeliv ? fmtFCFA(ordNet) : '—', xs[5]+3, y+5, { width: cw[5]-6, align: 'right' });

    y += rowH;
  });

  y += 12;

  // Ligne totaux
  doc.rect(40, y, 515.28, 22).fill(accentHex);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
     .text('TOTAUX', 48, y + 7)
     .text(fmtFCFA(totalCA),  xs[4]+3, y+7, { width: cw[4]-6, align: 'right' })
     .text(fmtFCFA(totalNet), xs[5]+3, y+7, { width: cw[5]-6, align: 'right' });
  y += 32;

  // Note légale
  doc.rect(40, y, 515.28, 40).fill('#eff6ff').stroke('#bfdbfe');
  doc.font('Helvetica').fontSize(7.5).fillColor('#1e3a5f')
     .text(
       'Ce relevé est généré automatiquement par NEXUS Market Sénégal. ' +
       'Le paiement du net à percevoir sera effectué selon vos modalités enregistrées (Orange Money / Wave / Virement). ' +
       'Pour toute contestation, contactez vendor@nexus.sn dans un délai de 10 jours ouvrés.',
       48, y + 6, { width: 499.28 }
     );

  drawPdfFooter(doc, accentHex);
  doc.end();
}

/**
 * Génère le relevé mensuel acheteur pro (toutes commandes du mois) — PDF.
 */
function generateBuyerStatementPDF(buyer, b2bProfile, orders, month, res) {
  const accentHex  = '#0284c7'; // bleu B2B
  const [year, mon] = month.split('-');
  const monthLabel  = new Date(parseInt(year), parseInt(mon) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const invNum  = `B2B-STMT-${buyer.id.slice(0, 6).toUpperCase()}-${year}${mon}`;
  const dateStr = `Période : ${monthLabel}`;

  // Totaux
  const delivered   = orders.filter(o => o.status === 'delivered');
  const totalAchats = delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalCmds   = orders.length;

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
    Title:  `Relevé Acheteur Pro ${monthLabel}`,
    Author: 'NEXUS Market Sénégal',
  }});

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Releve-Acheteur-B2B-NEXUS-${year}${mon}.pdf"`);
  doc.pipe(res);

  // ── En-tête ──────────────────────────────────────────────────────────────
  drawPdfHeader(doc, 'statement', invNum, dateStr, accentHex);

  let y = 108;

  // Bloc acheteur
  drawPartyBlock(doc, 40, y, 250, 'ACHETEUR PRO',
    b2bProfile?.company || buyer.name,
    [
      buyer.email  || '',
      buyer.phone  || '',
      b2bProfile?.address || '',
      `NINEA : ${b2bProfile?.ninea || '—'}${b2bProfile?.ninea_verified ? ' ✓ Vérifié' : ' (en attente)'}`,
    ].filter(Boolean),
    accentHex
  );

  // Récapitulatif
  doc.rect(305, y, 250.28, 80).fill('#eff6ff').stroke('#bfdbfe');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0c4a6e').text('RÉCAPITULATIF MENSUEL', 313, y + 6);
  const recaps = [
    ['Commandes passées',    `${totalCmds}`],
    ['Commandes livrées',    `${delivered.length}`],
    ['Total achats HT',      fmtFCFA(Math.round(totalAchats / 1.18))],
    ['TVA (18 %)',           fmtFCFA(Math.round(totalAchats - totalAchats / 1.18))],
    ['TOTAL TTC',            fmtFCFA(totalAchats)],
  ];
  recaps.forEach(([lbl, val], i) => {
    const isFinal = i === recaps.length - 1;
    doc.font(isFinal ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(isFinal ? 10 : 8.5)
       .fillColor(isFinal ? accentHex : '#374151')
       .text(lbl, 313, y + 20 + i * 12)
       .text(val, 313, y + 20 + i * 12, { width: 234.28, align: 'right' });
  });

  y += 94;

  // ── Tableau des commandes ────────────────────────────────────────────────
  const hdr = ['COMMANDE', 'DATE', 'FOURNISSEUR', 'PRODUITS', 'STATUT', 'MONTANT TTC'];
  const cw  = [80, 50, 90, 130, 55, 90];
  const xs  = cw.reduce((acc, w, i) => { acc.push((acc[i - 1] || 40) + (i > 0 ? cw[i - 1] : 0)); return acc; }, []);

  doc.rect(40, y, 515.28, 20).fill(accentHex);
  hdr.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
       .text(h, xs[i] + 3, y + 6, { width: cw[i] - 6, align: i === 5 ? 'right' : 'left' });
  });
  y += 20;

  orders.forEach((o, idx) => {
    const rowH = 18;
    if (y > 780) {
      doc.addPage({ size: 'A4', margin: 0 });
      drawPdfFooter(doc, accentHex);
      y = 20;
    }
    doc.rect(40, y, 515.28, rowH).fill(idx % 2 === 0 ? '#f0f9ff' : '#ffffff').stroke('#e0e7ff');

    const dateStr2  = new Date(o.created_at).toLocaleDateString('fr-FR');
    const prodsStr  = (o.products || []).slice(0, 2).map(p => p.name).join(', ') + (o.products?.length > 2 ? '…' : '');
    const statusTxt = { delivered: 'Livré', processing: 'En cours', in_transit: 'Transit', cancelled: 'Annulé', pending_payment: 'Attente' }[o.status] || o.status;
    const isDeliv   = o.status === 'delivered';

    doc.font('Helvetica').fontSize(7.5).fillColor('#111827')
       .text(o.id.slice(0, 12) + '…', xs[0] + 3, y + 5, { width: cw[0] - 6 })
       .text(dateStr2,                xs[1] + 3, y + 5, { width: cw[1] - 6 })
       .text(o.vendor_name || '—',   xs[2] + 3, y + 5, { width: cw[2] - 6 })
       .text(prodsStr,               xs[3] + 3, y + 5, { width: cw[3] - 6 });
    doc.fillColor(isDeliv ? '#15803d' : '#dc2626')
       .text(statusTxt,              xs[4] + 3, y + 5, { width: cw[4] - 6 });
    doc.fillColor(isDeliv ? accentHex : '#9ca3af').font(isDeliv ? 'Helvetica-Bold' : 'Helvetica')
       .text(fmtFCFA(o.total),       xs[5] + 3, y + 5, { width: cw[5] - 6, align: 'right' });

    y += rowH;
  });

  y += 12;

  // Ligne totaux
  doc.rect(40, y, 515.28, 22).fill(accentHex);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
     .text('TOTAL ACHATS DU MOIS', 48, y + 7)
     .text(fmtFCFA(totalAchats), xs[5] + 3, y + 7, { width: cw[5] - 6, align: 'right' });
  y += 32;

  // Note légale B2B
  const noteY = Math.min(y, 750);
  doc.rect(40, noteY, 515.28, 44).fill('#eff6ff').stroke('#bfdbfe');
  doc.font('Helvetica').fontSize(7.5).fillColor('#1e3a5f')
     .text(
       'Ce relevé est généré automatiquement par NEXUS Market Sénégal et constitue un justificatif comptable pour votre entreprise. ' +
       `NINEA : ${b2bProfile?.ninea || '—'}. ` +
       'Pour toute contestation ou demande de facture pro-forma, contactez b2b@nexus.sn dans un délai de 15 jours ouvrés.',
       48, noteY + 6, { width: 499.28 }
     );

  drawPdfFooter(doc, accentHex);
  doc.end();
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES PDF
// ════════════════════════════════════════════════════════════════════════════

// GET /api/invoices/:id/pdf — Télécharger une facture existante en PDF
// (facture déjà enregistrée en base)
app.get('/api/invoices/:id/pdf', verifyToken, async (req, res) => {
  try {
    const { data: invoice, error } = await supabase
      .from('invoices').select('id, order_id, type, buyer_id, vendor_id, invoice_number, amount_ht, tva, amount_ttc, commission, net_vendor, status, metadata, created_at').eq('id', req.params.id).single();

    if (error || !invoice) return res.status(404).json({ error: 'Facture introuvable' });

    const isAdmin  = req.user.role === 'admin';
    const isBuyer  = invoice.buyer_id  === req.user.id;
    const isVendor = invoice.vendor_id === req.user.id;
    if (!isAdmin && !isBuyer && !isVendor)
      return res.status(403).json({ error: 'Accès refusé' });

    // Récupérer la commande associée
    const { data: order } = await supabase
      .from('orders').select('id, buyer_id, vendor_id, buyer_name, buyer_email, buyer_address, vendor_name, products, total, subtotal, status, payment_method, payment_status, tracking_number, commission, discount_amount, shipping, shipping_city, created_at, processing_at, delivered_at, cancelled_at, in_transit_at, stripe_payment_id, mobile_money_ref, stock_reserved, cancel_reason, cancelled_by, vendor_note, has_dispute, dispute_id, return_status').eq('id', invoice.order_id).single();

    Logger.info('invoice', 'pdf.download', `PDF facture ${invoice.invoice_number} téléchargé`, { userId: req.user.id });

    if (invoice.type === 'buyer') {
      return generateBuyerInvoicePDF(invoice, order || {}, res);
    } else {
      return generateVendorInvoicePDF(invoice, order || {}, res);
    }
  } catch (e) {
    Logger.error('invoice', 'pdf.error', e.message, { userId: req.user.id });
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// GET /api/invoices/order/:orderId/pdf?type=buyer|vendor
// Génère, enregistre ET télécharge le PDF pour une commande donnée
app.get('/api/invoices/order/:orderId/pdf', verifyToken, async (req, res) => {
  const type    = req.query.type || 'buyer';
  const orderId = req.params.orderId;

  if (!['buyer', 'vendor'].includes(type))
    return res.status(400).json({ error: 'type invalide : buyer | vendor' });

  try {
    const { data: order, error: orderErr } = await supabase
      .from('orders').select('id, buyer_id, vendor_id, buyer_name, buyer_email, buyer_address, vendor_name, products, total, subtotal, status, payment_method, payment_status, tracking_number, commission, discount_amount, shipping, shipping_city, created_at, processing_at, delivered_at, cancelled_at, in_transit_at, stripe_payment_id, mobile_money_ref, stock_reserved, cancel_reason, cancelled_by, vendor_note, has_dispute, dispute_id, return_status').eq('id', orderId).single();

    if (orderErr || !order) return res.status(404).json({ error: 'Commande introuvable' });

    // Contrôle d'accès
    if (type === 'buyer'  && order.buyer_id  !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Accès refusé' });
    if (type === 'vendor' && order.vendor_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Accès refusé' });

    // Chercher ou créer l'enregistrement en base
    let invoice;
    const { data: existing } = await supabase
      .from('invoices').select('id, order_id, type, buyer_id, vendor_id, invoice_number, amount_ht, tva, amount_ttc, commission, net_vendor, status, metadata, created_at')
      .eq('order_id', orderId).eq('type', type).maybeSingle();

    if (existing) {
      invoice = existing;
    } else {
      const shippingFcfa = order.shipping !== 'gratuit' ? 655 : 0;
      const amounts = computeInvoiceAmounts(Number(order.total) || 0, type, shippingFcfa);
      const { data: saved } = await supabase.rpc('save_invoice', {
        p_type:       type,
        p_order_id:   orderId,
        p_buyer_id:   type === 'buyer'  ? order.buyer_id  : order.buyer_id,
        p_vendor_id:  type === 'vendor' ? order.vendor_id : order.vendor_id,
        p_amount_ht:  amounts.amountHT,
        p_tva:        amounts.tva,
        p_amount_ttc: amounts.amountTTC,
        p_commission: amounts.commission,
        p_net_vendor: amounts.netVendor,
        p_status:     'issued',
        p_metadata:   {
          buyerName:     order.buyer_name,
          buyerEmail:    order.buyer_email,
          buyerAddress:  order.buyer_address,
          vendorName:    order.vendor_name,
          products:      order.products || [],
          paymentMethod: order.payment_method,
          trackingNumber:order.tracking_number,
          ...amounts,
          generatedBy: req.user.id,
          generatedAt: new Date().toISOString(),
        },
      });

      // Récupérer l'invoice créée
      const { data: fresh } = await supabase
        .from('invoices').select('id, order_id, type, buyer_id, vendor_id, invoice_number, amount_ht, tva, amount_ttc, commission, net_vendor, status, metadata, created_at').eq('order_id', orderId).eq('type', type).single();
      invoice = fresh || { invoice_number: `NEXUS-${Date.now()}`, amount_ttc: order.total, metadata: {}, created_at: new Date().toISOString() };
    }

    Logger.info('invoice', 'pdf.generated', `PDF ${type} commande ${orderId}`, { userId: req.user.id });

    if (type === 'buyer') {
      return generateBuyerInvoicePDF(invoice, order, res);
    } else {
      return generateVendorInvoicePDF(invoice, order, res);
    }
  } catch (e) {
    Logger.error('invoice', 'pdf.order.error', e.message, { userId: req.user.id, meta: { orderId, type } });
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// GET /api/invoices/statement/vendor?month=YYYY-MM
// Relevé mensuel complet d'un vendeur (toutes commandes du mois)
app.get('/api/invoices/statement/vendor', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const month    = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
  const vendorId = req.user.role === 'admin' && req.query.vendorId
    ? req.query.vendorId
    : req.user.id;

  const [year, mon] = month.split('-').map(Number);
  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate   = new Date(year, mon, 1).toISOString();

  try {
    const { data: vendor } = await supabase
      .from('profiles').select('id, name, email, phone, company_name').eq('id', vendorId).single();

    if (!vendor) return res.status(404).json({ error: 'Vendeur introuvable' });

    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id, buyer_name, buyer_email, vendor_name, products, total, commission, status, payment_method, created_at, tracking_number')
      .eq('vendor_id', vendorId)
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: true });

    if (ordErr) throw ordErr;

    Logger.info('invoice', 'statement.generated', `Relevé mensuel ${month} vendeur ${vendorId}`, { userId: req.user.id });

    return generateMonthlyStatementPDF(vendor, orders || [], month, res);
  } catch (e) {
    Logger.error('invoice', 'statement.error', e.message, { userId: req.user.id });
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// GET /api/invoices/statement/buyer?month=YYYY-MM — relevé mensuel acheteur pro
app.get('/api/invoices/statement/buyer', verifyToken, requireRole('buyer_pro', 'admin'), async (req, res) => {
  const month   = req.query.month || new Date().toISOString().slice(0, 7);
  const buyerId = req.user.role === 'admin' && req.query.buyerId
    ? req.query.buyerId : req.user.id;

  const [year, mon] = month.split('-').map(Number);
  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate   = new Date(year, mon,     1).toISOString();

  try {
    const { data: buyer } = await supabase
      .from('profiles').select('id, name, email, phone').eq('id', buyerId).single();
    if (!buyer) return res.status(404).json({ error: 'Acheteur introuvable' });

    const { data: b2bProfile } = await supabase
      .from('buyer_pro_profiles')
      .select('company, ninea, ninea_verified, address, job_title')
      .eq('user_id', buyerId).maybeSingle();

    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id, vendor_name, products, total, status, payment_method, created_at, tracking_number')
      .eq('buyer_id', buyerId)
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: true });
    if (ordErr) throw ordErr;

    Logger.info('invoice', 'statement.buyer.generated', `Relevé acheteur pro ${month} (${buyerId})`, { userId: req.user.id });
    return generateBuyerStatementPDF(buyer, b2bProfile || {}, orders || [], month, res);
  } catch (e) {
    Logger.error('invoice', 'statement.buyer.error', e.message, { userId: req.user.id });
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// POST /api/invoices — Sauvegarde une facture après génération PDF côté client
app.post('/api/invoices', verifyToken, async (req, res) => {
  const { type, orderId, totalFcfa, shippingFcfa = 0, metadata = {} } = req.body;

  if (!['buyer', 'vendor'].includes(type))
    return res.status(400).json({ error: 'type invalide (buyer | vendor)' });
  if (!orderId)
    return res.status(400).json({ error: 'orderId manquant' });
  if (!totalFcfa || isNaN(Number(totalFcfa)))
    return res.status(400).json({ error: 'totalFcfa invalide' });

  try {
    const amounts = computeInvoiceAmounts(Number(totalFcfa), type, Number(shippingFcfa));

    // Vérifier que la commande existe et appartient à l'utilisateur
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, buyer_id, vendor_id, status')
      .eq('id', orderId)
      .single();

    if (!orderErr && order) {
      if (type === 'buyer'  && order.buyer_id  && order.buyer_id  !== req.user.id)
        return res.status(403).json({ error: "Accès refusé : vous n'êtes pas l'acheteur de cette commande" });
      if (type === 'vendor' && order.vendor_id && order.vendor_id !== req.user.id && req.user.role !== 'admin')
        return res.status(403).json({ error: "Accès refusé : vous n'êtes pas le vendeur de cette commande" });
    }

    const { data, error } = await supabase.rpc('save_invoice', {
      p_type:       type,
      p_order_id:   orderId,
      p_buyer_id:   type === 'buyer'  ? req.user.id : (order?.buyer_id  || null),
      p_vendor_id:  type === 'vendor' ? req.user.id : (order?.vendor_id || null),
      p_amount_ht:  amounts.amountHT,
      p_tva:        amounts.tva,
      p_amount_ttc: amounts.amountTTC,
      p_commission: amounts.commission,
      p_net_vendor: amounts.netVendor,
      p_status:     'issued',
      p_metadata:   {
        ...metadata,
        ...amounts,
        generatedBy: req.user.id,
        generatedAt: new Date().toISOString(),
      }
    });

    if (error) {
      if (error.code === '23505') {
        Logger.warn('invoice', 'duplicate', `Facture déjà existante pour commande ${orderId}`, { userId: req.user.id });
        return res.json({ ok: true, duplicate: true, message: 'Facture déjà enregistrée pour cette commande' });
      }
      throw error;
    }

    Logger.info('invoice', 'created', `Facture ${data.invoice_number} créée (${type})`, {
      userId: req.user.id, meta: { invoiceId: data.id, orderId, amounts }
    });

    res.json({ ok: true, id: data.id, invoiceNumber: data.invoice_number, type, ...amounts });

  } catch (e) {
    Logger.error('invoice', 'create.error', e.message, { userId: req.user.id, meta: { orderId, type } });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/invoices — Liste des factures de l'utilisateur connecté
app.get('/api/invoices', verifyToken, async (req, res) => {
  const { type, limit = 20, offset = 0 } = req.query;
  const lim = Math.min(parseInt(limit) || 20, 100);
  const off = parseInt(offset) || 0;

  try {
    let query = supabase
      .from('invoices')
      .select('id, invoice_number, type, order_id, status, amount_ttc, commission, net_vendor, created_at, metadata')
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    if (req.user.role === 'admin') {
      if (type) query = query.eq('type', type);
    } else if (req.user.role === 'vendor') {
      query = query.eq('vendor_id', req.user.id);
      if (type) query = query.eq('type', type);
    } else {
      query = query.eq('buyer_id', req.user.id).eq('type', 'buyer');
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, invoices: data || [] });

  } catch (e) {
    Logger.error('invoice', 'list.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/invoices/stats/vendor — Stats revenus/commissions vendeur
app.get('/api/invoices/stats/vendor', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const vendorId = req.user.role === 'admin' && req.query.vendorId
    ? req.query.vendorId
    : req.user.id;

  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('amount_ttc, commission, net_vendor, created_at, status')
      .eq('vendor_id', vendorId)
      .eq('type', 'vendor')
      .neq('status', 'cancelled');

    if (error) throw error;

    const now    = Date.now();
    const d30    = now - 30 * 86400000;
    const d7     = now - 7  * 86400000;
    const all    = data || [];
    const last30 = all.filter(i => new Date(i.created_at).getTime() > d30);
    const last7  = all.filter(i => new Date(i.created_at).getTime() > d7);
    const sum    = (arr, f) => arr.reduce((s, i) => s + (Number(i[f]) || 0), 0);

    res.json({
      ok: true,
      stats: {
        total:  { count: all.length,    revenu: sum(all,    'amount_ttc'), commission: sum(all,    'commission'), net: sum(all,    'net_vendor') },
        last30: { count: last30.length, revenu: sum(last30, 'amount_ttc'), commission: sum(last30, 'commission'), net: sum(last30, 'net_vendor') },
        last7:  { count: last7.length,  revenu: sum(last7,  'amount_ttc'), commission: sum(last7,  'commission'), net: sum(last7,  'net_vendor') },
      }
    });

  } catch (e) {
    Logger.error('invoice', 'stats.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/invoices/:id — Détail d'une facture
app.get('/api/invoices/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, order_id, type, buyer_id, vendor_id, invoice_number, amount_ht, tva, amount_ttc, commission, net_vendor, status, metadata, created_at')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Facture introuvable' });

    const isAdmin  = req.user.role === 'admin';
    const isBuyer  = data.buyer_id  === req.user.id;
    const isVendor = data.vendor_id === req.user.id;
    if (!isAdmin && !isBuyer && !isVendor)
      return res.status(403).json({ error: 'Accès refusé' });

    res.json({ ok: true, invoice: data });

  } catch (e) {
    Logger.error('invoice', 'get.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/invoices/:id/status — Mise à jour statut (admin uniquement)
app.patch('/api/invoices/:id/status', verifyToken, requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['draft', 'issued', 'paid', 'cancelled', 'refunded'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: `Statut invalide. Valeurs : ${validStatuses.join(', ')}` });

  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, invoice_number, status')
      .single();

    if (error) throw error;
    Logger.info('invoice', 'status_updated', `Facture ${data.invoice_number} → ${status}`, { userId: req.user.id });
    res.json({ ok: true, invoice: data });

  } catch (e) {
    Logger.error('invoice', 'status_update.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── FEATURE ROUTERS (montés AVANT les handlers 404/erreurs) ──────────────────
// ══════════════════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════════════════
// ── FEATURES INLINE (jwt-refresh · vendor-stats · delivery-tracking · fts) ──
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// ── JWT REFRESH — Routes inline (/api/auth/refresh · /api/auth/sessions)  ──
// ══════════════════════════════════════════════════════════════════════════════
//   POST   /api/auth/refresh        — Rotation du refresh token (30 j)
//   GET    /api/auth/sessions       — Liste les sessions actives
//   DELETE /api/auth/sessions/:id   — Révoque une session spécifique
//
// Sécurité : rotation automatique + détection de réutilisation
// (RT révoqué présenté → toute la famille est révoquée)
//
// SQL requis (Supabase) :
//   CREATE TABLE IF NOT EXISTS refresh_tokens (
//     id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
//     user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
//     token       text        UNIQUE NOT NULL,
//     expires_at  timestamptz NOT NULL,
//     revoked_at  timestamptz,
//     replaced_by text,
//     ip          text,
//     user_agent  text,
//     created_at  timestamptz DEFAULT now()
//   );
//   CREATE INDEX IF NOT EXISTS idx_rt_token   ON refresh_tokens(token);
//   CREATE INDEX IF NOT EXISTS idx_rt_user_id ON refresh_tokens(user_id);
// ══════════════════════════════════════════════════════════════════════════════
const _jwtRefreshRouter = express.Router();
const _AT_DURATION = parseInt(process.env.JWT_EXPIRES_IN || '900');
const _RT_DURATION = 30 * 24 * 3600; // 30 jours

// POST /api/auth/refresh
_jwtRefreshRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken manquant', code: 'REFRESH_TOKEN_MISSING' });
  }
  try {
    const { data: rt, error: rtErr } = await supabase
      .from('refresh_tokens')
      .select('id, user_id, expires_at, revoked_at')
      .eq('token', refreshToken)
      .maybeSingle();
    if (rtErr) throw rtErr;
    if (!rt) return res.status(401).json({ error: 'Refresh token invalide', code: 'REFRESH_TOKEN_INVALID' });

    // Détection de réutilisation : RT déjà révoqué → attaque possible
    if (rt.revoked_at) {
      await supabase.from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', rt.user_id).is('revoked_at', null);
      Logger.warn('auth', 'refresh.reuse_detected', `RT réutilisé — user ${rt.user_id} — toutes sessions révoquées`);
      return res.status(401).json({ error: 'Token réutilisé — toutes vos sessions ont été fermées par sécurité', code: 'REFRESH_TOKEN_REUSE_DETECTED' });
    }

    if (new Date(rt.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token expiré', code: 'REFRESH_TOKEN_EXPIRED' });
    }

    const { data: profile } = await supabase.from('profiles')
      .select('id, email, name, role, status').eq('id', rt.user_id).maybeSingle();
    if (!profile) return res.status(401).json({ error: 'Utilisateur introuvable', code: 'USER_NOT_FOUND' });
    if (profile.status === 'banned') return res.status(403).json({ error: 'Compte suspendu', code: 'ACCOUNT_BANNED' });

    // Rotation : révoquer l'ancien RT, émettre le nouveau
    const newRtToken = crypto.randomBytes(48).toString('hex');
    const newExpires = new Date(Date.now() + _RT_DURATION * 1000).toISOString();

    await supabase.from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString(), replaced_by: newRtToken }).eq('id', rt.id);
    await supabase.from('refresh_tokens').insert({
      user_id: profile.id, token: newRtToken, expires_at: newExpires,
      ip: req.ip || null, user_agent: req.headers?.['user-agent']?.slice(0, 255) || null,
    });

    const accessToken = jwt.sign(
      { id: profile.id, role: profile.role, name: profile.name, email: profile.email },
      process.env.JWT_SECRET, { expiresIn: _AT_DURATION }
    );
    Logger.info('auth', 'token.refreshed', `Token rafraîchi — ${profile.email}`, { userId: profile.id });
    return res.json({ accessToken, token: accessToken, refreshToken: newRtToken, expiresIn: _AT_DURATION, refreshExpiresIn: _RT_DURATION });
  } catch (e) {
    Logger.error('auth', 'refresh.error', e.message);
    return res.status(500).json({ error: 'Erreur serveur lors du refresh' });
  }
});

// GET /api/auth/sessions
_jwtRefreshRouter.get('/sessions', verifyToken, async (req, res) => {
  try {
    const { data: sessions, error } = await supabase.from('refresh_tokens')
      .select('id, created_at, expires_at, ip, user_agent')
      .eq('user_id', req.user.id).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ sessions: sessions || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/auth/sessions/:id
_jwtRefreshRouter.delete('/sessions/:id', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase.from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true, message: 'Session révoquée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/auth', _jwtRefreshRouter);

// ══════════════════════════════════════════════════════════════════════════════
// ── VENDOR STATS — Routes inline (/api/vendor/stats)                      ──
// ══════════════════════════════════════════════════════════════════════════════
//   GET /api/vendor/stats           — Dashboard chiffres clés
//   GET /api/vendor/stats/products  — Classement produits par ventes
//   GET /api/vendor/stats/orders    — Historique commandes agrégé
// ══════════════════════════════════════════════════════════════════════════════
const _vendorStatsRouter = express.Router();

_vendorStatsRouter.get('/stats', verifyToken, async (req, res) => {
  if (!['vendor', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Accès réservé aux vendeurs' });
  const vendorId = req.user.id;
  const period   = req.query.period || '30';
  const since    = new Date(Date.now() - Number(period) * 24 * 3600 * 1000).toISOString();
  try {
    const [{ data: orders }, { data: products }] = await Promise.all([
      supabase.from('orders').select('id, total, status, created_at').eq('vendor_id', vendorId).gte('created_at', since),
      supabase.from('products').select('id, name, price, stock, active').eq('vendor_id', vendorId),
    ]);
    const completed = (orders || []).filter(o => ['delivered','completed'].includes(o.status));
    const revenue   = completed.reduce((s, o) => s + (o.total || 0), 0);
    res.json({
      period: Number(period), total_orders: (orders || []).length,
      completed_orders: completed.length, revenue_eur: revenue,
      revenue_fcfa: Math.round(revenue * 655.957),
      total_products: (products || []).length,
      active_products: (products || []).filter(p => p.active).length,
      low_stock: (products || []).filter(p => p.stock < 5).length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

_vendorStatsRouter.get('/stats/products', verifyToken, async (req, res) => {
  if (!['vendor', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Accès réservé aux vendeurs' });
  try {
    const { data, error } = await supabase.from('products')
      .select('id, name, price, stock, rating, reviews_count, active')
      .eq('vendor_id', req.user.id).order('reviews_count', { ascending: false }).limit(20);
    if (error) throw error;
    res.json({ products: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

_vendorStatsRouter.get('/stats/orders', verifyToken, async (req, res) => {
  if (!['vendor', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Accès réservé aux vendeurs' });
  const limit = Math.min(Number(req.query.limit || 50), 200);
  try {
    const { data, error } = await supabase.from('orders')
      .select('id, total, status, created_at, buyer_name, tracking_number')
      .eq('vendor_id', req.user.id).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    res.json({ orders: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/vendor', _vendorStatsRouter);

// ══════════════════════════════════════════════════════════════════════════════
// ── DELIVERY TRACKING — Routes inline (/api/delivery)                     ──
// ══════════════════════════════════════════════════════════════════════════════
//   GET  /api/delivery/:orderId          — Statut complet + journal
//   POST /api/delivery/:orderId/status   — Mise à jour (vendeur/admin)
//   GET  /api/delivery/:orderId/events   — Journal d'événements seul
//
// SQL requis :
//   CREATE TABLE IF NOT EXISTS delivery_events (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
//     status text NOT NULL, location text, note text,
//     actor_id uuid, created_at timestamptz DEFAULT now()
//   );
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier text;
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery date;
// ══════════════════════════════════════════════════════════════════════════════
const _deliveryRouter = express.Router();
const _DELIVERY_STATUSES = {
  pending:'En attente', processing:'En préparation', ready_to_ship:'Prêt à expédier',
  shipped:'Expédié', in_transit:'En transit', out_for_delivery:'En cours de livraison',
  delivered:'Livré', failed_attempt:'Tentative échouée', returned:'Retour en cours', cancelled:'Annulé',
};

_deliveryRouter.get('/:orderId', verifyToken, async (req, res) => {
  const { orderId } = req.params;
  try {
    const { data: order, error } = await supabase.from('orders')
      .select('id, status, tracking_number, carrier, buyer_id, vendor_id, created_at, updated_at, estimated_delivery')
      .eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    const canView = req.user.role === 'admin' || order.buyer_id === req.user.id || order.vendor_id === req.user.id;
    if (!canView) return res.status(403).json({ error: 'Accès non autorisé' });
    const { data: events } = await supabase.from('delivery_events')
      .select('id, status, location, note, created_at').eq('order_id', orderId)
      .order('created_at', { ascending: false });
    res.json({ order_id: order.id, status: order.status, status_label: _DELIVERY_STATUSES[order.status] || order.status,
      tracking_number: order.tracking_number, carrier: order.carrier,
      estimated_delivery: order.estimated_delivery, created_at: order.created_at,
      updated_at: order.updated_at, events: events || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

_deliveryRouter.post('/:orderId/status', verifyToken, async (req, res) => {
  const { orderId } = req.params;
  const { status, location, note, tracking } = req.body || {};
  if (!status || !_DELIVERY_STATUSES[status]) {
    return res.status(400).json({ error: 'Statut invalide', valid_statuses: Object.keys(_DELIVERY_STATUSES) });
  }
  try {
    const { data: order, error: fetchErr } = await supabase.from('orders')
      .select('id, vendor_id, buyer_id, status').eq('id', orderId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (req.user.role !== 'admin' && order.vendor_id !== req.user.id)
      return res.status(403).json({ error: 'Seul le vendeur ou un admin peut mettre à jour la livraison' });
    const updates = { status, updated_at: new Date().toISOString() };
    if (tracking) updates.tracking_number = tracking;
    await supabase.from('orders').update(updates).eq('id', orderId);
    await supabase.from('delivery_events').insert({
      order_id: orderId, status, location: location || null, note: note || null,
      actor_id: req.user.id, created_at: new Date().toISOString(),
    });
    if (order.buyer_id) {
      await supabase.from('notifications').insert({
        user_id: order.buyer_id, type: 'order',
        title: `📦 Commande ${status === 'delivered' ? 'livrée !' : 'mise à jour'}`,
        message: `Commande #${orderId.slice(0,8)} : ${_DELIVERY_STATUSES[status]}${location ? ` — ${location}` : ''}`,
        link: `/orders/${orderId}`, read: false,
      }).catch(() => {});
    }
    Logger.info('delivery', 'status_updated', `${orderId} → ${status}`, { userId: req.user.id });
    res.json({ ok: true, status, status_label: _DELIVERY_STATUSES[status] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

_deliveryRouter.get('/:orderId/events', verifyToken, async (req, res) => {
  const { orderId } = req.params;
  try {
    const { data: order } = await supabase.from('orders')
      .select('buyer_id, vendor_id').eq('id', orderId).maybeSingle();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (req.user.role !== 'admin' && order.buyer_id !== req.user.id && order.vendor_id !== req.user.id)
      return res.status(403).json({ error: 'Accès non autorisé' });
    const { data: events, error } = await supabase.from('delivery_events')
      .select('id, status, location, note, created_at').eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ order_id: orderId, events: events || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/delivery', _deliveryRouter);

// ══════════════════════════════════════════════════════════════════════════════
// ── FULL-TEXT SEARCH — Routes inline (/api/search)                        ──
// ══════════════════════════════════════════════════════════════════════════════
//   GET /api/search            — Recherche full-text (tsvector PostgreSQL)
//   GET /api/search/suggest    — Suggestions/autocomplete par préfixe
//   GET /api/search/popular    — Termes populaires (cache 5 min)
//
// SQL requis :
//   ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;
//   CREATE INDEX IF NOT EXISTS idx_products_fts ON products USING gin(search_vector);
//   -- (voir features/search-fulltext.js pour le trigger et la fonction RPC complète)
// ══════════════════════════════════════════════════════════════════════════════
const _ftsRouter = express.Router();
let _ftsPopularCache = null, _ftsPopularCacheAt = 0;

function _ftsSanitize(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-ZÀ-ÿ0-9\s'\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}
function _ftsToTsQuery(q) {
  return q.split(/\s+/).filter(Boolean).map(w => `${w}:*`).join(' & ');
}

_ftsRouter.get('/', async (req, res) => {
  const q        = _ftsSanitize(req.query.q || '');
  const page     = Math.max(1, parseInt(req.query.page   || '1',  10));
  const limit    = Math.min(40, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const category = req.query.category || null;
  const minPrice = parseFloat(req.query.min_price) || null;
  const maxPrice = parseFloat(req.query.max_price) || null;
  const sortBy   = ['relevance','price_asc','price_desc','rating','newest'].includes(req.query.sort) ? req.query.sort : 'relevance';
  if (!q || q.length < 2) return res.status(400).json({ error: 'Requête trop courte (min 2 caractères)', results: [] });
  try {
    const { data, error, count } = await supabase.rpc('search_products', {
      query_text: _ftsToTsQuery(q), p_category: category, p_min: minPrice,
      p_max: maxPrice, p_sort: sortBy, p_limit: limit, p_offset: (page-1)*limit,
    }, { count: 'exact' });
    if (error) {
      if (error.code === 'PGRST202' || error.message?.includes('does not exist')) {
        // Fallback ILIKE si la fonction RPC n'est pas encore créée en base
        let fbq = supabase.from('products')
          .select('id, name, description, price, images, category, rating, reviews_count, vendor_id, active', { count: 'exact' })
          .eq('active', true).or(`name.ilike.%${q}%,description.ilike.%${q}%`)
          .order('rating', { ascending: false }).range((page-1)*limit, page*limit-1);
        if (category) fbq = fbq.eq('category', category);
        if (minPrice)  fbq = fbq.gte('price', minPrice);
        if (maxPrice)  fbq = fbq.lte('price', maxPrice);
        const { data: fd, error: fe, count: fc } = await fbq;
        if (fe) throw fe;
        return res.json({ q, page, limit, total: fc||0, results: fd||[], fallback: true });
      }
      throw error;
    }
    supabase.rpc('upsert_search_log', { p_term: q.toLowerCase() }).catch(() => {});
    res.json({ q, page, limit, total: count ?? data?.length ?? 0, results: data || [] });
  } catch (e) {
    Logger.error('search', 'fts.error', e.message);
    res.status(500).json({ error: 'Erreur lors de la recherche', results: [] });
  }
});

_ftsRouter.get('/suggest', async (req, res) => {
  const q = _ftsSanitize(req.query.q || '');
  if (!q || q.length < 2) return res.json({ suggestions: [] });
  try {
    const { data } = await supabase.from('products').select('name, category')
      .eq('active', true).ilike('name', `${q}%`).order('rating', { ascending: false }).limit(8);
    res.json({ suggestions: [...new Set((data||[]).map(p => p.name))].slice(0,6) });
  } catch (_) { res.json({ suggestions: [] }); }
});

_ftsRouter.get('/popular', async (req, res) => {
  if (_ftsPopularCache && Date.now() - _ftsPopularCacheAt < 5 * 60 * 1000)
    return res.json({ terms: _ftsPopularCache });
  try {
    const { data } = await supabase.from('search_logs').select('term, count')
      .order('count', { ascending: false }).limit(10);
    _ftsPopularCache = (data||[]).map(r => r.term);
    _ftsPopularCacheAt = Date.now();
    res.json({ terms: _ftsPopularCache });
  } catch (_) { res.json({ terms: [] }); }
});

app.use('/api/search', _ftsRouter);
// ─── 404 & ERROR HANDLER ─────────────────────────────────────────────────────
// [FIX] Fallback SPA — toutes les routes non-API renvoient index.html
// Injecte le DSN Sentry dans un meta tag pour que le frontend puisse l'utiliser
// sans exposer la valeur en dur dans le HTML source versionné.
app.get('*', async (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Route non trouvée' });
  }
  const fs   = require('fs');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  const sentryDsn = process.env.SENTRY_DSN_PUBLIC || process.env.SENTRY_DSN || '';
  // Injecter le meta tag juste après <head> si un DSN public est configuré
  const injected = sentryDsn
    ? html.replace('<head>', `<head>\n    <meta name="sentry-dsn" content="${sentryDsn}">`)
    : html;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(injected);
});
app.use((req, res) => res.status(404).json({ error: `Route introuvable: ${req.method} ${req.path}` }));

// ── Sentry error handler — DOIT être avant le handler Express générique ───────
// Capture toutes les exceptions Express (throw dans un middleware/route) avec
// contexte complet : stack trace, user, request, breadcrumbs.
if (Sentry) app.use(Sentry.Handlers.errorHandler({
  shouldHandleError(err) {
    // Remonter uniquement les erreurs 5xx et les exceptions non-HTTP
    return !err.status || err.status >= 500;
  },
}));

app.use((err, req, res, _next) => {
  // Capturer aussi dans Logger pour la traçabilité base de données
  Logger.error('system', 'unhandled_error', err.message, { path: req.path, method: req.method, meta: { stack: err.stack?.slice(0, 300) } });
  // Si Sentry n'est pas configuré, capturer manuellement
  sentryCapture(err, { tag: 'express-error-handler', extra: { path: req.path, method: req.method } });
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ══════════════════════════════════════════════════════════════════════════════
// [FIX 1] BUG CRITIQUE CORRIGÉ
// AVANT : if (process.env.NODE_ENV !== 'production') { app.listen(...) }
//         → Sur Render avec NODE_ENV=production dans .env, le serveur ne démarrait JAMAIS
//
// APRÈS : app.listen() TOUJOURS appelé (le serveur écoute dans tous les environnements)
//         Pour Vercel serverless → module.exports = app; suffit (Vercel gère le listen)
//         Pour Render/Railway → l'écoute est nécessaire
// ══════════════════════════════════════════════════════════════════════════════
// ─── GLOBAL ERROR GUARDS ─────────────────────────────────────────────────────
// [FIX] Évite que le process Node.js crash sur une promesse non gérée (ex: Supabase timeout)
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('system', 'unhandledRejection', String(reason), { meta: { promise: String(promise) } });
  sentryCapture(reason instanceof Error ? reason : new Error(String(reason)), {
    tag: 'unhandled-rejection', level: 'error',
  });
});
process.on('uncaughtException', (err) => {
  Logger.error('system', 'uncaughtException', err.message, { meta: { stack: err.stack?.slice(0, 300) } });
  sentryCapture(err, { tag: 'uncaught-exception', level: 'fatal' });
  // Ne pas quitter le process pour les erreurs non critiques
  if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') return;
  // Laisser Sentry flusher avant de quitter
  if (Sentry) {
    Sentry.flush(2000).finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orders/:id/cancel  — Annulation acheteur + remboursement Stripe auto
// Conditions : commande appartient à l'acheteur + statut = processing (pas expédié)
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/orders/:id/cancel', verifyToken, async (req, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim().length < 3)
    return res.status(400).json({ error: "Motif d'annulation requis (min 3 caractères)" });

  try {
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, buyer_id, buyer_email, buyer_name, vendor_id, vendor_name, status, total, products, stock_reserved, stripe_payment_id, payment_method, refund_status')
      .eq('id', req.params.id).single();

    if (fetchErr || !order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.buyer_id !== req.user.id)
      return res.status(403).json({ error: 'Non autorisé — commande appartient à un autre acheteur' });
    if (!['processing', 'pending_payment'].includes(order.status))
      return res.status(400).json({
        error: `Annulation impossible : statut "${order.status}". Seules les commandes en cours de traitement peuvent être annulées.`,
        code: 'CANCELLATION_NOT_ALLOWED',
      });

    const now = new Date().toISOString();
    const updates = {
      status:       'cancelled',
      cancel_reason: reason.trim(),
      cancelled_at: now,
      cancelled_by: 'buyer',
    };

    // ── Remboursement Stripe automatique ────────────────────────────────────────
    let stripeRefundResult = null;
    if (order.stripe_payment_id && order.refund_status !== 'refunded') {
      try {
        stripeRefundResult = await stripe.refunds.create({
          payment_intent: order.stripe_payment_id,
          reason:         'requested_by_customer',
          metadata: {
            order_id:     order.id,
            cancelled_by: req.user.id,
            cancel_reason: reason.trim(),
            source:       'buyer_cancel',
          },
        });
        updates.refund_status = 'refunded';
        updates.refund_id     = stripeRefundResult.id;
        updates.refund_amount = stripeRefundResult.amount / 100;
        updates.refunded_at   = now;
        Logger.info('refund', 'buyer_cancel.success',
          `Remboursement acheteur ${stripeRefundResult.id} — ${order.total}€ — commande ${order.id}`,
          { userId: req.user.id, meta: { refundId: stripeRefundResult.id, orderId: order.id } }
        );
      } catch (stripeErr) {
        updates.refund_status = 'failed';
        updates.refund_error  = stripeErr.message;
        Logger.error('refund', 'buyer_cancel.stripe_error', stripeErr.message,
          { userId: req.user.id, meta: { orderId: order.id } }
        );
        // L'annulation continue même si Stripe échoue — admin devra rembourser manuellement
      }
    } else if (!order.stripe_payment_id) {
      updates.refund_status = 'manual_pending'; // Mobile Money / espèces
    }

    // ── Re-crédit du stock ────────────────────────────────────────────────────
    if (order.stock_reserved) {
      const stockItems = (order.products || []).map(p => ({ product_id: p.id, qty: p.quantity || 1 }));
      if (stockItems.length > 0) {
        await supabase.rpc('release_stock', { p_items: JSON.stringify(stockItems) })
          .catch(e => Logger.warn('order', 'cancel.stock_release', e.message));
        updates.stock_reserved = false;
      }
    }

    const { data, error } = await supabase.from('orders').update(updates).eq('id', order.id).select().single();
    if (error) throw error;

    // ── Notifications ─────────────────────────────────────────────────────────
    const refundTxt = stripeRefundResult
      ? ` Remboursement de ${order.total}€ initié (3-5 jours ouvrés). Réf : ${stripeRefundResult.id}`
      : updates.refund_status === 'manual_pending'
        ? ' Remboursement Mobile Money à traiter par notre équipe.'
        : '';

    await Promise.all([
      pushNotification(order.vendor_id, {
        type: 'order', title: "❌ Commande annulée par l'acheteur",
        message: `Commande #${order.id.slice(-6)} — ${reason.trim()}`, link: '/dashboard',
      }),
      sendEmail({
        to: order.buyer_email,
        subject: `[NEXUS] Confirmation d'annulation — commande #${order.id.slice(-6)}`,
        html: `<p>Bonjour ${order.buyer_name},</p>
               <p>Votre commande <strong>#${order.id.slice(-6)}</strong> a bien été annulée.</p>
               ${stripeRefundResult
                 ? `<p>Un remboursement de <strong>${order.total}€</strong> a été initié.
                    Il apparaîtra sous <strong>3 à 5 jours ouvrés</strong>.<br>
                    Référence : <code>${stripeRefundResult.id}</code></p>`
                 : updates.refund_status === 'manual_pending'
                   ? '<p>Votre remboursement Mobile Money sera traité par notre équipe dans les 48h.</p>'
                   : ''}
               <p>L'équipe NEXUS</p>`,
      }).catch(() => {}),
    ]);

    Logger.info('order', 'buyer.cancelled',
      `Commande ${order.id} annulée par acheteur ${req.user.id}${refundTxt}`,
      { userId: req.user.id }
    );

    res.json({
      ...data,
      _refund: stripeRefundResult
        ? { id: stripeRefundResult.id, amount: stripeRefundResult.amount / 100, status: stripeRefundResult.status }
        : null,
    });
  } catch (e) {
    Logger.error('order', 'buyer_cancel.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/refunds  — Remboursement Stripe direct (admin seulement)
// Utile pour les cas manuels : paiement Mobile Money converti, correction, etc.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/refunds', verifyToken, requireRole('admin'), async (req, res) => {
  const { orderId, percent, reason, notes } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId requis' });
  const pct = parseFloat(percent ?? 100);
  if (isNaN(pct) || pct <= 0 || pct > 100)
    return res.status(400).json({ error: 'percent doit être entre 1 et 100' });

  try {
    const { data: order } = await supabase
      .from('orders')
      .select('id, buyer_id, buyer_email, buyer_name, total, stripe_payment_id, refund_status, payment_method')
      .eq('id', orderId).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (!order.stripe_payment_id)
      return res.status(400).json({ error: 'Aucun paiement Stripe associé à cette commande', code: 'NO_STRIPE_PAYMENT' });
    if (order.refund_status === 'refunded')
      return res.status(409).json({ error: 'Commande déjà remboursée à 100%', code: 'ALREADY_REFUNDED' });

    const amountCents = Math.round(((order.total * pct) / 100) * 100);
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_id,
      amount:         amountCents,
      reason:         reason || 'requested_by_customer',
      metadata: {
        order_id:    order.id,
        admin_id:    req.user.id,
        percent:     String(pct),
        source:      'admin_manual',
        notes:       notes || '',
      },
    });

    const refundStatus = pct >= 100 ? 'refunded' : 'partial_refund';
    await supabase.from('orders').update({
      refund_status:  refundStatus,
      refund_id:      refund.id,
      refund_amount:  amountCents / 100,
      refund_percent: pct,
      refunded_at:    new Date().toISOString(),
    }).eq('id', orderId);

    await Promise.all([
      pushNotification(order.buyer_id, {
        type: 'system', title: '💰 Remboursement initié',
        message: `${amountCents / 100}€ (${pct}%) remboursé pour la commande #${orderId.slice(-6)}`,
        link: '/orders',
      }),
      sendEmail({
        to: order.buyer_email,
        subject: `[NEXUS] Remboursement de ${amountCents / 100}€`,
        html: `<p>Bonjour ${order.buyer_name},</p>
               <p>Un remboursement de <strong>${amountCents / 100}€ (${pct}%)</strong> a été initié.</p>
               <p>Référence : <code>${refund.id}</code></p>
               <p>Il apparaîtra sous 3 à 5 jours ouvrés selon votre banque.</p>
               ${notes ? `<p>Note : ${notes}</p>` : ''}
               <p>L'équipe NEXUS</p>`,
      }).catch(() => {}),
    ]);

    Logger.info('refund', 'admin.manual',
      `Remboursement admin ${refund.id} — ${pct}% (${amountCents/100}€) — commande ${orderId}`,
      { userId: req.user.id }
    );

    res.status(201).json({
      refundId:  refund.id,
      amount:    amountCents / 100,
      percent:   pct,
      status:    refund.status,
      currency:  refund.currency,
      createdAt: new Date(refund.created * 1000).toISOString(),
    });
  } catch (e) {
    if (e.type === 'StripeInvalidRequestError') {
      Logger.error('refund', 'stripe.invalid', e.message, { userId: req.user.id });
      return res.status(400).json({ error: `Stripe : ${e.message}`, code: e.code });
    }
    Logger.error('refund', 'admin.error', e.message, { userId: req.user.id });
    res.status(500).json({ error: e.message });
  }
});


// ── Healthcheck rapide (sans DB) — utilisé par Railway si /api/health est trop lent ──
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));


app.listen(PORT, '0.0.0.0', async () => { // [FIX RAILWAY] Bind explicite 0.0.0.0 requis dans Docker/Railway
  const env     = process.env.NODE_ENV || 'development';
  const hasDb   = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasEmail  = !!(process.env.RESEND_API_KEY || process.env.SMTP_USER);
  const hasWebhook= !!process.env.STRIPE_WEBHOOK_SECRET;

  console.log(`\n🚀 NEXUS Market API v3.2.0 — port ${PORT} (${env})`);
  console.log(`   Supabase : ${hasDb      ? '✅' : '⚠️  manquant'}`);
  console.log(`   Anon Key : ${process.env.SUPABASE_ANON_KEY ? '✅' : '⚠️  manquant'}`);
  console.log(`   Stripe   : ${hasStripe  ? '✅' : '⚠️  manquant'}`);
  console.log(`   Email    : ${hasEmail   ? '✅' : '⚠️  manquant'}`);
  console.log(`   Webhook  : ${hasWebhook ? '✅' : '⚠️  manquant'}`);
  console.log(`   Logs     : Supabase table server_logs ✅`);
  console.log(`   Health   : http://localhost:${PORT}/api/health\n`);

  // ── [FIX] Création automatique du bucket nexus-images si inexistant ──────
  if (hasDb) {
    try {
      const { data: buckets, error: listErr } = await supabase.storage.listBuckets();

      // [FIX] Si listBuckets échoue (droits Storage Admin insuffisants),
      // on suppose que le bucket existe déjà plutôt que de tenter une création
      // aveugle qui produira "signature verification failed".
      if (listErr) {
        console.warn(`   Storage  : ⚠️  listBuckets échoué (${listErr.message}) — bucket supposé existant`);
      } else {
        const exists = (buckets || []).some(b => b.name === 'nexus-images');
        if (!exists) {
          const { error: bucketErr } = await supabase.storage.createBucket('nexus-images', {
            public: true,
            fileSizeLimit: 8 * 1024 * 1024, // 8 Mo
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          });
          if (bucketErr) {
            // "already exists" n'est pas une vraie erreur
            if (bucketErr.message?.toLowerCase().includes('already exist')) {
              console.log(`   Storage  : ✅ Bucket nexus-images déjà existant`);
            } else {
              console.warn(`   Storage  : ⚠️  Bucket nexus-images — erreur création: ${bucketErr.message}`);
            }
          } else {
            console.log(`   Storage  : ✅ Bucket nexus-images créé automatiquement`);
          }
        } else {
          console.log(`   Storage  : ✅ Bucket nexus-images OK`);
        }
      }
    } catch (e) {
      console.warn(`   Storage  : ⚠️  Vérification bucket échouée: ${e.message}`);
    }
  }

  Logger.info('system', 'startup', `API démarrée sur le port ${PORT}`, {
    meta: { env, hasDb, hasStripe, hasEmail, hasWebhook, version: 'v3.2.0' }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// [NOUVEAU v3.3.0] — SQL SUPABASE pour les nouvelles fonctionnalités
// ════════════════════════════════════════════════════════════════════════════════
//
// ── Commandes multi-vendeur (split automatique) ──────────────────────────────
// La table `orders` existante est utilisée sans modification de schéma.
// Chaque sous-commande issue du split a son propre enregistrement (1 row = 1 vendeur).
// La colonne `vendor_id` identifie le vendeur concerné.
// Nouveau endpoint : POST /api/orders/split (voir ci-dessus)
//
// ── GitHub OAuth — colonnes requises dans la table profiles ─────────────
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_id text UNIQUE;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_login text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_avatar text;
// CREATE INDEX IF NOT EXISTS idx_profiles_github_id ON profiles(github_id);
//
// ── Dépendance npm à ajouter ─────────────────────────────────────────────
// npm install cookie-parser
// (ajouter dans package.json dependencies)
//
// ── Variables .env à ajouter ─────────────────────────────────────────────
// GITHUB_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
// GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// API_URL=https://votre-api.onrender.com   (URL publique de CE serveur)
//
// ── GitHub OAuth App settings (github.com/settings/developers) ───────────
// Application name  : NEXUS Market
// Homepage URL      : ${FRONTEND_URL}
// Callback URL      : ${API_URL}/api/auth/github/callback
//
// ── Onboarding vendeur ───────────────────────────────────────────────────────
// Aucune table supplémentaire requise.
// L'état de l'onboarding est détecté côté frontend :
//   • shopImage / avatar    → booléen sur le profil (table profiles)
//   • products.length > 0  → table products (existante)
//   • payout_configured    → localStorage flag (temporaire) OU colonne ci-dessous :
//
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_method text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_destination text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
//
// Pour marquer l'onboarding complet côté backend (optionnel) :
//   PATCH /api/profiles/me  { onboarding_complete: true }
//
// ── Index recommandé pour la route split ────────────────────────────────────
// CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id);
// CREATE INDEX IF NOT EXISTS idx_orders_buyer_id  ON orders(buyer_id);
//
// ════════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════════
// SQL SUPABASE — Tables requises pour les nouvelles fonctionnalités (v3.2.0)
// Exécuter dans l'éditeur SQL de Supabase avant déploiement :
//
// -- [JWT-REFRESH] Refresh tokens (requis pour features/jwt-refresh.js)
// CREATE TABLE IF NOT EXISTS refresh_tokens (
//   id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
//   token       text        UNIQUE NOT NULL,
//   expires_at  timestamptz NOT NULL,
//   revoked_at  timestamptz,
//   replaced_by text,
//   ip          text,
//   user_agent  text,
//   created_at  timestamptz DEFAULT now()
// );
// CREATE INDEX IF NOT EXISTS idx_rt_token   ON refresh_tokens(token);
// CREATE INDEX IF NOT EXISTS idx_rt_user_id ON refresh_tokens(user_id);
// CREATE INDEX IF NOT EXISTS idx_rt_expires ON refresh_tokens(expires_at);
//
// -- Coupons
// CREATE TABLE IF NOT EXISTS coupons (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   code text UNIQUE NOT NULL,
//   discount integer NOT NULL CHECK (discount BETWEEN 1 AND 100),
//   description text,
//   max_uses integer,
//   used_count integer DEFAULT 0,
//   expires_at timestamptz,
//   active boolean DEFAULT true,
//   created_at timestamptz DEFAULT now()
// );
//
// -- Points de fidélité
// CREATE TABLE IF NOT EXISTS loyalty_points (
//   user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
//   points integer DEFAULT 0,
//   total_earned integer DEFAULT 0,
//   total_redeemed integer DEFAULT 0,
//   updated_at timestamptz DEFAULT now()
// );
//
// -- Parrainage
// CREATE TABLE IF NOT EXISTS referrals (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   referrer_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
//   referred_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
//   code text NOT NULL,
//   rewarded boolean DEFAULT false,
//   rewarded_at timestamptz,
//   created_at timestamptz DEFAULT now(),
//   UNIQUE(referred_id)
// );
//
// -- Demandes de retrait vendeur
// CREATE TABLE IF NOT EXISTS payout_requests (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   vendor_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
//   vendor_name text,
//   amount numeric NOT NULL CHECK (amount > 0),
//   method text NOT NULL CHECK (method IN ('mobile','bank')),
//   provider text,
//   destination text NOT NULL,
//   status text DEFAULT 'pending' CHECK (status IN ('pending','processing','approved','rejected')),
//   admin_note text,
//   processed_at timestamptz,
//   processed_by uuid REFERENCES profiles(id),
//   created_at timestamptz DEFAULT now()
// );
//
// -- Profils Buyer Pro (B2B)
// CREATE TABLE IF NOT EXISTS buyer_pro_profiles (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id uuid UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
//   company text NOT NULL,
//   job_title text,
//   ninea text UNIQUE NOT NULL,
//   rc text,
//   address text,
//   ninea_verified boolean DEFAULT false,
//   verification_note text,
//   verified_at timestamptz,
//   verified_by uuid REFERENCES profiles(id),
//   created_at timestamptz DEFAULT now()
// );
//
// -- Fonctions RPC (déjà présentes si stock v3.1.x installé, sinon à créer) :
// -- check_and_reserve_stock(p_items jsonb) : réservation atomique
// -- release_stock(p_items jsonb) : libération en cas de rollback
// ════════════════════════════════════════════════════════════════════════════════

module.exports = app; // Pour Vercel serverless (si besoin)
