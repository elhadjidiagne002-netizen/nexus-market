-- ============================================================
-- NEXUS Market Sénégal — Migration v3.2 (complète)
-- À exécuter dans Supabase SQL Editor APRÈS schema.sql initial
-- ============================================================

-- ─── 1. REFRESH TOKENS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_expires ON refresh_tokens(expires_at);
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access" ON refresh_tokens USING (false);

-- ─── 2. POINTS DE FIDÉLITÉ ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_points (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    order_id    TEXT REFERENCES orders(id) ON DELETE SET NULL,
    type        TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
    points      INT NOT NULL CHECK (points > 0),
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_user ON loyalty_points(user_id);
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own loyalty read"  ON loyalty_points FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin loyalty all" ON loyalty_points FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE OR REPLACE VIEW loyalty_balances AS
SELECT
    user_id,
    SUM(CASE WHEN type = 'earn'   THEN points ELSE 0    END) AS total_earned,
    SUM(CASE WHEN type = 'redeem' THEN points ELSE 0    END) AS total_redeemed,
    SUM(CASE WHEN type = 'earn'   THEN points ELSE -points END) AS balance
FROM loyalty_points
GROUP BY user_id;

-- ─── 3. VOTES SUR AVIS ──────────────────────────────────────────────────────
-- Empêche un utilisateur de voter deux fois pour le même avis (POST /api/reviews/:id/helpful)
CREATE TABLE IF NOT EXISTS review_votes (
    review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (review_id, user_id)
);
ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own votes" ON review_votes FOR ALL USING (user_id = auth.uid());

-- Fonction RPC pour incrémenter helpful de façon atomique
CREATE OR REPLACE FUNCTION increment_review_helpful(review_id UUID)
RETURNS VOID AS $$
  UPDATE reviews SET helpful = COALESCE(helpful, 0) + 1 WHERE id = review_id;
$$ LANGUAGE SQL;

-- ─── 4. CHAMP deleted SUR MESSAGES ──────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- ─── 5. CHAMP admin_notes SUR ORDERS ────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- ─── 6. COLONNES MANQUANTES SUR TABLES EXISTANTES ───────────────────────────

-- orders : taux de commission appliqué + transaction mobile + transporteur
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS commission_rate       NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS mobile_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS carrier               TEXT;

-- coupons : montant fixe FCFA + coupon nominatif fidélité
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS owner_id        UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index d'idempotence Stripe
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_pi_unique
  ON orders(stripe_payment_id)
  WHERE stripe_payment_id IS NOT NULL;

-- Index numéro de suivi
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number)
  WHERE tracking_number IS NOT NULL;

-- Index recherche full-text sur profiles pour /api/search
CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles USING gin(name gin_trgm_ops);

