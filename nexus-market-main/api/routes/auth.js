// backend/middleware/auth.js
// Vérification JWT Supabase + extraction utilisateur

import { createClient } from '@supabase/supabase-js';

// Client avec la clé anon (respecte le RLS)
const supabaseClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Middleware : vérifie le JWT Bearer et injecte req.user
 */
export const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token manquant' });
        }

        const token = authHeader.slice(7);

        // Vérifier le JWT via Supabase
        const { data: { user }, error } = await supabaseClient.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Token invalide ou expiré' });
        }

        // Récupérer le profil complet
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (!profile) {
            return res.status(401).json({ error: 'Profil introuvable' });
        }

        if (!profile.is_active) {
            return res.status(403).json({ error: 'Compte désactivé' });
        }

        req.user     = profile;
        req.token    = token;
        req.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // Mettre à jour last_seen (async, sans bloquer)
        supabaseClient
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', user.id)
            .then(() => {})
            .catch(() => {});

        next();
    } catch (err) {
        console.error('[Auth middleware]', err.message);
        res.status(500).json({ error: 'Erreur authentification' });
    }
};

/**
 * Middleware : authentification optionnelle
 */
export const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }
    return requireAuth(req, res, next);
};

/**
 * Middleware : vérifier le rôle
 */
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: `Accès réservé : ${roles.join(', ')}` });
    }
    next();
};

export const requireAdmin  = requireRole('admin');
export const requireVendor = requireRole('vendor', 'admin');
export const requireBuyer  = requireRole('buyer', 'admin');
