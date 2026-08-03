# Feuille de route « niveau professionnel » — NEXUS Market

Améliorations pour répondre aux exigences du milieu professionnel/entreprise.
Établie 2026-08-02 (analyse ancrée sur l'état réel : 141 routes API, 4 fichiers de
test, réponses API incohérentes 39 `{error}` vs 14 `{ok:false}`, incidents passés
égress/IO Supabase). Statut mis à jour au fil des sessions.

Légende statut : ⬜ à faire · 🟡 préparé (à appliquer) · 🟩 fait · 🔒 bloqué (accès requis)

## TOP 5 (priorité)

### 1. Intégrité paiements : réconciliation + journal `payment_events`
- 🟡 **Migration `sql/2026_08_02_payment_events.sql`** créée (journal immuable des
  événements paiement : provider/type/order/ref/montant/payload). À APPLIQUER en base
  (`node scripts/db-query.mjs --file sql/2026_08_02_payment_events.sql`).
- 🟩 **Journalisation BRANCHÉE** (best-effort, inerte tant que la table n'existe pas) :
  helper `functions/api/_lib/payment-log.js` (`logPaymentEvent`) appelé depuis
  paydunya/init (`init`), paydunya/ipn (`ipn_paid`/`ipn_failed`), et
  `cron/reconcile-payments.js` (`reconciled_paid`/`_failed` = écart webhook détecté).
- ⬜ Étendre la journalisation aux handlers PayTech/Stripe live (non touchés ici pour
  éviter tout risque sur le flux en prod) + alerte sur écart.
- ⬜ Étendre `reconcile-payments.js` au mobile money (aujourd'hui Stripe seul).
- **Pourquoi pro** : traçabilité comptable, zéro paiement perdu, audit financier.

### 2. Audit RLS/GRANT exhaustif (table + colonne)
- 🟡 **Script `scripts/audit-rls-grants.sql`** créé (liste tables sans policy, colonnes
  sans GRANT, tables RLS désactivée, écritures front vs droits). À RUN avec le token :
  `node scripts/db-query.mjs --file scripts/audit-rls-grants.sql`.
- 🔒 Exécution bloquée sans `SUPABASE_ACCESS_TOKEN` / `%TEMP%/sb-token.txt`.
- ⬜ Corriger les manques trouvés (piège récurrent du projet : GRANT colonne manquant →
  403 silencieux ; à vérifier en priorité pour `profiles.home_lat/home_lng` ajouté 08-02).
- **Pourquoi pro** : sécurité des données, pas de fuite/écriture non autorisée.

### 3. Tests de contrat sur les webhooks paiement + gate CI
- ⬜ Tests (node:test) : vérif signature/hash, idempotence, transitions de statut,
  parsing (form-encoded/JSON) pour paytech/paydunya IPN + `_lib/payment-fulfill.js`.
  Nécessite d'exporter quelques helpers purs (petit refactor testable).
- ⬜ Rendre le job bloquant dans `.github/workflows/ci.yml`.
- **Pourquoi pro** : chaque déploiement paiement est aujourd'hui un pari (4 tests / 141 routes).

### 4. Standardisation réponses API + OpenAPI complet
- ⬜ Migrer progressivement vers `functions/api/_lib/response.js` (`ok`/`err`).
  ⚠️ PAR ENDPOINT (changer la forme casse les consommateurs front) — pas de bulk.
- ⬜ Compléter `docs/openapi.yaml` (actuellement sous-ensemble) → API B2B documentée.
- **Pourquoi pro** : intégrations tierces fiables, contrat d'API clair.

### 5. Espace vendeur pro : facturation + exports comptables
- 🟩 **Export CSV des ventes vendeur** : `functions/api/vendor/sales-export.js` (auth,
  filtrable par période, EUR + FCFA). Premier livrable concret.
- ⬜ Factures PDF conformes, analytics vendeur (CA/panier moyen), alertes stock,
  multi-utilisateurs par boutique, suite devis B2B.
- **Pourquoi pro** : débloque les vendeurs professionnels/B2B.

## Reste (hors top 5, cf. analyse)
- ⬜ Observabilité : confirmer Sentry réellement branché (vs stub), logs structurés,
  alerting cron/webhooks, dashboard ops, health-check/uptime externe.
- ⬜ Sécurité : retirer `'unsafe-inline'`/`'unsafe-eval'` de la CSP (nonces/hashes).
- ⬜ Conformité PII/RGPD : rétention, export/suppression données, purge des backups.
- ⬜ Logistique : remplacer le stub `shipping-quote.js` (transporteur réel), preuve de
  livraison (photo/OTP).
- ⬜ Confiance : avis vérifiés (post-achat), KYC vendeur gradué, SLA litiges mesuré,
  escrow paiement jusqu'à livraison.
- ⬜ Perf/scalabilité : surveiller égress/IO Supabase, Orama en edge, proxies média.
- ⬜ Accessibilité (audit WCAG) + i18n Wolof côté serveur (SEO).
- ⬜ Unifier les 2 dossiers de migrations (`database/migrations` vs `sql/`).
