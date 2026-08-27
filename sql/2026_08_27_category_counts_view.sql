-- Vue de comptage par catégorie pour la sidebar "Filtres" de l'accueil statique
-- (public/index.html). Remplace les comptes codés en dur ("Alimentation (210)"…)
-- qui ne correspondaient à aucun produit réel. Exécutée en prod le 2026-08-27.
create or replace view public.category_counts as
select category, count(*)::int as cnt
from public.products
where coalesce(active, true) = true
  and coalesce(is_educational, false) = false
  and category is not null
group by category;

grant select on public.category_counts to anon, authenticated;
