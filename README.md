# TP Observabilité — Microservices avec OpenTelemetry

## Architecture

```
Client → API Gateway (3000) → Service Orders (3001) → Service Users (3002)
                   ↓                    ↓                    ↓
              /metrics             /metrics             /metrics
                   ↓
             Prometheus (9090)
                   ↓
              Grafana (3333)

Tous les services → Jaeger (16686) via OTLP HTTP (4318)
```

## Services

| Service | Port | Description |
|---|---|---|
| api-gateway | 3000 | Point d'entrée unique |
| service-orders | 3001 | Gestion des commandes |
| service-users | 3002 | Gestion des utilisateurs |
| Prometheus | 9090 | Collecte des métriques |
| Grafana | 3333 | Visualisation (admin/admin) |
| Jaeger | 16686 | Traces distribuées |

## Lancement

```bash
docker-compose up --build
```

Attendre que tous les services soient démarrés (environ 30 secondes).

## Interfaces

- **Grafana** : http://localhost:3333 (login: admin / admin)
- **Prometheus** : http://localhost:9090
- **Jaeger** : http://localhost:16686

## Endpoints disponibles

### Via API Gateway (port 3000)
- `GET /orders` — liste des commandes enrichies avec infos utilisateurs
- `GET /orders/:id` — commande par ID
- `GET /orders/slow` — simulation de latence (3-5 secondes)
- `GET /orders/error` — simulation d'erreur HTTP 500
- `GET /health` — healthcheck
- `GET /metrics` — métriques Prometheus

### Service Orders (port 3001)
- Mêmes endpoints + exposition directe des métriques

### Service Users (port 3002)
- `GET /users/:id` — utilisateur par ID
- `GET /health` — healthcheck
- `GET /metrics` — métriques Prometheus

## Simulation d'incident

```bash
# Rendre le script exécutable
chmod +x test.sh

# Lancer tous les scénarios de test
./test.sh
```

### Scénario manuel — Latence

```bash
# Générer une latence artificielle
curl http://localhost:3000/orders/slow
```

Dans Jaeger, chercher le service `api-gateway` et observer la trace avec plusieurs spans.
La span `service-orders` montrera la latence élevée.

### Scénario manuel — Erreur

```bash
# Provoquer une erreur 500
curl http://localhost:3000/orders/error

# Répéter pour voir le taux d'erreur monter dans Grafana
for i in $(seq 1 20); do curl -s http://localhost:3000/orders/error > /dev/null; done
```

## Métriques collectées

Chaque service expose :
- `http_requests_total{method, route, status_code}` — compteur total de requêtes
- `http_request_duration_seconds{method, route}` — histogramme de latence
- `http_errors_total{method, route}` — compteur d'erreurs

## Dashboard Grafana

Le dashboard **"Observabilité Microservices"** est pré-provisionné avec :
- Requêtes par seconde par service (time series)
- Taux d'erreur par service (gauge)
- Latence moyenne par service (time series)
- Requêtes par endpoint (bar chart)
- Stats globales (latence, total requêtes, total erreurs)

## Analyse des traces dans Jaeger

1. Ouvrir http://localhost:16686
2. Sélectionner le service `api-gateway`
3. Cliquer "Find Traces"
4. Cliquer sur une trace pour voir les spans distribuées :
   - `api-gateway` → `service-orders` → `service-users`

## Requêtes PromQL utiles

```promql
# Taux de requêtes par service
sum(rate(http_requests_total[1m])) by (job)

# Taux d'erreur
sum(rate(http_errors_total[5m])) by (job) / sum(rate(http_requests_total[5m])) by (job)

# Latence P95
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))

# Latence moyenne
sum(rate(http_request_duration_seconds_sum[1m])) by (job) / sum(rate(http_request_duration_seconds_count[1m])) by (job)
```
