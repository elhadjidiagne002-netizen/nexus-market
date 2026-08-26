-- ============================================================================
-- Photos génériques pour Immobilier (39 fiches) + Location (2 fiches) — aucune
-- des deux n'avait jamais eu de photo, même dans la source de prospection
-- d'origine (prospection/catalogue_immobilier_senegal.csv et
-- catalogue_location_senegal.csv : colonne Image_url vide sur 100% des lignes,
-- ce n'est pas un bug d'import). Chaque fiche retombait donc sur l'image
-- générique du site (/og-image.png), identique sur les 39 pages.
--
-- Vérifié : les annonceurs cités (ex. « Flèche Immo », tél. +221 33 867 17 91)
-- sont de VRAIES agences sénégalaises — mais réutiliser leurs propres photos de
-- biens sans autorisation recréerait le problème de contenu copié déjà corrigé
-- pour l'électronique (cf. sql/2026_08_26_fix_product_images.sql). Décision
-- utilisateur (2026-08-26) : photos GÉNÉRIQUES libres de droits, une par type
-- de bien plutôt qu'une par annonce.
--
-- Source : Wikimedia Commons (licences CC0/CC BY/CC BY-SA — toutes autorisent
-- la réutilisation commerciale). Redimensionnées à 1200px max côté long avant
-- upload (les originaux Commons faisaient jusqu'à 23 Mo — non postées telles
-- quelles, cf. sensibilité égress déjà documentée pour ce projet).
--   - appartement (+ studios, non distingués en property_type) :
--     "Modern living room..." — Shixart1985, CC BY 2.0
--   - villa : "Croix villa cavrois depuis jardin.jpg" — Velvet, CC BY-SA 4.0
--   - terrain : "Vacant plot of land..." — Richard Sutcliffe, CC BY-SA 2.0
--   - bureau : "Desks in an open office space (Unsplash).jpg" — Crew crew, CC0
--   - local commercial : "A vacant retail storefront..." — Jackilometresan, CC0
--   - immeuble : "F. E. Cottrell apartment building..." — Dewees, John Michael, CC0
--   - événementiel (Location) : "Marquee tents for events.jpg" — Barbieri.wiki, CC BY-SA 3.0
-- ⚠️ CC BY / CC BY-SA exigent une attribution visible quelque part sur le site
-- (une page crédits/mentions légales suffit) — pas encore fait, à ajouter.
--
-- Idempotent : rejouer ce script réapplique juste les mêmes URLs.
-- ============================================================================

UPDATE public.products p
SET image_url = v.image_url,
    images = array[v.image_url]
FROM (VALUES
  ('appartement', 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/appartement.jpg'),
  ('villa', 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/villa.jpg'),
  ('terrain', 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/terrain.jpg'),
  ('bureau', 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/bureau.jpg'),
  ('local commercial', 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/local_commercial.jpg'),
  ('immeuble', 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/immeuble.jpg')
) AS v(property_type, image_url)
WHERE p.category = 'Immobilier'
  AND p.realestate_specs->>'property_type' = v.property_type;

UPDATE public.products
SET image_url = 'https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/evenementiel.jpg',
    images = array['https://pqcqbstbdujzaclsiosv.supabase.co/storage/v1/object/public/nexus-images/products/generic-immobilier-location/evenementiel.jpg']
WHERE category = 'Location';
