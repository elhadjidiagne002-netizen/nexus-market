# 🔐 Rendre la session WhatsApp (WAHA) persistante — via Neon, gratuit

## Le problème

WAHA tourne sur **Render**, dont le disque est **éphémère** : à chaque
redémarrage de l'instance, la session WhatsApp appairée est effacée et
`GET /api/whatsapp` remonte `404 Session not found`.

Ce n'est pas une hypothèse : constaté **deux fois le 2026-09-05**, la session
réparée en début d'après-midi ayant disparu en moins de deux heures. Tant que
ce point n'est pas réglé, **aucune campagne WhatsApp ne peut aboutir** — et
WAHA n'est pas un secours mais le seul canal viable, le plan gratuit Green API
ne permettant d'échanger qu'avec 3 chats par mois.

## La solution

WAHA **Core** (la version gratuite) sait stocker ses sessions dans PostgreSQL
au lieu du disque : variable `WHATSAPP_SESSIONS_POSTGRESQL_URL`.
Vérifié dans la documentation WAHA — ce n'est pas réservé à WAHA Plus.

### Pourquoi Neon et pas notre base Supabase

C'était ma première idée, et elle ne marche pas :

| | Supabase (notre base) | Neon |
|---|---|---|
| Droit `CREATEDB` (WAHA crée des bases `waha_*`) | ✅ vérifié en réel | ✅ rôle membre de `neon_superuser` |
| Joignable depuis Render (IPv4) | ❌ **connexion directe en IPv6 seulement** — l'IPv4 est un add-on payant | ✅ IPv4 natif |

Render sort en IPv4 : la connexion directe à Supabase échouerait. Il existe
bien le pooler Supavisor en IPv4, mais je n'ai **pas vérifié** qu'il accepte la
création de bases ni le routage vers des bases créées après coup — donc je ne
le recommande pas sans test.

Le stockage de session WAHA n'a aucune raison de vivre dans la base de
l'application : quelques Mo isolés ailleurs conviennent parfaitement.

## Procédure

1. **Créer un projet Neon** (gratuit, 0,5 Go) sur <https://neon.com>.
2. Copier la **chaîne de connexion** fournie par le tableau de bord.
3. ⚠️ **Remplacer `sslmode=disable` par `sslmode=require`.**
   L'exemple de la documentation WAHA utilise `sslmode=disable` ; **Neon
   rejette les connexions non chiffrées**. Copier l'exemple tel quel échoue.
   Format attendu :
   ```
   postgresql://<user>:<password>@<hote>.neon.tech/<base>?sslmode=require
   ```
4. Dans **Render → service WAHA → Environment**, ajouter :
   ```
   WHATSAPP_SESSIONS_POSTGRESQL_URL=postgresql://…?sslmode=require
   ```
5. **Redémarrer** le service WAHA.
6. **Réappairer une dernière fois** : la session repart de zéro puisqu'elle
   change de support de stockage. Depuis un compte admin du site :
   ```js
   // console du navigateur, connecté sur nexusmarket.sn
   (async () => {
     const s = await DataService._sb.auth.getSession();
     const t = s?.data?.session?.access_token;
     const H = { Authorization: 'Bearer ' + t };
     await fetch('/api/admin/waha-session?action=start', { method:'POST', headers:H });
     const qr = await (await fetch('/api/admin/waha-session?action=qr', { headers:H })).json();
     console.log(qr.qr_value || qr);   // encoder cette valeur en QR et la scanner
   })();
   ```
   Puis dans WhatsApp : `Paramètres → Appareils connectés → Connecter un
   appareil`. Le QR expire en ~20 s, régénérer si besoin.

## Vérifier que c'est réglé

```bash
curl -s https://nexusmarket.sn/api/whatsapp
```
`wahaSession.state` doit valoir **`WORKING`**.

Le vrai test est le redémarrage : relancer le service Render, puis rappeler
la commande ci-dessus. L'état juste après appairage ne prouve rien — on l'a
déjà vu tenir deux heures avant de retomber.

### ✅ Vérifié le 2026-09-05 à 21 h

Appairage → `WORKING` (compte `221776254895`, moteur NOWEB). Redémarrage du
service Render → **toujours `WORKING`, sans nouveau QR**. Les logs Render le
montrent explicitement :

```
Restarting STOPPED session...
logging in... {"username":"221776254895"}
PreKey validation passed - Server: 404, Current prekey 812 exists
opened connection to WA
Reconnection with existing sync data, skipping history sync wait.
```

Les clés cryptographiques ont donc bien été relues depuis Neon après effacement
du disque éphémère. La persistance fonctionne.

## Ensuite

Le pilote (`eb8dc354-…`, 8 cibles restantes) a été **remis en `running`** le
2026-09-05 à 21 h, une fois la persistance prouvée. La fenêtre d'envoi étant
8 h–19 h, le cron `nexus-wa-campaign` (toutes les 15 min) reprendra les envois
le lendemain matin à 8 h.

La campagne principale (`2d616787-…`, 1602 cibles restantes) reste en `paused`
et ne doit être lancée qu'après un pilote concluant **et** accord explicite.
