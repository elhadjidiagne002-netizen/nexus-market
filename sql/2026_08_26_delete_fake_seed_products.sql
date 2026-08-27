-- ============================================================================
-- Suppression des produits fictifs (données de seed/dev, pas de vrais articles)
-- ============================================================================
-- Audit de public.products (667 lignes au total) : la quasi-totalité des
-- produits réels appartient au compte admin@nexus.sn (648 lignes — le
-- catalogue électronique/immobilier/location scrapé, cf. CLAUDE.md §
-- Dashboard/§ audit prospection). En creusant le reste, 16 produits sont sans
-- ambiguïté des données de démo insérées pendant le développement, pas de
-- vrais articles vendables :
--
-- 1) 12 produits à UUID fabriqué à la main « a0000001-0000-4000-8000-0000000000XX »
--    (X=1..12), vendor_id NULL, images picsum.photos/seed/... (placeholder),
--    créés en rafale à +1 jour d'écart (2026-04-30 → 2026-05-10, 22:28:01) —
--    catalogue de démo générique (Smartphone, Boubou, Thiéboudienne, Café
--    Touba...) pour peupler le site avant les premiers vrais vendeurs.
--    ⚠️ Vérifié : 35 commandes JSON (orders.products) les référencent, mais
--    TOUTES ces commandes ont buyer_id NULL (aucun vrai acheteur) — donc elles
--    aussi sont des artefacts de test (QA du tunnel de paiement), pas de vraies
--    ventes. La suppression des produits n'affecte aucune commande réelle
--    (orders.products est un instantané JSON, pas une FK).
--
-- 2) 4 produits des 2 comptes vendeur factices créés au même instant
--    (2026-04-28 12:14:04.988364+00), images Unsplash génériques, comptes
--    « TechZone Sénégal » (vendeur@nexus.sn) et « Wax & Co » (shop@nexus.sn) —
--    emails placeholder de dev, jamais des vraies inscriptions.
--
-- PAS inclus (laissés en l'état, à vérifier toi-même si besoin) : 3 produits
-- isolés (« beignet », « PROMPT MASTER », « le coran ») postés par de VRAIS
-- comptes actifs (connexion réelle, autres produits/commandes réelles) —
-- possiblement des tests personnels, mais je ne peux pas garantir qu'il ne
-- s'agit pas d'un vrai article ; à toi de trancher au cas par cas.
--
-- Idempotent : rejouer ce script ne fait rien si déjà appliqué (plus aucune
-- ligne ne correspond aux critères après la première exécution).
-- ============================================================================

-- Étape 1 (vérification avant suppression) :
-- SELECT id, name, category, price, vendor_id, created_at, image_url
-- FROM public.products
-- WHERE id::text LIKE 'a0000001-0000-4000-8000-0000000000%'
--    OR vendor_id IN (SELECT id FROM public.profiles WHERE email IN ('vendeur@nexus.sn','shop@nexus.sn'))
-- ORDER BY created_at;

-- Étape 2 (suppression) :
DELETE FROM public.products
WHERE id::text LIKE 'a0000001-0000-4000-8000-0000000000%'
   OR vendor_id IN (
     SELECT id FROM public.profiles WHERE email IN ('vendeur@nexus.sn', 'shop@nexus.sn')
   );

-- Étape 3 (contrôle après suppression) — doit renvoyer 0 :
-- SELECT count(*) FROM public.products
-- WHERE id::text LIKE 'a0000001-0000-4000-8000-0000000000%'
--    OR vendor_id IN (SELECT id FROM public.profiles WHERE email IN ('vendeur@nexus.sn','shop@nexus.sn'));
