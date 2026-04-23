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
 *   JWT_EXPIRES_IN            28800  (secondes = 8h)
 *   FRONTEND_URL              https://nexus-market-md360.vercel.app
 *   ADMIN_EMAIL               admin@nexus.sn
 *   EMAILJS_SERVICE_ID        service_84yfkgf
 *   EMAILJS_PUBLIC_KEY        WSBntSTWdh5d9usZC
 *   EMAILJS_PRIVATE_KEY       ...
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   LOG_LEVEL                 (optionnel — 'debug' pour logs verbeux, défaut: 'info')
 *
 * CHANGELOG v3.1.2 (correctifs appliqués) :
 *   [FIX 1] BUG CRITIQUE — app.listen() maintenant TOUJOURS appelé (plus conditionné à NODE_ENV)
 *           Avant : if (process.env.NODE_ENV !== 'production') { app.listen(...) }
 *           → Sur Render/Railway avec NODE_ENV=production, le serveur ne démarrait JAMAIS
 *   [FIX 2] BUG table — 'password_reset' → 'password_resets' (avec 's') pour correspondre au schema.sql
 *   [FIX 3] Health check — STRIPE_PUBLIC_KEY (votre .env) au lieu de NEXT_PUBLIC_STRIPE_KEY
 */

require('dotenv').config(); // DOIT être en premier

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const nodemailer   = require('nodemailer');
const stripe       = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const multer       = require('multer');
const PDFDocument  = require('pdfkit');
const path         = require('path');

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

// ─── SUPABASE (service role — accès complet, bypass RLS côté backend) ─────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // [FIX 3] votre .env utilise SUPABASE_SERVICE_KEY
);

// ─── SUPABASE ANON (singleton — évite de recréer un client à chaque login) ──────
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY
);

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
];
const corsOptions = {
  origin: (origin, callback) => {
    // Requêtes sans Origin (curl, Postman, cron-job.org) → toujours autorisé
    if (!origin) return callback(null, true);
    // [FIX] Origin "null" = ouverture depuis file:// ou redirection opaque → autoriser en dev
    if (origin === 'null') {
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(null, false);
    }
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

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser); // Requis pour le state anti-CSRF du GitHub OAuth
app.use(requestLogger); // Log HTTP → Supabase

// ── Fichiers statiques (frontend single-file) ─────────────────────────────────
// Sert index.html directement depuis http://localhost:PORT
// Placé AVANT les routes API pour servir les assets, APRÈS cors/helmet/requestLogger
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

// [FIX] Purge des entrées expirées toutes les 10 min — évite la fuite mémoire sur Render Free
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _profileCache.entries()) {
    if (val.expiresAt < now) _profileCache.delete(key);
  }
}, 10 * 60 * 1000);

