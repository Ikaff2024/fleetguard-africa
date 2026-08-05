# 9. Plan de Tests et Critères d'Acceptation

### Stratégie de Test Exhaustive
1. **Tests Unitaires (Moteur de Scoring & Ingestion)** :
   - Vérification du calcul explicable du Driver Safety Score sur 100.
   - Validation des limites d'excès de vitesse selon le type de zone (urbaine 50 km/h, nationale 90 km/h).

2. **Tests de Sécurité Multi-Tenant (Isolation des Données)** :
   - Vérification stricte qu'un utilisateur de `org_transafrik` reçevant un `HTTP 403 / 404` s'il tente d'accéder à un `vehicleId` appartenant à `org_sahel_express`.
   - Test automatisé sur tous les endpoints `/api/v1/*` filtrés par `organizationId`.

3. **Tests de Résilience GPS & Idempotence** :
   - Simulation de réémission 5 fois du même `batchId` GPS. Résultat attendu : 1 seule écriture en base, 5 réponses `HTTP 202`.
   - Simulation d'un paquet contenant 200 points GPS hors ligne. Résultat attendu : découpage propre en batchs de 50.
