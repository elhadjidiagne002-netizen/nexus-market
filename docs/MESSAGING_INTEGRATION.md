# NEXUS Market — Guide d'intégration MessagingCenter v4.0.0

## Vue d'ensemble

Le système de messagerie repose sur du **polling adaptatif multi-vitesse** — sans WebSocket
ni Supabase Realtime. Il s'adapte automatiquement à l'état de l'onglet et à l'activité :

| Situation                          | Intervalle | Raison                              |
|------------------------------------|-----------|--------------------------------------|
| Conversation ouverte + onglet actif | **2 s**   | Expérience quasi-temps-réel          |
| Onglet visible, pas de conversation | **8 s**   | Mise à jour badge non-lus            |
| Onglet caché (document.hidden)      | **30 s**  | Économie batterie/bande passante     |
| Erreur réseau (backoff exponentiel) | **4→60 s**| Évite de saturer l'API lors d'un bug |
| Retour sur l'onglet                 | **immédiat** | Poll forcé dès le focus            |

---

## ÉTAPE 1 — Migration SQL Supabase

Exécuter dans l'éditeur SQL Supabase (une seule fois) :

```sql
-- Nouvelles colonnes
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id    uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_text  text,
  ADD COLUMN IF NOT EXISTS attachments    jsonb,
  ADD COLUMN IF NOT EXISTS reactions      jsonb,
  ADD COLUMN IF NOT EXISTS deleted_for    uuid[],
  ADD COLUMN IF NOT EXISTS read_at        timestamptz;

-- Index de performance critiques
CREATE INDEX IF NOT EXISTS idx_messages_from_to
  ON messages(from_id, to_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_to_unread
  ON messages(to_id, read) WHERE read = false;

-- Recherche plein-texte (optionnel)
CREATE INDEX IF NOT EXISTS idx_messages_text_search
  ON messages USING gin(to_tsvector('french', text));

-- RLS (si pas encore activée)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own" ON messages
  FOR SELECT USING (auth.uid() = from_id OR auth.uid() = to_id);

CREATE POLICY "messages_insert_own" ON messages
  FOR INSERT WITH CHECK (auth.uid() = from_id);

CREATE POLICY "messages_update_own" ON messages
  FOR UPDATE USING (auth.uid() = from_id OR auth.uid() = to_id);
```

---

## ÉTAPE 2 — Backend : remplacer les routes messages dans server.js

**Localiser** les lignes `~1993` à `~2038` de server.js (les 4 routes messages existantes) :
```
app.get('/api/messages', ...)
app.post('/api/messages', ...)
app.get('/api/messages/unread-count', ...)
app.patch('/api/messages/read', ...)
```

**Remplacer** par le contenu complet de `messaging-backend-routes.js`.

Le nouveau fichier ajoute 5 routes supplémentaires :
- `GET  /api/messages/conversations`  — liste des conversations avec métadonnées
- `GET  /api/messages/search`          — recherche plein-texte
- `PATCH /api/messages/:id/react`      — réactions emoji
- `PATCH /api/messages/:id/delete`     — suppression douce
- `POST  /api/messages/typing`         — signal de frappe (in-memory, TTL 4s)
- `GET   /api/messages/typing/:convId` — état de frappe de l'autre participant

---

## ÉTAPE 3 — Frontend : ajouter le module dans index.html

**Insérer** le contenu de `messaging-frontend.js` dans `index.html`,
juste **avant** la balise `</body>`, après tous les autres scripts :

```html
<!-- MessagingCenter v4.0.0 — insérer juste avant </body> -->
<script>
  // [COLLER ICI le contenu COMPLET de messaging-frontend.js]
</script>
```

> ⚠️ Ce script **doit** être inséré après React, ReactDOM, et l'initialisation
> de `DataService`, `storage`, `EmailService` déjà présents dans index.html.

---

## ÉTAPE 4 — Ouvrir MessagingCenter depuis n'importe quelle page

### A) Depuis un bouton "Contacter le vendeur"

Remplacer le code existant qui ouvre `MessageComposeModal` :

```javascript
// AVANT
setShowMessageModal(true); // ouvrait MessageComposeModal

// APRÈS — MessagingCenter est un drop-in replacement
setShowMessageModal(true); // fonctionne toujours !
```

Le shim de rétrocompatibilité en bas de `messaging-frontend.js` remplace
automatiquement `window.MessageComposeModal` par `MessagingCenter`.

### B) Ouvrir directement une conversation

```javascript
// Dans un composant React :
const [showMsg, setShowMsg] = React.useState(false);

// ...
React.createElement(MessagingCenter, {
  currentUser: currentUser,
  openWithId:   vendor.id,      // Ouvre directement cette conversation
  openWithName: vendor.name,
  onClose:     () => setShowMsg(false),
  addToast:    addToast
})
```

### C) Badge dans le header de navigation

Chercher dans `index.html` la zone du header de navigation (vers la ligne ~4100) :

```javascript
// Ajouter MessagingBadge dans le rendu du GlobalHeader, après les autres icônes :
React.createElement(MessagingBadge, {
  currentUser: currentUser,
  onClick:     () => setShowMessaging(true)
})
```

Et gérer l'état d'ouverture :
```javascript
const [showMessaging, setShowMessaging] = React.useState(false);

// Dans le rendu :
showMessaging && React.createElement(MessagingCenter, {
  currentUser: currentUser,
  onClose:     () => setShowMessaging(false),
  addToast:    addToast
})
```

---

