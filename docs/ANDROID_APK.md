# Générer l'application Android (APK / AAB) de NEXUS Market

Le site est une **PWA** (manifest + service worker + HTTPS). On l'empaquette en application
Android via **TWA** (Trusted Web Activity) : l'app affiche le site en plein écran, comme une
vraie appli, sans barre d'URL.

> Le code ne peut pas être compilé en APK depuis ce repo (il faut le SDK Android + une clé de
> signature). Deux méthodes ci-dessous — la **A est la plus simple** (aucun outil à installer).

---

## ✅ Pré-requis déjà en place dans le repo
- `public/manifest.json` — manifest valide (nom, icônes 192/512, maskable, thème).
- `public/sw.js` — service worker enregistré.
- `public/.well-known/assetlinks.json` — fichier de vérification (à compléter avec votre empreinte).
- `twa-manifest.json` — config pour Bubblewrap (méthode B).
- Icônes : `public/icon-192.png`, `public/icon-512.png`.

---

## Méthode A — PWABuilder (recommandée, sans rien installer)

1. Aller sur **https://www.pwabuilder.com**
2. Entrer l'URL : `https://nexus-market-asb.pages.dev` → **Start**.
3. PWABuilder note la PWA. Cliquer **Package For Stores → Android**.
4. Renseigner :
   - **Package ID** : `sn.nexusmarket.twa` (doit rester identique partout)
   - Laisser les autres champs (il lit le manifest).
5. **Download** : vous obtenez un ZIP contenant :
   - `app-release-signed.apk` (installable directement pour tester)
   - `app-release-bundle.aab` (pour publier sur le Play Store)
   - `assetlinks.json` (avec **l'empreinte SHA-256** de la clé générée)
   - `signing.keystore` + le mot de passe (⚠️ **à conserver précieusement** — sans lui, pas de mise à jour possible).
6. **Activer le plein écran** (Digital Asset Links) :
   - Ouvrir le `assetlinks.json` fourni, copier la valeur `sha256_cert_fingerprints`.
   - La coller dans `public/.well-known/assetlinks.json` (remplacer `REMPLACER_PAR_LE_SHA256...`).
   - Commit + push → le fichier est servi sur
     `https://nexus-market-asb.pages.dev/.well-known/assetlinks.json`.
7. **Tester** : transférer l'`.apk` sur un téléphone Android, autoriser « sources inconnues », installer.
8. **Publier** : sur **Google Play Console** (compte développeur 25 USD une fois), créer l'app et
   uploader l'`.aab`.

---

## Méthode B — Bubblewrap (CLI, contrôle total)

Pré-requis : **Node 14+**, **JDK 17**, **Android SDK** (Bubblewrap peut les installer).

```bash
npm install -g @bubblewrap/cli

# Initialiser depuis le manifest en ligne (ou utiliser le twa-manifest.json du repo)
bubblewrap init --manifest https://nexus-market-asb.pages.dev/manifest.json

# Construire l'APK + l'AAB (génère et signe avec une clé créée à la 1re fois)
bubblewrap build
```

Sorties : `app-release-signed.apk`, `app-release-bundle.aab`, et un `assetlinks.json`.
Récupérer l'empreinte SHA-256 :

```bash
keytool -list -v -keystore android.keystore -alias nexus | findstr SHA256
```

Coller cette empreinte dans `public/.well-known/assetlinks.json`, puis commit + push.

---

## Vérifications

- `https://nexus-market-asb.pages.dev/manifest.json` → JSON (200).
- `https://nexus-market-asb.pages.dev/.well-known/assetlinks.json` → JSON (200), avec la **vraie** empreinte.
- Outil officiel : https://developers.google.com/digital-asset-links/tools/generator
- Si la barre d'URL reste visible dans l'app → l'`assetlinks.json` n'est pas correct (empreinte ou
  `package_name` qui ne correspond pas au build). Le `package_name` **doit** être `sn.nexusmarket.twa`
  partout (PWABuilder, twa-manifest.json, assetlinks.json).

---

## Notes importantes

- 🔑 **Conservez la clé de signature** (keystore + mots de passe). Toute mise à jour Play Store doit
  être signée avec la **même** clé.
- 🔔 **Notifications push** : déjà supportées côté web (VAPID). En TWA elles fonctionnent via le
  service worker ; activer `enableNotifications` (déjà true dans `twa-manifest.json`).
- 🔄 **Mises à jour** : comme c'est un TWA, l'app charge toujours le site en ligne → toute mise à jour
  du site est **immédiate** dans l'app, sans republier l'APK (sauf changement d'icône/nom/permissions).
- 📦 Le **package_name** choisi (`sn.nexusmarket.twa`) est définitif une fois publié sur le Play Store.

---

*NEXUS Market — guide APK Android (TWA). Dernière mise à jour : 2026-06-08.*
