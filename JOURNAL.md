# Journal du projet NEXUS Market

Historique chronologique (le plus récent en haut) de ce qui a été fait, pourquoi,
et où en est chaque chantier. Complète `CLAUDE.md` (référence technique/pièges,
non chronologique). Mis à jour après chaque session de travail avec Claude.

---

## 2026-07-31 — Lecture log console prod : CSP beacon Cloudflare + SMS 502 en attente

Analyse d'un export console de `nexusmarket.sn` fourni par l'utilisateur.
- **Une seule vraie erreur** : `POST /api/sms` → **502**. La route est vivante
  et le gate d'auth OK (probe non signée → 401) ; le 502 vient donc de httpSMS
  lui-même (clé, `HTTPSMS_FROM` ≠ numéro enregistré, téléphone passerelle
  hors-ligne, ou quota). Le détail est déjà exposé depuis `675bf92` mais n'est
  visible que dans le toast admin, pas dans la console. **En attente** : le
  texte du toast pour trancher.
- **CSP** : ajout de `https://static.cloudflareinsights.com` à `script-src` et
  de `https://cloudflareinsights.com` à `connect-src` (`public/_headers`). Le
  beacon Web Analytics est injecté par Cloudflare, pas par le repo — il ne
  figurait donc pas dans le grep d'origines ayant servi à bâtir la CSP. La CSP
  restant en **Report-Only**, c'est du nettoyage de bruit, rien n'était bloqué.
- **Reste du log = bruit, rien à corriger** : `ERR_BLOCKED_BY_CLIENT`
  (adblocker du navigateur de test) ; `ERR_NAME_NOT_RESOLVED` sur Supabase +
  WebSockets fermés + `r.stripe.com` = coupure internet locale en cours de
  session, pas un incident serveur ; avertissement Tailwind CDN (dette connue) ;
  `beforeinstallprompt.preventDefault()` = comportement voulu de `nexusInstall()`.

## 2026-07-12 — Panne Supabase (402) + migration R2 activée

**Incident** : la période de grâce Fair Use a expiré (11 juil.) → Supabase a
restreint tout le projet (`402` sur REST/Storage/Auth) → **site down** ~24h.
Cause : égress déjà consommé (37 Go) avant que les correctifs du 10-11 juil.
(proxies vidéo/image) ne fassent effet sur un nouveau cycle. Base de données
restée saine (`ACTIVE_HEALTHY`, données intactes) tout du long.
- Diagnostiqué via l'API Management (accessible même quand le plan données est
  bloqué) : org toujours en plan **Free**, pas d'upgrade fait.
- Rétabli spontanément (reset de cycle ou action externe) le 12 juil.
- **Bucket R2 `nexus-media` créé** + binding `MEDIA_BUCKET` activé dans
  `wrangler.toml` → la migration R2 préparée la veille (dormante) est passée
  **en fonction**. Testé : lecture vidéo (27 Mo + 12 Mo) en 200, build sain.
- **Statut** : R2 actif, peuplement automatique en cours (chaque média migre
  au premier accès). Reste à confirmer visuellement dans le dashboard R2 que
  les objets apparaissent (connecteur Cloudflare MCP à reconnecter pour que
  Claude puisse le vérifier directement la prochaine fois).
- ⚠️ **Toujours sur plan Free** — R2 protège l'égress média, mais aucune marge
  supplémentaire sur les autres métriques Supabase (DB, Realtime...). À
  surveiller ; upgrade Pro reste une option si un autre poste dérape.

## 2026-07-11 — Diagnostic système admin + bug rôle admin + retrait SMS payant

