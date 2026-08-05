# Décisions d'architecture

### Context & Enjeux Métier en Afrique

Les flottes de transport inter-États et de livraison urbaine/suburbaine en Afrique subsaharienne (Cotonou-Parakou, Dakar-Touba, Lagos-Ibadan, Douala-Yaoundé, Nairobi-Mombasa) évoluent dans des conditions extrêmes :

1. **Connectivité intermittente & zones blanches** : Les camions parcourent des centaines de kilomètres sans réseau 3G/4G.
2. **Gestion agressive de la batterie sur Android** : Les constructeurs (Transsion, Samsung, Xiaomi) tuent fréquemment les processus d'arrière-plan des applications hybrides.
3. **Sécurité & Vol de carburant** : Nécessité de corréler l'odomètre, les arrêts suspects et les ravitaillements en temps réel ou lors des reconnexions.
4. **Isolation Multi-Tenant Stricte** : Chaque entreprise cliente (TransAfrik, Sahel Express, etc.) doit disposer d'un cloisonnement étanche de ses données.

---

### Arbitrage Choix Mobile : Android Kotlin Native vs React Native

**Décision retenue : Android Kotlin Native (avec Foreground Service & Room DB)**

#### Tableau comparatif justifié :

| Critère                           | Android Native (Kotlin)                                                                 | React Native / Flutter                                                         |
| :-------------------------------- | :-------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Arrière-plan persistant**       | **Excellence maximale** (`ForegroundService` + Notification permanente + `WorkManager`) | Risque élevé d'arrêt du JS Engine par l'OS lors d'une mise en veille prolongée |
| **Consommation Batterie**         | **Optimisée au niveau hardware** (`FusedLocationProviderClient` avec débit adaptatif)   | Surcharge du pont JS (Bridge) / Threading JS lourd en tâche de fond            |
| **Taille de l'APK**               | **Ultra-léger (~6 Mo)**                                                                 | Plus lourd (~18 - 30 Mo) avec moteurs V8/Hermes embarqués                      |
| **Stockage Hors Ligne**           | **Room SQLite natif** avec transactions atomiques et idempotence                        | Asynchronous AsyncStorage ou SQLite wrapper tiers                              |
| **Fiabilité Réseau Intermittent** | `JobScheduler` natif gérant automatiquement le backoff exponentiel                      | Dépendance de plugins tiers parfois instables sur coupure brusque de réseau    |

#### Architecture Mobile Kotlin Retenue :

- **Background Tracking Engine** : Service Foreground Android natif avec notification persistante.
- **Adaptive Sampling** : Échantillonnage à 10s en déplacement, basculement à 60s en arrêt prolongé (détection par accéléromètre).
- **Buffer Local** : Base de données Room (SQLite local). Tout point GPS est écrit dans Room avant toute tentative réseau.
- **Worker Sync** : `WorkManager` Android déclenche l'envoi par lots (batchs de 50 points max) dès le rétablissement de la connexion.
