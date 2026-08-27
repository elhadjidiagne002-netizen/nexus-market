-- Comptage réel par métier pour les chips de filtre du module NEXUS Pro
-- (public/index.html, overlay #nx-pro-ov). Évite de télécharger les ~2500
-- lignes de `pros` juste pour afficher un nombre par chip. Exécutée en
-- prod le 2026-08-27.
create or replace view public.pro_profession_counts as
select profession, count(*)::int as cnt
from public.pros
where status = 'active' and disponible = true and profession is not null
group by profession;

grant select on public.pro_profession_counts to anon, authenticated;
