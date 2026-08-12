-- ============================================================================
-- REGISTRE GLOBAL des entités déjà exportées vers Supabase — pour dédupliquer les
-- FUTURES prospections. Recense (nom + téléphone normalisés) : comptes, prospects,
-- produits (vendeurs), lignes transport, annonces express.
-- Usage : exporter en CSV la requête ci-dessous, puis filtrer les nouveaux CSV avec
--         tools/scraper/dedupe-registry.mjs.
-- ============================================================================

-- Helpers de normalisation (téléphone 9 derniers chiffres ; nom sans accents/casse).
create or replace function public.reg_phone9(t text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(t,''),'\D','','g'),9) $$;

create or replace function public.reg_norm(t text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(t,''),
      'àâäáãçéèêëíïîìóôöòõúùûüýñ','aaaaaceeeeiiiiooooouuuuyn')),
    '[^a-z0-9]+',' ','g'))
$$;

create or replace view public.export_registry as
  select 'compte'::text as kind, coalesce(nullif(p.shop_name,''), p.name) as name, p.phone,
         public.reg_phone9(p.phone) as phone9,
         public.reg_norm(coalesce(nullif(p.shop_name,''), p.name)) as name_norm,
         p.email, 'profiles'::text as source, p.id::text as ref
    from public.profiles p
   where p.role = 'vendor' or p.is_pro or p.is_courier or p.is_breeder or p.is_rescuer
  union all
  select 'prospect', pr.name, pr.phone, public.reg_phone9(pr.phone), public.reg_norm(pr.name), pr.email, 'prospects', pr.id::text
    from public.prospects pr
  union all
  select 'transport', tl.operator, tl.phone, public.reg_phone9(tl.phone), public.reg_norm(tl.operator), tl.email, 'transport_lines', tl.id::text
    from public.transport_lines tl
  union all
  select 'annonce', left(coalesce(ax.description,''),60), ax.phone, public.reg_phone9(ax.phone), public.reg_norm(ax.description), ax.email, 'annonces_express', ax.id::text
    from public.annonces_express ax
  union all
  select 'produit', pd.vendor_name, null, null, public.reg_norm(pd.vendor_name), null, 'products', pd.id::text
    from public.products pd
   where pd.vendor_name is not null and pd.vendor_name <> '';

grant select on public.export_registry to authenticated, service_role;

-- ── Export à télécharger (Results → Download CSV) → tools/scraper/registry.csv ──
-- Ne garder que les 2 colonnes clés (sûres pour un CSV) :
select distinct phone9, name_norm
  from public.export_registry
 where phone9 <> '' or name_norm <> ''
 order by name_norm;
