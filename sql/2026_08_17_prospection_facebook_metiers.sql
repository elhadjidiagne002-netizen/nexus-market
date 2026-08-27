-- ============================================================================
-- PROSPECTION FACEBOOK : 3 metiers sous-couverts (Photographe, Graphiste /
-- Designer, Community manager). INSERT dans prospects (account_type='pro').
-- Source = pages Facebook publiques d'entreprises/pros senegalais (recherche
-- via Google/Bing site:facebook.com, jamais de connexion/interaction FB).
-- email = prospect_<telephone>@nexusmarket.sn. Pas de promotion automatique
-- (l'admin decide). Idempotent : ON CONFLICT DO NOTHING sur (phone) via
-- contrainte unique existante si presente, sinon dedoublonnage deja fait a la
-- main (verifie 2026-08-17 contre prospects.phone, aucun doublon restant sauf
-- 1 exclu : "Sy Ndiaye Creative Design" +221 77 735 35 06 deja present en base
-- sous le nom "Ndiaye" / profession "Graphiste / Designer").
-- A coller dans Supabase SQL Editor.
-- ============================================================================

insert into public.prospects(account_type,profession,name,phone,email,city,region,address,source,status) values

-- ---- Photographe (10 fiches) ----
('pro','Photographe','Cynpa Studio','+221 77 514 19 55','prospect_221775141955@nexusmarket.sn','Dakar','Dakar','Mariste',            'facebook.com/cynpastudio','new'),
('pro','Photographe','Yaaba Photography','+221 77 709 06 71','prospect_221777090671@nexusmarket.sn','Dakar','Dakar','Sicap Foire, Cité Des Magistrats','facebook.com/YaabaPhoto','new'),
('pro','Photographe','Studio Atlantique','+221 77 068 99 42','prospect_221770689942@nexusmarket.sn','Dakar','Dakar','Almadies Zone 12, The Attic','facebook.com/StudioAtlantique','new'),
('pro','Photographe','Mom''art Photography','+221 77 594 48 34','prospect_221775944834@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/p/Momart-photography-100066530684214','new'),
('pro','Photographe','TRAART.Studio','+221 78 125 61 61','prospect_221781256161@nexusmarket.sn','Dakar','Dakar','Liberté 6 extension','facebook.com/Studio.TRAART','new'),
('pro','Photographe','Digital Photography','+221 77 774 85 58','prospect_221777748558@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/p/Digital-photography-100063999433391','new'),
('pro','Photographe','Asmaoul Photographe Officiel','+221 77 948 16 89','prospect_221779481689@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/p/Asmaoul-Photographe-Officiel-100064368807016','new'),
('pro','Photographe','Sadi Photographys','+221 77 010 84 40','prospect_221770108440@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/p/sadiphotographys-100087896886578','new'),
('pro','Photographe','2mvision (Momar Multimédias)','+221 78 361 48 28','prospect_221783614828@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/momarmultimedias','new'),
('pro','Photographe','One Shoot Pictures','+221 77 796 96 96','prospect_221777969696@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/Oneshootpictures','new'),

-- ---- Graphiste / Designer (8 fiches) ----
('pro','Graphiste / Designer','Ms Designer','+221 76 902 57 64','prospect_221769025764@nexusmarket.sn','Dakar','Dakar','Marché HLM 5','facebook.com/msdesigner18','new'),
('pro','Graphiste / Designer','Magri David Graphisme','+221 77 639 13 61','prospect_221776391361@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/MagriDavidGraphisme','new'),
('pro','Graphiste / Designer','RealBizon Designer','+221 76 617 73 73','prospect_221766177373@nexusmarket.sn','Dakar','Dakar','Liberté 6, en face Im.','facebook.com/Realbizondesign','new'),
('pro','Graphiste / Designer','Shadow Design','+221 77 801 01 95','prospect_221778010195@nexusmarket.sn','Dakar','Dakar','SIPRES 1','facebook.com/61555208325928','new'),
('pro','Graphiste / Designer','Sen Logo & Co','+221 77 193 42 15','prospect_221771934215@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/people/Sen-logo-Sénégal/100065319637712','new'),
('pro','Graphiste / Designer','Numerika Dakar','+221 78 180 96 66','prospect_221781809666@nexusmarket.sn','Dakar','Dakar','Km 2.5, Route de Rufisque','facebook.com/NumerikaDakar','new'),
('pro','Graphiste / Designer','Leadbydesigns Creative Agency','+221 77 794 76 29','prospect_221777947629@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/p/Leadbydesigns-Creative-Agency-Dakar-100085164025427','new'),
('pro','Graphiste / Designer','Sénégalaise de l''Infographie','+221 78 179 60 60','prospect_221781796060@nexusmarket.sn','Dakar','Dakar','Mermoz Sacré-Cœur','facebook.com/infographiesenegal','new'),

-- ---- Community manager (7 fiches) ----
('pro','Community manager','Community Manager Dakar','+221 77 626 28 77','prospect_221776262877@nexusmarket.sn','Dakar','Dakar',NULL,'facebook.com/p/Community-manager-DAKAR-100071750108291','new'),
('pro','Community manager','Community Manager Afrik','+221 77 552 85 57','prospect_221775528557@nexusmarket.sn','Dakar','Dakar','Petit Mbao Extension','facebook.com/communitymanagerafrik','new'),
('pro','Community manager','Gaynako','+221 77 588 32 08','prospect_221775883208@nexusmarket.sn','Dakar','Dakar','Sacré-Cœur 3, Lot 137','facebook.com/teamgaynako','new'),
('pro','Community manager','Agence Interaktive','+221 78 302 30 30','prospect_221783023030@nexusmarket.sn','Dakar','Dakar','Liberté 6 Extension, Villa N°78','facebook.com/AgenceInteraktive','new'),
('pro','Community manager','Sabma Digital','+221 77 842 54 13','prospect_221778425413@nexusmarket.sn','Dakar','Dakar','Sacré-Cœur, Rue 47','facebook.com/sabmadigital','new'),
('pro','Community manager','Dakar Communication','+221 76 577 39 90','prospect_221765773990@nexusmarket.sn','Dakar','Dakar','107 Nord Foire','facebook.com/dakarcommunication','new'),
('pro','Community manager','Mercatik','+221 78 184 42 41','prospect_221781844241@nexusmarket.sn','Dakar','Dakar','Nord Foire, Cité Damel Lot n°71','facebook.com/Mercatik','new');
