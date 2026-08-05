# Protocole d'ingestion GPS

### Protocole d'Ingestion GPS & Synchronisation Hors Ligne

1. **Cycle de Vie du Point GPS en Mobilité :**
   - L'application Android natif capte la position via `FusedLocationProviderClient`.
   - L'accéléromètre mesure les g-forces (`a_x, a_y, a_z`). Si la décélération dépasse `-3.8 m/s²`, un flag `HARSH_BRAKE` est adossé au point.
   - Le point est sauvegardé immédiatement dans la BDD locale **Room (SQLite)** dans l'état `status = PENDING`.

2. **Garantie d'Idempotence (`X-Batch-Id`) :**
   - Chaque paquet envoyé contient un identifiant unique universel (`batchId`).
   - Le backend enregistre immédiatement le `batchId` dans **Redis** avec un TTL de 48h.
   - En cas de double envoi suite à un sous-réseau instable (ACK non reçu par le mobile mais requête exécutée sur le serveur), le serveur détecte le `batchId` existant dans Redis et renvoie un `HTTP 202` instantané sans réinsérer les points.

3. **Stratégie de Résilience & Compression :**
   - **Taille Max du Batch** : 50 points GPS par requête HTTP.
   - **Algorithme d'envoi** : Backoff exponentiel (1s, 2s, 4s, 8s, max 60s).
   - **Purge Locale** : Une fois le retour `HTTP 202 (accepted)` validé par le serveur, la table Room locale supprime les points archivés pour préserver l'espace de stockage du téléphone.
