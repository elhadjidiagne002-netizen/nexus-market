# NEXUS Market — Guide d'intégration migration localStorage → Supabase

## Fichiers produits

| Fichier | Rôle |
|---------|------|
| `supabase_schema.sql` | DDL complet de toutes les tables + RLS + triggers + fonctions RPC |
| `nexus_migrate.js` | Migration one-shot : lit localStorage et pousse vers Supabase via l'API |
| `nexus_storage_supabase.js` | Nouveau wrapper `storage` : Supabase en priorité, localStorage comme cache |

---

## Étape 1 — Exécuter le schéma SQL dans Supabase

1. Ouvrir **Supabase Dashboard → SQL Editor**
2. Coller le contenu de `supabase_schema.sql` et exécuter
3. Vérifier qu'aucune erreur n'apparaît (toutes les instructions sont idempotentes)

> ✅ Le schéma crée les tables manquantes, ajoute les colonnes manquantes,
> configure les RLS et les triggers `updated_at` automatiques.

---

## Étape 2 — Ajouter les scripts dans `index.html`

### 2a. Ajouter les deux `<script>` après le chargement de Supabase

Localiser dans `index.html` la ligne :
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js" ...></script>
```

Ajouter JUSTE APRÈS :
```html
<!-- Migration localStorage → Supabase (one-shot, doit être chargé avant l'app) -->
<script defer src="nexus_migrate.js"></script>
<script defer src="nexus_storage_supabase.js"></script>
```

---

## Étape 3 — Patcher l'objet `storage` existant

Dans `index.html`, localiser la définition (ligne ~5378) :
```javascript
const storage = {
  get(key) { ... },
  ...
};
```

Ajouter JUSTE APRÈS cette définition (ne rien supprimer — le patch est non-destructif) :
```javascript
// ── PATCH : storage → SupabaseStorage (écriture Supabase en arrière-plan) ──
// Ce bloc est exécuté une fois le DOM chargé pour garantir que SupabaseStorage
// est disponible (chargé via <script defer>).
document.addEventListener('DOMContentLoaded', () => {
  if (typeof SupabaseStorage !== 'undefined') {
    Object.assign(storage, SupabaseStorage.compat);
    console.info('[NEXUS] storage patché → Supabase');
  }
});
```

---

## Étape 4 — Déclencher la migration au login

Dans le handler de login existant, chercher l'endroit où `currentUser`
est assigné après une connexion réussie (chercher `window.__nexusCurrentUser =`
ou l'événement `nexus-user-logged-in`).

La migration s'active **automatiquement** via l'event listener dans
`nexus_storage_supabase.js`. Il suffit que votre code dispatch l'événement :

```javascript
// Après login réussi — à placer dans votre handler onLogin
document.dispatchEvent(new CustomEvent('nexus-user-logged-in', {
  detail: { user: currentUser }
}));
```

Et après logout :
```javascript
document.dispatchEvent(new CustomEvent('nexus-user-logged-out'));
```

Si ces événements sont déjà dispatchés dans votre code, **rien d'autre n'est requis**.

---

## Étape 5 — Vérification

Après déploiement, ouvrir la console navigateur. Vous devriez voir :

```
[NEXUS] NexusMigration v1.0.0 chargé
[NEXUS] SupabaseStorage v1.0.0 chargé
[NEXUS] storage patché → Supabase
[SupabaseStorage] ✅ storage patché → Supabase actif en arrière-plan
[SupabaseStorage] ✅ Sync complète depuis Supabase
[NexusMigration] ▶ Démarrage migration pour user <uuid>…
[NexusMigration] ✅ cart: N migrés
[NexusMigration] ✅ wishlists: N migrés
...
[NexusMigration] Migration terminée : X enregistrements migrés. ✅ Aucune erreur.
[SupabaseStorage] Migration one-shot terminée.
```

---

## Ce qui reste dans localStorage (intentionnel)

Ces données ne sont PAS migrées vers Supabase — elles sont éphémères ou
propres au navigateur/appareil :

| Clé | Raison |
|-----|--------|
| `cookie_consent` | Préférence navigateur locale |
| `nexus_setup_done` / `onboarding_done` | Flag UI one-time |
| `data_v6` | Flag de migration interne |
| `nexus_saved_config` | Config URL/environment locale |
| `nexus_user_role` | Cache du rôle (synchronisé au prochain login) |
| `guest_cart` | Panier des visiteurs non connectés |
| `nexus_jwt*` / `nexus_refresh*` | Tokens d'auth (ne jamais stocker en DB) |

---

## Stratégie de cache après migration

```
Lecture  : localStorage (cache) → immédiat (0ms)
           + hydratation Supabase en arrière-plan
Écriture : localStorage (synchrone) → immédiat
           + Supabase via API en arrière-plan (non bloquant)
Offline  : localStorage comme fallback complet (inchangé)
```

Cela garantit :
- **Zéro régression** de performance pour l'utilisateur
- **Données persistantes** entre appareils (via Supabase)
- **Résistance aux pannes réseau** (fallback localStorage)

---

## Rollback

Pour revenir à localStorage pur, supprimer les deux `<script>` ajoutés
et le bloc patch. L'objet `storage` reprend son comportement original.
