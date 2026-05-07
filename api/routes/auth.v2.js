// backend/routes/auth.js
// Authentification : register, login, logout, reset password

import { Router }     from 'express';
import { supabaseAdmin } from '../server.js';
import { requireAuth }   from '../middleware/auth.js';
import { createClient }  from '@supabase/supabase-js';

const router = Router();

const supabaseAnon = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, role = 'buyer', phone, city, shopName } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ message: 'email, password et name sont requis' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'Le mot de passe doit faire au moins 8 caractères' });
        }
        if (!['buyer','vendor','admin'].includes(role)) {
            return res.status(400).json({ message: 'Rôle invalide' });
        }

        const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        // Créer l'utilisateur Supabase Auth
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email:             email.trim().toLowerCase(),
            password,
            email_confirm:     false,          // email de confirmation envoyé
            user_metadata:     { name, role, avatar, phone, city }
        });

        if (error) {
            if (error.message.includes('already registered')) {
                return res.status(409).json({ message: 'Cet email est déjà utilisé' });
            }
            return res.status(400).json({ message: error.message });
        }

        const uid = data.user.id;

        // Créer profil (le trigger le fait aussi, mais upsert pour être sûr)
        await supabaseAdmin.from('profiles').upsert({
            id: uid, email: email.trim().toLowerCase(),
            name, role, avatar, phone, city
        });

        // Si vendeur → créer vendor_profile
        if (role === 'vendor' && shopName) {
            await supabaseAdmin.from('vendor_profiles').upsert({
                user_id: uid,
                shop_name: shopName,
                status: 'pending'
            });
        }

        res.status(201).json({
            message: 'Compte créé avec succès. Vérifiez votre email.',
            emailConfirmPending: true,
            user: { id: uid, email: data.user.email, name, role }
        });
    } catch (err) {
        console.error('[register]', err.message);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'email et password requis' });
        }

        const { data, error } = await supabaseAnon.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });

        if (error) {
            return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
        }

        // Récupérer profil enrichi
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        res.json({
            token:      data.session.access_token,
            expiresIn:  data.session.expires_in,
            user:       profile || { id: data.user.id, email: data.user.email }
        });
    } catch (err) {
        console.error('[login]', err.message);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
    try {
        await req.supabase.auth.signOut();
        res.json({ message: 'Déconnecté avec succès' });
    } catch (err) {
        res.json({ message: 'Déconnecté' });
    }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
    try {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*, vendor_profiles(*)')
            .eq('id', req.user.id)
            .single();

        res.json(profile || req.user);
    } catch (err) {
        res.json(req.user);
    }
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────
router.patch('/profile', requireAuth, async (req, res) => {
    try {
        const allowed = ['name', 'phone', 'address', 'city', 'bio', 'website', 'preferences'];
        const updates = {};
        allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update(updates)
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) return res.status(400).json({ message: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'email requis' });

        const { error } = await supabaseAnon.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.SITE_URL || 'https://nexus.sn'}/#reset`
        });

        // Toujours retourner succès (sécurité : ne pas révéler si l'email existe)
        res.json({ message: 'Si ce compte existe, un email a été envoyé.' });
    } catch (err) {
        res.json({ message: 'Si ce compte existe, un email a été envoyé.' });
    }
});

export default router;
