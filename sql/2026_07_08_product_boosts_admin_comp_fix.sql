-- [FIX] "Offrir un Boost" (admin, gratuit) échouait TOUJOURS : le payload envoyé par
-- AdminDashboard.grant() (payment_method:'admin_comp', price_fcfa:0) violait les CHECK
-- constraints ci-dessous, qui ne connaissaient que les paiements réels (wave/orange_money/
-- card, price_fcfa>0). Symptôme observé : "new row violates row-level security policy for
-- table product_boosts" — en réalité un admin sans droits DB obtient l'erreur RLS ; un admin
-- valide (is_admin() OK, policy boosts_admin_all) passe la RLS mais échoue ensuite sur ces
-- CHECK constraints, avec un message différent mais le même symptôme "impossible de booster".
-- Fix : autoriser 'admin_comp' comme payment_method et price_fcfa=0 pour les boosts offerts.

ALTER TABLE product_boosts DROP CONSTRAINT IF EXISTS product_boosts_payment_method_check;
ALTER TABLE product_boosts ADD CONSTRAINT product_boosts_payment_method_check
  CHECK (payment_method = ANY (ARRAY['wave'::text, 'orange_money'::text, 'card'::text, 'admin_comp'::text]));

ALTER TABLE product_boosts DROP CONSTRAINT IF EXISTS product_boosts_price_fcfa_check;
ALTER TABLE product_boosts ADD CONSTRAINT product_boosts_price_fcfa_check
  CHECK (price_fcfa >= 0);
