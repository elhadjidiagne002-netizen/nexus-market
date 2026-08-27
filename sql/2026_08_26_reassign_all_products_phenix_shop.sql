-- ============================================================================
-- Réattribution de TOUS les produits de la base au vendeur « phenix shop »
-- ============================================================================
-- Contexte : audit demandé par l'utilisateur pour comparer
-- catalogue_electronique_import_nexus_importer.csv (478 produits) avec l'état
-- actuel de public.products. Résultat : les 478 produits du fichier sont DÉJÀ
-- tous présents en base (comparaison par nom normalisé — accents/tirets/casse
-- ignorés — 478/478 trouvés, 0 manquant) → rien à importer de ce côté, ce
-- script ne couvre donc QUE la seconde demande : réattribuer l'ensemble des
-- produits existants (651 lignes, tous vendeurs confondus) au compte
-- « phenix shop » (samba ndoye, princepod51@gmail.com,
-- id 6e468cb1-70e8-478f-8f5c-7660fd1a27d1 — le seul profil dont
-- shop_name = 'phenix shop' exactement ; à ne pas confondre avec les 2 comptes
-- "phenix inc" trouvés en parallèle, non concernés).
--
-- ⚠️ Périmètre = LITTÉRALEMENT tous les produits, y compris 2 qui n'appartenaient
-- ni au catalogue scrapé (admin@nexus.sn) ni à phenix shop : « PROMPT MASTER »
-- (compte DC digital / almactuum7@gmail.com) et « le coran » (compte deme sene /
-- mor92d@gmail.com) — ces 2 produits changeront donc RÉELLEMENT de propriétaire.
-- Le reste (648 produits admin@nexus.sn + 1 déjà chez phenix shop : « beignet »)
-- n'a pas de vrai propriétaire distinct à déposséder.
--
-- Idempotent : rejouer ce script ne change plus rien à la 2e exécution.
-- ============================================================================

-- Étape 1 (vérification avant réattribution) :
-- SELECT p.id, p.name, p.category, pr.email AS proprietaire_actuel
-- FROM public.products p
-- LEFT JOIN public.profiles pr ON pr.id = p.vendor_id
-- WHERE p.vendor_id IS DISTINCT FROM '6e468cb1-70e8-478f-8f5c-7660fd1a27d1'
-- ORDER BY pr.email, p.name;

-- Étape 2 (réattribution) :
UPDATE public.products
SET vendor_id = '6e468cb1-70e8-478f-8f5c-7660fd1a27d1',
    vendor_name = 'phenix shop'
WHERE vendor_id IS DISTINCT FROM '6e468cb1-70e8-478f-8f5c-7660fd1a27d1'
   OR vendor_name IS DISTINCT FROM 'phenix shop';

-- Étape 3 (contrôle après réattribution) — doit renvoyer 651 (ou le total actuel) :
-- SELECT count(*) FROM public.products WHERE vendor_id = '6e468cb1-70e8-478f-8f5c-7660fd1a27d1';
