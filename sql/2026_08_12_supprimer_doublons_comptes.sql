-- DESTRUCTIF - A RELIRE. Supprime 19 comptes doublons (meme telephone),
-- en gardant le plus ancien de chaque groupe. Supprime l utilisateur Auth (cascade
-- profiles/pros/couriers via FK). Verifie d abord rapport/doublons_comptes.csv.
-- Decommente le bloc pour executer :
/*
delete from auth.users where id in (
  'b7dd72a3-0604-46b7-b31d-abd04364a554',
  '2590abc3-5e8a-4e47-b24b-ab80175571cc',
  'cf8c631e-7019-4674-b1d1-75d4988baa5b',
  '7885fe46-1855-4064-a534-707365dbb9e2',
  '1b132aa1-146c-4d5c-973c-e45e3a89562f',
  '2dca526c-0db8-48a6-857a-c5b0d180d5a9',
  '8ef465cb-ce4d-48c7-87a5-283661e56b1c',
  'e971efdd-e493-4a12-917b-97838a38ee72',
  'cb14d900-167b-4d02-9ac5-66c3bd8621ef',
  '06060a84-5360-4ddc-829c-8e3ba047ce7a',
  '0bd4a869-dcc5-4e77-85cb-6d850c338da9',
  '9df1111b-6d9d-4c2f-a1f3-addb1bb45d1d',
  'b033438d-d785-4827-af3b-d106a2a11ffe',
  '709d0f38-ced7-4a5d-9647-f35b4167200c',
  '37804c1b-267b-4a54-9d19-e61a52a23e60',
  'febb6a32-8bce-4726-ad40-8c4da1d6c1c2',
  '7f7f4f63-fb55-4ff7-8f48-cc125d1f01e3',
  '02d56abe-40a5-4029-bd82-2ee94ec88b3c',
  '1aefe979-a669-400b-a3bd-6be81be16a71'
);
*/
