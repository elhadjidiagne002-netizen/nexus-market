-- Insere dans prospects (account_type=pro) les mecaniciens/garages/carrossiers des CSV
-- absents du systeme (10). Lance ENSUITE promote-prospects.sql.
insert into public.prospects(account_type,profession,name,phone,city,region,address,lat,lng,source,status) values
('pro','Garage / Mecanicien','GARAGE PRO TECH','','Keur Massar','Dakar','Sotrac, Keur Massar',14.772579,-17.313819,'goafricaonline.com','new'),
('pro','Garage / Mecanicien','Leader du Diagnostic automobile et Électricité','','Touba','Diourbel','Touba khaïra',14.845673,-15.884398,'goafricaonline.com','new'),
('pro','Garage / Mecanicien','Diallo Toyota - Garagiste Inter Service','','Saint-Louis / Dakar','Saint-Louis','',15.98841,-16.488331,'garagisteinterservice.com','new'),
('pro','Garage / Mecanicien','Grand Garage De Mbour','','Mbour','Thiès','',14.42074,-16.971484,'yandex maps','new'),
('pro','Garage / Mecanicien','Garage Darou Mouhti','','Touba','Diourbel','',14.864559,-15.876047,'BeezPages (note 3.9/5, 164 avis)','new'),
('pro','Garage / Mecanicien','Excellence Auto Service','','Rufisque','Dakar','Route de Rufisque',14.741994,-17.395241,'annuaire-senegal.com','new'),
('pro','Garage / Mecanicien','Ibou Diémé (mécanicien indépendant)','','Non précisé','Non précisé','',null,null,'au-senegal.com','new'),
('pro','Carrosserie / Tolerie auto','ADPRO (carrosserie et mécanique)','Voir Facebook','Dakar','Dakar','Dakar',14.693425,-17.447938,'facebook.com/ADPROGARAGE','new'),
('pro','Carrosserie / Tolerie auto','Premium Car Services','Voir Facebook','Dakar','Dakar','Zone Industrielle SONEPI',14.710073,-17.444181,'facebook.com','new'),
('pro','Carrosserie / Tolerie auto','auto-carrosserie-dakar.com','Voir site','Dakar','Dakar','Dakar',14.693425,-17.447938,'auto-carrosserie-dakar.com','new')
on conflict (account_type,phone,name) do nothing;
