#!/bin/bash

BASE_URL="http://localhost:3000"

echo "============================================"
echo "  TP Observabilité — Tests des scénarios"
echo "============================================"
echo ""

echo "--- Scénario 1: Requêtes normales ---"
echo ""

echo "[1/4] GET /orders (liste des commandes enrichies)"
curl -s "$BASE_URL/orders" | python3 -m json.tool 2>/dev/null || curl -s "$BASE_URL/orders"
echo ""

echo "[2/4] GET /orders/1 (commande par ID)"
curl -s "$BASE_URL/orders/1" | python3 -m json.tool 2>/dev/null || curl -s "$BASE_URL/orders/1"
echo ""

echo "[3/4] GET /orders/2 (commande par ID)"
curl -s "$BASE_URL/orders/2" | python3 -m json.tool 2>/dev/null || curl -s "$BASE_URL/orders/2"
echo ""

echo "--- Scénario 2: Réponse lente (simulation incident) ---"
echo ""
echo "[!] GET /orders/slow (latence 3-5 secondes attendue...)"
time curl -s "$BASE_URL/orders/slow" | python3 -m json.tool 2>/dev/null || time curl -s "$BASE_URL/orders/slow"
echo ""

echo "--- Scénario 3: Erreur HTTP (simulation incident) ---"
echo ""
echo "[!] GET /orders/error (erreur 500 attendue)"
curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/orders/error"
echo ""

echo "--- Génération de charge (50 requêtes) ---"
echo ""
echo "[...] Envoi de 50 requêtes GET /orders..."
for i in $(seq 1 50); do
  curl -s "$BASE_URL/orders" > /dev/null
  if [ $((i % 10)) -eq 0 ]; then
    echo "  $i/50 requêtes envoyées"
  fi
done
echo "[OK] Charge générée !"
echo ""

echo "--- Vérification des healthchecks ---"
echo ""
echo "api-gateway:"
curl -s "$BASE_URL/health"
echo ""
echo "service-orders:"
curl -s "http://localhost:3001/health"
echo ""
echo "service-users:"
curl -s "http://localhost:3002/health"
echo ""

echo "============================================"
echo "  Interfaces disponibles :"
echo "  - Grafana    : http://localhost:3333 (admin/admin)"
echo "  - Prometheus : http://localhost:9090"
echo "  - Jaeger     : http://localhost:16686"
echo "============================================"
