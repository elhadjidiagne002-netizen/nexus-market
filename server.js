/**
 * GasTon 360 / NEXUS Market Sénégal — Backend Node.js/Express v3.1.1
 * ====================================================================
 * Installation : npm install
 * Démarrage    : node server.js  (ou : npm run dev avec nodemon)
 *
 * Variables d'environnement requises dans .env.local :
 *   PORT                        (défaut : 3001 en local)
 *   NEXT_PUBLIC_SUPABASE_URL    https://pqcqbstbdujzaclsiosv.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   eyJ... (service_role — jamais côté client)
 *   STRIPE_SECRET_KEY           sk_test_51TGdXe...
 *   NEXT_PUBLIC_STRIPE_KEY      pk_test_51TGdXe...
 *   STRIPE_WEBHOOK_SECRET       whsec_Xlt4nDaTfX...
 *   JWT_SECRET                  (chaîne aléatoire sécurisée — ex: openssl rand -hex 32)
 *   NEXT_PUBLIC_APP_URL         https://nexus-market-md360.vercel.app
 *   ADMIN_EMAIL                 admin@nexus.sn
 *   NEXT_PUBLIC_MARKET_NAME     GasTon 360
 *   EMAILJS_SERVICE_ID          service_84yfkgf
 *   EMAILJS_PUBLIC_KEY          WSBntSTWdh5d9usZC
 *   EMAILJS_PRIVATE_KEY         MYTRFE7rqZ2rC7IZcRTuf
 *   (Optionnel SMTP pour emails serveur :)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

require('dotenv').config(); // DOIT être en premier

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs'); // bcryptjs = pas de compilation native → compatible Vercel
const nodemailer   = require('nodemailer');
const stripe       = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// ─── APP ───────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;

// ─── SUPABASE ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || process.env.SUPABASE_URL,        // compatibilité .env.local
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY  // service role — jamais côté client
);

// ─── EMAIL ────────────────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host   : process.env.SMTP_HOST   || 'smtp.gmail.com',
  port   : parseInt(process.env.SMTP_PORT || '587'),
  secure : false,
  auth   : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls    : { rejectUnauthorized: false },
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await mailer.sendMail({ from: process.env.SMTP_FROM || 'NEXUS Market <no-reply@nexus.sn>', to, subject, html, text });
    console.log('[Email] ✅ Sent to', to);
    return true;
  } catch (e) {
    console.error('[Email] ❌ Error:', e.message);
    return false;
  }
};

// Email templates
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
            <p style="margin:8px 0 0"><strong>🏠 Livraison :</strong> ${order.buyer_address}</p>
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
          <p>Vous pouvez dès maintenant vous connecter et commencer à vendre vos produits.</p>
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

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// CORS dynamique — accepte localhost en dev + toutes les URLs Vercel en prod
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://nexus-market-md360.vercel.app',
];
const VERCEL_REGEX = /^https:\/\/nexus-market.*\.vercel\.app$/;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // SSR / mobile / Postman
    if (VERCEL_REGEX.test(origin) || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn('[CORS] Origine bloquée :', origin);
    callback(new Error('Origine non autorisée par CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','stripe-signature'],
}));
app.options('*', cors()); // Répondre aux preflight OPTIONS

// Webhook Stripe MUST come before JSON parser (raw body needed)
// ⚠️  URL enregistrée dans Stripe : https://nexus-market-md360.vercel.app/api/webhooks/stripe
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '2mb' }));

// Rate limiting
const apiLimiter     = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Trop de requêtes' } });
const authLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,  message: { error: 'Trop de tentatives' } });
const paymentLimiter = rateLimit({ windowMs: 60  * 60 * 1000, max: 50,  message: { error: 'Limite paiements atteinte' } });
app.use('/api/', apiLimiter);

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Accès refusé' });
  next();
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const formatFCFA = (eur) => `${Math.round(eur * 655.957).toLocaleString('fr-FR')} FCFA`;

const pushNotification = async (userId, { type, title, message, link }) => {
  if (!userId) return;
  await supabase.from('notifications').insert({ user_id: userId, type, title, message, link: link || null, read: false });
};

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password, role, shopName, shopCategory, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });

  try {
    const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

    const hashedPw = await bcrypt.hash(password, 12);
    const avatar   = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    if (role === 'vendor') {
      if (!shopName) return res.status(400).json({ error: 'Nom de boutique requis' });
      const { data, error } = await supabase.from('pending_vendors').insert({
        name: shopName,
        owner_name: name,
        email,
        password_hash: hashedPw,
        category: shopCategory || 'Général',
        avatar,
        status: 'pending',
      }).select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Cet email est déjà en attente de validation' });
        throw error;
      }

      // Notify admins
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      for (const admin of (admins || [])) {
        await pushNotification(admin.id, { type: 'vendor', title: '🏪 Nouvelle demande vendeur', message: `${shopName} (${name}) souhaite vendre sur NEXUS.`, link: '/admin/vendors' });
      }
      return res.json({ message: 'Demande vendeur envoyée — en attente de validation sous 48h', pending: true });
    }

    const { data, error } = await supabase.from('profiles').insert({
      name, email, password_hash: hashedPw, role: 'buyer', avatar, phone: phone || null
    }).select().single();
    if (error) throw error;

    const token = jwt.sign({ id: data.id, role: 'buyer', name, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = data;
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error('[register]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const { data: user, error } = await supabase.from('profiles').select('*').eq('email', email).single();
    if (error || !user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    if (user.role === 'vendor' && user.status !== 'approved') return res.status(403).json({ error: 'Compte vendeur en attente de validation' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Compte suspendu — contactez support@nexus.sn' });

    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', user.id);
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error('[login]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  try {
    const { data: user } = await supabase.from('profiles').select('id,name').eq('email', email).single();
    if (!user) return res.json({ message: 'Si cet email existe, un code vous sera envoyé' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('password_reset').upsert({ email, code, expires_at: expires });
    const tpl = emailTemplates.passwordReset(code);
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
    res.json({ message: 'Code envoyé — vérifiez votre boîte email' });
  } catch (e) {
    console.error('[forgot-password]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
  try {
    const { data: reset } = await supabase.from('password_reset').select('*').eq('email', email).eq('code', code).single();
    if (!reset || new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: 'Code invalide ou expiré' });

    const hash = await bcrypt.hash(newPassword, 12);
    await supabase.from('profiles').update({ password_hash: hash }).eq('email', email);
    await supabase.from('password_reset').delete().eq('email', email);
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
    const hash = await bcrypt.hash(newPassword, 12);
    await supabase.from('profiles').update({ password_hash: hash }).eq('id', req.user.id);
    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, vendor, min_price, max_price, sort, page = 1, limit = 20, include_pending } = req.query;

    // Admins/vendors can see unmoderated products with include_pending=true
    let query = supabase.from('products').select('*', { count: 'exact' }).eq('active', true);
    if (include_pending !== 'true') query = query.eq('moderated', true);

    if (category && category !== 'all') query = query.eq('category', category);
    if (vendor) query = query.eq('vendor_id', vendor);
    if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
    if (min_price) query = query.gte('price', parseFloat(min_price));
    if (max_price) query = query.lte('price', parseFloat(max_price));

    switch (sort) {
      case 'price-asc':  query = query.order('price', { ascending: true }); break;
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
  const { name, category, price, stock, description, imageUrl, images = [] } = req.body;
  if (!name || !price || !stock) return res.status(400).json({ error: 'Nom, prix et stock requis' });
  if (parseFloat(price) <= 0) return res.status(400).json({ error: 'Prix invalide' });
  if (parseInt(stock) < 0) return res.status(400).json({ error: 'Stock invalide' });

  try {
    const { data: vendor } = await supabase.from('profiles').select('name, status').eq('id', req.user.id).single();
    if (vendor?.status !== 'approved') return res.status(403).json({ error: 'Compte vendeur non approuvé' });

    const { data, error } = await supabase.from('products').insert({
      name, category: category || 'Autre',
      price: parseFloat(price),
      stock: parseInt(stock),
      description: description || null,
      image_url: imageUrl || images[0] || null,
      images: images.length > 0 ? images : [imageUrl].filter(Boolean),
      vendor_id  : req.user.id,
      vendor_name: vendor?.name || req.user.name,
      rating: 0, reviews_count: 0, active: true,
      moderated: false,
    }).select().single();
    if (error) throw error;

    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, { type: 'system', title: '🏷️ Nouveau produit à modérer', message: `"${name}" — ${vendor?.name}`, link: '/admin/products' });
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
    if (imageUrl !== undefined)    updates.image_url = imageUrl;
    if (images !== undefined)      updates.images = images;
    if (active !== undefined && req.user.role === 'admin') updates.active = active;

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

    await supabase.from('products').update({ active: false }).eq('id', req.params.id);
    res.json({ message: 'Produit désactivé' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/products/:id/moderate', verifyToken, requireRole('admin'), async (req, res) => {
  const { approved, reason } = req.body;
  try {
    const { data: product } = await supabase.from('products').select('vendor_id, name').eq('id', req.params.id).single();
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });

    await supabase.from('products').update({
      moderated: approved,
      moderation_reason: reason || null,
      moderated_at: new Date().toISOString()
    }).eq('id', req.params.id);

    await pushNotification(product.vendor_id, {
      type: 'system',
      title: approved ? '✅ Produit approuvé' : '❌ Produit refusé',
      message: approved
        ? `"${product.name}" est maintenant visible dans le catalogue.`
        : `"${product.name}" refusé. Raison : ${reason || 'Non précisée'}`,
      link: '/vendor/products',
    });
    res.json({ message: approved ? 'Produit approuvé' : 'Produit refusé' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
app.get('/api/orders', verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = supabase.from('orders').select('*', { count: 'exact' });

    if (req.user.role === 'buyer') query = query.eq('buyer_id', req.user.id);
    else if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    // admin sees all

    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ orders: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/orders/:id', verifyToken, async (req, res) => {
  try {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (error || !order) return res.status(404).json({ error: 'Commande introuvable' });

    const authorized = req.user.role === 'admin'
      || order.buyer_id === req.user.id
      || order.vendor_id === req.user.id;
    if (!authorized) return res.status(403).json({ error: 'Non autorisé' });

    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders', verifyToken, async (req, res) => {
  const { cart, customerInfo, shippingCity, paymentMethod, paymentIntentId, couponCode } = req.body;
  if (!cart?.length) return res.status(400).json({ error: 'Panier vide' });
  if (!customerInfo?.name || !customerInfo?.email) return res.status(400).json({ error: 'Informations client manquantes' });

  try {
    // Validate stock atomically
    for (const item of cart) {
      const { data: product } = await supabase.from('products').select('stock, name, active, moderated').eq('id', item.id).single();
      if (!product || !product.active || !product.moderated) return res.status(400).json({ error: `Produit indisponible : ${item.name}` });
      if (product.stock < item.quantity) return res.status(400).json({ error: `Stock insuffisant pour ${item.name} (dispo: ${product.stock})` });
    }

    // Apply coupon
    let discountPercent = 0;
    if (couponCode) {
      const { data: coupon } = await supabase.from('coupons')
        .select('*').eq('code', couponCode.toUpperCase()).eq('active', true).single();
      if (coupon && (!coupon.expires_at || new Date(coupon.expires_at) > new Date())) {
        if (!coupon.max_uses || coupon.used_count < coupon.max_uses) {
          discountPercent = coupon.discount_percent;
          await supabase.from('coupons').update({ used_count: (coupon.used_count || 0) + 1 }).eq('id', coupon.id);
        }
      }
    }

    // Group by vendor
    const byVendor = {};
    cart.forEach(item => {
      if (!byVendor[item.vendor]) byVendor[item.vendor] = { vendorId: item.vendor, vendorName: item.vendorName, products: [] };
      byVendor[item.vendor].products.push(item);
    });

    const createdOrders = [];
    for (const group of Object.values(byVendor)) {
      const subtotal = group.products.reduce((s, p) => s + p.price * p.quantity, 0);
      const discount = subtotal * (discountPercent / 100);
      const total    = subtotal - discount;

      // Commission rate from vendor profile
      const { data: vendorProfile } = await supabase.from('profiles').select('commission_rate').eq('id', group.vendorId).single();
      const commissionRate = vendorProfile?.commission_rate || 15;

      const tracking = 'SN' + Math.floor(100000 + Math.random() * 900000);

      const { data: order, error } = await supabase.from('orders').insert({
        buyer_id       : req.user.id,
        buyer_name     : customerInfo.name,
        buyer_email    : customerInfo.email,
        buyer_address  : `${customerInfo.address}, ${customerInfo.postalCode || ''} ${shippingCity}`.trim(),
        buyer_phone    : customerInfo.phone || null,
        vendor_id      : group.vendorId,
        vendor_name    : group.vendorName,
        products       : group.products,
        subtotal,
        discount_amount: discount,
        total,
        commission     : total * (commissionRate / 100),
        status         : paymentIntentId ? 'processing' : 'pending_payment',
        payment_method : paymentMethod,
        stripe_payment_id: paymentIntentId || null,
        tracking_number: tracking,
        shipping_city  : shippingCity,
        coupon_code    : couponCode || null,
      }).select().single();
      if (error) throw error;

      // Decrement stock atomically
      for (const item of group.products) {
        await supabase.rpc('decrement_stock', { product_id: item.id, qty: item.quantity });
      }

      createdOrders.push(order);
      await sendEmail({ to: customerInfo.email, subject: emailTemplates.orderConfirmation(order).subject, html: emailTemplates.orderConfirmation(order).html });
      await pushNotification(req.user.id,     { type: 'order', title: '✅ Commande confirmée', message: `Commande ${order.id} — Suivi : ${tracking}`, link: `/orders/${order.id}` });
      await pushNotification(group.vendorId,  { type: 'order', title: '💰 Nouvelle commande',  message: `${customerInfo.name} — ${formatFCFA(total)}`, link: `/vendor/orders` });
    }

    res.json({ orders: createdOrders, message: `${createdOrders.length} commande(s) créée(s)` });
  } catch (e) {
    console.error('[create-order]', e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/status', verifyToken, requireRole('admin', 'vendor'), async (req, res) => {
  const { status, note } = req.body;
  const validStatuses = ['processing', 'in_transit', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  try {
    const { data: order } = await supabase.from('orders').select('buyer_id, id, vendor_id, total').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (req.user.role === 'vendor' && order.vendor_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });

    const updates = { status, [`${status}_at`]: new Date().toISOString() };
    if (note) updates.vendor_note = note;

    // Update vendor total_sales on delivery
    if (status === 'delivered') {
      const { data: vp } = await supabase.from('profiles').select('total_sales').eq('id', order.vendor_id).single();
      await supabase.from('profiles').update({
        total_sales: (vp?.total_sales || 0) + order.total
      }).eq('id', order.vendor_id);
    }

    await supabase.from('orders').update(updates).eq('id', req.params.id);
    const statusLabels = { processing: 'En préparation', in_transit: 'En transit 🚚', delivered: 'Livré ✅', cancelled: 'Annulé' };
    await pushNotification(order.buyer_id, {
      type: 'order',
      title: `Commande ${statusLabels[status]}`,
      message: `Votre commande ${order.id} est maintenant : ${statusLabels[status]}`,
      link: `/orders/${order.id}`,
    });
    res.json({ message: 'Statut mis à jour' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.buyer_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Non autorisé' });
    if (!['pending_payment', 'processing'].includes(order.status)) return res.status(400).json({ error: 'Commande non annulable (déjà expédiée ou livrée)' });

    await supabase.from('orders').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: req.body.reason || 'Annulé par le client',
    }).eq('id', req.params.id);

    // Restock
    for (const item of (order.products || [])) {
      await supabase.rpc('increment_stock', { product_id: item.id, qty: item.quantity });
    }

    // Refund if paid via Stripe
    if (order.stripe_payment_id && order.status === 'processing') {
      try {
        await stripe.refunds.create({ payment_intent: order.stripe_payment_id });
        await pushNotification(order.buyer_id, { type: 'order', title: '💸 Remboursement initié', message: `Remboursement commande ${order.id} en cours (3-5 jours ouvrés)` });
      } catch (e) { console.error('[refund]', e.message); }
    }

    await pushNotification(order.buyer_id,  { type: 'order', title: '❌ Commande annulée', message: `Votre commande ${order.id} a été annulée.` });
    await pushNotification(order.vendor_id, { type: 'order', title: 'Commande annulée', message: `Commande ${order.id} annulée par le client.` });
    res.json({ message: 'Commande annulée' });
  } catch (e) {
    console.error('[cancel-order]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── STRIPE PAYMENT ROUTES ────────────────────────────────────────────────────
app.post('/api/payments/create-intent', verifyToken, paymentLimiter, async (req, res) => {
  const { amount, currency = 'eur', metadata = {} } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Montant invalide' });

  try {
    const intent = await stripe.paymentIntents.create({
      amount     : Math.round(amount * 100), // cents
      currency,
      metadata   : { ...metadata, user_id: req.user.id, platform: 'nexus_market_sn' },
      description: `NEXUS Market — Commande pour ${req.user.name}`,
      receipt_email: req.user.email,
    });
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e) {
    console.error('[create-intent]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payments/mobile-money', verifyToken, paymentLimiter, async (req, res) => {
  const { provider, phone, amount, orderId } = req.body;
  if (!provider || !phone || !amount || !orderId) {
    return res.status(400).json({ error: 'provider, phone, amount et orderId requis' });
  }

  // Validate phone (Senegalese numbers: 7x xxx xx xx)
  const phoneClean = phone.replace(/\s/g, '');
  if (!/^(\+221|00221)?[76]\d{8}$/.test(phoneClean)) {
    return res.status(400).json({ error: 'Numéro de téléphone sénégalais invalide' });
  }

  console.log(`[MobileMoney] ${provider} — ${phone} — ${amount} FCFA — order: ${orderId}`);

  try {
    /* ─────────────────────────────────────────────────────────────────────
     * INTÉGRATION RÉELLE — À COMPLÉTER SELON L'OPÉRATEUR
     * ─────────────────────────────────────────────────────────────────────
     *
     * 1. ORANGE MONEY (Orange Money Web Payment)
     *    Documentation : https://dev.orange.com/api/omoney-webpay-sn
     *    endpoint      : POST https://api.orange.com/orange-money-webpay/sn/v1/webpayment
     *    Headers       : Authorization: Bearer <access_token>
     *    Body          : { merchant_key, currency, order_id, amount, return_url, cancel_url,
     *                      notif_url, lang, reference }
     *
     * const omResponse = await fetch('https://api.orange.com/orange-money-webpay/sn/v1/webpayment', {
     *   method: 'POST',
     *   headers: {
     *     'Authorization': `Bearer ${process.env.ORANGE_MONEY_TOKEN}`,
     *     'Content-Type': 'application/json',
     *   },
     *   body: JSON.stringify({
     *     merchant_key: process.env.ORANGE_MONEY_MERCHANT_KEY,
     *     currency: 'OUV',
     *     order_id: orderId,
     *     amount: Math.round(amount),
     *     return_url: `${process.env.FRONTEND_URL}/payment/success`,
     *     cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
     *     notif_url: `${process.env.BACKEND_URL}/webhooks/orange-money`,
     *     lang: 'fr',
     *     reference: orderId,
     *   }),
     * });
     * const omData = await omResponse.json();
     * if (!omResponse.ok) throw new Error(omData.message || 'Erreur Orange Money');
     * return res.json({ success: true, paymentUrl: omData.payment_url, transactionId: omData.pay_token });
     *
     * ─────────────────────────────────────────────────────────────────────
     * 2. WAVE (Wave Business API)
     *    Documentation : https://docs.wave.com/business
     *    endpoint      : POST https://api.wave.com/v1/checkout/sessions
     *    Headers       : Authorization: Bearer <WAVE_API_KEY>
     *
     * const waveResponse = await fetch('https://api.wave.com/v1/checkout/sessions', {
     *   method: 'POST',
     *   headers: {
     *     'Authorization': `Bearer ${process.env.WAVE_API_KEY}`,
     *     'Content-Type': 'application/json',
     *   },
     *   body: JSON.stringify({
     *     currency: 'XOF',
     *     amount: String(Math.round(amount)),
     *     error_url: `${process.env.FRONTEND_URL}/payment/cancel`,
     *     success_url: `${process.env.FRONTEND_URL}/payment/success?order=${orderId}`,
     *     client_reference: orderId,
     *   }),
     * });
     * const waveData = await waveResponse.json();
     * if (!waveResponse.ok) throw new Error(waveData.message || 'Erreur Wave');
     * return res.json({ success: true, paymentUrl: waveData.wave_launch_url, transactionId: waveData.id });
     *
     * ─────────────────────────────────────────────────────────────────────
     * 3. FREE MONEY (Free Mobile Sénégal)
     *    Contactez Free Mobile Sénégal pour les clés API : https://www.free.sn
     * ─────────────────────────────────────────────────────────────────────
     */

    // MODE SIMULATION — Supprimer en production
    await new Promise(r => setTimeout(r, 800));
    const transactionId = `${provider.toUpperCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Mark order as pending mobile payment
    await supabase.from('orders').update({
      payment_status: 'pending',
      mobile_money_ref: transactionId,
      payment_method: 'mobile',
    }).eq('id', orderId);

    await pushNotification(req.user.id, {
      type: 'order',
      title: '📱 Paiement Mobile Money en attente',
      message: `Vérifiez votre téléphone (${phone}) pour confirmer le paiement ${provider}.`,
      link: `/orders/${orderId}`,
    });

    res.json({
      success      : true,
      transactionId,
      provider,
      phone,
      amount,
      message      : `Paiement ${provider} initié — confirmez sur votre téléphone`,
      simulation   : true, // Retirer en production
    });
  } catch (e) {
    console.error('[mobile-money]', e);
    res.status(500).json({ error: e.message });
  }
});

// Webhook Mobile Money (Orange Money / Wave)
app.post('/webhooks/mobile-money', async (req, res) => {
  try {
    const { order_id, status, transaction_id, provider } = req.body;
    if (!order_id) return res.status(400).json({ error: 'order_id requis' });

    if (status === 'SUCCESS' || status === 'success') {
      const { data: order } = await supabase.from('orders').select('buyer_id, vendor_id, total').eq('id', order_id).single();
      await supabase.from('orders').update({
        status: 'processing',
        payment_status: 'paid',
        mobile_money_ref: transaction_id,
      }).eq('id', order_id);

      if (order) {
        await pushNotification(order.buyer_id, { type: 'order', title: '✅ Paiement confirmé', message: `Votre paiement ${provider} pour la commande ${order_id} a été confirmé.` });
        await pushNotification(order.vendor_id, { type: 'order', title: '💰 Paiement reçu', message: `Commande ${order_id} — ${formatFCFA(order.total)}` });
      }
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order_id);
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[webhook-mobile-money]', e);
    res.status(500).json({ error: e.message });
  }
});

async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[Webhook] Signature invalide:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        await supabase.from('orders').update({ status: 'processing', payment_status: 'paid', stripe_payment_id: pi.id }).eq('id', orderId);
        const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (order) {
          await sendEmail({ to: order.buyer_email, ...emailTemplates.orderConfirmation(order) });
          await pushNotification(order.buyer_id,  { type: 'order', title: '✅ Paiement confirmé', message: `Commande ${orderId} payée avec succès.`, link: `/orders/${orderId}` });
          await pushNotification(order.vendor_id, { type: 'order', title: '💰 Nouvelle commande payée', message: `Commande ${orderId} — ${formatFCFA(order.total)}`, link: `/vendor/orders` });
        }
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', orderId);
        const { data: order } = await supabase.from('orders').select('buyer_id').eq('id', orderId).single();
        if (order) {
          await pushNotification(order.buyer_id, { type: 'order', title: '❌ Paiement échoué', message: `Le paiement pour la commande ${orderId} a échoué. Veuillez réessayer.`, link: `/orders/${orderId}` });
        }
      }
      console.log('[Webhook] Paiement échoué:', pi.id, pi.last_payment_error?.message);
      break;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      console.warn('[Webhook] ⚠️ Litige ouvert:', dispute.id, dispute.amount, dispute.reason);
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      for (const admin of (admins || [])) {
        await pushNotification(admin.id, { type: 'system', title: '⚠️ Litige Stripe', message: `Litige #${dispute.id} — ${Math.round(dispute.amount / 100)} ${dispute.currency.toUpperCase()}`, link: '/admin/disputes' });
      }
      break;
    }
  }
  res.json({ received: true });
}

