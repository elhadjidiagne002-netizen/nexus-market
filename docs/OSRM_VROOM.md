# OSRM + VROOM — routage routier réel & optimisation de tournées

Deux services **auto-hébergés** que les Cloudflare Pages Functions interrogent par
simple `fetch()` (compatible runtime Workers, aucun module Node requis) :

| Service | Rôle | Consommé par |
|---|---|---|
| **OSRM** | distance/durée routières réelles, matrice N×M | `/api/courier/optimize` (mode classement), `/api/shipping-quote` |
| **VROOM** | affectation multi-courses / multi-coursiers (VRP) | `/api/courier/optimize` (mode groupé) |

VROOM ne calcule pas les trajets lui-même : il interroge OSRM. **OSRM est donc le
prérequis** ; VROOM est facultatif par-dessus.

## Pourquoi

Aujourd'hui tout le projet raisonne à vol d'oiseau : Haversine côté frontend
(`DataService._haversineKm`, ETA à 22 km/h fixe) et distance géodésique PostGIS
côté matching (`nearby_couriers`). À Dakar, un coursier « à 800 m » peut être de
l'autre côté de la corniche, soit 15 min de route. OSRM corrige ce biais sans
rien changer au dispatch existant.

## Dégradation sans ces services

**Rien ne casse si les variables ne sont pas configurées** — c'est le contrat de
`functions/api/_lib/routing.js` :

- sans `OSRM_BASE_URL` → repli Haversine × 1,35 (facteur de détour urbain),
  la réponse porte `routing: "haversine"` / `source: "grid"` ;
- sans `VROOM_BASE_URL` → le mode groupé de `/api/courier/optimize` répond **503**,
  le mode classement continue de fonctionner.

## Déploiement