-- ─── 7. NETTOYAGE AUTOMATIQUE DES TOKENS EXPIRÉS (optionnel) ────────────────
-- Décommenter si pg_cron est activé dans votre projet Supabase :
-- SELECT cron.schedule('purge-expired-tokens', '0 3 * * *',
--   $$DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day'$$);

-- ─── 8. VARIABLE .env À AJOUTER ─────────────────────────────────────────────
-- WAVE_WEBHOOK_SECRET=whsec_xxxxxxxx  (dashboard Wave Développeur → Webhooks)

-- ─── 9. RÉCAPITULATIF COMPLET DES ROUTES API v3.2 ───────────────────────────
--
-- AUTH (7 routes)
--   POST   /api/auth/register           inscription + email bienvenue + refreshToken
--   POST   /api/auth/login              connexion + refreshToken
--   GET    /api/auth/me                 profil connecté (reload frontend)
--   POST   /api/auth/refresh            renouveler JWT (rotation token)
--   POST   /api/auth/logout             déconnexion (révocation)
--   PATCH  /api/auth/profile            modifier profil
--   PATCH  /api/auth/change-password    changer mot de passe
--   POST   /api/auth/forgot-password    demande reset
--   POST   /api/auth/reset-password     reset avec code OTP
--
-- PAIEMENTS (5 routes)
--   POST   /api/payments/create-intent
--   POST   /api/payments/mobile-money             Orange Money / Wave (réel + simulation)
--   POST   /api/payments/mobile-money/initiate    endpoint alternatif
--   POST   /webhooks/stripe
--   POST   /api/webhooks/orange-money
--   POST   /api/webhooks/wave                     HMAC SHA-256 vérifié
--
-- COMMANDES (7 routes)
--   POST   /api/orders                  créer (idempotent + coupon fixed/percent)
--   GET    /api/orders                  liste paginée (?page=&limit=&status=)
--   GET    /api/orders/:id              détail
--   PATCH  /api/orders/:id/status       mise à jour + loyalty auto à delivered
--   PATCH  /api/orders/:id/cancel       annuler + remboursement Stripe
--   PATCH  /api/orders/:id/tracking     numéro suivi + email expédition
--   GET    /api/admin/orders            vue admin filtrée paginée
--   PATCH  /api/admin/orders/:id        admin force-update statut/paiement
--
-- PRODUITS (7 routes)
--   GET    /api/products                liste filtrée paginée
--   POST   /api/products                créer (vendor)
--   GET    /api/products/:id            détail
--   PATCH  /api/products/:id            modifier
--   DELETE /api/products/:id            désactiver
--   PATCH  /api/products/:id/moderate   modérer (admin)
--   PATCH  /api/products/:id/images     galerie images
--   GET    /api/products/similar/:id    produits similaires (8 max)
--
-- RECHERCHE
--   GET    /api/search?q=&type=products,vendors&page=&limit=
--
-- AVIS (3 routes)
--   POST   /api/reviews                 déposer (achat vérifié)
--   GET    /api/reviews/:productId      liste paginée par produit
--   POST   /api/reviews/:id/helpful     voter "utile" (1 vote/user)
--
-- FIDÉLITÉ (2 routes)
--   GET    /api/loyalty                 solde + historique
--   POST   /api/loyalty/redeem          100 pts → coupon 1 000 FCFA
--
-- COUPONS (4 routes)
--   GET    /api/coupons/validate/:code  valider un code
--   GET    /api/coupons                 liste admin paginée
--   POST   /api/coupons                 créer (admin)
--   PATCH  /api/coupons/:id             activer/modifier (admin)
--   DELETE /api/coupons/:id             désactiver (admin)
--
-- MESSAGES (4 routes)
--   GET    /api/messages                conversations groupées
--   POST   /api/messages                envoyer
--   PATCH  /api/messages/:id/read       marquer lu
--   DELETE /api/messages/:id            supprimer (soft)
--
-- ADMIN DIVERS
--   GET    /api/admin/stats             statistiques globales
--   GET    /api/admin/reports/monthly   rapport financier mensuel
--   GET    /api/admin/users             liste utilisateurs
--   PATCH  /api/admin/users/:id/status  ban / unban
--   GET    /api/admin/vendors (+ pending, approve, reject, ban, commission)
--   GET    /api/admin/products/pending
--   GET    /api/admin/disputes
--   GET    /api/admin/payouts
--   GET    /api/admin/export/orders     CSV commandes
--   GET    /api/admin/export/vendors    CSV vendeurs
--   GET    /api/admin/export/users      CSV utilisateurs
--
-- VENDOR
--   GET    /api/vendor/stats            statistiques vendeur
--   GET    /api/vendor/commission       taux de commission propre
--
-- DIVERS (inchangés)
--   GET/POST/DELETE /api/wishlists/:productId
--   GET/POST/PATCH  /api/offers/:id
--   GET/PATCH/DELETE /api/notifications
--   GET/POST/DELETE /api/stock-alerts
--   POST            /api/stock-alerts/notify/:productId
--   GET/POST        /api/flash-sales
--   POST/PATCH      /api/payout-requests
--   GET             /api/vendors/:id
--   GET             /api/returns (+ PATCH admin)
--   POST            /api/upload
--   GET             /api/health

-- ─── 10. CHECKLIST GO-LIVE ──────────────────────────────────────────────────
-- [ ] Exécuter ce fichier dans Supabase SQL Editor
-- [ ] Ajouter WAVE_WEBHOOK_SECRET dans .env
-- [ ] Tester les 9 routes auth (register, login, me, refresh, logout, change-pw...)
-- [ ] Tester /api/search?q=boubou
-- [ ] Tester coupon type 'fixed' sur une commande
-- [ ] Livrer une commande → vérifier +X points dans /api/loyalty
-- [ ] Tester POST /api/loyalty/redeem → coupon FIDELITEXXXXXX dans coupons
-- [ ] Appliquer coupon FIDELITEXXXXXX sur nouvelle commande → remise 1 000 FCFA
-- [ ] GET /api/admin/reports/monthly → vérifier conversionRate, topVendors
-- [ ] GET /api/admin/export/users → CSV avec BOM UTF-8 (Excel lisible)
-- [ ] PATCH /api/admin/orders/:id → forcer delivered → loyalty attribuée
-- [ ] POST /api/reviews/:id/helpful → 409 si double vote
-- [ ] DELETE /api/messages/:id → text = '[Message supprimé]' dans DB
-- [ ] PATCH /api/orders/:id/tracking → email d'expédition reçu par acheteur
-- [ ] Virement vendeur paid → email payoutProcessed reçu
-- [ ] Vérifier WAVE_WEBHOOK_SECRET dans webhook Wave (signature HMAC)
-- [ ] Supprimer nexus_reset.html du serveur web public
