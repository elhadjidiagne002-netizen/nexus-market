-- ============================================================================
-- DEPANNEURS : INSERT dans prospects (account_type='rescuer') + PROMOTION.
-- Auto-genere depuis prospection/depanneurs_from_pros.csv (338 fiches).
-- email = prospect_<telephone>@ -> REUTILISE le compte garage existant (ajout du
-- role depanneur : fiche rescuers + is_rescuer), pas de doublon.
-- A coller dans Supabase SQL Editor. Idempotent (on conflict + re-run sur).
-- ============================================================================

insert into public.prospects(account_type,profession,name,phone,email,city,region,address,lat,lng,source,status) values
('rescuer','Mécanique / dépannage auto','A salihou automobiles','+221 77 203 53 21','prospect_221772035321@nexusmarket.sn','Dakar','Dakar','Rte des Maristes - Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ABRO','+221 33 842 72 43','prospect_221338427243@nexusmarket.sn','Dakar','Dakar','Rue Dial Diop - Dakar-Plateau',14.677125,-17.444315,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ADK SA','+221 33 834 14 08','prospect_221338341408@nexusmarket.sn','Dakar','Dakar','Km 16 route de Rufisque',14.698385,-17.436969,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','AFRIQUE MINES INDUSTRIES','+221 33 824 23 17','prospect_221338242317@nexusmarket.sn','Dakar','Dakar','Lot 61 Zone Industrielle Sonepi Hlm, BP 10405',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ALAS SERVICES','+221 33 860 71 81','prospect_221338607181@nexusmarket.sn','Dakar','Dakar','Yoff APECSY, Villa N°316',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ALDO MOTORS','+221 76 141 51 13','prospect_221761415113@nexusmarket.sn','Dakar','Dakar','Dieuppeul-Derklé',14.719814,-17.453231,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','AMA GARAGE AUTO','+221 77 634 10 55','prospect_221776341055@nexusmarket.sn','Saint-Louis','Saint-Louis','Saint-Louis',16.028045,-16.504869,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','AMERICAINE DE L''AUTOMOBILE','+221 77 341 45 68','prospect_221773414568@nexusmarket.sn','Dakar','Dakar','26 Sodida',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','AUTO-TECK','+221 77 777 84 91','prospect_221777778491@nexusmarket.sn','Dakar','Dakar','Parcelles Assainies',14.759407,-17.438455,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Adpro','+221 77 651 96 28','prospect_221776519628@nexusmarket.sn','Dakar','Dakar','Avenue Cheikh Ahmadou Bamba Mbacké - HLM',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Afrique Pare-brise','+221 77 532 28 08','prospect_221775322808@nexusmarket.sn','Thiès','Thiès','Thiès Nord',14.791461,-16.925605,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Allô Dépannage Auto','+221 70 706 00 00','prospect_221707060000@nexusmarket.sn','Dakar','Dakar','Sicap-Liberté',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Ancien Saly Service','+221 77 464 80 60','prospect_221774648060@nexusmarket.sn','Saly','Thiès','Saly',14.441115,-17.01483,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Apsonic Sénégal','+221 77 528 03 85','prospect_221775280385@nexusmarket.sn','Kaolack','Kaolack','347 Ave Cheikh Ibra Fall',14.138815,-16.076391,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Assane''s Auto Repair','+221 77 528 91 64','prospect_221775289164@nexusmarket.sn','Dakar','Dakar','Yoff',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Atelier bara mécanicien','+221 77 722 03 57','prospect_221777220357@nexusmarket.sn','Dakar','Dakar','Ngor',14.748791,-17.514961,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Auto garage moderne AGM','+221 77 541 77 90','prospect_221775417790@nexusmarket.sn','Dakar','Dakar','Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','AutoAssist','+221 78 524 85 35','prospect_221785248535@nexusmarket.sn','Dakar','Dakar','Sicap Liberté 6, Grand Yoff',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','AutoSud Garage','+221 33 822 16 61','prospect_221338221661@nexusmarket.sn','Dakar','Dakar','Rue de Reims - Dakar-Plateau',14.677125,-17.444315,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','BAOBAB Automobile','+221 78 541 09 49','prospect_221785410949@nexusmarket.sn','Mbour','Thiès','Saly',14.444835,-16.998517,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','BAZAROTO SENEGAL','+221 77 489 73 12','prospect_221774897312@nexusmarket.sn','Dakar','Dakar','Patte D''oie, Cité Soprim Villa 100 A',14.746488,-17.440689,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','BOSH SERVICE','+221 33 868 23 00','prospect_221338682300@nexusmarket.sn','Dakar','Dakar','Zone 7 Almadies',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Ba et frère diesel','+221 70 653 53 02','prospect_221706535302@nexusmarket.sn','Pikine','Dakar','SIPS Pikine',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Bara automobile et services','+221 77 312 29 74','prospect_221773122974@nexusmarket.sn','Dakar','Dakar','Patte d''Oie',14.746488,-17.440689,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CARFIX SENEGAL','+221 33 821 24 74','prospect_221338212474@nexusmarket.sn','Dakar','Dakar','Sipres 2',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CCBM INDUSTRIES','+221 33 859 08 80','prospect_221338590880@nexusmarket.sn','Dakar','Dakar','Km 4 Route de Rufisque',14.698385,-17.436969,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CENTRAL PARK AUTOMOBILE','+221 78 528 60 48','prospect_221785286048@nexusmarket.sn','Dakar','Dakar','Dakar',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CFAO Sénégal','+221 33 991 29 30','prospect_221339912930@nexusmarket.sn','Dakar','Dakar','Dakar',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CIMA SERVICES','+221 76 196 27 12','prospect_221761962712@nexusmarket.sn','Diamniadio','Dakar','Diamniadio',14.737000,-17.189000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CLINIQUE AUTO SERVICE','+221 77 353 02 13','prospect_221773530213@nexusmarket.sn','Dakar','Dakar','HLM, Cité Douane',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CLÉ AUTO SERVICES','+221 77 897 91 56','prospect_221778979156@nexusmarket.sn','Dakar','Dakar','Sicap-Liberté',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CTA Centrale Technique Automobile','+221 33 825 46 00','prospect_221338254600@nexusmarket.sn','Dakar','Dakar','Rue DD 71',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Carcare Senegal','+221 33 820 42 37','prospect_221338204237@nexusmarket.sn','Dakar','Dakar','Mermoz Sacré-Cœur',14.720000,-17.466000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Chez Demba Mécanique Moto','+221 77 518 54 92','prospect_221775185492@nexusmarket.sn','Kidira','Tambacounda','Kidira',14.464000,-12.213000,'goafricaonline.com','new'),
('rescuer','Pneu + Mécanique / dépannage auto','DADDY 2 ROUES','+221 77 694 64 60','prospect_221776946460@nexusmarket.sn','Dakar','Dakar','Biscuiterie - Bene Tally',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DAKAR AUTO PARTS','+221 33 823 13 72','prospect_221338231372@nexusmarket.sn','Dakar','Dakar','Fass',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DAKAR MECANIQUE OUTILLAGE','+221 33 832 03 59','prospect_221338320359@nexusmarket.sn','Dakar','Dakar','Av. Félix Eboué',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DAS - Dakar Auto Service','+221 78 633 45 15','prospect_221786334515@nexusmarket.sn','Dakar','Dakar','Ouakam',14.724737,-17.485066,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DELTA DIESEL SUARL','+221 33 832 91 96','prospect_221338329196@nexusmarket.sn','Dakar','Dakar','Km 6.5 BCCD Yarakh',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DIESEL PLUS','+221 33 834 42 92','prospect_221338344292@nexusmarket.sn','Dakar','Dakar','Km 12.5 Route de Rufisque',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Dakar Automobile','+221 33 827 46 47','prospect_221338274647@nexusmarket.sn','Dakar','Dakar','Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Darmanko Électronique Sénégal','+221 77 068 19 95','prospect_221770681995@nexusmarket.sn','Dakar','Dakar','Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Djolof Motors','+221 78 529 42 42','prospect_221785294242@nexusmarket.sn','Dakar','Dakar','Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ENTREPRISE DAKAR MECANIQUE','+221 33 825 56 38','prospect_221338255638@nexusmarket.sn','Dakar','Dakar','Zone Industrielle',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','EXPERT AUTO','+221 33 821 90 00','prospect_221338219000@nexusmarket.sn','Dakar','Dakar','Ngor',14.748791,-17.514961,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Express Automobile','+221 77 558 39 62','prospect_221775583962@nexusmarket.sn','Dakar','Dakar','Yoff',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','FALCON AUTOMOBILE & TECHNICAL SERVICES','+221 33 860 18 60','prospect_221338601860@nexusmarket.sn','Dakar','Dakar','Almadies',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Fayauto Car Services','+221 76 733 66 20','prospect_221767336620@nexusmarket.sn','Mbour','Thiès','Thiocé Ouest',14.444835,-16.998517,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Ford Sénégal - Caetano One','+221 33 849 31 31','prospect_221338493131@nexusmarket.sn','Dakar','Dakar','Km 5 Rte de Rufisque, Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GA (GARAGE ATLANTIQUE)','+221 33 824 14 68','prospect_221338241468@nexusmarket.sn','Dakar','Dakar','Route de Ouakam',14.724737,-17.485066,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE 2000','+221 33 822 61 02','prospect_221338226102@nexusmarket.sn','Dakar','Dakar','Rue 19 X Corniche Médina',14.677125,-17.444315,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE CARROSSERIE NABY','+221 77 525 71 36','prospect_221775257136@nexusmarket.sn','Dakar','Dakar','Yoff',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE DE JOAL FADIOUTH','+221 77 530 50 54','prospect_221775305054@nexusmarket.sn','Joal Fadiout','Thiès','Santhie 3',14.160000,-16.860000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE DIAPO AUTO','+221 77 266 66 97','prospect_221772666697@nexusmarket.sn','Dakar','Dakar','Rue Félix Eboué',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE FATOU FATOU MERCEDES','+221 33 827 08 18','prospect_221338270818@nexusmarket.sn','Dakar','Dakar','Sicap Foire, Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE FEMME AUTO','+221 33 867 47 22','prospect_221338674722@nexusmarket.sn','Dakar','Dakar','Cité SIPRES VDN',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE GIG - IBRA GUEYE','+221 33 832 64 80','prospect_221338326480@nexusmarket.sn','Dakar','Dakar','Zone industrielle Colobane Sud Lot N°6, Bel Air',14.695118,-17.445426,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE IBRAHIM DIOP','+221 77 433 93 43','prospect_221774339343@nexusmarket.sn','Ziguinchor','Ziguinchor','Route du Cap Skiring',12.565000,-16.271000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE JAMIL','+221 77 638 86 66','prospect_221776388666@nexusmarket.sn','Dakar','Dakar','Croisement rue des écrivains, Point E',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE KEUR AUTO SPEED/MALICK ET FILS','+221 33 820 50 01','prospect_221338205001@nexusmarket.sn','Dakar','Dakar','Route de l''Aéroport, Yoff',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE KHADIM RASSOUL','+221 77 630 71 25','prospect_221776307125@nexusmarket.sn','Guédiawaye','Dakar','Guédiawaye',14.777121,-17.390071,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE MEDINA BAYE NIASS','+221 33 824 00 12','prospect_221338240012@nexusmarket.sn','Dakar','Dakar','HLM 5',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE MOMAR NDIAYE','+221 77 012 19 67','prospect_221770121967@nexusmarket.sn','Dakar','Dakar','Cité Sonatel 2',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE PRO TECH','+221 77 505 18 90','prospect_221775051890@nexusmarket.sn','Dakar','Dakar','Sotrac - Keur Massar',14.780000,-17.316000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE SERIGNE BABACAR SY','+221 77 931 78 00','prospect_221779317800@nexusmarket.sn','Dakar','Dakar','Rue 34, Allée Centenaire - Médina',14.677125,-17.444315,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE TAPHA AUTOMOBILE','+221 33 832 18 86','prospect_221338321886@nexusmarket.sn','Dakar','Dakar','Km 5 Boulevard du Centenaire',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE TAWFEKH AUTOMOBILE','+221 77 756 67 37','prospect_221777566737@nexusmarket.sn','Dakar','Dakar','Parcelles Assainies',14.759407,-17.438455,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE UBC Centre de Diagnostique','+221 77 318 07 87','prospect_221773180787@nexusmarket.sn','Dakar','Dakar','Lot 69 VDN Ouest Foire',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GECOM INDUSTRIES','+221 33 854 98 46','prospect_221338549846@nexusmarket.sn','Dakar','Dakar','Km 19 Route de Rufisque',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GENERAL MOTOR SENEGAL-GMS','+221 77 987 40 87','prospect_221779874087@nexusmarket.sn','Dakar','Dakar','Fass - Colobane',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GLOBAL VITRAGE AUTO','+221 33 820 07 44','prospect_221338200744@nexusmarket.sn','Dakar','Dakar','Ouest Foire',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GMS AUTO CENTER','+221 33 827 19 67','prospect_221338271967@nexusmarket.sn','Dakar','Dakar','Patte d''Oie',14.746488,-17.440689,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GMT AUTOMOBILE','+221 78 371 14 14','prospect_221783711414@nexusmarket.sn','Dakar','Dakar','Parcelles Assainies',14.759407,-17.438455,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Galass AutoZone','+221 33 867 10 70','prospect_221338671070@nexusmarket.sn','Dakar','Dakar','Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage 55 Warang','+221 33 957 33 00','prospect_221339573300@nexusmarket.sn','Mbour','Thiès','Warang',14.444835,-16.998517,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Aladji Matar','+221 77 830 65 86','prospect_221778306586@nexusmarket.sn','Mbour','Thiès','Mbour',14.444835,-16.998517,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Arezki','+221 77 558 34 49','prospect_221775583449@nexusmarket.sn','Dakar','Dakar','Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Auto Diamanka','+221 77 558 94 81','prospect_221775589481@nexusmarket.sn','Ziguinchor','Ziguinchor','Ziguinchor',12.565000,-16.271000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage BAKA','+221 77 768 46 00','prospect_221777684600@nexusmarket.sn','Guédiawaye','Dakar','Guédiawaye',14.777121,-17.390071,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Pape Ka','+221 77 021 09 71','prospect_221770210971@nexusmarket.sn','Dakar','Dakar','Malika',14.780000,-17.316000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Pape SAMB','+221 77 656 46 29','prospect_221776564629@nexusmarket.sn','Mboro','Thiès','Mboro',15.135985,-16.881218,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Poid Lourd Depannage','+221 77 975 96 00','prospect_221779759600@nexusmarket.sn','Thiès','Thiès','Thiès Ouest',14.791461,-16.925605,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Sénégal Auto','+221 77 645 32 43','prospect_221776453243@nexusmarket.sn','Dakar','Dakar','Av. Cheikh Anta Diop - Fass',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Teranga Automobiles Maristes','+221 33 832 46 58','prospect_221338324658@nexusmarket.sn','Dakar','Dakar','Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Teranga Automobiles cité Keur Gorgui','+221 77 961 50 31','prospect_221779615031@nexusmarket.sn','Dakar','Dakar','Cité Keur Gorgui, Lot 57 Sicap',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Tivaouane','+221 77 765 77 53','prospect_221777657753@nexusmarket.sn','Tivaouane','Thiès','Tivaouane',14.951507,-16.812868,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage mécanique Cambérène','+221 77 519 24 69','prospect_221775192469@nexusmarket.sn','Dakar','Dakar','Cambérène',14.759407,-17.438455,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage mécanique Pa Cam','+221 77 980 41 36','prospect_221779804136@nexusmarket.sn','Dakar','Dakar','Rue 39, angle 30 - Médina',14.677125,-17.444315,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage mécanique de Serigne','+221 77 642 40 67','prospect_221776424067@nexusmarket.sn','Saint-Louis','Saint-Louis','Saint-Louis',16.028045,-16.504869,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage ngor','+221 78 371 79 71','prospect_221783717971@nexusmarket.sn','Dakar','Dakar','Yoff - Ngor',14.748791,-17.514961,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage réparation climatiseur auto','+221 77 243 31 47','prospect_221772433147@nexusmarket.sn','Thiaroye','Dakar','Djida Thiaroye Kaw',14.745269,-17.378121,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage touba mécanique pro','+221 77 681 45 09','prospect_221776814509@nexusmarket.sn','Touba','Diourbel','Touba',14.864559,-15.876047,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','General Auto Services (Mecatronic Senegal)','+221 77 663 52 21','prospect_221776635221@nexusmarket.sn','Dakar','Dakar','Cité Sipres II VDN',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Gmd auto Dakar','+221 77 623 60 33','prospect_221776236033@nexusmarket.sn','Dakar','Dakar','Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Go Services','+221 33 823 99 22','prospect_221338239922@nexusmarket.sn','Dakar','Dakar','Mermoz Sacré-Cœur',14.720000,-17.466000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Guédé Mécanique','+221 77 300 28 29','prospect_221773002829@nexusmarket.sn','Dakar','Dakar','Keur Massar',14.780000,-17.316000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GUEBELS SARL','+221 33 957 07 72','prospect_221339570772@nexusmarket.sn','Saly','Thiès','Saly Carrefour',14.441115,-17.01483,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SENEGALAISE DE MECANIQUE (SENEMECA)','+221 33 849 47 70','prospect_221338494770@nexusmarket.sn','Dakar','Dakar','Rue Félix Eboué',14.693425,-17.447938,'nexpages.com','new'),
('rescuer','Mécanique / dépannage auto','Solution Auto Garage Mecanique','+221 77 640 90 88','prospect_221776409088@nexusmarket.sn','Dakar','Dakar','Zac Mbao, Rond-point Spires n°245',14.731241,-17.316679,'senpages.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Mécanique tôlerie Mbourouk','+221 77 648 36 75','prospect_221776483675@nexusmarket.sn','Mbourouk','Thiès','Mbourouk',14.791461,-16.925605,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage mécanicien chez pape Gueye','+221 77 677 42 21','prospect_221776774221@nexusmarket.sn','Koumpentoum','Tambacounda','Koumpentoum',13.984000,-14.554000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage chez THIERNO','+221 77 567 00 21','prospect_221775670021@nexusmarket.sn','Kabrousse','Ziguinchor','Route de Ziguinchor',12.359000,-16.723000,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Guy Gui Mécanique','+221 77 014 22 22','prospect_221770142222@nexusmarket.sn','Joal Fadiout','Thiès','Joal Fadiout',14.160000,-16.860000,'goafricaonline.com','new'),
('rescuer','Pneu + Mécanique / dépannage auto','BLACK POWER 2 ROUES','+221 33 824 31 12','prospect_221338243112@nexusmarket.sn','Dakar','Dakar','Av. Cheikh Ahmadou Bamba, HLM 1',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SUPER MOTO','+221 33 864 85 43','prospect_221338648543@nexusmarket.sn','Dakar','Dakar','Av. Cheikh Ahmadou Bamba, HLM 1',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','UNIVERSAL MOTO','+221 77 105 16 20','prospect_221771051620@nexusmarket.sn','Dakar','Dakar','Dieuppeul Derklé Bourguiba',14.706882,-17.460532,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DJOLOFF MOTO','+221 77 649 23 23','prospect_221776492323@nexusmarket.sn','Pikine','Dakar','Rue des Niayes - Pikine Ouest Canada',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','NDINDY MOTO','+221 77 614 50 16','prospect_221776145016@nexusmarket.sn','Guédiawaye','Dakar','Guediawaye Ravin',14.777121,-17.390071,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Dabakh Moto','+221 77 945 01 01','prospect_221779450101@nexusmarket.sn','Guédiawaye','Dakar','Guediawaye',14.777121,-17.390071,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SAHEL MOTORS','+221 33 832 53 53','prospect_221338325353@nexusmarket.sn','Dakar','Dakar','Hann Bel Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','LIFAN MOTO SENEGAL','+221 77 767 26 82','prospect_221777672682@nexusmarket.sn','Dakar','Dakar','Service des Mines Hann Yarakh',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GAYNDE MOTO SARL (BAJAJ MOTO)','+221 77 366 45 39','prospect_221773664539@nexusmarket.sn','Dakar','Dakar','10 Route de Rufisque',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','HAOJUE MOTO','+221 77 401 86 59','prospect_221774018659@nexusmarket.sn','Dakar','Dakar','Sicap Liberté 1',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','PARIS MOTO','+221 77 127 82 56','prospect_221771278256@nexusmarket.sn','Dakar','Dakar','Liberté 6 Extension Sicap liberté',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MOTO STYLE','+221 33 843 61 37','prospect_221338436137@nexusmarket.sn','Dakar','Dakar','Ouakam cité El Hadji Malick Sy',14.739967,-17.491018,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DAABA MOTOS TRICYCLES','+221 77 094 67 02','prospect_221770946702@nexusmarket.sn','Dakar','Dakar','Rond Point Jet d''Eau',14.733827,-17.453649,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MAM AUTOMOTOS','+221 77 270 32 15','prospect_221772703215@nexusmarket.sn','Dakar','Dakar','Yoff Layenne',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CHEIKH MOTORS','+221 77 523 54 77','prospect_221775235477@nexusmarket.sn','Dakar','Dakar','Route de Ngor - Yoff',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','InstaBike Senegal','+221 78 128 17 82','prospect_221781281782@nexusmarket.sn','Dakar','Dakar','Mermoz Sacré-Cœur',14.720000,-17.466000,'goafricaonline.com','new'),
('rescuer','Pneu + Mécanique / dépannage auto','NDINDY 2 ROUES','+221 77 484 87 98','prospect_221774848798@nexusmarket.sn','Dakar','Dakar','Wagou Niaye Biscuterie',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MOD DISTRIBUTION','+221 33 822 07 21','prospect_221338220721@nexusmarket.sn','Dakar','Dakar','Rue 25 X 30 Médina',14.677125,-17.444315,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','POLAQUAD','+221 33 954 97 22','prospect_221339549722@nexusmarket.sn','Saly','Thiès','Saly Carrefour',14.441115,-17.014830,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ESPACE MOTO','+221 33 962 24 71','prospect_221339622471@nexusmarket.sn','Saint-Louis','Saint-Louis','Route nationale Pikine - Saint-Louis',15.984844,-16.489688,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','AFRIQUE PARE-BRISES','+221 33 832 15 40','prospect_221338321540@nexusmarket.sn','Dakar','Dakar','Km 5 Boulevard Du Centenaire De La Commune De Dakar, BP 2620',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ALASSANE NIANG ELECTRIQUE','+221 77 246 23 25','prospect_221772462325@nexusmarket.sn','Dakar','Dakar','Ouest Foire',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Africa Star Trans','+221 78 373 05 22','prospect_221783730522@nexusmarket.sn','Dakar','Dakar','PHRW+QMP',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Alpha','+221 77 813 34 59','prospect_221778133459@nexusmarket.sn','Dakar','Dakar','Boutique free - Ouakam',14.724737,-17.485066,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Arret Cherif','+221 78 291 47 18','prospect_221782914718@nexusmarket.sn','Rufisque','Dakar','PPHR+3MG',14.716417,-17.273844,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Atelier Mécanique','+221 77 561 23 75','prospect_221775612375@nexusmarket.sn','Tivaouane','Thiès','W5RP+39F',14.951507,-16.812868,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Auto motion service','+221 33 959 08 04','prospect_221339590804@nexusmarket.sn','Dakar','Dakar','Jaxaay-Parcelle-Niakoul Rap',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Bamba Niang Business Corp','+221 77 752 27 65','prospect_221777522765@nexusmarket.sn','Rufisque','Dakar','PPV2+4MX',14.716417,-17.273844,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CF MOTO','+221 77 300 80 39','prospect_221773008039@nexusmarket.sn','N''Gaparou','Thiès','Route de Saly, ancienne usine glace',14.470278,-17.059288,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CHEIKH REPARATION','+221 77 168 44 32','prospect_221771684432@nexusmarket.sn','Dakar','Dakar','4,5 Potou',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','CLE MINUTE MULTISERVICES','+221 77 503 06 18','prospect_221775030618@nexusmarket.sn','Dakar','Dakar','Av. Cheikh Ahmadou Bamba, HLM 1, Rail Bi',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Caetano Express','+221 77 096 17 95','prospect_221770961795@nexusmarket.sn','Dogar','Dakar','PR8G+5X',14.7,-17.4,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Corniche Dara Djiolof','+221 76 833 81 17','prospect_221768338117@nexusmarket.sn','Touba','Diourbel','N3',14.864559,-15.876047,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DIALLO ET FRERE MOTO','+221 77 562 99 89','prospect_221775629989@nexusmarket.sn','Dakar','Dakar','Liberté 5, Sicap liberté',14.721027,-17.464029,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DIOP FROID AUTO','+221 77 555 21 36','prospect_221775552136@nexusmarket.sn','Dakar','Dakar','MHQ3+M3M, Rue ME 32 - Medina',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','DK_tuning_accessoires','+221 77 586 08 29','prospect_221775860829@nexusmarket.sn','Dakar','Dakar','yoff, lot 6',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Dakar GPS Tracking Services','+221 77 114 14 09','prospect_221771141409@nexusmarket.sn','Dakar','Dakar','111 Rue CA 01 - Parcelles Assainies',14.754034,-17.442517,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Darou sam PIECES Détachées','+221 76 735 77 91','prospect_221767357791@nexusmarket.sn','Touba','Diourbel','Touba',14.864559,-15.876047,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Diabel','+221 76 778 19 25','prospect_221767781925@nexusmarket.sn','Khombole','Thiès','Unnamed Road',14.760535,-16.691803,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Digitale-Power-SN','+221 77 630 04 66','prospect_221776300466@nexusmarket.sn','Dakar','Dakar','QJ55+7HH',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ENTREPRISE MECANIQUE GENERALE','+221 33 821 72 32','prospect_221338217232@nexusmarket.sn','Dakar','Dakar','1 Rue Félix Eboue, BP 2072',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ENTREPRISE TALL TANOR','+221 33 850 35 99','prospect_221338503599@nexusmarket.sn','Dakar','Dakar','Ancienne piste VDN',14.714949,-17.470927,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ENTREPRISES DIAGNE & FRÈRES','+221 33 823 06 08','prospect_221338230608@nexusmarket.sn','Dakar','Dakar','Av. Faidherbe - Dakar-Plateau',14.67558,-17.438488,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ETS HARTMANN','+221 33 832 35 17','prospect_221338323517@nexusmarket.sn','Dakar','Dakar','Km 4,5 Boulevard Du Centenaire De La Commune De Dakar, BP 1946',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ETS MAGUETTE MECANIQUE','+221 77 900 78 46','prospect_221779007846@nexusmarket.sn','Keur Massar','Dakar','Keur Massar',14.771832,-17.307663,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','ETS MBAO AUTO','+221 77 546 95 59','prospect_221775469559@nexusmarket.sn','Dakar','Dakar','Grand Mbao KM21, Route de rufisque',14.741542,-17.326147,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','EXCELLENCE AUTO','+221 33 825 79 26','prospect_221338257926@nexusmarket.sn','Dakar','Dakar','Mermoz Amitié 2, Villa n°3028',14.707445,-17.474397,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','EXPERTISE AUTOMOBILE PASSIONNÉ','+221 78 175 83 47','prospect_221781758347@nexusmarket.sn','Dakar','Dakar','HLM Sodida liberté 5',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Eumeuzone','+221 78 140 89 36','prospect_221781408936@nexusmarket.sn','Dakar','Dakar','Rue 110 - Grand Dakar',14.706696,-17.457739,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Excellence Auto Keur Mbaye Fall','+221 77 629 40 60','prospect_221776294060@nexusmarket.sn','Pikine','Dakar','Pikine',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','FIRENZE MOTO','+221 33 842 41 27','prospect_221338424127@nexusmarket.sn','Dakar','Dakar','Sicap Mbao, BP 20742',14.756056,-17.351587,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','FLASH AUTO','+221 77 544 40 02','prospect_221775444002@nexusmarket.sn','Dakar','Dakar','Rue 48 x Canal 4, Fann Point E',14.690791,-17.466559,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','FOC TS','+221 33 832 78 59','prospect_221338327859@nexusmarket.sn','Dakar','Dakar','Km 2 Boulevard du centenaire de la commune de Dakar',14.691645,-17.437478,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','FORMADIAG AUTO','+221 70 700 83 84','prospect_221707008384@nexusmarket.sn','Dakar','Dakar','Rue 61x52',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','FROID AUTO CENTENAIRE','+221 30 104 11 60','prospect_221301041160@nexusmarket.sn','Dakar','Dakar','Km 2 Av. Cheikh Anta Diop, Fann Point E',14.701256,-17.471674,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Favour obasi Engine','+221 77 129 97 22','prospect_221771299722@nexusmarket.sn','Dakar','Dakar','MHG4+9WV, Rue PL115 - Dakar-Plateau',14.676818,-17.439291,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Froid Automobile','+221 77 647 23 10','prospect_221776472310@nexusmarket.sn','Mbour','Thiès','C2RC+5F7',14.42074,-16.971484,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE MEDINA BAYE','+221 77 532 33 56','prospect_221775323356@nexusmarket.sn','Dakar','Dakar','Allees Cheikh Sidaty Aidara - Biscuiterie',14.708748,-17.453005,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GARAGE PRO TECH','',null,'Keur Massar','Dakar','Sotrac, Keur Massar',14.772579,-17.313819,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GDOA-LAVAGE AUTO','+221 77 656 44 28','prospect_221776564428@nexusmarket.sn','Dakar','Dakar','Terrain basket, Sicap Mbao',14.749243,-17.351976,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','GENERAL MOTORS SERVICES','+221 77 685 82 05','prospect_221776858205@nexusmarket.sn','Dakar','Dakar','Dakar Vdn',14.784201,-17.393682,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage A lune ngom hafa lub','+221 33 864 30 99','prospect_221338643099@nexusmarket.sn','Dakar','Dakar','SODIDA, Sonepi - HLM',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Bignona','+221 76 408 25 51','prospect_221764082551@nexusmarket.sn','Dakar','Dakar','PHP4+6MG, Unnamed Road - Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Casamance','+221 78 359 16 85','prospect_221783591685@nexusmarket.sn','Dakar','Dakar','Grand Dakar',14.705464,-17.454109,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Clando','+221 77 002 00 00','prospect_221770020000@nexusmarket.sn','Yeumbeul','Dakar','',14.775771,-17.357087,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Dabakh','+221 77 433 31 98','prospect_221774333198@nexusmarket.sn','Dakar','Dakar','MHX7+563 - Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Dakar','+221 70 123 45 56','prospect_221701234556@nexusmarket.sn','Louga','Louga','JQ65+MVQ',15.777002,-16.061847,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage De Bokeladji','+221 77 653 42 82','prospect_221776534282@nexusmarket.sn','Bokiladji','Matam','3733+7X6',15.057821,-12.745281,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Fouta','+221 77 148 93 28','prospect_221771489328@nexusmarket.sn','Dakar','Dakar','QJ68+83H',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Kawsara Fall','+221 33 836 83 87','prospect_221338368387@nexusmarket.sn','Dakar','Dakar','21 Rte de Rufisque - Dakar-Plateau',14.716417,-17.273844,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Khabane FALL','+221 77 535 11 00','prospect_221775351100@nexusmarket.sn','Tivaouane','Thiès','X56W+RXQ',14.951507,-16.812868,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage LT Automobiles - Lamine Touré','+221 77 649 12 55','prospect_221776491255@nexusmarket.sn','Dakar','Dakar','Yoff',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Land Rover','+221 33 832 43 39','prospect_221338324339@nexusmarket.sn','Dakar','Dakar','PHR8+V84 - Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Laurena','+221 77 091 50 68','prospect_221770915068@nexusmarket.sn','Dakar','Dakar','à coté de la pharmacie renaissance - Ouakam',14.724737,-17.485066,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage MOBILITY','+221 78 139 90 44','prospect_221781399044@nexusmarket.sn','Dakar','Dakar','Km1 Av. Cheikh Anta Diop - Fass',14.687731,-17.456329,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Mecatech','+221 78 139 96 91','prospect_221781399691@nexusmarket.sn','Rufisque','Dakar','PPJ2+94J',14.716417,-17.273844,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Minou','+221 77 634 78 59','prospect_221776347859@nexusmarket.sn','Dakar','Dakar','MGGW+GJ9, Rue 15 - Medina',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Mécanicien djibril faye climatisation','+221 77 185 80 72','prospect_221771858072@nexusmarket.sn','Dakar','Dakar','Fass',14.688276,-17.455366,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Ndindy wa keur serigne attékh mbacké fallilou','+221 77 657 00 34','prospect_221776570034@nexusmarket.sn','Saint-Louis','Saint-Louis','Village Artisanal - Thiès Nord',16.028045,-16.504869,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Sénégal DEM DIKK-Bignona','+221 33 827 00 24','prospect_221338270024@nexusmarket.sn','Bignona','Ziguinchor','RQ3F+48P, Quartier Château D''eau',12.801133,-16.22897,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Touba Taïf Ibrahim','+221 77 570 96 91','prospect_221775709691@nexusmarket.sn','Nianing','Thiès','83V9+6V9',14.34398,-16.929427,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage djapal ma djap','+221 77 568 17 23','prospect_221775681723@nexusmarket.sn','NGUITH','Louga','CR2P+JRR',15.55,-16.1,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage mécanique auto chez Mame Cheikh','+221 77 681 86 17','prospect_221776818617@nexusmarket.sn','Dakar','Dakar','PGFG+V2M, Rue MZ 01 - Sicap-Liberté',14.713165,-17.454183,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Garage mécanique chez Antoine Gomis','+221 77 899 18 01','prospect_221778991801@nexusmarket.sn','Ziguinchor','Ziguinchor','HPFM+WH',12.563493,-16.272461,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Gare Routière (Bignona)','+221 77 591 61 79','prospect_221775916179@nexusmarket.sn','Bignona','Ziguinchor','Nouvelle Gare Routiere, N4',12.801133,-16.22897,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Gare routière de vélingara','+221 76 184 36 29','prospect_221761843629@nexusmarket.sn','Vélingara','Kolda','',13.147235,-14.107583,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Génération Automobile','+221 33 835 96 97','prospect_221338359697@nexusmarket.sn','Dakar','Dakar','Rond point Cambérene, Total - Patte d''Oie',14.746488,-17.440689,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','HERTZ SENEGAL','+221 33 832 17 83','prospect_221338321783@nexusmarket.sn','Dakar','Dakar','Km 5 Boulevard Du Centenaire De La Commune De Dakar, BP 2302',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','HUI YUE AUTOMOBILE','+221 33 827 32 09','prospect_221338273209@nexusmarket.sn','Dakar','Dakar','Cité Tobago - Yoff',14.760358,-17.468149,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','IBOU BA MECANIQUE GENERALE','+221 77 537 58 67','prospect_221775375867@nexusmarket.sn','Dakar','Dakar','1013 Rue 6 - Medina',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','IBOU LAUNCH','+221 78 120 76 74','prospect_221781207674@nexusmarket.sn','Dakar','Dakar','Rue 41x30, Centenaire, Medina',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Ibrahima Beye','+221 76 600 21 33','prospect_221766002133@nexusmarket.sn','Dakar','Dakar','158 Rue DF 131 - Hann Bel-Air',14.740395,-17.419892,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','JEM''S AUTOMOBILE','+221 77 163 00 77','prospect_221771630077@nexusmarket.sn','Mbour','Thiès','x rue de la mer, Piste des Charrettes',14.42074,-16.971484,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','JIHAD','+221 33 832 17 49','prospect_221338321749@nexusmarket.sn','Dakar','Dakar','PH55+GJ - Hann Bel-Air',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','KANG AUTOMOBILE','+221 77 195 69 96','prospect_221771956996@nexusmarket.sn','Pikine','Dakar','',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','KEE WU PRO','+221 33 842 02 06','prospect_221338420206@nexusmarket.sn','Dakar','Dakar','18 Rue loulou, Fann Hock',14.690791,-17.466559,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','KEUR SOKHNA KHADY','+221 76 731 73 06','prospect_221767317306@nexusmarket.sn','Dakar','Dakar','Parcelles assainies unité 19',14.756024,-17.442384,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','KEUR THIANE AUTOMOBILES','+221 33 849 36 31','prospect_221338493631@nexusmarket.sn','Dakar','Dakar','Km 9,5 Route de Rufisque 26292 Parcelles',14.716417,-17.273844,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','KHELCOM PAREBRISE','+221 33 959 10 58','prospect_221339591058@nexusmarket.sn','Dakar','Dakar','Parcelles assainies, Soprim et Camberene 1',14.759407,-17.438455,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','KING PIECES DETACHEES','+221 77 954 14 56','prospect_221779541456@nexusmarket.sn','Dakar','Dakar','HLM 2',14.713992,-17.444395,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','KITKONECT','+221 33 824 33 56','prospect_221338243356@nexusmarket.sn','Dakar','Dakar','Centre commercial Sea Plaza',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Khelcom automobile','+221 77 566 26 29','prospect_221775662629@nexusmarket.sn','Mbour','Thiès','C27J+Q7',14.42074,-16.971484,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Kitane et frères gandiaye','+221 77 512 26 46','prospect_221775122646@nexusmarket.sn','Gandiaye','Kaolack','6PQM+P7F',14.243744,-16.273878,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Koubalan djinoubor','+221 76 123 24 50','prospect_221761232450@nexusmarket.sn','Dakar','Dakar','MR7C+3VW',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','L''AUTOMOBILE AUTREMENT SACABESA SARL','+221 76 260 31 91','prospect_221762603191@nexusmarket.sn','Dakar','Dakar','Station 10 Golf Sud Camberene',14.693425,-17.447938,'goafricaonline.com / expat.com','new'),
('rescuer','Mécanique / dépannage auto','LA CARROSSERIE DE L''AUTOMOBILE','+221 33 832 93 93','prospect_221338329393@nexusmarket.sn','Dakar','Dakar','Lot V39, Hann Mariste',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','LA SENEGALAISE DE L''AUTOMOBILE - LASA','+221 33 849 38 38','prospect_221338493838@nexusmarket.sn','Dakar','Dakar','Km 2,5 Bd du Centenaire de la Commune de Dakar, BP 18524',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','LES SPECIALISTES DE L''AUTOMOBILE','+221 77 653 32 43','prospect_221776533243@nexusmarket.sn','Dakar','Dakar','Cambérène 1, Quartier Kawsara Laye',14.771003,-17.423697,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','LEYDIFILS COMPANY','+221 77 425 09 05','prospect_221774250905@nexusmarket.sn','Dakar','Dakar','123 Rue MZ 68 - Mermoz Sacre-coeur',14.706904,-17.471659,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','LT AUTOMOBILE','+221 33 868 99 81','prospect_221338689981@nexusmarket.sn','Dakar','Dakar','Grand yoff, zone de captage',14.734219,-17.445055,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Lamine diatta','+221 78 202 07 39','prospect_221782020739@nexusmarket.sn','Ziguinchor','Ziguinchor','HP7P+MC2',12.563493,-16.272461,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Leader du Diagnostic automobile et Électricité','',null,'Touba','Diourbel','Touba khaïra',14.845673,-15.884398,'goafricaonline.com','new'),
('rescuer','Pneu + Mécanique / dépannage auto','MAINTENANCE PNEUMATIQUE','+221 33 842 47 00','prospect_221338424700@nexusmarket.sn','Dakar','Dakar','2 Av. Cheikh Anta Diop - Fass',14.686509,-17.455069,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MAN DIESEL ET TURBO','+221 33 867 79 77','prospect_221338677977@nexusmarket.sn','Dakar','Dakar','Sacre Coeur 3 Vdn Villa 9432, BP 45947',14.784201,-17.393682,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MATFORCE','+221 33 864 95 00','prospect_221338649500@nexusmarket.sn','Dakar','Dakar','VDN immeuble taif 397',14.784201,-17.393682,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MAZDA','+221 33 821 04 43','prospect_221338210443@nexusmarket.sn','Dakar','Dakar','Sandaga, Av. Blaise Ndiagne',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MBAUTOPARTS','+221 33 823 76 87','prospect_221338237687@nexusmarket.sn','Dakar','Dakar','120 Rue M''baye Worre - Medina',14.679258,-17.445285,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECA AUTO SERVICES','+221 77 632 80 64','prospect_221776328064@nexusmarket.sn','Dakar','Dakar','Piste Ikagel',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECA MERSEN','+221 33 832 01 57','prospect_221338320157@nexusmarket.sn','Dakar','Dakar','45 Rue Hann Bel Air, BP 3927',14.723317,-17.438124,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECA PRESS EQUIPEMENT','+221 33 835 88 13','prospect_221338358813@nexusmarket.sn','Dakar','Dakar','Patte D''oie Buldeuse',14.746488,-17.440689,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECANIQUE AUTO TECHNOLOGIE','+221 77 797 80 50','prospect_221777978050@nexusmarket.sn','Dakar','Dakar','Ngor',14.748791,-17.514961,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECANIQUE GENERAL ASSISTANCE','+221 77 550 56 03','prospect_221775505603@nexusmarket.sn','Dakar','Dakar','Keur Massar route de Jaxaay',14.752614,-17.28653,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECATEK BOUTIQUE','+221 77 883 67 82','prospect_221778836782@nexusmarket.sn','Pikine','Dakar','Tally Boubess',14.756388,-17.392563,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECATRONIC SENEGAL','+221 77 640 82 14','prospect_221776408214@nexusmarket.sn','Dakar','Dakar','VDN Cite Sipres II',14.784201,-17.393682,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MECA_FORM','+221 77 353 82 99','prospect_221773538299@nexusmarket.sn','Dakar','Dakar','94 Rue GY-316 - Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MIDAS','+221 77 177 76 85','prospect_221771777685@nexusmarket.sn','Dakar','Dakar','35 Avenue Malick Sy x Ambroise Mendy',14.693425,-17.447938,'goafricaonline.com / midas.sn','new'),
('rescuer','Mécanique / dépannage auto','MISSION AUTO','+221 77 535 43 23','prospect_221775354323@nexusmarket.sn','Dakar','Dakar','Patte d''oie builders',14.746799,-17.441876,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MOBEL AUTO','+221 76 027 00 47','prospect_221760270047@nexusmarket.sn','Keur Massar','Dakar','villa 264',14.803959,-17.337064,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MOBILITY','+221 77 744 76 48','prospect_221777447648@nexusmarket.sn','Dakar','Dakar','KM 4,5 Route de Ouakam Mermoz',14.724737,-17.485066,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MRS','+221 78 177 49 42','prospect_221781774942@nexusmarket.sn','Dakar','Dakar','Villa 146 Ouest Foire - Yoff',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MTN Auto','+221 77 722 07 55','prospect_221777220755@nexusmarket.sn','Dakar','Dakar','PGRQ+H58 - Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MWWB','+221 78 440 19 58','prospect_221784401958@nexusmarket.sn','Dakar','Dakar','Zone Ouest Foire, Route de l''aéroport',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','MY AUTO TECH','+221 77 709 40 40','prospect_221777094040@nexusmarket.sn','Dakar','Dakar','Rue 12 Mermoz Pyrotechnie VDN',14.707445,-17.474397,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Madina','+221 78 202 84 14','prospect_221782028414@nexusmarket.sn','Waoundé','Matam','74CJ+553',15.264125,-12.867714,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Maison De L''outil Mbour','+221 33 957 06 00','prospect_221339570600@nexusmarket.sn','Mbour','Thiès','92XR+FPR, tripano',14.42074,-16.971484,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Midas Amitié Sénégal','+221 77 790 86 57','prospect_221777908657@nexusmarket.sn','Dakar','Dakar','avenue Bourguiba angle Allees Seydou',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Mobileautoplus','+221 78 595 42 44','prospect_221785954244@nexusmarket.sn','Thiès','Thiès','Thies Ouest',14.782347,-16.94188,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Mécabat.sn','+221 77 293 03 09','prospect_221772930309@nexusmarket.sn','Dakar','Dakar','PJV6+53P',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','NEXT AUTOMOBILE','+221 77 369 40 80','prospect_221773694080@nexusmarket.sn','Dakar','Dakar','Ouest foire en face impot et domaine',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Nouvelle Vision de l''Automobile-SAV','+221 77 637 55 67','prospect_221776375567@nexusmarket.sn','Dakar','Dakar','Grand Dakar',14.705464,-17.454109,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','OH GARAGE','+221 77 312 20 20 / +221 33 858 15 41','prospect_221773122020221338581541@nexusmarket.sn','Dakar','Dakar','VDN Face Sonatel, Pyrotechnie 4500',14.784201,-17.393682,'goafricaonline.com / ohgarage.com','new'),
('rescuer','Mécanique / dépannage auto','ORIENT AUTO SERVICE','+221 33 821 47 11','prospect_221338214711@nexusmarket.sn','Dakar','Dakar','Km 2.5 Boulevard du Centenaire',14.679911,-17.435244,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Oh garage PL Diamniadio','+221 77 816 75 84','prospect_221778167584@nexusmarket.sn','Bargny Gouddau','Dakar','PQ7W+5P',14.6994,-17.2333,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','PALENE AUTO','+221 33 855 33 14','prospect_221338553314@nexusmarket.sn','Dakar','Dakar','Rte des Niayes - Parcelles Assainies',14.735759,-17.455831,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','PAPA THIOUNE NDIAYE','+221 33 832 23 22','prospect_221338322322@nexusmarket.sn','Dakar','Dakar','Cite Diamalaye 3 Villa n°3',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','PLANETE AUTO SERVICE SARL','+221 33 820 81 05','prospect_221338208105@nexusmarket.sn','Dakar','Dakar','Ouest Foire Cité Sipres 2 N° 02',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','POULART AUTOMOBIL','+221 77 778 01 18','prospect_221777780118@nexusmarket.sn','Dakar','Dakar','PGGP+6H4 - Sicap-Liberté',14.713165,-17.454183,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','POWER DIESEL','+221 33 832 17 42','prospect_221338321742@nexusmarket.sn','Dakar','Dakar','Km 3,5 Bd du Centenaire, BP 9001',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','PRECISION AUTO','+221 77 694 73 73','prospect_221776947373@nexusmarket.sn','Dakar','Dakar','Ngor extension',14.748791,-17.514961,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','PRINCIPALE AUTOSERVICE','+221 77 630 81 57','prospect_221776308157@nexusmarket.sn','Dakar','Dakar','Ouest Foire, rond point Yoff',14.749386,-17.470208,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Pa Ibou Mécanique Générale','+221 77 486 10 25','prospect_221774861025@nexusmarket.sn','Mbour','Thiès','F267+8V9',14.42074,-16.971484,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Parking Kode','+221 77 490 59 38','prospect_221774905938@nexusmarket.sn','Dakar','Dakar','PGJR+96X - Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Pièces auto Sénégal','+221 77 403 02 01','prospect_221774030201@nexusmarket.sn','Dakar','Dakar','Rue OKM-165 - Ouakam',14.724737,-17.485066,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','REDAT SENEGAL (TTP)','+221 33 854 24 00','prospect_221338542400@nexusmarket.sn','Dakar','Dakar','Km 11,8 en face Cinéma Thiaroye, BP 20456',14.747343,-17.368778,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','S. M. A','+221 77 280 62 19','prospect_221772806219@nexusmarket.sn','Dakar','Dakar','Jaxaay-Parcelle-Niakoul Rap',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SAGVR','+221 77 730 44 52','prospect_221777304452@nexusmarket.sn','Dakar','Dakar','Parcelles assainies 14000',14.759407,-17.438455,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SAHEL DISTRIBUTION SARL','+221 77 764 83 23','prospect_221777648323@nexusmarket.sn','Dakar','Dakar','Hann bel Air',14.715635,-17.435563,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SALOUM MOBYLETTE','+221 77 974 46 47','prospect_221779744647@nexusmarket.sn','Dakar','Dakar','Djidah 2, grand yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SALY SERVICES','+221 33 957 06 51','prospect_221339570651@nexusmarket.sn','Saly','Thiès','Saly carrefour, BP 42',14.44349,-16.988868,'goafricaonline.com / salyservices.com','new'),
('rescuer','Mécanique / dépannage auto','SAMA AUTOMOTIVE GARAGE','+221 76 947 26 34','prospect_221769472634@nexusmarket.sn','Pikine','Dakar','Lot N°05, route cambérène, Dalifort-Foirail',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SARR BUSINESS SERVICES','+221 77 757 41 98','prospect_221777574198@nexusmarket.sn','Tivaouane','Thiès','Al Amine, Route de l''hôpital',14.951507,-16.812868,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SAUDEQUIP','+221 33 832 06 83','prospect_221338320683@nexusmarket.sn','Dakar','Dakar','Km 5, Bd du centenaire, BP 3364',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SCM DAROU SALAM','+221 33 825 81 14','prospect_221338258114@nexusmarket.sn','Dakar','Dakar','Mermoz Sacre-coeur',14.705728,-17.469209,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SCOMATH SARL','+221 33 827 53 96','prospect_221338275396@nexusmarket.sn','Dakar','Dakar','Keur Massar',14.782257,-17.311199,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SELMEG','+221 33 824 73 58','prospect_221338247358@nexusmarket.sn','Dakar','Dakar','Lot 20 Rue 14 Prolongee Sodida Hlm, BP 1811',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SEN DIESEL','+221 33 832 33 83','prospect_221338323383@nexusmarket.sn','Dakar','Dakar','Km 4,5 Bd Du Centenaire, Hann-Bel Air, BP 3170',14.722162,-17.432101,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SENBUS DIRECTION GENERALE ET SAV','+221 33 922 54 54','prospect_221339225454@nexusmarket.sn','Pikine','Dakar','PMX5+286',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SENBUS SAV','+221 77 341 12 48','prospect_221773411248@nexusmarket.sn','Saint-Louis','Saint-Louis','',16.028045,-16.504869,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SENE MECA','+221 33 849 47 50','prospect_221338494750@nexusmarket.sn','Dakar','Dakar','Rue félix éboué',14.67896,-17.43935,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SENE TECHNOLOGY','+221 33 825 58 79','prospect_221338255879@nexusmarket.sn','Dakar','Dakar','Ouakam Batrain',14.724737,-17.485066,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SENEMECA MG','+221 33 849 47 80','prospect_221338494780@nexusmarket.sn','Dakar','Dakar','Rue Félix Eboué, BP 3251',14.67896,-17.43935,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SENGARAGE','+221 30 105 78 46','prospect_221301057846@nexusmarket.sn','Mbour','Thiès','petite cote mbour nationale 1',14.42074,-16.971484,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SEYDOU DIA ET FRERES-GARAGE AUTOMOBILE','+221 33 927 23 23','prospect_221339272323@nexusmarket.sn','Mbour','Thiès','',14.42074,-16.971484,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SMPL SUARL','+221 77 130 54 53','prospect_221771305453@nexusmarket.sn','Pikine','Dakar','PMV4+CPV',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SNF AUTOMOBILE','+221 77 656 47 49','prospect_221776564749@nexusmarket.sn','Saint-Louis','Saint-Louis','Avenue 15m, 05051',16.028045,-16.504869,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SOCIETE DE TRANSPORT DE GABON','+221 77 726 52 89','prospect_221777265289@nexusmarket.sn','Dakar','Dakar','hlm 1, villa n° 401',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SOETI SARL','+221 33 822 33 74','prospect_221338223374@nexusmarket.sn','Dakar','Dakar','Croisement Camberene en face Cite fayçal',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SOGAFRIC SENEGAL','+221 33 869 10 60','prospect_221338691060@nexusmarket.sn','Dakar','Dakar','73 Sacré Cœur 3-Extension VDN',14.711462,-17.468869,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SOTONI / kedougou','+221 77 090 76 76','prospect_221770907676@nexusmarket.sn','Kédougou','Kédougou','HR7C+7VF',12.557075,-12.185565,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','SPEEDY SERVICES SENEGAL 3S','+221 33 820 44 10','prospect_221338204410@nexusmarket.sn','Dakar','Dakar','6 et 38 Avenue Lamine Gueye, BP 25770',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','STATION PILOTE','+221 77 704 16 15','prospect_221777041615@nexusmarket.sn','Dakar','Dakar','HLM Grande Medina',14.710073,-17.444181,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Salle de Peinture Auto SUNU SALLE','+221 77 579 96 86','prospect_221775799686@nexusmarket.sn','Rufisque','Dakar','QP68+JC5',14.716417,-17.273844,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Sand auto','+221 33 823 33 02','prospect_221338233302@nexusmarket.sn','Dakar','Dakar','MHG3+9JR Rue de Reims - Dakar-Plateau',14.676818,-17.439291,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Sarr et frères','+221 77 507 08 30','prospect_221775070830@nexusmarket.sn','Richard Toll','Saint-Louis','API, en face station',16.466294,-15.688449,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Seck clim Auto Thies','+221 77 563 99 98','prospect_221775639998@nexusmarket.sn','Thiès','Thiès','Rocade de Contournement de Thiès - Thiès Nord',14.791461,-16.925605,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Senautozone','+221 33 867 45 47','prospect_221338674547@nexusmarket.sn','Dakar','Dakar','Voie de degagement N - Sicap-Liberté',14.727549,-17.471521,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Seneauto','+221 77 510 95 87','prospect_221775109587@nexusmarket.sn','Dakar','Dakar','Villa 75B Cité Teranga Keur Massar',14.782257,-17.311199,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Shama Auto','+221 33 862 58 29','prospect_221338625829@nexusmarket.sn','Pikine','Dakar','Pikine',14.751544,-17.396413,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Sicauto','+221 77 531 40 46','prospect_221775314046@nexusmarket.sn','Saint-Louis','Saint-Louis','Rte de Leybar, 32002',16.028045,-16.504869,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Singuinar Garage Auto','+221 77 100 00 55','prospect_221771000055@nexusmarket.sn','Dakar','Dakar','Sacre coeur 3 extention - Sicap-Liberté',14.713165,-17.454183,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Solution Peinture Automobile du Sénégal','+221 77 120 26 95','prospect_221771202695@nexusmarket.sn','Dakar','Dakar','Hann Bel-Air',14.715635,-17.435563,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Speedy Sénégal','+221 33 889 51 70','prospect_221338895170@nexusmarket.sn','Dakar','Dakar','Angle Rue GT66, Soumbédioune',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Sénégal Cars Electronics Balla THIAM','+221 77 568 87 33','prospect_221775688733@nexusmarket.sn','Bargny Gouddau','Dakar','MQXG+9M9',14.6994,-17.2333,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TEAM AUGER','+221 33 824 74 88','prospect_221338247488@nexusmarket.sn','Dakar','Dakar','Point E Impasse LGM',14.696478,-17.464182,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TEPA DAKAR SENEGAL','+221 77 268 79 85','prospect_221772687985@nexusmarket.sn','Dakar','Dakar','HLM patte d''oie',14.741461,-17.441632,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TERANGA AUTOMOBILE','+221 33 821 04 00','prospect_221338210400@nexusmarket.sn','Dakar','Dakar','Cité Keur Gorgui en face Park Site',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Pneu + Mécanique / dépannage auto','TOP PNEUS','+221 33 849 33 66','prospect_221338493366@nexusmarket.sn','Dakar','Dakar','Km 2,8 Boulevard du Centenaire',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TOPOTO','+221 78 308 32 32','prospect_221783083232@nexusmarket.sn','Dakar','Dakar','17920, Sicap-Liberté',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TOUBA DIESEL','+221 33 834 92 60','prospect_221338349260@nexusmarket.sn','Dakar','Dakar','Km 10, route de Rufisque',14.712351,-17.433763,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TOUBA MECANIQUE GENERALE','+221 77 376 90 00','prospect_221773769000@nexusmarket.sn','Dakar','Dakar','Cité Alioune sow',14.769382,-17.412167,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TOUBA MECATRONIQUE','+221 77 676 58 91','prospect_221776765891@nexusmarket.sn','Dakar','Dakar','Grand Dakar',14.705464,-17.454109,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','TOUBA PARE BRISE','+221 78 011 18 09','prospect_221780111809@nexusmarket.sn','Dakar','Dakar','Rue 12xY, usine Bene Tally',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Teranga Motors','+221 77 597 10 57','prospect_221775971057@nexusmarket.sn','Dakar','Dakar','PGVP+GM9 - Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Thies Équipement','+221 77 644 93 94','prospect_221776449394@nexusmarket.sn','Thiès','Thiès','361 Avenida Leopold Senghor, Thies Est',14.791461,-16.925605,'goafricaonline.com / site123.me','new'),
('rescuer','Mécanique / dépannage auto','Thomé - Oil Station Pêche','+221 33 832 94 07','prospect_221338329407@nexusmarket.sn','Lompoul sur Mer','Thiès','C7W8+562',15.442796,-16.728723,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Tim trading car','+221 77 653 63 09','prospect_221776536309@nexusmarket.sn','Dakar','Dakar','25587, Mermoz Sacre-coeur',14.705728,-17.469209,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Tivaouane moto','+221 77 641 27 14','prospect_221776412714@nexusmarket.sn','Tivaouane','Thiès','N2',15.404168,-16.421972,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Top Garage','+221 77 625 74 53','prospect_221776257453@nexusmarket.sn','Ngaparou','Thiès','FXC3+H6M',14.463516,-17.056689,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Touba Ndindy Khaïra Afia','+221 77 483 16 03','prospect_221774831603@nexusmarket.sn','Dakar','Dakar','PG5H+RWJ, Rue MZ 83, Mermoz',14.707445,-17.474397,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Tournal Boune','+221 77 634 84 10','prospect_221776348410@nexusmarket.sn','Yeumbeul','Dakar','QM85+CP6',14.775771,-17.357087,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Universal Technicien Automobile','+221 78 608 76 53','prospect_221786087653@nexusmarket.sn','Dakar','Dakar','12000, Grand Dakar',14.709573,-17.449127,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','WALO AUTO SERVICE','+221 77 193 35 86','prospect_221771933586@nexusmarket.sn','Dakar','Dakar','Cité Fadia Extension n°64, Ndingala Parcelles Assainies',14.759407,-17.438455,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','WALO MÉCANIQUE SERVICES','+221 77 556 56 59','prospect_221775565659@nexusmarket.sn','Ross Bethio','Saint-Louis','N2',16.278163,-16.140586,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','WARTSILA WEST AFRICA','+221 33 849 39 90','prospect_221338493990@nexusmarket.sn','Dakar','Dakar','km 4,5 BCCD, BP 21861',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','WORLD CARS','+221 77 660 13 66','prospect_221776601366@nexusmarket.sn','Dakar','Dakar','Sicap-Liberté',14.722996,-17.461589,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Wakeur Borom Darou Aluminium','+221 78 400 57 57','prospect_221784005757@nexusmarket.sn','Joal Fadiout','Thiès','54GX+94W, Rte Mbour-Joal',14.1667,-16.8333,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Yamaha Atelier Mecanique Hors-bord','+221 77 632 55 05','prospect_221776325505@nexusmarket.sn','Ziguinchor','Ziguinchor','HPQ9+9C7',12.563493,-16.272461,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','garage Tamba','+221 70 355 73 77','prospect_221703557377@nexusmarket.sn','Medina Gounass','Kolda','46XM+XVM',13.138886,-13.760137,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','nafissatou service logistic','+221 78 132 13 21','prospect_221781321321@nexusmarket.sn','Dakar','Dakar','rue 31x2bis - Medina',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','nettoyage phare automobile','+221 78 550 51 91','prospect_221785505191@nexusmarket.sn','Dakar','Dakar','Soprim extension, Rte des Niayes - Patte d''Oie',14.746488,-17.440689,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','pieces détachées Automobiles','+221 77 822 70 27','prospect_221778227027@nexusmarket.sn','Dakar','Dakar','MHV2+CFR - Fass',14.693425,-17.447938,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','precision auto ngor express','+221 33 865 73 73','prospect_221338657373@nexusmarket.sn','Dakar','Dakar','Rte Ngor Village - Ngor',14.748791,-17.514961,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Établissement Mawa Dieng','+221 77 548 18 15','prospect_221775481815@nexusmarket.sn','Dakar','Dakar','PGVX+H2W, Rue GY-316 - Grand Yoff',14.736683,-17.452813,'goafricaonline.com','new'),
('rescuer','Mécanique / dépannage auto','Gueye Mécanique Automobile','+221 77 116 55 58 / +221 76 383 19 90','prospect_221771165558221763831990@nexusmarket.sn','Thiès','Thiès','Grand standing Thiès',14.774238,-16.950771,'omargueye554.wixsite.com','new'),
('rescuer','Mécanique / dépannage auto','Diallo Toyota - Garagiste Inter Service','',null,'Saint-Louis / Dakar','Saint-Louis','',15.98841,-16.488331,'garagisteinterservice.com','new'),
('rescuer','Mécanique / dépannage auto','Grand Garage De Mbour','',null,'Mbour','Thiès','',14.42074,-16.971484,'yandex maps','new'),
('rescuer','Mécanique / dépannage auto','Mbour Mecanics Services','+221 77 501 53 19','prospect_221775015319@nexusmarket.sn','Mbour','Thiès','Parcelles Assainies (Grand Yoff)',14.42074,-16.971484,'yandex maps','new'),
('rescuer','Mécanique / dépannage auto','Touba Darou Karim Auto','+221 77 506 05 19','prospect_221775060519@nexusmarket.sn','Touba','Diourbel','',14.864559,-15.876047,'toubadaroukarimaut.wixsite.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Darou Mouhti','',null,'Touba','Diourbel','',14.864559,-15.876047,'BeezPages (note 3.9/5, 164 avis)','new'),
('rescuer','Mécanique / dépannage auto','Sen Diesel Divers Mecanique Generale','+221 33 832 33 83 / +221 33 859 16 44','prospect_221338323383221338591644@nexusmarket.sn','Rufisque','Dakar','Km 45 Boulevard Du Centenaire',14.716417,-17.273844,'annuaire-senegal.com','new'),
('rescuer','Mécanique / dépannage auto','Excellence Auto Service','',null,'Rufisque','Dakar','Route de Rufisque',14.741994,-17.395241,'annuaire-senegal.com','new'),
('rescuer','Mécanique / dépannage auto','Garage Wend Yam Chez Padre','+221 77 551 93 17','prospect_221775519317@nexusmarket.sn','Kaolack','Kaolack','Route de Gossas',14.15994,-16.075559,'expat.com','new'),
('rescuer','Mécanique / dépannage auto','Kraftwerk Sénégal','+221 77 800 81 38','prospect_221778008138@nexusmarket.sn','Keur-Massar','Dakar','Keur-Massar',14.771832,-17.307663,'expat.com','new'),
('rescuer','Mécanique / dépannage auto','Samba (mécanicien)','+221 77 421 99 13','prospect_221774219913@nexusmarket.sn','Vélingara','Kolda','Samba 15 ans, Velingara Centre',13.147235,-14.107583,'expat.com','new'),
('rescuer','Mécanique / dépannage auto','Ibou Diémé (mécanicien indépendant)','',null,'Non précisé','Non précisé','',null,null,'au-senegal.com','new')
on conflict (account_type,phone,name) do nothing;

-- ============================================================================
-- PROMOTION (copie de scripts/promote-prospects.sql, filtree account_type='rescuer').
-- ============================================================================
-- scripts/promote-prospects.sql
-- Promeut EN MASSE tous les prospects (table CRM `public.prospects`) en vrais comptes,
-- 100% en SQL — à coller dans Supabase → SQL Editor (aucune Service Role Key à manipuler,
-- l'éditeur tourne en service_role et bypasse la RLS).
--
-- Ce que fait le script, pour chaque prospect NON encore promu :
--   1. génère un email (email fourni, sinon slug(nom).4derniers-chiffres@nexusmarket.sn) ;
--   2. crée le compte auth.users + auth.identities (mot de passe = variable ci-dessous),
--      ou réutilise le compte existant si l'email existe déjà ;
--   3. laisse le trigger handle_new_user créer le profil, puis pose les flags + géo ;
--   4. crée la fiche métier : pros → status 'active' (visible direct), couriers → 'pending' ;
--   5. marque le prospect status='promoted' + promoted_user_id.
--
-- Idempotent : relançable sans créer de doublons (dédup par email + on conflict).
-- Filtre par défaut : tous les prospects dont status <> 'promoted'.
-- Pour ne traiter qu'un type, ajoute p.ex.  and account_type = 'pro'  au WHERE (marqué ci-dessous).

create extension if not exists pgcrypto;

-- Retire les accents FR courants sans dépendre de l'extension `unaccent`.
create or replace function pg_temp.unaccent_safe(txt text) returns text
language sql immutable as $fn$
  select translate(coalesce(txt,''),
    'àâäáãçéèêëíïîìóôöòõúùûüýñ',
    'aaaaaceeeeiiiiooooouuuuyn');
$fn$;

-- Journal des résultats — affiché dans la grille « Results » à la fin (visible même si
-- l'onglet Messages ne montre pas les RAISE NOTICE).
drop table if exists _promo_log;
create temp table _promo_log (seq serial, name text, account_type text, email text, outcome text, detail text);

do $$
declare
  p            record;
  v_uid        uuid;
  v_email      text;
  v_slug       text;
  v_d4         text;
  v_role       text;
  v_phone      text;
  v_note       text;
  v_spec       text[];
  v_hay        text;
  v_pwd        text := 'Nexus@2024';   -- ← mot de passe attribué à tous les comptes créés
  n_ok         int := 0;
  n_skip       int := 0;
  n_reuse      int := 0;
  n_err        int := 0;
begin
  -- Le trigger protect_profile_columns() interdit de changer role/is_pro/status SAUF pour
  -- service_role ou is_admin(). Le SQL Editor n'a pas de JWT (auth.role() = NULL) → on se
  -- déclare service_role le temps de CETTE transaction (chemin privilégié prévu par le
  -- trigger). Idem pour toute RLS/anti-escalade s'appuyant sur auth.role().
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true); -- variante ancienne d'auth.role()

  -- Diagnostic : le bypass a-t-il pris ? combien de lignes à traiter ?
  insert into _promo_log(name, outcome, detail) values (
    '(DIAGNOSTIC)', 'info',
    'auth.role()=[' || coalesce(auth.role(), 'NULL') || '] · prospects non-promus=' ||
    (select count(*) from public.prospects where status is distinct from 'promoted')::text);

  for p in
    select * from public.prospects
    where status is distinct from 'promoted'
      and account_type = 'rescuer'        -- ← ce script ne promeut QUE les depanneurs
    order by created_at asc
  loop
   -- Sous-bloc par prospect : une erreur (doublon de téléphone, contrainte…) est CAPTURÉE
   -- et n'annule que CE prospect (savepoint implicite), pas toute la transaction. Sans ça,
   -- une seule ligne fautive ferait tout échouer (rien d'enregistré).
   begin
    -- profession requise pour une fiche pro
    if p.account_type = 'pro' and coalesce(nullif(trim(p.profession), ''), null) is null then
      insert into _promo_log(name, account_type, outcome, detail) values (p.name, p.account_type, 'ignoré', 'pro sans profession');
      n_skip := n_skip + 1;
      continue;
    end if;

    v_role := case p.account_type when 'vendor' then 'vendor' else 'buyer' end;

    -- ---- email ----
    -- On IGNORE l'email-placeholder non-unique 'prospect_@...' (généré à l'import pour les
    -- fiches sans numéro, ex. « Voir Facebook ») : sinon plusieurs entreprises distinctes le
    -- partagent → fusionnées sur UN seul compte. Suffixe déterministe (hash de l'id) quand il
    -- n'y a pas de chiffres de téléphone → email UNIQUE par prospect ET idempotent (re-run OK).
    if coalesce(p.email,'') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       and lower(p.email) !~ '^prospect_?@' then
      v_email := lower(trim(p.email));
    else
      v_slug := regexp_replace(lower(pg_temp.unaccent_safe(coalesce(p.name,''))), '[^a-z0-9]+', '.', 'g');
      v_slug := trim(both '.' from v_slug);
      v_d4   := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 4);
      if v_slug <> '' then
        v_email := v_slug || '.' || coalesce(nullif(v_d4,''), left(md5(p.id::text),4)) || '@nexusmarket.sn';
      else
        v_email := 'prospect.' || coalesce(nullif(v_d4,''), left(md5(p.id::text),6)) || '@nexusmarket.sn';
      end if;
    end if;

    -- ---- compte auth : réutilise si l'email existe, sinon crée ----
    select id into v_uid from auth.users where lower(email) = v_email limit 1;
    if v_uid is not null then
      n_reuse := n_reuse + 1;
    else
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, crypt(v_pwd, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
          'name', coalesce(p.name,''), 'phone', coalesce(p.phone,''),
          'role', v_role, 'account_type', coalesce(p.account_type,'custom'),
          'profession', coalesce(p.profession,''), 'imported', true
        ),
        now(), now()
      );
      insert into auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        v_uid::text, v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_email),
        'email', now(), now(), now()
      );
    end if;

    -- ---- profil (le trigger handle_new_user a pu déjà le créer) ----
    insert into public.profiles (id, email, name, phone, role)
    values (v_uid, v_email, coalesce(p.name,''), coalesce(p.phone,''), v_role)
    on conflict (id) do update
      set email = coalesce(public.profiles.email, excluded.email),
          name  = coalesce(nullif(public.profiles.name,''), excluded.name),
          phone = coalesce(nullif(public.profiles.phone,''), excluded.phone),
          role  = excluded.role;

    -- flags + géo (le trigger sync_profile_geolocation remplira profiles.geolocation)
    update public.profiles set
      is_pro      = case when p.account_type = 'pro'     then true else is_pro end,
      is_courier  = case when p.account_type = 'courier' then true else is_courier end,
      is_breeder  = case when p.account_type = 'breeder' then true else is_breeder end,
      is_rescuer  = case when p.account_type = 'rescuer' then true else is_rescuer end,
      rescuer_status = case when p.account_type = 'rescuer' then 'available' else rescuer_status end,
      current_lat = coalesce(p.lat, current_lat),
      current_lng = coalesce(p.lng, current_lng),
      location_updated_at = case when p.lat is not null and p.lng is not null then now() else location_updated_at end
    where id = v_uid;

    -- ---- fiche métier ----
    -- `couriers.phone` (et parfois `pros.phone`) est NOT NULL + UNIQUE. Un prospect sans
    -- numéro, ou dont le numéro duplique une fiche existante, reçoit un téléphone-repère
    -- UNIQUE (`na-<8 hex de l'uid>`) pour satisfaire les contraintes et sortir de la file.
    -- La note le signale → l'admin pourra corriger/rejeter ensuite.
    v_note := null;
    if p.account_type = 'pro' then
      v_phone := nullif(trim(p.phone), '');
      if v_phone is not null and exists (select 1 from public.pros where phone = v_phone and user_id <> v_uid) then v_phone := null; end if;
      if v_phone is null then v_phone := 'na-' || left(v_uid::text, 8); v_note := 'téléphone manquant/dupliqué → repère'; end if;
      insert into public.pros (user_id, profession, name, phone, city, status, disponible)
      values (v_uid, p.profession, coalesce(p.name,''), v_phone, p.city, 'active', true)
      on conflict (user_id) do update
        set profession = excluded.profession, status = 'active', disponible = true;
    elsif p.account_type = 'courier' then
      v_phone := nullif(trim(p.phone), '');
      if v_phone is not null and exists (select 1 from public.couriers where phone = v_phone and user_id <> v_uid) then v_phone := null; end if;
      if v_phone is null then v_phone := 'na-' || left(v_uid::text, 8); v_note := 'téléphone manquant/dupliqué → repère'; end if;
      insert into public.couriers (user_id, name, phone, status)
      values (v_uid, coalesce(p.name,''), v_phone, 'pending')
      on conflict (user_id) do nothing;
    elsif p.account_type = 'rescuer' then
      -- Dépanneur (vertical NEXUS Dépannage). rescuers.phone nullable et NON unique → pas de
      -- repère. specialties dérivées de la profession (codes valides mechanic|tow_truck|
      -- battery|tire|fuel|lockout), défaut mechanic si aucun mot-clé.
      v_hay := lower(pg_temp.unaccent_safe(coalesce(p.profession,'') || ' ' || coalesce(p.name,'')));
      -- NB: array_append (PAS `|| 'texte'`) : `text[] || 'litteral'` non typé fait un
      -- array_cat et échoue avec "malformed array literal".
      v_spec := array[]::text[];
      if v_hay ~ 'remorqu|depanneuse|tow|plateau' then v_spec := array_append(v_spec, 'tow_truck'); end if;
      if v_hay ~ 'batterie|battery|demarrage|survolt' then v_spec := array_append(v_spec, 'battery'); end if;
      if v_hay ~ 'pneu|tire|crevaison|roue' then v_spec := array_append(v_spec, 'tire'); end if;
      if v_hay ~ 'carburant|essence|fuel|panne seche' then v_spec := array_append(v_spec, 'fuel'); end if;
      if v_hay ~ 'serrur|clef|^cle | cle |lockout|ouverture' then v_spec := array_append(v_spec, 'lockout'); end if;
      if v_hay ~ 'mecanic|garage|moteur|electr|diagnostic' then v_spec := array_append(v_spec, 'mechanic'); end if;
      if array_length(v_spec,1) is null then v_spec := array['mechanic']; end if;
      insert into public.rescuers (user_id, name, phone, specialties, vehicle_type, is_available, status)
      values (v_uid, coalesce(p.name,''), nullif(trim(p.phone),''), v_spec, null, true, 'active')
      on conflict (user_id) do update set specialties = excluded.specialties, status = 'active', is_available = true;
    end if;

    -- ---- marque le prospect ----
    update public.prospects
       set status = 'promoted', promoted_user_id = v_uid, email = v_email, updated_at = now()
     where id = p.id;

    n_ok := n_ok + 1;
    insert into _promo_log(name, account_type, email, outcome, detail)
      values (p.name, p.account_type, v_email, 'promu', v_note);
   exception when others then
     n_err := n_err + 1;
     insert into _promo_log(name, account_type, email, outcome, detail)
       values (p.name, p.account_type, v_email, 'ERREUR', sqlerrm);
   end;
  end loop;

  insert into _promo_log(name, outcome, detail) values (
    '(RÉCAP)', 'info',
    n_ok || ' promus, ' || n_reuse || ' réutilisés, ' || n_skip || ' ignorés, ' || n_err || ' erreurs · mdp=' || v_pwd);
end $$;

-- ── Résultats (grille « Results ») ────────────────────────────────────────────
-- Dernier SELECT = ce qui s'affiche : DIAGNOSTIC + RÉCAP + toutes les ERREURS (avec le
-- message exact). Le détail complet (dont les 'promu') reste requêtable via _promo_log.
select seq, outcome, name, account_type, email, detail
  from _promo_log
 where outcome in ('info', 'ERREUR')
 order by seq;