Machine cible : 2 vCPU / 4 Go RAM suffisent largement pour le Sénégal seul
(l'extrait OSM fait ~50 Mo, les graphes compilés ~1,5 Go).

### 1. Préparer le graphe OSRM (une fois, puis à chaque mise à jour de la carte)

```bash
mkdir -p /srv/osrm && cd /srv/osrm
curl -O https://download.geofabrik.de/africa/senegal-latest.osm.pbf

docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/senegal-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/senegal-latest.osrm
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/senegal-latest.osrm
```

Le pipeline `partition`/`customize` correspond à l'algorithme **MLD**, obligatoire
pour servir avec `--algorithm mld` ci-dessous. (L'alternative `osrm-contract` sert
l'algorithme CH, plus rapide en requête mais bien plus lourd à recompiler.)

### 2. `docker-compose.yml`

```yaml
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend
    command: >
      osrm-routed --algorithm mld --max-table-size 100
      /data/senegal-latest.osrm
    volumes: [ /srv/osrm:/data ]
    ports: [ "5000:5000" ]
    restart: unless-stopped

  vroom:
    image: vroomvrp/vroom-docker:v1.14.0
    environment:
      VROOM_ROUTER: osrm
    volumes: [ ./vroom-conf:/conf ]
    ports: [ "3000:3000" ]
    depends_on: [ osrm ]
    restart: unless-stopped
```

`./vroom-conf/config.yml` :

```yaml
cliArgs:
  router: osrm
routingServers:
  osrm:
    car:
      host: osrm
      port: '5000'
```

⚠️ `--max-table-size 100` doit rester **≥** au nombre de points envoyés en une
matrice. `routing.js` refuse d'appeler `/table` au-delà de 100 coordonnées
(`MAX_TABLE_COORDS`) et retombe sur Haversine — si vous augmentez la limite
serveur, augmentez aussi cette constante, sinon la montée est sans effet.

### 3. Exposer derrière HTTPS

Les deux services n'ont **aucune authentification native**. Ne les exposez jamais
nus sur Internet : mettez un reverse proxy (Caddy/Nginx) qui termine le TLS et
exige un `Authorization: Bearer …`, puis renseignez ce jeton dans
`OSRM_API_KEY` / `VROOM_API_KEY`. Sans proxy, n'ouvrez les ports que sur un
réseau privé.

Exemple Caddy :

```
osrm.nexusmarket.sn {
  @noauth not header Authorization "Bearer LE_JETON"
  respond @noauth 401
  reverse_proxy localhost:5000
}
```

### 4. Variables Cloudflare Pages

À définir dans le dashboard Cloudflare (Settings → Environment variables), et
documentées dans `.env.example` :

```
OSRM_BASE_URL=https://osrm.nexusmarket.sn
OSRM_PROFILE=driving
OSRM_API_KEY=LE_JETON
VROOM_BASE_URL=https://vroom.nexusmarket.sn
VROOM_API_KEY=LE_JETON
```

### 5. Vérifier

```bash
curl "https://osrm.nexusmarket.sn/route/v1/driving/-17.4467,14.6928;-17.4676,14.7167?overview=false" -H "Authorization: Bearer LE_JETON"
```

Réponse attendue : `{"code":"Ok","routes":[{"distance":…,"duration":…}],…}`.

## API `/api/courier/optimize`

`POST`, authentifié **admin** (JWT Supabase) ou **appel interne**
(`X-Internal-Secret`). Rate limit 20/min/IP pour les appels non internes.

Cet endpoint **ne modifie rien en base** : il calcule et renvoie. L'attribution
effective reste la cascade d'offres SQL (`_activate_next_offer`) ou
`admin_assign_delivery` — brancher l'optimiseur directement sur l'écriture ferait
diverger deux sources de vérité de dispatch.

### Mode classement

```json
{ "delivery_id": "uuid", "radius_m": 30000, "limit": 20 }
```

PostGIS (`nearby_couriers`) fait le pré-filtre — c'est lui qui borne la liste ;
OSRM ne fait que **re-classer** cette liste courte par temps de route réel
jusqu'au point de retrait.

```json
{
  "mode": "rank",
  "leg": { "distance_km": 6.4, "duration_min": 17, "source": "osrm" },
  "couriers": [
    { "courier_id": "…", "user_id": "…", "name": "…",
      "crow_km": 0.8, "road_km": 3.1, "eta_pickup_min": 9 }
  ],
  "routing": "osrm"
}
```

`crow_km` (vol d'oiseau, PostGIS) est conservé à côté de `road_km` précisément
pour rendre l'écart visible en exploitation.

### Mode groupé (VROOM)

```json
{ "delivery_ids": ["uuid1", "uuid2"], "max_per_courier": 3 }
```

Chaque course devient un *shipment* retrait→dépôt, chaque coursier disponible un
véhicule de capacité `max_per_courier`. Maximum 25 courses par appel.

```json
{
  "mode": "batch",
  "routes": [
    { "courier_id": "…", "duration_min": 42, "distance_km": 18.3,
      "steps": [ { "type": "pickup", "delivery_id": "…", "arrival_min": 8 } ] }
  ],
  "unassigned": []
}
```

## Pièges

- **`[lng, lat]`, jamais `[lat, lng]`.** OSRM et VROOM attendent la longitude en
  premier. La conversion est centralisée dans `routing.js` (`toLonLat`) et ne doit
  être faite nulle part ailleurs — c'est l'erreur n°1 sur ces APIs, et elle est
  silencieuse (on obtient une route plausible mais fausse).
- **VROOM n'accepte que des identifiants numériques.** `optimize.js` indexe les
  courses/coursiers et remappe vers les uuid dans la réponse.
- **Un coursier injoignable par la route** (`eta_pickup_min: null`) est relégué en
  fin de classement, pas écarté : la cascade SQL doit pouvoir lui proposer la
  course quand même.
- **Recompiler le graphe après chaque mise à jour de l'extrait OSM** — servir un
  `.osrm` produit par une autre version d'OSRM que celle qui sert fait échouer le
  démarrage.
