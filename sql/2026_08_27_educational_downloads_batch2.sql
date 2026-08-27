-- ============================================================================
-- NEXUS Éducation — 2e lot de 15 cours CC BY-SA (Wikiversité), pour étoffer la
-- collection au-delà des 20 déjà importés (sql/2026_08_27_educational_downloads.sql).
-- Mêmes règles : price=0.01 (contournement CHECK products_price_check, jamais
-- affiché — cf. PriceDisplay/isEducationalListing), fichiers hébergés (copies,
-- pas de liens externes), attribution CC BY-SA 4.0 dans educational_specs.
-- Nouvelles matières couvertes : Économie, Informatique, Droit, Espagnol,
-- Allemand, Latin (+ probabilités/mécanique des fluides en approfondissement
-- Mathématiques/Physique, sixième/quatrième en approfondissement collège).
-- Idempotent : rejouer ce script ne change plus rien à la 2e exécution.
-- ============================================================================

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
  ('economie-systemes', 'Les systèmes économiques', 'Les_systèmes_économiques', 'lycee', 'Économie', 'economie', 'Panorama des grands systèmes économiques (capitalisme, socialisme, économies mixtes).'),
  ('info-algorithmique', 'Algorithmique', 'Algorithmique', 'universite', 'Informatique', 'informatique', 'Introduction aux bases de l''algorithmique.'),
  ('info-structures-donnees', 'Introduction aux structures de données, algorithmes et programmation', 'Introduction_aux_structures_de_données,_algorithmes_et_programmation', 'universite', 'Informatique', 'informatique', 'Cours d''introduction aux structures de données et à la programmation.'),
  ('maths-sixieme', 'Mathématiques en sixième', 'Mathématiques_en_sixième', 'college', 'Mathématiques', 'mathematiques', 'Programme de mathématiques de sixième.'),
  ('maths-quatrieme', 'Mathématiques en quatrième', 'Mathématiques_en_quatrième', 'college', 'Mathématiques', 'mathematiques', 'Programme de mathématiques de quatrième.'),
  ('physique-mecanique-fluides', 'Mécanique des fluides', 'Mécanique_des_fluides', 'universite', 'Physique', 'physique', 'Cours de mécanique des fluides niveau université.'),
  ('physique-seconde', 'Physique en seconde générale et technologique', 'Physique_en_seconde_générale_et_technologique', 'lycee', 'Physique', 'physique', 'Cours de physique-chimie pour la classe de seconde.'),
  ('droit-obligations', 'Droit des obligations', 'Droit_des_obligations', 'universite', 'Droit', 'droit', 'Cours de droit des obligations (contrats, responsabilité civile).'),
  ('histoire-geo-seconde', 'Histoire-géographie en seconde générale et technologique', 'Histoire-géographie_en_seconde_générale_et_technologique', 'lycee', 'Histoire-Géographie', 'histoire-geo', 'Programme d''histoire-géographie de seconde.'),
  ('histoire-geo-premiere', 'Histoire-géographie en première générale', 'Histoire-géographie_en_première_générale', 'lycee', 'Histoire-Géographie', 'histoire-geo', 'Programme d''histoire-géographie de première générale.'),
  ('espagnol-conjugaison', 'Espagnol/Grammaire/Conjugaison', 'Espagnol/Grammaire/Conjugaison', 'college', 'Espagnol', 'espagnol', 'Leçon de conjugaison espagnole.'),
  ('allemand-grammaire-phrase', 'Allemand/Grammaire/Phrase', 'Allemand/Grammaire/Phrase', 'college', 'Allemand', 'allemand', 'Leçon de grammaire allemande sur la construction de la phrase.'),
  ('latin-cinquieme', 'Latin en cinquième', 'Latin_en_cinquième', 'college', 'Latin', 'latin', 'Programme de latin de cinquième.'),
  ('maths-probabilites-combinatoire', 'Probabilités, statistiques et combinatoire', 'Probabilités,_statistiques_et_combinatoire', 'universite', 'Mathématiques', 'mathematiques', 'Cours de probabilités, statistiques et combinatoire niveau université.'),
  ('maths-probabilites-conditionnelles', 'Probabilités conditionnelles', 'Probabilités_conditionnelles', 'lycee', 'Mathématiques', 'mathematiques', 'Cours sur les probabilités conditionnelles.')
) AS v(slug, title, wiki_slug, level, subject, cover, blurb)
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.vendor_id = (SELECT id FROM adm) AND p.name = v.title AND p.is_educational = true
);
