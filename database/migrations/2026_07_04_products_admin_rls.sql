-- =====================================================================
-- « L'admin peut tout faire » sur les produits.
-- Jusqu'ici, `products` n'avait que des policies VENDEUR (vendor_id = auth.uid()) :
-- l'admin ne pouvait ni booster, ni modérer, ni éditer les produits des AUTRES
-- vendeurs — les UPDATE échouaient SILENCIEUSEMENT (0 ligne, aucune erreur).
-- Impacte le panneau Boosts (AdminBoostsPanel) ET le validateBoost / la
-- modération produits existants.
-- Appliqué en prod (pqcqbstbdujzaclsiosv) le 2026-07-04.
-- =====================================================================
create policy products_admin_all on public.products
  for all using (public.is_admin()) with check (public.is_admin());
