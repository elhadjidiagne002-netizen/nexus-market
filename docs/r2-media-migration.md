# Migration des médias vers Cloudflare R2 (égress gratuit)

**But** : sortir DÉFINITIVEMENT l'égress des médias (images + vidéos) de Supabase.
R2 a un **égress gratuit et illimité** → le blocage « Cached Egress Exceeded » qui a
mis le projet en 402 **ne peut plus se produire**.

## Ce qui est déjà en place (code déployé, dormant)
- `functions/_lib/r2media.js` : helper `getMediaObject()` — lit R2 en priorité, sinon
  Supabase (URL publique) **+ peuple R2 au passage** (auto-migration « read-through »).
- `functions/img/[[path]].js` et `functions/stories/media/[id].js` : utilisent ce helper.
- **Sans le binding `MEDIA_BUCKET`, tout ce code est un NO-OP** : comportement 100 %
  Supabase, identique à aujourd'hui. → sûr à déployer avant la création du bucket.

## Comment ça migre (aucun script requis)
Chaque objet est lu depuis Supabase **au plus une fois** (au 1ᵉʳ accès après activation),
puis stocké dans R2 et servi depuis R2 pour toujours. Le trafic migre lui-même les
objets « chauds ». Les objets froids restent sur Supabase jusqu'à leur prochain accès
(égress négligeable). Un script de pré-migration (ci-dessous) est optionnel.

## Procédure d'activation (à faire quand Supabase répond à nouveau en 200)

1. **Créer le bucket R2** : Cloudflare Dashboard → **R2** → *Create bucket* → nom EXACT
   **`nexus-media`** (garder privé — l'accès public passe par les proxies).
2. **Activer le binding** : dans `wrangler.toml`, décommenter le bloc :
   ```toml
   [[r2_buckets]]
   binding     = "MEDIA_BUCKET"
   bucket_name = "nexus-media"
   ```
3. **Déployer** (push git → build Cloudflare).
4. **Tester** (site rétabli) :
   - Image : `curl -sI "https://nexusmarket.sn/img/<chemin>?w=400&fmt=webp"` → 200.
   - Vidéo : `curl -sI "https://nexusmarket.sn/stories/media/<id_story>"` → 200 + `Accept-Ranges`.
   - 1ᵉʳ accès = lu depuis Supabase + copié dans R2 ; 2ᵉ accès = servi depuis R2.
   - Vérifier dans **R2 → nexus-media** que les objets `nexus-stories/…` et
     `nexus-images/…` apparaissent après quelques accès.

## (Optionnel) Pré-migration en masse
Pour copier d'un coup tous les objets existants sans attendre le trafic, exécuter
depuis un poste avec le token R2 S3 + la service key Supabase :

```bash
# Lister les objets Supabase (via SQL) puis, pour chacun :
#   GET https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
#   PUT vers R2 (rclone / aws s3 --endpoint-url <r2-endpoint> / wrangler r2 object put)
# Clé R2 = "<bucket>/<path>" (ex: nexus-stories/f23d9140-.../video.mp4)
```
Le read-through rend cette étape non indispensable.

## Verrouillage final (facultatif mais recommandé sur Free)
Une fois R2 peuplé et vérifié, rendre les buckets Supabase **privés**
(`storage.buckets.public = false`) pour tuer les derniers hotlinks directs. Les
proxies liront alors R2 (ou Supabase via service key si besoin — adapter le helper).

## Rollback
Recommenter le binding `MEDIA_BUCKET` + redéployer → retour immédiat au 100 % Supabase.