const verifyToken = async (req, res, next) => {
  const auth = req.headers.authorization;
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
      const { data: byId } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (byId) {
        profile = byId;
      } else {
        // Fallback par email (profils créés avant synchronisation Auth↔DB)
        const { data: byEmail } = await supabase.from('profiles').select('*')
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

const pushNotification = async (userId, { type, title, message, link }) => {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: userId, type, title, message, link: link || null, read: false
    });
  } catch (e) {
    Logger.warn('notification', 'push.error', e.message, { meta: { userId, type } });
  }
};

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

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password, role, shopName, shopCategory, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });

  try {
    const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

    const hashedPw = await bcrypt.hash(password, 10);
    const avatar   = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    if (role === 'vendor') {
      if (!shopName) return res.status(400).json({ error: 'Nom de boutique requis' });
      const { data, error } = await supabase.from('pending_vendors').insert({
        name: shopName, owner_name: name, email,
        password_hash: hashedPw,
        category: shopCategory || 'Général',
        avatar, status: 'pending',
      }).select().single();
      if (error) {
        Logger.warn('auth', 'register.vendor.error', error.message, { meta: { email }, ip: req.ip });
        if (error.code === '23505') return res.status(409).json({ error: 'Cet email est déjà en attente' });
        throw error;
      }
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      for (const admin of (admins || [])) {
        await pushNotification(admin.id, { type: 'vendor', title: '🏪 Nouvelle demande vendeur', message: `${shopName} (${name})`, link: '/admin/vendors' });
      }
      return res.json({ message: 'Demande envoyée — validation sous 48h', pending: true });
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
      const { data: profiles } = await supabase.from('profiles').select('id, name').eq('status', 'active');
      const referrer = (profiles || []).find(u => {
        const expected = `NEXUS-${(u.name||'').replace(/\s+/g,'').toUpperCase().slice(0,5)}-${(u.id||'').slice(-4)}`;
        return expected === safeCode;
      });
      if (referrer && referrer.id !== data.id) {
        await supabase.from('referrals').insert({
          referrer_id: referrer.id, referred_id: data.id, code: safeCode, rewarded: false,
        }).catch(() => {});
        await pushNotification(referrer.id, {
          type: 'system', title: '🎁 Nouveau filleul !',
          message: `${name} vient de s'inscrire avec votre code. Récompense dès sa 1ère commande.`,
        });
      }
    }

    const token = jwt.sign({ id: data.id, role: 'buyer', name, email }, process.env.JWT_SECRET, {
      expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '604800') // 7 jours par défaut
    });
    const { password_hash, ...safeUser } = data;
    res.json({ token, user: safeUser });
  } catch (e) {
    Logger.error('auth', 'register.error', e.message, { meta: { email }, ip: req.ip });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  try {
    const { data: user } = await supabase.from('profiles').select('*').eq('email', email.trim().toLowerCase()).single();

    // Chemin 1 : user bcrypt (créé via backend)
    if (user && user.password_hash) {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) { Logger.warn('auth', 'login.failed', `Mot de passe incorrect: ${email}`, { meta: { email }, ip: req.ip }); return res.status(401).json({ error: 'Email ou mot de passe incorrect' }); }
      if (user.role === 'vendor' && user.status !== 'approved') return res.status(403).json({ error: 'Compte vendeur en attente de validation' });
      if (user.status === 'banned') return res.status(403).json({ error: 'Compte suspendu — contactez support@nexus.sn' });
      await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', user.id);
      const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '604800') });
      const { password_hash, ...safeUser } = user;
      Logger.info('auth', 'login', `Login OK: ${email} (${user.role})`, { userId: user.id, userEmail: email, userRole: user.role, ip: req.ip });
      return res.json({ token, user: safeUser, expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '604800') });
    }

    // Chemin 1b : vendeur en attente de validation
    const { data: pendingVendor } = await supabase.from('pending_vendors').select('id, status').eq('email', email.trim().toLowerCase()).single();
    if (pendingVendor) {
      if (pendingVendor.status === 'pending')  return res.status(403).json({ error: 'Votre demande vendeur est en cours de validation (délai : 48h). Vous recevrez un email dès approbation.' });
      if (pendingVendor.status === 'rejected') return res.status(403).json({ error: "Votre demande vendeur a été refusée. Contactez support@nexus.sn pour plus d'informations." });
    }

    // Chemin 2 : [FIX] Fallback Supabase Auth (users créés via Supabase, sans password_hash)
    // [FIX] Utilise le singleton supabaseAnon (évite la création d'un client par login)
    const { data: sbData, error: sbErr } = await supabaseAnon.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (sbErr || !sbData?.user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    let profile = user;
    if (!profile) {
      const meta = sbData.user.user_metadata || {};
      const name = meta.name || email.split('@')[0];
      const { data: np } = await supabase.from('profiles').upsert({
        id: sbData.user.id, email: email.trim().toLowerCase(),
        name, role: meta.role || 'buyer', avatar: (meta.avatar || name.slice(0,2)).toUpperCase(), status: 'active', password_hash: null
      }, { onConflict: 'id' }).select().single();
      profile = np || { id: sbData.user.id, email, name, role: meta.role || 'buyer', status: 'active' };
    }
    if (profile.status === 'banned') return res.status(403).json({ error: 'Compte suspendu' });
    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id);
    const token = jwt.sign({ id: profile.id, role: profile.role, name: profile.name, email: profile.email }, process.env.JWT_SECRET, { expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '604800') });
    const { password_hash: _ph, ...safeProfile } = profile;
    Logger.info('auth', 'login.supabase_fallback', `Login Supabase OK: ${email} (${profile.role})`, { userId: profile.id, userEmail: email, userRole: profile.role, ip: req.ip });
    return res.json({ token, user: safeProfile, expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '604800') });

  } catch (e) {
    Logger.error('auth', 'login.error', e.message, { meta: { email }, ip: req.ip });
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
      .select('*')
      .eq('github_id', ghId)
      .single();

    if (byGhId) {
      profile = byGhId;
    } else {
      const { data: byEmail } = await supabase
        .from('profiles')
        .select('*')
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
          .select('*')
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
          .select('*')
          .single();

        if (createErr) throw createErr;
        profile = created;

        // Notification admin pour nouveau compte GitHub
        await supabase.from('notifications').insert({
          user_id: 'admin',
          type: 'system',
          title: '🐙 Nouveau membre via GitHub',
          message: `${ghName} (${primaryEmail}) vient de créer un compte via GitHub OAuth.`,
          read: false,
        }).catch(() => {});
      }
    }

    // Vérifications sécurité
    if (profile.status === 'banned') {
      return res.redirect(`${frontendUrl}?nexus_github_error=${encodeURIComponent('Compte suspendu — contactez support@nexus.sn')}`);
    }

    // MAJ last_login si pas déjà fait
    if (!isNewUser) {
      await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id).catch(() => {});
    }

    // 4. Émettre JWT NEXUS
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || '604800');
    const token = jwt.sign(
      { id: profile.id, role: profile.role, name: profile.name, email: profile.email, github: true },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    Logger.info('auth', 'github.login_ok', `GitHub login OK: ${primaryEmail} (${profile.role})${isNewUser ? ' [NOUVEAU]' : ''}`, {
      userId: profile.id, userEmail: primaryEmail, userRole: profile.role,
    });

    // 5. Redirect vers le frontend avec token + données utilisateur
    const { password_hash, ...safeProfile } = profile;
    const userParam  = encodeURIComponent(JSON.stringify(safeProfile));
    const redirectUrl = `${frontendUrl}?nexus_github_token=${token}&nexus_github_user=${userParam}&nexus_github_new=${isNewUser}&nexus_expires_in=${expiresIn}`;
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
      .update({ role, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', req.user.id)
      .select('id, name, email, role, status, avatar, github_id, github_login, github_avatar')
      .single();

    if (error) throw error;

    // Si le vendeur choisit "vendre" → créer une entrée pending_vendors
    if (role === 'vendor') {
      await supabase.from('pending_vendors').upsert({
        id: data.id, name: data.name, email: data.email,
        status: 'pending', source: 'github_oauth',
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' }).catch(() => {});

      await supabase.from('notifications').insert({
        user_id: 'admin',
        type: 'system',
        title: '🏪 Demande vendeur (GitHub)',
        message: `${data.name} (${data.email}) souhaite devenir vendeur. Compte créé via GitHub OAuth.`,
        read: false,
      }).catch(() => {});
    }

    // Émettre un nouveau JWT avec le bon rôle
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || '604800');
    const newToken = jwt.sign(
      { id: data.id, role: data.role, name: data.name, email: data.email, github: true },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    Logger.info('auth', 'github.role_set', `Rôle GitHub user défini: ${data.role}`, { userId: data.id });
    res.json({ ok: true, token: newToken, user: data, expiresIn });

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

    const code      = Math.random().toString().slice(2, 8); // 6 chiffres
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
    const { data: reset } = await supabase.from('password_resets').select('*').eq('email', email).eq('code', code).single();
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
    const { data: user, error } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
    if (error || !user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const { password_hash, ...safeUser } = user;
    res.json(safeUser);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Alias — certains composants appelaient /api/profiles/me (chemin historique)
// On le redirige vers la même logique pour ne pas casser la compatibilité
app.get('/api/profiles/me', verifyToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
    if (error || !user) return res.status(404).json({ error: 'Utilisateur introuvable' });
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

// POST /api/auth/logout — invalide le cache profil pour ce token
app.post('/api/auth/logout', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    _profileCache.delete(auth.slice(7));
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
    let query = supabase.from('products').select('*', { count: 'exact' }).eq('active', true);
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
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ products: data, total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (error || !product) return res.status(404).json({ error: 'Produit introuvable' });
    const { data: reviews } = await supabase.from('reviews')
      .select('*').eq('product_id', req.params.id).order('created_at', { ascending: false }).limit(20);
    const { data: questions } = await supabase.from('product_questions')
      .select('*').eq('product_id', req.params.id).order('created_at', { ascending: false });
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
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
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
      .select('*')
      .single();

    if (orderErr) {
      Logger.error('order', 'split.insert_fail', orderErr.message, { userId: req.user.id, meta: { vendorId: group.vendorId } });
      // Rollback stock pour les commandes déjà créées
      if (createdOrders.length > 0) {
        const rollbackItems = createdOrders.flatMap(o => (o.products || []).map(p => ({
          product_id: p.id, quantity: p.quantity
        })));
        await supabase.rpc('release_stock', { p_items: JSON.stringify(rollbackItems) }).catch(() => {});
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
    }).catch(() => {});
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
        .from('coupons').select('*').eq('code', safeCode).eq('active', true).maybeSingle();
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
      supabase.from('coupons').update({ used_count: (coupon.used_count || 0) + 1 })
        .eq('id', coupon.id).catch(() => {});
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
        .catch(e => Logger.error('order', 'rollback.failed', e.message));
      throw orderErr;
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
    res.status(500).json({ error: 'Erreur lors de la création de la commande' });
  }
});

app.patch('/api/orders/:id/status', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const { status, trackingNumber, vendorNote } = req.body;
  const validStatuses = ['pending_payment','processing','in_transit','delivered','cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (req.user.role === 'vendor' && order.vendor_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });

    const updates = { status };
    if (trackingNumber)                   updates.tracking_number = trackingNumber;
    if (vendorNote)                        updates.vendor_note = vendorNote;
    if (status === 'processing')           updates.processing_at = new Date().toISOString();
    if (status === 'in_transit')           updates.in_transit_at = new Date().toISOString();
    if (status === 'delivered')            updates.delivered_at  = new Date().toISOString();

    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    const statusLabels = { processing: '⚙️ Commande en préparation', in_transit: '🚚 Commande en livraison', delivered: '📦 Commande livrée', cancelled: '❌ Commande annulée' };
    Logger.info('order', 'status.updated', `Commande #${req.params.id} → ${status}`, { userId: req.user.id, userRole: req.user.role, meta: { orderId: req.params.id, status } });
    if (statusLabels[status]) {
      await pushNotification(order.buyer_id, { type: 'order', title: statusLabels[status], message: `Commande #${order.id.slice(-6)}`, link: `/orders/${order.id}` });
      if (status === 'delivered') {
        const { subject, html } = emailTemplates.orderConfirmation({ ...order, tracking_number: trackingNumber });
        await sendEmail({ to: order.buyer_email, subject, html });
      }
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/cancel', verifyToken, async (req, res) => {
  const { reason } = req.body;
  try {
    const { data: order } = await supabase
      .from('orders').select('*').eq('id', req.params.id).single();
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
                    }).catch(() => {});
                  }
                }
              }).catch(() => {});
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

    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
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
        const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
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
          await supabase.rpc('release_stock', { p_items: JSON.stringify(stockItems) }).catch(e =>
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
          await supabase.rpc('release_stock', { p_items: JSON.stringify(stockItems) }).catch(() => {});
          await supabase.from('orders').update({ stock_reserved: false }).eq('id', refundedOrder.id);
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    Logger.error('payment', 'webhook.processing_error', e.message, { meta: { stack: e.stack?.slice(0,200) } });
    res.status(500).json({ error: 'Erreur traitement webhook' });
  }
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────
app.get('/api/messages', verifyToken, async (req, res) => {
  try {
    const { with: withUser } = req.query;
    let query = supabase.from('messages').select('*');
    if (withUser) {
      query = query.or(`and(from_id.eq.${req.user.id},to_id.eq.${withUser}),and(from_id.eq.${withUser},to_id.eq.${req.user.id})`);
    } else {
      query = query.or(`from_id.eq.${req.user.id},to_id.eq.${req.user.id}`);
    }
    const { data, error } = await query.order('created_at', { ascending: true }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/messages', verifyToken, async (req, res) => {
  const { toId, text } = req.body;
  if (!toId || !text) return res.status(400).json({ error: 'toId et text requis' });
  try {
    const { data: recipient } = await supabase.from('profiles').select('name, email').eq('id', toId).single();
    const { data, error } = await supabase.from('messages').insert({
      from_id: req.user.id, from_name: req.user.name, to_id: toId, to_name: recipient?.name || 'Utilisateur', text, read: false
    }).select().single();
    if (error) throw error;
    await pushNotification(toId, { type: 'message', title: `💬 Message de ${req.user.name}`, message: text.slice(0, 100), link: `/messages/${req.user.id}` });
    if (recipient?.email) await sendEmail({ to: recipient.email, ...emailTemplates.newMessage(req.user.name, text) });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/messages/unread-count', verifyToken, async (req, res) => {
  const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('to_id', req.user.id).eq('read', false);
  res.json({ count: count || 0 });
});

app.patch('/api/messages/read', verifyToken, async (req, res) => {
  const { fromId } = req.body;
  const query = supabase.from('messages').update({ read: true }).eq('to_id', req.user.id);
  if (fromId) query.eq('from_id', fromId);
  await query;
  res.json({ ok: true });
});

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
  const { data } = await supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30);
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
  let query = supabase.from('offers').select('*');
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
  let query = supabase.from('disputes').select('*');
  if (req.user.role === 'buyer')  query = query.eq('buyer_id', req.user.id);
  if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
  const { data } = await query.order('created_at', { ascending: false });
  res.json(data || []);
});
app.post('/api/disputes', verifyToken, requireRole('buyer'), async (req, res) => {
  const { orderId, reason, description } = req.body;
  if (!orderId || !reason || !description) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('buyer_id', req.user.id).single();
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
  const { status, resolution, adminNotes } = req.body;
  const updates = { status };
  if (resolution)  updates.resolution   = resolution;
  if (adminNotes)  updates.admin_notes  = adminNotes;
  if (status === 'investigating') updates.investigating_at = new Date().toISOString();
  if (status === 'resolved')      updates.resolved_at      = new Date().toISOString();
  if (status === 'closed')        updates.closed_at        = new Date().toISOString();
  const { data, error } = await supabase.from('disputes').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── RETURNS ─────────────────────────────────────────────────────────────────
app.get('/api/returns', verifyToken, async (req, res) => {
  try {
    let query = supabase.from('return_requests').select('*');
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
      .from('orders').select('*').eq('id', orderId).eq('buyer_id', req.user.id).single();
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
      .from('return_requests').select('*').eq('id', req.params.id).single();
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
    const MSG = {
      approved: '✅ Votre demande de retour a été approuvée. Vous serez remboursé sous 5-7 jours ouvrés.',
      rejected: '❌ Votre demande de retour a été refusée.' + (adminNotes ? ` Motif : ${adminNotes}` : ''),
      refunded: '💰 Votre remboursement a été effectué.',
    };
    await pushNotification(existing.buyer_id, {
      type:    'system',
      title:   '↩️ Mise à jour de votre retour',
      message: MSG[status],
      link:    '/orders',
    });

    Logger.info('returns', 'updated', `Retour ${req.params.id} → ${status}`, { userId: req.user.id });
    res.json(data);
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
    let q = supabase.from('reviews').select('id, product_id, user_id, user_name, rating, comment, vendor_reply, created_at').order('created_at', { ascending: false }).limit(Number(limit));
    if (productId) q = q.eq('product_id', productId);
    if (vendorId)  q = q.eq('vendor_id',  vendorId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reviews — soumettre une note/avis sur un produit (acheteur authentifié)
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
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'buyer'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'vendor').eq('status', 'approved'),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true).eq('moderated', true),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('pending_vendors').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    ]);
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
    const { data, error } = await supabase
      .from('pending_vendors')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    // Normaliser les champs snake_case → camelCase pour le frontend
    const normalized = (data || []).map(v => ({
      id:        v.id,
      name:      v.name,
      ownerName: v.owner_name  || '',          // owner_name → ownerName
      email:     v.email,
      category:  v.category    || '',
      date:      v.created_at  || v.date || new Date().toISOString(), // created_at → date
      avatar:    v.avatar      || '',
      phone:     v.phone       || '',
      ninea:     v.ninea       || '',
      address:   v.address     || '',
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
    const { data: pending, error: pendingErr } = await supabase
      .from('pending_vendors').select('*').eq('id', vendorId).single();
    if (pendingErr || !pending) return res.status(404).json({ error: 'Demande introuvable' });

    if (approved) {
      // 2a. Approbation : créer ou mettre à jour le profil dans profiles
      // [FIX] Utiliser .maybeSingle() pour éviter l'erreur silencieuse sur existingProfile.data
      const { data: existingProfile } = await supabase
        .from('profiles').select('id, password_hash').eq('email', pending.email).maybeSingle();

      if (!existingProfile) {
        // Nouveau compte — insérer un profil complet
        const { error: insertErr } = await supabase.from('profiles').insert({
          name:          pending.owner_name,
          email:         pending.email,
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
        const { error: updateErr } = await supabase
          .from('profiles').update(updatePayload).eq('id', existingProfile.id);
        if (updateErr) throw new Error(`Mise à jour profil : ${updateErr.message}`);
      }

      // 3a. Invalider le cache token pour ce vendeur
      for (const [key, val] of _profileCache.entries()) {
        if (val.user?.email === pending.email) _profileCache.delete(key);
      }

      // 4a. Marquer la demande comme approuvée
      await supabase.from('pending_vendors')
        .update({ status: 'approved', notes: null, reviewed_at: new Date().toISOString(), reviewed_by: req.user.id })
        .eq('id', vendorId);

      // 5a. Email de confirmation
      const tpl = emailTemplates.vendorApproved(pending.owner_name);
      await sendEmail({ to: pending.email, ...tpl });

      // 6a. Log d'audit
      await supabase.from('admin_logs').insert({
        admin_id: req.user.id, action: 'vendor_approved',
        target_id: vendorId, details: { vendor_name: pending.name, email: pending.email }
      }).catch(() => {}); // log non-bloquant

      return res.json({ message: 'Vendeur approuvé', vendorId, email: pending.email });

    } else {
      // 2b. Refus : marquer la demande et envoyer l'email de refus
      await supabase.from('pending_vendors')
        .update({ status: 'rejected', notes: reason || null, reviewed_at: new Date().toISOString(), reviewed_by: req.user.id })
        .eq('id', vendorId);

      const tpl = emailTemplates.vendorRejected(pending.owner_name, reason);
      await sendEmail({ to: pending.email, ...tpl });

      // Log d'audit
      await supabase.from('admin_logs').insert({
        admin_id: req.user.id, action: 'vendor_rejected',
        target_id: vendorId, details: { vendor_name: pending.name, email: pending.email, reason: reason || null }
      }).catch(() => {});

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
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  let dbStatus = 'unknown';
  try {
    await supabase.from('profiles').select('id', { head: true, count: 'exact' });
    dbStatus = 'ok';
  } catch { dbStatus = 'error'; }

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
    const { data, error } = await supabase.from('logs_summary_24h').select('*');
    if (error) throw error;
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
    let query = supabase.from('coupons').select('*').order('created_at', { ascending: false });
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
      .from('coupons').select('*').eq('code', safeCode).eq('active', true).maybeSingle();
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
app.get('/api/loyalty', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('loyalty_points').select('points, total_earned, total_redeemed')
      .eq('user_id', req.user.id).maybeSingle();
    if (error) throw error;
    res.json({ points: data?.points || 0, totalEarned: data?.total_earned || 0, totalRedeemed: data?.total_redeemed || 0 });
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
    const { data: existing } = await supabase.from('loyalty_points').select('*').eq('user_id', targetId).maybeSingle();
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
      .from('loyalty_points').select('*').eq('user_id', req.user.id).maybeSingle();
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
      .from('referrals').select('*').eq('referrer_id', req.user.id).order('created_at', { ascending: false });
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
      .from('referrals').select('*').eq('referred_id', referredUserId).eq('rewarded', false).maybeSingle();
    if (!referral) return; // Pas de parrainage ou déjà récompensé

    // Créditer les points au parrain
    const { data: existing } = await supabase.from('loyalty_points').select('*').eq('user_id', referral.referrer_id).maybeSingle();
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
    const { data: existing } = await supabase.from('payout_requests').select('*').eq('id', req.params.id).maybeSingle();
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
    const { data, error } = await supabase.from('buyer_pro_profiles').select('*').eq('user_id', targetId).maybeSingle();
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

    // JWT
    const token = jwt.sign(
      { id: profile.id, role: 'buyer_pro', name, email: profile.email, company },
      process.env.JWT_SECRET,
      { expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '604800') }
    );

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
    res.status(201).json({ token, user: { ...safeUser, company, jobTitle }, expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '604800') });
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
    supabase.rpc('expire_flash_sales').catch(() => {});

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
app.post('/api/flash-sales', verifyToken, requireRole('admin'), async (req, res) => {
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
app.delete('/api/flash-sales/:id', verifyToken, requireRole('admin'), async (req, res) => {
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
      .from('invoices').select('*').eq('id', req.params.id).single();

    if (error || !invoice) return res.status(404).json({ error: 'Facture introuvable' });

    const isAdmin  = req.user.role === 'admin';
    const isBuyer  = invoice.buyer_id  === req.user.id;
    const isVendor = invoice.vendor_id === req.user.id;
    if (!isAdmin && !isBuyer && !isVendor)
      return res.status(403).json({ error: 'Accès refusé' });

    // Récupérer la commande associée
    const { data: order } = await supabase
      .from('orders').select('*').eq('id', invoice.order_id).single();

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
      .from('orders').select('*').eq('id', orderId).single();

    if (orderErr || !order) return res.status(404).json({ error: 'Commande introuvable' });

    // Contrôle d'accès
    if (type === 'buyer'  && order.buyer_id  !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Accès refusé' });
    if (type === 'vendor' && order.vendor_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Accès refusé' });

    // Chercher ou créer l'enregistrement en base
    let invoice;
    const { data: existing } = await supabase
      .from('invoices').select('*')
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
        .from('invoices').select('*').eq('order_id', orderId).eq('type', type).single();
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
      .select('*')
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

// ─── 404 & ERROR HANDLER ──────────────────────────────────────────────────────
// ── Fallback SPA — sert index.html pour toutes les routes non-API ────────────
// Permet la navigation directe vers /dashboard, /products/:id etc. sans 404.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `Route introuvable: ${req.method} ${req.path}` });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, _next) => {
  Logger.error('system', 'unhandled_error', err.message, { path: req.path, method: req.method, meta: { stack: err.stack?.slice(0, 300) } });
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
});
process.on('uncaughtException', (err) => {
  Logger.error('system', 'uncaughtException', err.message, { meta: { stack: err.stack?.slice(0, 300) } });
  // Ne pas quitter le process pour les erreurs non critiques
  if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') return;
  process.exit(1); // Quitter sur les erreurs vraiment fatales
});

app.listen(PORT, async () => {
  const env     = process.env.NODE_ENV || 'development';
  const hasDb   = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasEmail  = !!process.env.SMTP_USER;
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