## ÉTAPE 5 — Accès depuis la page "Mes Messages" (dashboard acheteur/vendeur)

Remplacer le composant `MessagesPage` (ou équivalent) existant par :

```javascript
const MessagesPage = ({ currentUser, addToast }) => {
  return React.createElement('div', { style: { padding: '1.5rem' } },
    React.createElement('h2', {
      style: {
        fontFamily: 'Montserrat', fontWeight: 800,
        color: 'var(--primary)', marginBottom: '1.25rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem'
      }
    },
      React.createElement('i', { className: 'fas fa-comments' }),
      'Messagerie'
    ),
    // Inbox intégrée dans la page (pas en modal)
    React.createElement(MessagingCenter, {
      currentUser,
      onClose: () => {},   // pas de fermeture dans ce contexte
      addToast,
      // Style inline (pas en modal flottant) :
      inline: true
    })
  );
};
```

---

## Architecture du polling adaptatif

```
NexusPollingService (singleton)
  │
  ├── subscribe('msg-main', fetchMessages, priority=1)
  │     └── Récupère les nouveaux messages via /api/messages?after=<curseur>
  │
  ├── subscribe('msg-badge', checkUnread, priority=10)
  │     └── Met à jour le badge header via /api/messages/unread-count
  │
  ├── subscribe('msg-typing-{convId}', checkTyping, priority=0)  [haute prio]
  │     └── Vérifie l'indicateur de frappe via /api/messages/typing/:convId
  │
  └── setActiveConversation(true/false)
        └── Déclenche le switch d'intervalle (2s ↔ 8s)
```

### Comportements spéciaux

- **Envoi de message** → `NexusPollingService.forceNow()` déclenche un poll immédiat,
  de sorte que l'accusé de lecture (`✓✓`) apparaît dès que l'autre ouvre le message.

- **Retour sur l'onglet** (`visibilitychange`) → Poll immédiat pour rattraper
  tous les messages arrivés pendant l'absence.

- **Erreur réseau** → Backoff exponentiel : 4s → 8s → 16s → 32s → 60s max.
  Le compteur d'erreurs se réinitialise automatiquement sur le premier succès.

---

## Fonctionnalités détaillées

### Pagination par curseur
Les messages sont chargés avec un curseur temporel (`after=<ISO>`) :
- Au premier chargement : les 50 messages les plus récents
- À chaque poll : uniquement les messages **après** le dernier reçu
- Pagination histoire : `before=<ISO>` pour charger les messages plus anciens

Avantages vs offset pagination :
- Pas de "trous" si un message est inséré entre deux polls
- Charge réseau minimale (quelques octets si rien de nouveau)

### Indicateur de frappe (sans WebSocket)
Approche : **polling léger à 2s** sur un store in-memory côté serveur.

- L'expéditeur POST `/api/messages/typing` toutes les ~3s pendant qu'il écrit
- L'autre participant GET `/api/messages/typing/:convId` toutes les 2s
- Le signal expire automatiquement après 4s sans mise à jour
- Le store est purgé toutes les 10s côté serveur

Latence perçue : **max ~2s** pour apparaître, **max ~4s** pour disparaître.

### Réactions emoji
- 8 emojis prédéfinis : 👍 ❤️ 😂 😮 😢 🔥 🙏 ✅
- Toggle : cliquer à nouveau retire la réaction
- Stockage : colonne JSONB `{ "👍": ["user1", "user2"], "❤️": ["user3"] }`
- Optimistic update : la réaction s'affiche immédiatement côté client

### Suppression douce
- Un message supprimé via "Supprimer pour moi" reste en base de données
- Il est masqué uniquement pour l'utilisateur qui l'a supprimé
- L'autre participant continue de le voir normalement
- Stockage : tableau JSONB `deleted_for: ["userId1"]`

### Réponse à un message (reply/quote)
- Double-clic sur un message ou clic droit → "Répondre"
- Le texte cité est stocké de manière dénormalisée (`reply_to_text`) pour éviter
  une jointure à chaque affichage
- Clic sur la citation → scroll vers le message d'origine

---

## Variables d'environnement requises
Aucune nouvelle variable requise. Réutilise les variables Supabase existantes.

---

## Tests rapides post-déploiement

```bash
# 1. Envoyer un message
curl -X POST https://votre-api.onrender.com/api/messages \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"toId":"<userId>","text":"Test messagerie v4"}'

# 2. Vérifier le statut de frappe
curl https://votre-api.onrender.com/api/messages/typing/<convId> \
  -H "Authorization: Bearer <JWT>"

# 3. Compter les non-lus
curl https://votre-api.onrender.com/api/messages/unread-count \
  -H "Authorization: Bearer <JWT>"

# 4. Rechercher dans les messages
curl "https://votre-api.onrender.com/api/messages/search?q=test" \
  -H "Authorization: Bearer <JWT>"
```

---

## Feuille de route (améliorations futures)

| Priorité | Amélioration | Effort |
|----------|-------------|--------|
| 🔴 Haute | Supabase Realtime (Postgres Changes) sur la table `messages` | 2h |
| 🔴 Haute | Mise à jour automatique du badge (Supabase subscription) | 1h |
| 🟡 Moyenne | Upload d'images vers Supabase Storage (vs base64) | 3h |
| 🟡 Moyenne | Messages vocaux (Web Audio API + upload) | 6h |
| 🟢 Basse | Chiffrement E2E des messages (libsodium) | 8h |
| 🟢 Basse | Groupes de conversation (modèle many-to-many) | 12h |