- **Panneau admin dupliqué puis corrigé** : ajouté d'abord un diagnostic dans
  l'admin React (jamais utilisé par l'utilisateur), puis dans le VRAI dashboard
  utilisé (`/dashboard-admin`, statique) : onglet **« Diagnostic & Tests »**
  (grille d'état des intégrations + test SMS + test WhatsApp inline).
  Endpoint `GET /api/admin/diagnostics` (agrège Supabase/PayTech/Email/
  WhatsApp/SMS/Imagor/Push/file de retry).
- **Bug critique découvert et corrigé** : connexion avec le compte admin
  (Google OAuth) retombait en rôle `buyer`. Cause : `_fetchProfile` timeoutait
  à 2s (latence Sénégal→Supabase Paris) → repli sur `user_metadata` (sans
  `role` pour un compte Google) → `role='buyer'` par défaut, alors que
  `profiles.role='admin'` était correct. Fix : timeout 2s→8s (bundle
  re-hashé) + synchronisation `role:admin` dans `user_metadata` (autorisée
  explicitement par l'utilisateur — l'autorisation serveur reste sur
  `profiles.role`, aucune élévation de privilège réelle).
- **SMS payant retiré** : Africa's Talking / Orange SMS API / Twilio
  **supprimés** de `functions/api/sms.js`, remplacés par **httpSMS**
  (téléphone Android + SIM sénégalaise comme passerelle, coût quasi nul).
  `.env.example`, `wrangler.toml` (INFOBIP_SENDER mort retiré), panneau admin
  et doc mis à jour. Diagnostic httpSMS en cours : `/api/sms` renvoie 502
  (httpSMS rejette), cause exacte pas encore confirmée — endpoint modifié
  pour exposer le détail de l'erreur httpSMS (`httpsms_status` + `detail`),
  **test bloqué par la panne Supabase du 12/07** (login KO tant que 402).
- **Outbox + retry notifications** : table `notification_outbox` +
  `claim_notification_outbox()` (SKIP LOCKED) + `/cron/notify-retry`
  (backoff 15min/1h/3h/6h, 5 essais, dead-letter). Comble le seul manque de
  la chaîne email+WhatsApp existante. Reste : enregistrer le job sur
  cron-job.org (action utilisateur, pas encore confirmée faite).
- **4 libs open-source sans hébergement intégrées** (demande : "gros impact,
  facile, pas d'hébergement") :
  - **Fuse.js** — recherche floue tolérante aux fautes (`labtop`→`laptop`),
    branchée sur `nxpShowAll` + `renderSearch`.
  - **libphonenumber-js** — `toE164()` normalise les numéros SN, branché
    dans le routage WhatsApp (`wa-send.js`, `whatsapp.js`).
  - **html5-qrcode** — scanner QR coursier (FAB 📷 coursier-only, décode
    `NEXUS-PICKUP:<orderId>`, navigue vers la commande sans muter de donnée).
  - **qrcodejs** — QR de retrait affiché sur le suivi commande acheteur
    (`NexusPickupQR`, ferme la boucle avec le scanner).
  - DOMPurify chargé (prêt, pas encore branché sur un sink précis).
- **Proxy image généralisé + Imagor branché** : `/img/:path` sert
  `nexus-images` via Cloudflare (cache 1 an), avec conversion WebP/AVIF via
  **Imagor self-hosted sur Render Free**. Saga de debug : le vrai bug était
  le **padding base64url manquant** dans la signature HMAC (pas un mismatch
  de secret comme on l'a cru pendant 2h) — thumbor/imagor signent en
  base64url AVEC `=`, notre code le retirait. Corrigé.
- **Migration R2 préparée** (dormante ce jour-là) : `functions/_lib/r2media.js`
  (read-through R2 + repli Supabase + auto-peuplement), branché dans `/img`
  et `/stories/media`. Activée le lendemain (cf. entrée 12/07).
- **Piège cache découvert et corrigé 2×** : `public/assets/app.<hash>.js` est
  servi `Cache-Control: immutable` (1 an). Éditer ce fichier SANS renommer le
  hash ne livre RIEN en prod (Cloudflare + navigateurs servent l'ancien).
  A fait perdre le bénéfice de deux commits pendant un moment avant d'être
  repéré et corrigé (`app.256576749a.js` → ... → `app.18f295745d.js`, chaque
  renommage accompagné de la mise à jour de la référence dans `index.html`).

## 2026-07-10 — Généralisation WhatsApp + fix égress vidéo (37 Go)

- **WhatsApp généralisé à tous les événements email** : `sendEventNotification`
  (email + WhatsApp en parallèle, best-effort indépendant) remplace
  `sendEventEmail` dans tous les appelants (paiement, payout, offres, stock,
  commande...). `vendor_new_order` reste email-only volontairement (le
  trigger DB `trg_new_order_vendor_whatsapp` couvre déjà ce cas).
- **Cause du dépassement Cached Egress identifiée** : les vidéos de stories
  (upload direct, hors Mux) étaient servies via l'URL Supabase Storage BRUTE
  dans `og:video`/JSON-LD/lecteur — chaque vue, crawler (Google, surtout
  WhatsApp/Facebook) ou partage retéléchargeait le MP4 complet depuis
  l'égress Supabase. ~89 Mo stockés servis ~400 fois = 37 Go (740% du quota
  Free 5 Go).
- **Fix** : proxy vidéo caché Cloudflare `/stories/media/:id` (cache edge +
  Range/seek), `og:video`/lecteur pointent dessus, `autoplay` retiré +
  `preload="none"` (plus de download spéculatif par les bots).

---

## État actuel des intégrations (résumé, voir `/dashboard-admin` → Diagnostic pour le live)

| Intégration | État | Notes |
|---|---|---|
| WhatsApp | ✅ Green API + repli WAHA | Généralisé à tous les événements |
| SMS | 🔧 httpSMS configuré, 502 à diagnostiquer | Providers payants retirés |
| Images | ✅ Proxy `/img` + Imagor (Render Free) | WebP/AVIF + resize |
| Vidéos stories | ✅ Proxy `/stories/media` | Cache + Range |
| Médias (égress) | ✅ R2 activé (12/07) | Auto-migration en cours |
| Recherche | ✅ Fuse.js (floue) | |
| Téléphone | ✅ E.164 via libphonenumber-js | |
| QR retrait coursier | ✅ Génération + scan | Boucle fermée |
| Notifications retry | ✅ Outbox + cron | Job cron-job.org à confirmer côté user |
| Supabase | ⚠️ Plan Free | Panne 402 le 11-12/07, R2 réduit le risque futur |

## Chantiers en attente / décisions ouvertes

- **SMS httpSMS 502** : diagnostic à finir dès que le login admin refonctionne
  (dépendait de la panne Supabase). Vérifier téléphone en ligne, `HTTPSMS_FROM`
  = numéro exact enregistré, clé API, quota tier gratuit.
- **Job cron-job.org `/cron/notify-retry`** : à créer par l'utilisateur
  (toutes les 5 min), pas encore confirmé fait.
- **QR paiement Wave/Orange Money** (lot 2b) : bloqué, aucun lien de paiement
  Wave/OM n'existe dans le code (mobile-money = PayTech uniquement) — besoin
  du format exact des liens si l'utilisateur veut ce lot.
- **Offline-first (Dexie/IndexedDB)** : évalué, déconseillé pour l'instant
  (cache catalogue localStorage déjà existant, ROI faible vs risque de
  régression à cette échelle).
- **Vérifier peuplement R2** dans le dashboard Cloudflare (objets
  `nexus-stories/...`, `nexus-images/...` dans le bucket `nexus-media`).
- **Verrouillage Storage** (rendre les buckets Supabase privés une fois R2
  confirmé stable) — supprimerait les derniers hotlinks directs résiduels.
- **Upgrade Supabase Pro** : toujours pas fait, projet reste sur Free malgré
  la panne du 11-12/07. À reconsidérer si un autre poste (pas média) dérape.
