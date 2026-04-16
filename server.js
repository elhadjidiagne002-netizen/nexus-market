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

// ─── EMAIL SMTP ───────────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host   : process.env.SMTP_HOST || 'smtp.gmail.com',
  port   : parseInt(process.env.SMTP_PORT || '587'),
  secure : false,
  auth   : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls    : { rejectUnauthorized: false },
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || 'NEXUS Market <no-reply@nexus.sn>',
      to, subject, html, text
    });
    Logger.info('email', 'sent', `Email envoyé à ${to}`);
    return true;
  } catch (e) {
    Logger.error('email', 'send.error', e.message, { meta: { to, subject } });
    return false;
  }
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
app.use(requestLogger); // Log HTTP → Supabase

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

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password, role, shopName, shopCategory, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });

  try {
    const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).single();
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

    const { data, error } = await supabase.from('profiles').insert({
      name, email, password_hash: hashedPw, role: 'buyer', avatar, phone: phone || null
    }).select().single();
    if (error) throw error;

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
    if (vendor?.status !== 'approved') return res.status(403).json({ error: 'Compte vendeur non approuvé' });
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
      moderated: false,
    }).select().single();
    if (error) throw error;
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, { type: 'system', title: '🏷️ Produit à modérer', message: `"${name}" — ${vendor?.name}`, link: '/admin/products' });
    }
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

