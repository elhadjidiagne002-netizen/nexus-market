-- ============================================================================
-- CATALOGUE : produits Téléphones réellement en vente sur nova.sn (harvest direct,
-- pas de correspondance avec d'anciennes fiches de prospection — nom/prix/photo
-- proviennent tous les trois de la MÊME fiche produit source, donc cohérents par
-- construction). Attribué au compte ADMIN. Prix converti FCFA -> EUR (/655.957),
-- comme le reste du catalogue (cf. CLAUDE.md, convention monétaire EUR).
-- Lot test (24 produits, catégorie Téléphones, pages 1-3 de nova.sn/99-telephones).
-- Idempotent (skip si déjà présent pour ce vendeur+nom).
-- ============================================================================

do $$ begin
  if not exists (select 1 from public.profiles where role='admin') then
    raise exception 'Aucun compte admin (profiles.role=admin) — impossible d''attribuer le catalogue.';
  end if;
end $$;

drop table if exists _nova_catalogue;
create temp table _nova_catalogue(name text, category text, price_eur numeric, description text, image_url text, vendor_name text, source_url text);
insert into _nova_catalogue values
('Samsung Galaxy A27 5G – 256 Go – 8 Go RAM','Téléphones',274.41,'Samsung Galaxy A27 5G – 256 Go – 8 Go RAM. Prix catalogue Nova.sn (180 000 FCFA au moment de l''import).','https://nova.sn/43563-medium_default/samsung-galaxy-a27-5g-256-go-8-go-ram.jpg','Nova.sn','https://nova.sn/telephones/19784-samsung-galaxy-a27-5g-256-go-8-go-ram.html'),
('Samsung Galaxy A27 5G – 128 Go – 6 Go RAM','Téléphones',243.92,'Samsung Galaxy A27 5G – 128 Go – 6 Go RAM. Prix catalogue Nova.sn (160 000 FCFA au moment de l''import).','https://nova.sn/43560-medium_default/samsung-galaxy-a27-5g-128-go-6-go-ram.jpg','Nova.sn','https://nova.sn/telephones/19783-samsung-galaxy-a27-5g-128-go-6-go-ram.html'),
('HONOR 600 Lite 5G – 256 Go – 8 Go','Téléphones',289.65,'HONOR 600 Lite 5G – 256 Go – 8 Go. Prix catalogue Nova.sn (190 000 FCFA au moment de l''import).','https://nova.sn/43555-medium_default/honor-600-lite-5g-256-go-8-go.jpg','Nova.sn','https://nova.sn/telephones/19782-honor-600-lite-5g-256-go-8-go.html'),
('HONOR X7e 4G – 256 Go – 6 Go RAM','Téléphones',205.81,'HONOR X7e 4G – 256 Go – 6 Go RAM. Prix catalogue Nova.sn (135 000 FCFA au moment de l''import).','https://nova.sn/43549-medium_default/honor-x7e-4g-256-go-6-go-ram.jpg','Nova.sn','https://nova.sn/telephones/19781-honor-x7e-4g-256-go-6-go-ram.html'),
('HONOR X7e 4G – 128 Go – 6 Go RAM','Téléphones',182.94,'HONOR X7e 4G – 128 Go – 6 Go RAM. Prix catalogue Nova.sn (120 000 FCFA au moment de l''import).','https://nova.sn/43546-medium_default/honor-x7e-4g-128-go-6-go-ram.jpg','Nova.sn','https://nova.sn/telephones/19780-honor-x7e-4g-128-go-6-go-ram.html'),
('HONOR Choice T10 4G – 64 go – 4 Go','Téléphones',99.09,'HONOR Choice T10 4G – 64 go – 4 Go. Prix catalogue Nova.sn (65 000 FCFA au moment de l''import).','https://nova.sn/43544-medium_default/honor-choice-t10-4g-64-go-4-go.jpg','Nova.sn','https://nova.sn/telephones/19779-honor-choice-t10-4g-64-go-4-go.html'),
('ASTECH S9 4G – 128 Go – 8 Go RAM','Téléphones',76.22,'ASTECH S9 4G – 128 Go – 8 Go RAM. Prix catalogue Nova.sn (50 000 FCFA au moment de l''import).','https://nova.sn/43517-medium_default/astech-s9-4g-128-go-8-go-ram.jpg','Nova.sn','https://nova.sn/telephones/19775-astech-s9-4g-128-go-8-go-ram.html'),
('Samsung Galaxy Z Fold8 Ultra – 512 Go – 12 Go','Téléphones',2263.87,'Samsung Galaxy Z Fold8 Ultra – 512 Go – 12 Go. Prix catalogue Nova.sn (1 485 000 FCFA au moment de l''import).','https://nova.sn/43504-medium_default/samsung-galaxy-z-fold8-ultra-512-go-12-go.jpg','Nova.sn','https://nova.sn/telephones/19774-samsung-galaxy-z-fold8-ultra-512-go-12-go.html'),
('Samsung Galaxy Z Fold8 Ultra – 256 Go – 12 Go','Téléphones',2065.68,'Samsung Galaxy Z Fold8 Ultra – 256 Go – 12 Go. Prix catalogue Nova.sn (1 355 000 FCFA au moment de l''import).','https://nova.sn/43495-medium_default/samsung-galaxy-z-fold8-ultra-256-go-12-go.jpg','Nova.sn','https://nova.sn/telephones/19773-samsung-galaxy-z-fold8-ultra-256-go-12-go.html'),
('Samsung Galaxy Z Fold8 5G – 512 Go – 12 Go','Téléphones',1829.39,'Samsung Galaxy Z Fold8 5G – 512 Go – 12 Go. Prix catalogue Nova.sn (1 200 000 FCFA au moment de l''import).','https://nova.sn/43493-medium_default/samsung-galaxy-z-fold8-5g-512-go-12-go.jpg','Nova.sn','https://nova.sn/telephones/19772-samsung-galaxy-z-fold8-5g-512-go-12-go.html'),
('Samsung Galaxy Z Fold8 5G – 256 Go – 12 Go','Téléphones',1676.94,'Samsung Galaxy Z Fold8 5G – 256 Go – 12 Go. Prix catalogue Nova.sn (1 100 000 FCFA au moment de l''import).','https://nova.sn/43492-medium_default/samsung-galaxy-z-fold8-5g-256-go-12-go.jpg','Nova.sn','https://nova.sn/telephones/19771-samsung-galaxy-z-fold8-5g-256-go-12-go.html'),
('TECNO CAMON Slim 256 Go – 8 Go RAM – Ecran 6.78"','Téléphones',297.28,'TECNO CAMON Slim 256 Go – 8 Go RAM – Ecran 6.78". Prix catalogue Nova.sn (195 000 FCFA au moment de l''import).','https://nova.sn/43330-medium_default/tecno-camon-slim-256-go-8-go-ram-ecran-678.jpg','Nova.sn','https://nova.sn/telephones/19698-tecno-camon-slim-256-go-8-go-ram-ecran-678.html'),
('TECNO Spark 50 Pro 128 Go – 8 Go RAM – Ecran 6.78"','Téléphones',236.30,'TECNO Spark 50 Pro 128 Go – 8 Go RAM – Ecran 6.78". Prix catalogue Nova.sn (155 000 FCFA au moment de l''import).','https://nova.sn/43322-medium_default/tecno-spark-50-pro-128-go-8-go-ram-ecran-678.jpg','Nova.sn','https://nova.sn/telephones/19697-tecno-spark-50-pro-128-go-8-go-ram-ecran-678.html'),
('Infinix Hot 70 256 Go RAM 6 Go – Écran 6.78"','Téléphones',221.05,'Infinix Hot 70 256 Go RAM 6 Go – Écran 6.78". Prix catalogue Nova.sn (145 000 FCFA au moment de l''import).','https://nova.sn/43248-medium_default/infinix-hot-70-256-go-ram-6-go-ecran-678.jpg','Nova.sn','https://nova.sn/telephones/19677-infinix-hot-70-256-go-ram-6-go-ecran-678.html'),
('Infinix Hot 70 128 Go RAM 4 Go – Écran 6.78"','Téléphones',158.55,'Infinix Hot 70 128 Go RAM 4 Go – Écran 6.78". Prix catalogue Nova.sn (104 000 FCFA au moment de l''import).','https://nova.sn/43243-medium_default/infinix-hot-70-128-go-ram-4-go-ecran-678.jpg','Nova.sn','https://nova.sn/telephones/19676-infinix-hot-70-128-go-ram-4-go-ecran-678.html'),
('Infinix Smart 20 128 Go RAM 4 Go – Ecran 6,78"','Téléphones',135.68,'Infinix Smart 20 128 Go RAM 4 Go – Ecran 6,78". Prix catalogue Nova.sn (89 000 FCFA au moment de l''import).','https://nova.sn/43237-medium_default/infinix-smart-20-128-go-ram-4-go-ecran-678.jpg','Nova.sn','https://nova.sn/telephones/19675-infinix-smart-20-128-go-ram-4-go-ecran-678.html'),
('Infinix Smart 20 64 Go RAM 4 Go – Ecran 6,78"','Téléphones',114.34,'Infinix Smart 20 64 Go RAM 4 Go – Ecran 6,78". Prix catalogue Nova.sn (75 000 FCFA au moment de l''import).','https://nova.sn/43233-medium_default/infinix-smart-20-64-go-ram-4-go-ecran-678.jpg','Nova.sn','https://nova.sn/telephones/19674-infinix-smart-20-64-go-ram-4-go-ecran-678.html'),
('Samsung Galaxy A26 5G - 256 Go - RAM 8 Go – Écran 6.7 pouces','Téléphones',243.92,'Samsung Galaxy A26 5G - 256 Go - RAM 8 Go – Écran 6.7 pouces. Prix catalogue Nova.sn (160 000 FCFA au moment de l''import).','https://nova.sn/43184-medium_default/samsung-galaxy-a26-5g-256-go-ram-8-go-ecran-67-pouces.jpg','Nova.sn','https://nova.sn/telephones/19655-samsung-galaxy-a26-5g-256-go-ram-8-go-ecran-67-pouces.html'),
('Samsung Galaxy A37 5G 128 Go 6 Go RAM','Téléphones',251.54,'Samsung Galaxy A37 5G 128 Go 6 Go RAM. Prix catalogue Nova.sn (165 000 FCFA au moment de l''import).','https://nova.sn/43180-medium_default/samsung-galaxy-a37-5g-128-go-6-go-ram.jpg','Nova.sn','https://nova.sn/telephones/19654-samsung-galaxy-a37-5g-128-go-6-go-ram.html'),
('Samsung Galaxy A37 5G 128 Go 8 Go RAM','Téléphones',335.39,'Samsung Galaxy A37 5G 128 Go 8 Go RAM. Prix catalogue Nova.sn (220 000 FCFA au moment de l''import).','https://nova.sn/43176-medium_default/samsung-galaxy-a37-5g-128-go-8-go-ram.jpg','Nova.sn','https://nova.sn/telephones/19653-samsung-galaxy-a37-5g-128-go-8-go-ram.html'),
('Samsung Galaxy A17 – 128 Go – RAM 6 Go – Écran 6.7 – Triple Caméra 50MP','Téléphones',167.69,'Samsung Galaxy A17 – 128 Go – RAM 6 Go – Écran 6.7 – Triple Caméra 50MP. Prix catalogue Nova.sn (110 000 FCFA au moment de l''import).','https://nova.sn/43141-medium_default/samsung-galaxy-a17-128-go-ram-6-go-ecran-67-triple-camera-50mp.jpg','Nova.sn','https://nova.sn/telephones/19636-samsung-galaxy-a17-128-go-ram-6-go-ecran-67-triple-camera-50mp.html'),
('Xiaomi Redmi A7 Pro 128 Go RAM 4 Go – Écran 6.9"','Téléphones',118.91,'Xiaomi Redmi A7 Pro 128 Go RAM 4 Go – Écran 6.9". Prix catalogue Nova.sn (78 000 FCFA au moment de l''import).','https://nova.sn/43011-medium_default/xiaomi-redmi-a7-pro-128-go-ram-4-go-ecran-69.jpg','Nova.sn','https://nova.sn/telephones/19580-xiaomi-redmi-a7-pro-128-go-ram-4-go-ecran-69.html'),
('Xiaomi Redmi A7 Pro 64 Go RAM 4 Go – Écran 6.9"','Téléphones',103.67,'Xiaomi Redmi A7 Pro 64 Go RAM 4 Go – Écran 6.9". Prix catalogue Nova.sn (68 000 FCFA au moment de l''import).','https://nova.sn/43008-medium_default/xiaomi-redmi-a7-pro-64-go-ram-4-go-ecran-69.jpg','Nova.sn','https://nova.sn/telephones/19579-xiaomi-redmi-a7-pro-64-go-ram-4-go-ecran-69.html'),
('Xiaomi Redmi A7 64 Go RAM 3 Go – Écran LCD 6.88','Téléphones',96.04,'Xiaomi Redmi A7 64 Go RAM 3 Go – Écran LCD 6.88. Prix catalogue Nova.sn (63 000 FCFA au moment de l''import).','https://nova.sn/43002-medium_default/xiaomi-redmi-a7-64-go-ram-3-go-ecran-lcd-688.jpg','Nova.sn','https://nova.sn/telephones/19578-xiaomi-redmi-a7-64-go-ram-3-go-ecran-lcd-688.html');

-- Attribution à l'admin (le plus ancien si plusieurs).
with adm as (select id from public.profiles where role='admin' order by created_at asc limit 1)
insert into public.products(name,category,price,stock,description,image_url,vendor_id,vendor_name,active)
select nc.name, nc.category, nc.price_eur, 5, nc.description, nc.image_url, (select id from adm), nc.vendor_name, true
  from _nova_catalogue nc
 where not exists (select 1 from public.products p where p.vendor_id=(select id from adm) and p.name=nc.name);

-- Récap.
select count(*) as produits_inseres from _nova_catalogue;