// ─── COUPONS ──────────────────────────────────────────────────────────────────
app.get('/api/coupons/validate/:code', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('coupons')
      .select('*').eq('code', req.params.code.toUpperCase()).eq('active', true).single();
    if (error || !data) return res.status(404).json({ error: 'Code promo invalide' });
    if (data.expires_at && new Date(data.expires_at) < new Date()) return res.status(400).json({ error: 'Code promo expiré' });
    if (data.max_uses && data.used_count >= data.max_uses) return res.status(400).json({ error: 'Code promo épuisé' });
    res.json({ valid: true, discount: data.discount_percent, type: data.type, description: data.description, code: data.code });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/coupons', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/coupons', verifyToken, requireRole('admin'), async (req, res) => {
  const { code, discount_percent, type = 'percent', description, expires_at, max_uses, min_order_amount } = req.body;
  if (!code || !discount_percent) return res.status(400).json({ error: 'Code et remise requis' });
  if (discount_percent <= 0 || discount_percent > 100) return res.status(400).json({ error: 'Remise entre 1% et 100%' });
  try {
    const { data, error } = await supabase.from('coupons').insert({
      code: code.toUpperCase(), discount_percent, type, description, expires_at: expires_at || null,
      max_uses: max_uses || null, min_order_amount: min_order_amount || 0,
      active: true, used_count: 0, created_by: req.user.id,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce code existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.patch('/api/coupons/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { active } = req.body;
  try {
    const { data, error } = await supabase.from('coupons').update({ active }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── RETURNS ──────────────────────────────────────────────────────────────────
app.get('/api/returns', verifyToken, async (req, res) => {
  try {
    let query = supabase.from('return_requests').select('*').order('created_at', { ascending: false });
    if (req.user.role === 'buyer') query = query.eq('buyer_id', req.user.id);
    else if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/returns', verifyToken, requireRole('buyer'), async (req, res) => {
  const { orderId, category, description } = req.body;
  if (!orderId || !category || !description) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (description.length < 20) return res.status(400).json({ error: 'Description trop courte (min 20 caractères)' });

  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('buyer_id', req.user.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (order.status !== 'delivered') return res.status(400).json({ error: 'Retour possible uniquement sur commande livrée' });
    const daysSince = Math.floor((Date.now() - new Date(order.delivered_at || order.created_at).getTime()) / 86400000);
    if (daysSince > 30) return res.status(400).json({ error: `Délai de retour dépassé (${daysSince} jours > 30 jours autorisés)` });

    // Check no existing return
    const { data: existingReturn } = await supabase.from('return_requests').select('id, status').eq('order_id', orderId).single();
    if (existingReturn) return res.status(409).json({ error: `Une demande de retour existe déjà (statut : ${existingReturn.status})` });

    const { data: ret, error } = await supabase.from('return_requests').insert({
      order_id   : orderId,
      buyer_id   : req.user.id,
      buyer_name : req.user.name,
      vendor_id  : order.vendor_id,
      vendor_name: order.vendor_name,
      products   : order.products,
      order_total: order.total,
      category, description, status: 'pending',
    }).select().single();
    if (error) throw error;

    await supabase.from('orders').update({ return_status: 'requested', return_id: ret.id }).eq('id', orderId);
    await pushNotification(req.user.id,     { type: 'return', title: '📦 Retour enregistré', message: `Demande pour commande ${orderId} reçue. Traitement sous 48h.` });
    await pushNotification(order.vendor_id, { type: 'return', title: '⚠️ Demande de retour', message: `${req.user.name} — commande ${orderId}`, link: '/vendor/returns' });
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, { type: 'return', title: '🔄 Nouveau retour', message: `${req.user.name} — commande ${orderId} — ${category}`, link: '/admin/returns' });
    }
    res.json(ret);
  } catch (e) {
    console.error('[return]', e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/returns/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { status, admin_notes } = req.body;
  const validStatuses = ['approved', 'rejected', 'refunded'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  try {
    const { data: ret } = await supabase.from('return_requests').select('*').eq('id', req.params.id).single();
    if (!ret) return res.status(404).json({ error: 'Demande introuvable' });

    await supabase.from('return_requests').update({
      status,
      admin_notes: admin_notes || null,
      [`${status}_at`]: new Date().toISOString(),
    }).eq('id', req.params.id);

    if (status === 'refunded') {
      const { data: order } = await supabase.from('orders').select('stripe_payment_id').eq('id', ret.order_id).single();
      if (order?.stripe_payment_id) {
        try { await stripe.refunds.create({ payment_intent: order.stripe_payment_id }); }
        catch (e) { console.error('[refund]', e); }
      }
      await pushNotification(ret.buyer_id, { type: 'return', title: '💸 Remboursement envoyé', message: `Remboursement de ${formatFCFA(ret.order_total)} en cours (3-5 jours ouvrés).` });
    } else {
      await pushNotification(ret.buyer_id, {
        type: 'return',
        title: status === 'approved' ? '✅ Retour approuvé' : '❌ Retour refusé',
        message: status === 'approved'
          ? `Votre demande de retour a été approuvée.${admin_notes ? ' ' + admin_notes : ''}`
          : `Votre demande de retour a été refusée.${admin_notes ? ' Raison : ' + admin_notes : ''}`,
      });
    }
    res.json({ message: 'Statut retour mis à jour' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DISPUTES ─────────────────────────────────────────────────────────────────
app.get('/api/disputes', verifyToken, async (req, res) => {
  try {
    let query = supabase.from('disputes').select('*').order('created_at', { ascending: false });
    if (req.user.role === 'buyer') query = query.eq('buyer_id', req.user.id);
    else if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/disputes', verifyToken, requireRole('buyer'), async (req, res) => {
  const { orderId, reason, description } = req.body;
  if (!orderId || !reason || !description) return res.status(400).json({ error: 'orderId, reason et description requis' });
  if (description.length < 20) return res.status(400).json({ error: 'Description trop courte (min 20 caractères)' });

  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('buyer_id', req.user.id).single();
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (!['processing', 'in_transit', 'delivered'].includes(order.status)) {
      return res.status(400).json({ error: 'Litige impossible sur cette commande' });
    }

    const { data: existing } = await supabase.from('disputes').select('id').eq('order_id', orderId).eq('status', 'open').single();
    if (existing) return res.status(409).json({ error: 'Un litige est déjà ouvert pour cette commande' });

    const { data: dispute, error } = await supabase.from('disputes').insert({
      order_id   : orderId,
      buyer_id   : req.user.id,
      buyer_name : req.user.name,
      vendor_id  : order.vendor_id,
      vendor_name: order.vendor_name,
      order_total: order.total,
      reason, description, status: 'open',
    }).select().single();
    if (error) throw error;

    await supabase.from('orders').update({ dispute_id: dispute.id, has_dispute: true }).eq('id', orderId);

    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, { type: 'system', title: '⚖️ Nouveau litige', message: `${req.user.name} — commande ${orderId} — ${reason}`, link: '/admin/disputes' });
    }
    await pushNotification(order.vendor_id, { type: 'system', title: '⚖️ Litige ouvert', message: `Un litige a été ouvert sur votre commande ${orderId}. Notre équipe va examiner.`, link: `/vendor/orders` });
    await sendEmail({ to: req.user.email, ...emailTemplates.disputeOpened(req.user.name, orderId, reason) });

    res.status(201).json(dispute);
  } catch (e) {
    console.error('[dispute]', e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/disputes/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { status, resolution, admin_notes } = req.body;
  const validStatuses = ['open', 'investigating', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  try {
    const { data: dispute } = await supabase.from('disputes').select('*').eq('id', req.params.id).single();
    if (!dispute) return res.status(404).json({ error: 'Litige introuvable' });

    await supabase.from('disputes').update({
      status, resolution: resolution || null, admin_notes: admin_notes || null,
      resolved_by: req.user.id,
      [`${status}_at`]: new Date().toISOString(),
    }).eq('id', req.params.id);

    if (status === 'resolved' || status === 'closed') {
      await pushNotification(dispute.buyer_id,  { type: 'system', title: `⚖️ Litige ${status === 'resolved' ? 'résolu' : 'fermé'}`, message: resolution || `Votre litige sur la commande ${dispute.order_id} a été traité.` });
      await pushNotification(dispute.vendor_id, { type: 'system', title: `⚖️ Litige ${status === 'resolved' ? 'résolu' : 'fermé'}`, message: `Le litige sur la commande ${dispute.order_id} a été traité.` });
    }
    res.json({ message: 'Litige mis à jour' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
app.get('/api/messages', verifyToken, async (req, res) => {
  try {
    const { with: withUserId } = req.query;
    let query = supabase.from('messages').select('*').order('created_at', { ascending: true });

    if (withUserId) {
      query = query.or(
        `and(from_id.eq.${req.user.id},to_id.eq.${withUserId}),and(from_id.eq.${withUserId},to_id.eq.${req.user.id})`
      );
      // Mark as read
      await supabase.from('messages').update({ read: true })
        .eq('to_id', req.user.id).eq('from_id', withUserId).eq('read', false);
    } else {
      // Return conversation list (latest message per contact)
      query = query.or(`from_id.eq.${req.user.id},to_id.eq.${req.user.id}`)
        .order('created_at', { ascending: false }).limit(100);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!withUserId) {
      // Deduplicate by conversation partner
      const seen = new Set();
      const conversations = [];
      for (const msg of (data || [])) {
        const partnerId = msg.from_id === req.user.id ? msg.to_id : msg.from_id;
        const partnerName = msg.from_id === req.user.id ? msg.to_name : msg.from_name;
        if (!seen.has(partnerId)) {
          seen.add(partnerId);
          conversations.push({ partnerId, partnerName, lastMessage: msg.text, lastAt: msg.created_at, unread: msg.to_id === req.user.id && !msg.read });
        }
      }
      return res.json(conversations);
    }

    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/messages/unread-count', verifyToken, async (req, res) => {
  try {
    const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true })
      .eq('to_id', req.user.id).eq('read', false);
    res.json({ count: count || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/messages', verifyToken, async (req, res) => {
  const { recipientId, text } = req.body;
  if (!recipientId || !text?.trim()) return res.status(400).json({ error: 'Destinataire et message requis' });
  if (recipientId === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer un message' });

  try {
    const { data: recipient } = await supabase.from('profiles').select('name, email').eq('id', recipientId).single();
    if (!recipient) return res.status(404).json({ error: 'Destinataire introuvable' });

    const { data, error } = await supabase.from('messages').insert({
      from_id  : req.user.id,
      from_name: req.user.name,
      to_id    : recipientId,
      to_name  : recipient.name,
      text     : text.trim(),
      read     : false,
    }).select().single();
    if (error) throw error;

    const tpl = emailTemplates.newMessage(req.user.name, text);
    await sendEmail({ to: recipient.email, subject: tpl.subject, html: tpl.html });
    await pushNotification(recipientId, { type: 'message', title: `💬 Message de ${req.user.name}`, message: text.length > 100 ? text.slice(0, 97) + '...' : text });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, unread_only } = req.query;
    let query = supabase.from('notifications').select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (unread_only === 'true') query = query.eq('read', false);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ notifications: data || [], total: count, unread: (data || []).filter(n => !n.read).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    await supabase.from('notifications').update({ read: true })
      .eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ message: 'Notification marquée comme lue' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/notifications/read-all', verifyToken, async (req, res) => {
  try {
    await supabase.from('notifications').update({ read: true })
      .eq('user_id', req.user.id).eq('read', false);
    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── WISHLISTS ────────────────────────────────────────────────────────────────
app.get('/api/wishlists', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('wishlists')
      .select('product_id, created_at, products(*)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/wishlists', verifyToken, async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requis' });
  try {
    const { error } = await supabase.from('wishlists')
      .upsert({ user_id: req.user.id, product_id: productId }, { onConflict: 'user_id, product_id' });
    if (error) throw error;
    res.json({ message: 'Produit ajouté à la liste de souhaits' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/wishlists/:productId', verifyToken, async (req, res) => {
  try {
    await supabase.from('wishlists').delete().eq('user_id', req.user.id).eq('product_id', req.params.productId);
    res.json({ message: 'Produit retiré de la liste de souhaits' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── OFFERS ──────────────────────────────────────────────────────────────────
app.get('/api/offers', verifyToken, async (req, res) => {
  try {
    let query = supabase.from('offers').select('*').order('created_at', { ascending: false });
    if (req.user.role === 'buyer') query = query.eq('buyer_id', req.user.id);
    else if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/offers', verifyToken, requireRole('buyer'), async (req, res) => {
  const { productId, offeredPrice, message } = req.body;
  if (!productId || !offeredPrice) return res.status(400).json({ error: 'productId et offeredPrice requis' });
  if (offeredPrice <= 0) return res.status(400).json({ error: 'Prix invalide' });

  try {
    const { data: product } = await supabase.from('products').select('name, vendor_id, vendor_name, price').eq('id', productId).single();
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    if (offeredPrice >= product.price) return res.status(400).json({ error: 'L\'offre doit être inférieure au prix affiché' });

    const { data: existing } = await supabase.from('offers')
      .select('id, status').eq('product_id', productId).eq('buyer_id', req.user.id).eq('status', 'pending').single();
    if (existing) return res.status(409).json({ error: 'Vous avez déjà une offre en attente pour ce produit' });

    const { data: offer, error } = await supabase.from('offers').insert({
      product_id   : productId,
      product_name : product.name,
      buyer_id     : req.user.id,
      buyer_name   : req.user.name,
      vendor_id    : product.vendor_id,
      offered_price: offeredPrice,
      message      : message || null,
      status       : 'pending',
    }).select().single();
    if (error) throw error;

    await pushNotification(product.vendor_id, {
      type: 'offer',
      title: `💰 Nouvelle offre — ${product.name}`,
      message: `${req.user.name} propose ${formatFCFA(offeredPrice)} (prix : ${formatFCFA(product.price)})`,
      link: '/vendor/offers',
    });

    const { data: vendor } = await supabase.from('profiles').select('email').eq('id', product.vendor_id).single();
    if (vendor?.email) {
      const tpl = emailTemplates.offerReceived(product.vendor_name, product.name, req.user.name, offeredPrice);
      await sendEmail({ to: vendor.email, subject: tpl.subject, html: tpl.html });
    }

    res.status(201).json(offer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/offers/:id', verifyToken, requireRole('vendor'), async (req, res) => {
  const { status, counter_price } = req.body;
  const validStatuses = ['accepted', 'rejected'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide (accepted | rejected)' });

  try {
    const { data: offer } = await supabase.from('offers').select('*').eq('id', req.params.id).single();
    if (!offer) return res.status(404).json({ error: 'Offre introuvable' });
    if (offer.vendor_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Cette offre a déjà été traitée' });

    await supabase.from('offers').update({
      status, counter_price: counter_price || null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    await pushNotification(offer.buyer_id, {
      type: 'offer',
      title: status === 'accepted' ? `✅ Offre acceptée — ${offer.product_name}` : `❌ Offre refusée — ${offer.product_name}`,
      message: status === 'accepted'
        ? `Votre offre de ${formatFCFA(offer.offered_price)} a été acceptée ! Vous pouvez maintenant passer commande.`
        : counter_price
          ? `Votre offre a été refusée. Contre-proposition : ${formatFCFA(counter_price)}.`
          : 'Votre offre a été refusée par le vendeur.',
    });

    res.json({ message: `Offre ${status === 'accepted' ? 'acceptée' : 'refusée'}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── REVIEWS ──────────────────────────────────────────────────────────────────
app.get('/api/reviews/:productId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('reviews').select('*')
      .eq('product_id', req.params.productId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reviews', verifyToken, requireRole('buyer'), async (req, res) => {
  const { productId, rating, comment } = req.body;
  if (!productId || !rating) return res.status(400).json({ error: 'Produit et note requis' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Note entre 1 et 5' });

  try {
    // Verify buyer purchased this product
    const { data: order } = await supabase.from('orders').select('id').eq('buyer_id', req.user.id).eq('status', 'delivered')
      .contains('products', JSON.stringify([{ id: productId }])).single();
    if (!order) return res.status(403).json({ error: 'Vous devez avoir acheté et reçu ce produit pour laisser un avis' });

    const { data, error } = await supabase.from('reviews').upsert(
      { product_id: productId, user_id: req.user.id, user_name: req.user.name, rating, comment: comment || null },
      { onConflict: 'product_id, user_id' }
    ).select().single();
    if (error) throw error;

    // Recalculate product average rating
    const { data: allReviews } = await supabase.from('reviews').select('rating').eq('product_id', productId);
    if (allReviews?.length) {
      const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
      await supabase.from('products').update({ rating: Math.round(avg * 10) / 10, reviews_count: allReviews.length }).eq('id', productId);
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── STOCK ALERTS ────────────────────────────────────────────────────────────
app.post('/api/stock-alerts', verifyToken, async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requis' });
  try {
    const { error } = await supabase.from('stock_alerts')
      .upsert({ product_id: productId, user_id: req.user.id, user_email: req.user.email }, { onConflict: 'product_id, user_id' });
    if (error) throw error;
    res.json({ message: 'Alerte stock activée — vous serez notifié dès que ce produit sera disponible' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/stock-alerts/:productId', verifyToken, async (req, res) => {
  try {
    await supabase.from('stock_alerts').delete().eq('product_id', req.params.productId).eq('user_id', req.user.id);
    res.json({ message: 'Alerte stock désactivée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stock-alerts/notify/:productId', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: alerts } = await supabase.from('stock_alerts').select('user_id, user_email').eq('product_id', req.params.productId);
    const { data: product } = await supabase.from('products').select('name').eq('id', req.params.productId).single();
    for (const alert of (alerts || [])) {
      await pushNotification(alert.user_id, { type: 'system', title: '🔔 Produit disponible !', message: `"${product?.name}" est de nouveau en stock sur NEXUS Market.` });
      if (alert.user_email) {
        await sendEmail({ to: alert.user_email, subject: `✅ ${product?.name} est disponible — NEXUS Market`, html: `<p>Le produit <strong>${product?.name}</strong> est de nouveau en stock.<br><a href="${process.env.FRONTEND_URL}">Acheter maintenant</a></p>` });
      }
    }
    await supabase.from('stock_alerts').delete().eq('product_id', req.params.productId);
    res.json({ notified: alerts?.length || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FLASH SALES ──────────────────────────────────────────────────────────────
app.get('/api/flash-sales', async (req, res) => {
  try {
    const { data } = await supabase.from('flash_sales')
      .select('*, products(name, price, image_url, category)')
      .eq('active', true).gt('ends_at', new Date().toISOString());
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flash-sales', verifyToken, requireRole('admin'), async (req, res) => {
  const { productId, discount, hours } = req.body;
  if (!productId || !discount || !hours) return res.status(400).json({ error: 'productId, discount et hours requis' });
  const endsAt = new Date(Date.now() + (hours || 24) * 3600000).toISOString();
  try {
    const { data, error } = await supabase.from('flash_sales').insert({ product_id: productId, discount_percent: discount, ends_at: endsAt, active: true, created_by: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── VENDORS (PUBLIC) ─────────────────────────────────────────────────────────
app.get('/api/vendors', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    let query = supabase.from('profiles').select('id, name, avatar, bio, rating, total_sales, shop_category, created_at', { count: 'exact' })
      .eq('role', 'vendor').eq('status', 'approved');

    if (category) query = query.eq('shop_category', category);
    if (search)   query = query.ilike('name', `%${search}%`);
    query = query.order('total_sales', { ascending: false });

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ vendors: data, total: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/vendors/:id', async (req, res) => {
  try {
    const { data: vendor } = await supabase.from('profiles')
      .select('id, name, avatar, bio, rating, total_sales, shop_category, created_at')
      .eq('id', req.params.id).eq('role', 'vendor').single();
    if (!vendor) return res.status(404).json({ error: 'Vendeur introuvable' });

    const { data: products } = await supabase.from('products').select('*')
      .eq('vendor_id', req.params.id).eq('active', true).eq('moderated', true)
      .order('created_at', { ascending: false });

    const productIds = (products || []).map(p => p.id);
    let reviews = [];
    if (productIds.length > 0) {
      const { data: rev } = await supabase.from('reviews').select('rating, comment, user_name, created_at')
        .in('product_id', productIds).order('created_at', { ascending: false }).limit(10);
      reviews = rev || [];
    }

    res.json({ vendor, products: products || [], reviews });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PAYOUT REQUESTS ──────────────────────────────────────────────────────────
app.get('/api/payout-requests', verifyToken, async (req, res) => {
  try {
    let query = supabase.from('payout_requests').select('*').order('created_at', { ascending: false });
    if (req.user.role === 'vendor') query = query.eq('vendor_id', req.user.id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payout-requests', verifyToken, requireRole('vendor'), async (req, res) => {
  const { method, provider, destination, amount } = req.body;
  if (!method || !destination || !amount) return res.status(400).json({ error: 'method, destination et amount requis' });
  if (amount < 10) return res.status(400).json({ error: 'Montant minimum de retrait : 10 EUR' });

  try {
    // Check if vendor has enough net earnings
    const { data: orders } = await supabase.from('orders')
      .select('total, commission').eq('vendor_id', req.user.id).eq('status', 'delivered');
    const totalNet = (orders || []).reduce((s, o) => s + (o.total - o.commission), 0);

    const { data: pendingPayouts } = await supabase.from('payout_requests')
      .select('amount').eq('vendor_id', req.user.id).eq('status', 'pending');
    const pendingTotal = (pendingPayouts || []).reduce((s, p) => s + p.amount, 0);

    if (amount > totalNet - pendingTotal) {
      return res.status(400).json({ error: `Solde insuffisant. Disponible : ${formatFCFA(totalNet - pendingTotal)}` });
    }

    const { data, error } = await supabase.from('payout_requests').insert({
      vendor_id: req.user.id, vendor_name: req.user.name,
      amount, method, provider: provider || null, destination, status: 'pending',
    }).select().single();
    if (error) throw error;

    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await pushNotification(admin.id, { type: 'system', title: '💰 Demande de retrait', message: `${req.user.name} — ${formatFCFA(amount)} via ${method}`, link: '/admin/payouts' });
    }
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/payout-requests/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { status, note } = req.body;
  const validStatuses = ['paid', 'rejected'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide (paid | rejected)' });

  try {
    const { data: req_ } = await supabase.from('payout_requests').select('vendor_id, amount, provider, method').eq('id', req.params.id).single();
    if (!req_) return res.status(404).json({ error: 'Demande introuvable' });

    await supabase.from('payout_requests').update({
      status, admin_note: note || null,
      processed_at: new Date().toISOString(), processed_by: req.user.id,
    }).eq('id', req.params.id);

    await pushNotification(req_.vendor_id, {
      type: 'system',
      title: status === 'paid' ? '✅ Retrait effectué' : '❌ Retrait refusé',
      message: status === 'paid'
        ? `Votre retrait de ${formatFCFA(req_.amount)} a été effectué via ${req_.provider || req_.method}.`
        : `Votre demande de retrait de ${formatFCFA(req_.amount)} a été refusée.${note ? ' Raison : ' + note : ' Contactez le support.'}`,
    });
    res.json({ message: 'Statut mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: stats } = await supabase.from('platform_stats').select('*').single();
    const { data: recentOrders } = await supabase.from('orders').select('id, total, status, buyer_name, created_at')
      .order('created_at', { ascending: false }).limit(10);
    const { data: topVendors } = await supabase.from('vendor_stats').select('*').order('total_revenue', { ascending: false }).limit(5);
    const { data: pendingCount } = await supabase.from('pending_vendors').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { data: disputeCount } = await supabase.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open');

    res.json({
      stats,
      recentOrders: recentOrders || [],
      topVendors: topVendors || [],
      pendingVendors: pendingCount || 0,
      openDisputes: disputeCount || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/vendors/pending', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('pending_vendors').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/vendors/:id/approve', verifyToken, requireRole('admin'), async (req, res) => {
  const { approved, reason } = req.body;
  try {
    const { data: pending } = await supabase.from('pending_vendors').select('*').eq('id', req.params.id).single();
    if (!pending) return res.status(404).json({ error: 'Demande introuvable' });

    if (approved) {
      // Create profile
      const { data: profile, error } = await supabase.from('profiles').insert({
        name: pending.name,
        email: pending.email,
        password_hash: pending.password_hash,
        role: 'vendor',
        status: 'approved',
        avatar: pending.avatar,
        shop_category: pending.category,
        commission_rate: 15,
      }).select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Email déjà enregistré' });
        throw error;
      }

      const tpl = emailTemplates.vendorApproved(pending.name);
      await sendEmail({ to: pending.email, subject: tpl.subject, html: tpl.html });
    } else {
      const tpl = emailTemplates.vendorRejected(pending.name, reason);
      await sendEmail({ to: pending.email, subject: tpl.subject, html: tpl.html });
    }

    await supabase.from('pending_vendors').update({
      status: approved ? 'approved' : 'rejected',
      notes: reason || null,
    }).eq('id', req.params.id);

    res.json({ message: approved ? 'Vendeur approuvé et compte créé' : 'Demande refusée' });
  } catch (e) {
    console.error('[approve-vendor]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/payouts', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: orders } = await supabase.from('orders').select('vendor_id, vendor_name, total, commission, status, created_at').eq('status', 'delivered');
    const payouts = {};
    for (const o of (orders || [])) {
      if (!payouts[o.vendor_id]) payouts[o.vendor_id] = { vendorId: o.vendor_id, vendorName: o.vendor_name, totalSales: 0, totalCommission: 0, netPayout: 0, ordersCount: 0 };
      payouts[o.vendor_id].totalSales     += o.total;
      payouts[o.vendor_id].totalCommission+= o.commission;
      payouts[o.vendor_id].netPayout      += o.total - o.commission;
      payouts[o.vendor_id].ordersCount    += 1;
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

    if (banned) {
      await sendEmail({
        to: user.email,
        subject: '⚠️ Compte suspendu — NEXUS Market',
        html: `<p>Bonjour ${user.name},</p><p>Votre compte a été suspendu.${reason ? ' Raison : ' + reason : ''}</p><p>Contactez <a href="mailto:support@nexus.sn">support@nexus.sn</a> pour plus d'informations.</p>`,
      });
    }

    res.json({ message: banned ? 'Utilisateur suspendu' : 'Compte réactivé' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin CSV export
app.get('/api/admin/export/:type', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    let data, filename, headers;

    switch (req.params.type) {
      case 'orders': {
        const { data: orders } = await supabase.from('orders').select('id, buyer_name, buyer_email, vendor_name, total, status, payment_method, created_at').order('created_at', { ascending: false });
        data = orders;
        filename = `nexus-orders-${new Date().toISOString().slice(0, 10)}.csv`;
        headers = ['ID', 'Acheteur', 'Email', 'Vendeur', 'Total (EUR)', 'Statut', 'Paiement', 'Date'];
        data = (orders || []).map(o => [o.id, o.buyer_name, o.buyer_email, o.vendor_name, o.total, o.status, o.payment_method, new Date(o.created_at).toLocaleDateString('fr-FR')]);
        break;
      }
      case 'users': {
        const { data: users } = await supabase.from('profiles').select('id, name, email, role, status, created_at').order('created_at', { ascending: false });
        filename = `nexus-users-${new Date().toISOString().slice(0, 10)}.csv`;
        headers = ['ID', 'Nom', 'Email', 'Rôle', 'Statut', 'Inscrit le'];
        data = (users || []).map(u => [u.id, u.name, u.email, u.role, u.status, new Date(u.created_at).toLocaleDateString('fr-FR')]);
        break;
      }
      case 'products': {
        const { data: products } = await supabase.from('products').select('id, name, category, price, stock, vendor_name, rating, active, moderated').order('created_at', { ascending: false });
        filename = `nexus-products-${new Date().toISOString().slice(0, 10)}.csv`;
        headers = ['ID', 'Produit', 'Catégorie', 'Prix (EUR)', 'Stock', 'Vendeur', 'Note', 'Actif', 'Modéré'];
        data = (products || []).map(p => [p.id, p.name, p.category, p.price, p.stock, p.vendor_name, p.rating, p.active ? 'Oui' : 'Non', p.moderated ? 'Oui' : 'Non']);
        break;
      }
      default:
        return res.status(400).json({ error: 'Type d\'export invalide (orders | users | products)' });
    }

    const csvRows = [headers.join(','), ...data.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))];
    const csv = '\uFEFF' + csvRows.join('\r\n'); // UTF-8 BOM for Excel

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
  let storageStatus = false;

  try {
    await supabase.from('profiles').select('id', { head: true, count: 'exact' });
    dbStatus = 'ok';
  } catch { dbStatus = 'error'; }

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    storageStatus = (buckets || []).some(b => b.name === 'products');
  } catch { storageStatus = false; }

  const stripePub    = process.env.NEXT_PUBLIC_STRIPE_KEY || '';
  const stripeSecret = process.env.STRIPE_SECRET_KEY      || '';
  const emailjsOk    = !!(process.env.EMAILJS_PUBLIC_KEY || 'WSBntSTWdh5d9usZC');

  res.json({
    status    : dbStatus === 'ok' ? 'OK' : 'DEGRADED',
    service   : 'GasTon 360 API',
    timestamp : new Date().toISOString(),
    latency_ms: Date.now() - start,
    version   : '3.1.1',
    services  : {
      database  : dbStatus,
      storage   : storageStatus,
      stripe    : (stripePub.startsWith('pk_test_') || stripePub.startsWith('pk_live_')) &&
                  (stripeSecret.startsWith('sk_test_') || stripeSecret.startsWith('sk_live_')),
      stripe_mode: stripePub.startsWith('pk_live_') ? 'live' : 'test',
      email     : emailjsOk,
      email_provider: 'emailjs',
      webhook_ok: !!(process.env.STRIPE_WEBHOOK_SECRET),
    },
    project: {
      name   : process.env.NEXT_PUBLIC_MARKET_NAME || 'GasTon 360',
      url    : process.env.NEXT_PUBLIC_APP_URL     || 'https://nexus-market-md360.vercel.app',
      admin  : process.env.ADMIN_EMAIL             || 'admin@nexus.sn',
    },
    endpoints : {
      auth      : ['/api/auth/register', '/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/me', '/api/auth/profile', '/api/auth/change-password'],
      products  : ['/api/products', '/api/products/:id', 'POST /api/products', 'PATCH /api/products/:id', 'DELETE /api/products/:id', '/api/products/:id/moderate'],
      orders    : ['/api/orders', '/api/orders/:id', 'POST /api/orders', '/api/orders/:id/status', '/api/orders/:id/cancel'],
      payments  : ['/api/payments/create-intent', '/api/payments/mobile-money'],
      messages  : ['/api/messages', 'POST /api/messages', '/api/messages/unread-count'],
      notifications: ['/api/notifications', '/api/notifications/:id/read', '/api/notifications/read-all'],
      wishlists : ['/api/wishlists', 'POST /api/wishlists', 'DELETE /api/wishlists/:productId'],
      offers    : ['/api/offers', 'POST /api/offers', 'PATCH /api/offers/:id'],
      disputes  : ['/api/disputes', 'POST /api/disputes', 'PATCH /api/disputes/:id'],
      returns   : ['/api/returns', 'POST /api/returns', 'PATCH /api/returns/:id'],
      admin     : ['/api/admin/stats', '/api/admin/vendors/pending', '/api/admin/vendors/:id/approve', '/api/admin/payouts', '/api/admin/users/:id/ban', '/api/admin/export/:type'],
      webhook   : ['/api/webhooks/stripe'],
    },
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route introuvable: ${req.method} ${req.path}` }));

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ─── START (local dev uniquement) ────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    console.log(`\n🚀 GasTon 360 API v3.1.1 démarré sur le port ${PORT}`);
    console.log(`   Stripe   : ${process.env.STRIPE_SECRET_KEY ? '✅ configuré' : '⚠️  manquant'}`);
    console.log(`   Supabase : ${supaUrl && svcKey ? '✅ configuré' : '⚠️  manquant'}`);
    console.log(`   EmailJS  : ${process.env.EMAILJS_PUBLIC_KEY || 'WSBntSTWdh5d9usZC' ? '✅ configuré' : '⚠️  manquant'}`);
    console.log(`   Webhook  : ${process.env.STRIPE_WEBHOOK_SECRET ? '✅ configuré' : '⚠️  manquant'}`);
    console.log(`   Health   : http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