app.post('/api/orders', verifyToken, async (req, res) => {
  try {
    const {
      vendorId, products, subtotal, total, discountAmount = 0, commission,
      paymentMethod, buyerAddress, buyerPhone, shippingCity, couponCode
    } = req.body;
    if (!vendorId || !products || !total) return res.status(400).json({ error: 'Données commande incomplètes' });
    if (!Array.isArray(products) || products.length === 0) return res.status(400).json({ error: 'Panier vide' });
    if (parseFloat(total) <= 0) return res.status(400).json({ error: 'Montant invalide' });
    // [FIX sécurité] S'assurer que chaque produit a un prix positif (empêche les commandes à 0€)
    if (products.some(p => !p.name || typeof p.price !== 'number' || p.price < 0)) {
      return res.status(400).json({ error: 'Données produit invalides' });
    }

    const { data: buyerProfile } = await supabase.from('profiles').select('name, email').eq('id', req.user.id).single();
    const commissionRate = 0.15;
    const calculatedCommission = commission || Math.round(total * commissionRate * 100) / 100;

    const { data, error } = await supabase.from('orders').insert({
      buyer_id: req.user.id,
      buyer_name: buyerProfile?.name || req.user.name,
      buyer_email: buyerProfile?.email || req.user.email,
      buyer_address: buyerAddress || null,
      buyer_phone: buyerPhone || null,
      vendor_id: vendorId,
      vendor_name: products[0]?.vendorName || 'Vendeur',
      products,
      subtotal: parseFloat(subtotal),
      discount_amount: parseFloat(discountAmount),
      total: parseFloat(total),
      commission: calculatedCommission,
      payment_method: paymentMethod || 'mobile',
      shipping_city: shippingCity || null,
      coupon_code: couponCode || null,
      status: 'pending_payment',
    }).select().single();
    if (error) throw error;

    Logger.info('order', 'created', `Commande #${data.id} créée — ${formatFCFA(total)}`, { userId: req.user.id, userEmail: req.user.email, meta: { orderId: data.id, total, vendorId } });
    await pushNotification(vendorId, {
      type: 'order', title: '🛒 Nouvelle commande', message: `Commande #${data.id.slice(-6)} — ${formatFCFA(total)}`, link: `/orders/${data.id}`
    });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
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
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (req.user.role !== 'admin' && order.buyer_id !== req.user.id && order.vendor_id !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    const { data, error } = await supabase.from('orders').update({
      status: 'cancelled', cancel_reason: reason || null, cancelled_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Remettre le stock
    for (const item of (order.products || [])) {
      if (item.id) await supabase.rpc('increment_stock', { product_id: item.id, qty: item.quantity || 1 });
    }
    res.json(data);
  } catch (e) {
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
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('stripe_payment_id', pi.id);
    }
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      await supabase.from('orders').update({ payment_status: 'refunded', status: 'cancelled' }).eq('stripe_payment_id', charge.payment_intent);
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
  let query = supabase.from('return_requests').select('*');
  if (req.user.role === 'buyer')  query = query.eq('buyer_id', req.user.id);
  if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
  const { data } = await query.order('created_at', { ascending: false });
  res.json(data || []);
});
app.post('/api/returns', verifyToken, requireRole('buyer'), async (req, res) => {
  const { orderId, category, description } = req.body;
  if (!orderId || !category || !description) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('buyer_id', req.user.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    const { data, error } = await supabase.from('return_requests').insert({
      order_id: orderId, buyer_id: req.user.id, buyer_name: req.user.name,
      vendor_id: order.vendor_id, vendor_name: order.vendor_name,
      products: order.products, order_total: order.total, category, description
    }).select().single();
    if (error) throw error;
    await supabase.from('orders').update({ return_status: 'pending', return_id: data.id }).eq('id', orderId);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/returns/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { status, adminNotes } = req.body;
  const updates = { status };
  if (adminNotes)             updates.admin_notes  = adminNotes;
  if (status === 'approved')  updates.approved_at  = new Date().toISOString();
  if (status === 'rejected')  updates.rejected_at  = new Date().toISOString();
  if (status === 'refunded')  updates.refunded_at  = new Date().toISOString();
  const { data, error } = await supabase.from('return_requests').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── REVIEWS ─────────────────────────────────────────────────────────────────
app.post('/api/reviews', verifyToken, requireRole('buyer'), async (req, res) => {
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
  const { data } = await supabase.from('pending_vendors').select('*').eq('status', 'pending').order('created_at', { ascending: true });
  res.json(data || []);
});

app.patch('/api/admin/vendors/:id/approve', verifyToken, requireRole('admin'), async (req, res) => {
  const { approved, reason } = req.body;
  try {
    const { data: pending, error } = await supabase.from('pending_vendors').select('*').eq('id', req.params.id).single();
    if (error || !pending) return res.status(404).json({ error: 'Demande introuvable' });

    if (approved) {
      const existingProfile = await supabase.from('profiles').select('id').eq('email', pending.email).single();
      if (!existingProfile.data) {
        await supabase.from('profiles').insert({
          name: pending.owner_name, email: pending.email, password_hash: pending.password_hash,
          role: 'vendor', status: 'approved', avatar: pending.avatar || pending.owner_name.slice(0,2).toUpperCase(), shop_category: pending.category
        });
      } else {
        await supabase.from('profiles').update({ role: 'vendor', status: 'approved' }).eq('email', pending.email);
      }
    }

    await supabase.from('pending_vendors').update({ status: approved ? 'approved' : 'rejected', notes: reason || null }).eq('id', req.params.id);
    const tpl = approved ? emailTemplates.vendorApproved(pending.owner_name) : emailTemplates.vendorRejected(pending.owner_name, reason);
    await sendEmail({ to: pending.email, ...tpl });
    res.json({ message: approved ? 'Vendeur approuvé' : 'Demande refusée' });
  } catch (e) {
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

// ─── 404 & ERROR HANDLER ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route introuvable: ${req.method} ${req.path}` }));
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

app.listen(PORT, () => {
  const env     = process.env.NODE_ENV || 'development';
  const hasDb   = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasEmail  = !!process.env.SMTP_USER;
  const hasWebhook= !!process.env.STRIPE_WEBHOOK_SECRET;

  console.log(`\n🚀 NEXUS Market API v3.1.4 — port ${PORT} (${env})`);
  console.log(`   Supabase : ${hasDb      ? '✅' : '⚠️  manquant'}`);
  console.log(`   Anon Key : ${process.env.SUPABASE_ANON_KEY ? '✅' : '⚠️  manquant'}`);
  console.log(`   Stripe   : ${hasStripe  ? '✅' : '⚠️  manquant'}`);
  console.log(`   Email    : ${hasEmail   ? '✅' : '⚠️  manquant'}`);
  console.log(`   Webhook  : ${hasWebhook ? '✅' : '⚠️  manquant'}`);
  console.log(`   Logs     : Supabase table server_logs ✅`);
  console.log(`   Health   : http://localhost:${PORT}/api/health\n`);

  // Log de démarrage dans Supabase
  Logger.info('system', 'startup', `API démarrée sur le port ${PORT}`, {
    meta: { env, hasDb, hasStripe, hasEmail, hasWebhook, version: 'v3.1.4' }
  });
});

module.exports = app; // Pour Vercel serverless (si besoin)
