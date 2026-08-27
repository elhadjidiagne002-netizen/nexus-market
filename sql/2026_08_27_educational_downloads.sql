-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Éducation 🎓 — plateforme de téléchargement gratuit de cours/exercices
--  pour élèves et étudiants.
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
--
--  · products.is_educational / educational_specs → verticale téléchargement
--    gratuit (même pattern que is_rental/is_realestate/is_animal).
--  · Contenu = 20 cours/manuels PDF issus de Wikiversité/Wikilivres
--    (fr.wikiversity.org), tous sous licence CC BY-SA 4.0 — seule source
--    retenue après vérification (APPRENDRE/AUF écarté : tous droits réservés,
--    pas de licence ouverte). Attribution : titre + "Wikiversité" + lien +
--    licence, dans educational_specs (affichée par le front).
--  · Fichiers hébergés (copies, pas de simples liens) dans le bucket public
--    existant `nexus-images` : products/educational/covers/*.jpg (couvertures
--    génériques par matière, créées pour ce site, aucune attribution requise)
--    et products/educational/pdfs/*.pdf (les cours eux-mêmes).
--  · price = 0.01 EUR (symbolique — la contrainte CHECK products_price_check
--    interdit price=0 ; le front ignore ce prix pour is_educational=true et
--    affiche toujours "Télécharger gratuitement", jamais de paiement réel) ;
--    stock = 999999 (copie numérique, pas de rupture possible) ; active +
--    moderated = true (pas de modération nécessaire, contenu vérifié à la
--    source).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_educational    boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS educational_specs jsonb;
-- {level, subject, source, source_title, source_url, license, license_url, file_type}

CREATE INDEX IF NOT EXISTS idx_products_is_educational ON public.products(is_educational) WHERE is_educational = true;

WITH adm AS (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1),
base_url AS (SELECT 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/educational/' AS u)
INSERT INTO public.products (name, category, price, stock, description, image_url, file_url, vendor_id, vendor_name, active, moderated, is_educational, educational_specs)
SELECT
  v.title,
  'Éducation',
  0.01,
  999999,
  v.blurb || ' Source : Wikiversité (fr.wikiversity.org), licence CC BY-SA 4.0. Document éducatif libre, sans lien avec un établissement scolaire sénégalais officiel — vérifiez la conformité au programme local avant usage en classe.',
  (SELECT u FROM base_url) || 'covers/' || v.cover || '.jpg',
  (SELECT u FROM base_url) || 'pdfs/' || v.slug || '.pdf',
  (SELECT id FROM adm),
  'NEXUS Éducation',
  true,
  true,
  true,
  jsonb_build_object(
    'level', v.level,
    'subject', v.subject,
    'source', 'Wikiversité',
    'source_title', v.title,
    'source_url', 'https://fr.wikiversity.org/wiki/' || v.wiki_slug,
    'license', 'CC BY-SA 4.0',
    'license_url', 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
    'file_type', 'pdf'
  )
FROM (VALUES
  ('maths-seconde', 'Mathématiques en seconde générale et technologique', 'Mathématiques_en_seconde_générale_et_technologique', 'lycee', 'Mathématiques', 'mathematiques', 'Cours complet de mathématiques de seconde : fonctions, équations, statistiques, géométrie.'),
  ('maths-troisieme', 'Mathématiques en troisième', 'Mathématiques_en_troisième', 'college', 'Mathématiques', 'mathematiques', 'Programme de mathématiques de troisième : calcul littéral, fonctions, théorème de Pythagore et Thalès.'),
  ('maths-terminale-stmg', 'Mathématiques en terminale STMG', 'Mathématiques_en_terminale_STMG', 'lycee', 'Mathématiques', 'mathematiques', 'Cours de mathématiques pour la terminale STMG : suites, fonctions, probabilités.'),
  ('chimie-lycee', 'Cours de chimie de lycée (France)', 'Cours_de_chimie_de_lycée_(France)', 'lycee', 'Chimie', 'chimie', 'Cours de chimie couvrant le programme du lycée français.'),
  ('physique-lycee', 'Cours de physique de lycée (France)', 'Cours_de_physique_de_lycée_(France)', 'lycee', 'Physique', 'physique', 'Cours de physique couvrant le programme du lycée français.'),
  ('physique-premiere', 'Physique en première générale', 'Physique_en_première_générale', 'lycee', 'Physique', 'physique', 'Cours de physique-chimie pour la classe de première générale.'),
  ('histoire-geo-cinquieme', 'Histoire-géographie en cinquième', 'Histoire-géographie_en_cinquième', 'college', 'Histoire-Géographie', 'histoire-geo', 'Programme d''histoire-géographie de cinquième.'),
  ('histoire-geo-sixieme', 'Histoire-géographie en sixième', 'Histoire-géographie_en_sixième', 'college', 'Histoire-Géographie', 'histoire-geo', 'Programme d''histoire-géographie de sixième.'),
  ('francais-proposition-subordonnee', 'Proposition subordonnée en français', 'Proposition_subordonnée_en_français', 'college', 'Français', 'francais', 'Leçon de grammaire française sur les propositions subordonnées.'),
  ('francais-present-indicatif', 'Présent de l''indicatif en conjugaison française', 'Présent_de_l''indicatif_en_conjugaison_française', 'college', 'Français', 'francais', 'Leçon de conjugaison sur le présent de l''indicatif.'),
  ('philosophie-terminale', 'Philosophie en terminale générale', 'Philosophie_en_terminale_générale', 'lycee', 'Philosophie', 'philosophie', 'Cours de philosophie pour la terminale générale.'),
  ('hlp-terminale', 'Humanités, littérature et philosophie en terminale générale', 'Humanités,_littérature_et_philosophie_en_terminale_générale', 'lycee', 'Philosophie', 'philosophie', 'Cours de l''enseignement de spécialité HLP en terminale.'),
  ('hlp-premiere', 'Humanités, littérature et philosophie en première générale', 'Humanités,_littérature_et_philosophie_en_première_générale', 'lycee', 'Philosophie', 'philosophie', 'Cours de l''enseignement de spécialité HLP en première.'),
  ('maths-theorie-groupes', 'Théorie des groupes', 'Théorie_des_groupes', 'universite', 'Mathématiques', 'mathematiques', 'Cours d''algèbre sur la théorie des groupes (niveau licence/université).'),
  ('chimie-bcpst1', 'Chimie en BCPST1 (France)', 'Chimie_en_BCPST1_(France)', 'universite', 'Chimie', 'chimie', 'Cours de chimie pour la classe préparatoire BCPST1.'),
  ('maths-outils-physique-pcsi', 'Outils mathématiques pour la physique (PCSI)', 'Outils_mathématiques_pour_la_physique_(PCSI)', 'universite', 'Mathématiques', 'mathematiques', 'Outils mathématiques utiles pour la physique, niveau prépa PCSI.'),
  ('physique-thermodynamique', 'Cours de thermodynamique', 'Cours_de_thermodynamique', 'universite', 'Physique', 'physique', 'Cours de thermodynamique niveau université.'),
  ('svt-biologie-cellulaire', 'Introduction à la biologie cellulaire', 'Introduction_à_la_biologie_cellulaire', 'universite', 'SVT / Biologie', 'svt-biologie', 'Introduction aux concepts de base de la biologie cellulaire.'),
  ('anglais-quatrieme', 'Anglais en quatrième', 'Anglais_en_quatrième', 'college', 'Anglais', 'anglais', 'Programme d''anglais de quatrième.'),
  ('anglais-conjugaison-present', 'Anglais/Grammaire/Conjugaison/Exercices/Présent', 'Anglais/Grammaire/Conjugaison/Exercices/Présent', 'college', 'Anglais', 'anglais', 'Exercices de conjugaison anglaise sur le présent.')
) AS v(slug, title, wiki_slug, level, subject, cover, blurb)
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.vendor_id = (SELECT id FROM adm) AND p.name = v.title AND p.is_educational = true
);
