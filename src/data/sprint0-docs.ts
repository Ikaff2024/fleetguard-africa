/**
 * FleetGuard Africa - Sprint 0 Complete Specifications & Deliverables
 */

export const SPRINT_0_DOCS = {
  title: "FleetGuard Africa - Dossier d'Architecture & Spécifications Spint 0",
  version: '1.0.0-MVP',
  date: 'Juillet 2026',
  author: 'Senior Software Architect & Lead Product Engineer',

  // 1. HYPOTHÈSES ET DÉCISIONS D'ARCHITECTURE
  architectureDecisions: {
    title: "1. Hypothèses et Décisions d'Architecture",
    content: `
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
| Critère | Android Native (Kotlin) | React Native / Flutter |
| :--- | :--- | :--- |
| **Arrière-plan persistant** | **Excellence maximale** (\`ForegroundService\` + Notification permanente + \`WorkManager\`) | Risque élevé d'arrêt du JS Engine par l'OS lors d'une mise en veille prolongée |
| **Consommation Batterie** | **Optimisée au niveau hardware** (\`FusedLocationProviderClient\` avec débit adaptatif) | Surcharge du pont JS (Bridge) / Threading JS lourd en tâche de fond |
| **Taille de l'APK** | **Ultra-léger (~6 Mo)** | Plus lourd (~18 - 30 Mo) avec moteurs V8/Hermes embarqués |
| **Stockage Hors Ligne** | **Room SQLite natif** avec transactions atomiques et idempotence | Asynchronous AsyncStorage ou SQLite wrapper tiers |
| **Fiabilité Réseau Intermittent** | \`JobScheduler\` natif gérant automatiquement le backoff exponentiel | Dépendance de plugins tiers parfois instables sur coupure brusque de réseau |

#### Architecture Mobile Kotlin Retenue :
- **Background Tracking Engine** : Service Foreground Android natif avec notification persistante.
- **Adaptive Sampling** : Échantillonnage à 10s en déplacement, basculement à 60s en arrêt prolongé (détection par accéléromètre).
- **Buffer Local** : Base de données Room (SQLite local). Tout point GPS est écrit dans Room avant toute tentative réseau.
- **Worker Sync** : \`WorkManager\` Android déclenche l'envoi par lots (batchs de 50 points max) dès le rétablissement de la connexion.
`,
  },

  // 2. MONOREPO STRUCTURE
  monorepoStructure: {
    title: '2. Structure Complète du Monorepo',
    content: `
\`\`\`
fleetguard-africa/
├── apps/
│   ├── web/                         # Application Web Next.js 15 (Tailwind, Lucide, MapLibre, React)
│   │   ├── src/
│   │   │   ├── app/                 # Router Next.js (Dashboard, Tracking, Fleet, Scoring, Maintenance, AI)
│   │   │   ├── components/          # Composants UI modulaires (Map, Score, Tables, Charts)
│   │   │   ├── hooks/               # Hooks personnalisés (useSocket, useTenant, useVehicles)
│   │   │   └── lib/                 # Utilities & API Client Axios/Fetch
│   ├── mobile-android/              # Application Mobile Native Kotlin
│   │   ├── app/src/main/java/com/fleetguard/mobile/
│   │   │   ├── service/             # GpsForegroundService.kt
│   │   │   ├── db/                  # Room Database & TelemetryDao.kt
│   │   │   ├── worker/              # TelemetrySyncWorker.kt
│   │   │   └── ui/                  # Activités Kotlin & Jetpack Compose
│   └── backend/                     # Application NestJS / Express Monolith Modulaire
│       ├── src/
│       │   ├── modules/
│       │   │   ├── identity/        # Auth, JWT, Users, RBAC
│       │   │   ├── organizations/   # Multi-Tenancy Management
│       │   │   ├── fleet/           # Vehicles, Drivers, Assignments
│       │   │   ├── tracking/        # GPS Ingestion Gateway, WebSockets, MapLibre tiles
│       │   │   ├── safety/          # Driver Safety Score Engine & Penalty Calculator
│       │   │   ├── geofencing/      # Geofence polygon/circle checking
│       │   │   ├── maintenance/     # Servicing logs & alerts
│       │   │   ├── fuel/            # Fuel logs & theft anomaly detector
│       │   │   ├── compliance/      # Documents expiry tracking
│       │   │   └── intelligence/    # Fleet Intelligence Hub (Gemini AI Agent)
│       │   ├── common/              # Middlewares, TenantFilter, Guards, AuditLogger
│       │   └── jobs/                # Workers BullMQ pour ingestion batch async
├── packages/
│   ├── database/                    # Schéma Prisma PostgreSQL + PostGIS
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # Modèle de données exhaustif
│   │   │   └── seeds/               # Seeders de démonstration multi-tenants
│   ├── shared/                      # DTOs, types TypeScript, utilitaires de calcul de score
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── dtos/
│   │   │   └── scoring-calculator.ts
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.web
│   └── docker-compose.yml           # PostgreSQL, PostGIS, Redis, Mosquitto/SocketIO
├── .env.example                     # Variables d'environnement documentées
└── README.md                        # Guide complet d'installation et de déploiement
\`\`\`
`,
  },

  // 3. MERMAID DIAGRAM
  mermaidDiagram: `
graph TD
    subgraph Mobile_Android ["App Mobile Native Kotlin (Chauffeur / Boîtier)"]
        A[GPS Receiver] --> B[GpsForegroundService]
        B --> C[Accéléromètre & Détecteur d'événements]
        B & C --> D[Room Local SQLite Database]
        D --> E{Connexion Mobile?}
        E -- "Non (Zone Blanche)" --> D
        E -- "Oui (2G/3G/4G)" --> F[TelemetrySyncWorker Batcher]
    end

    subgraph Backend_Gateway ["Backend NestJS / Express API Gateway"]
        F -->|HTTP POST /api/v1/tracking/telemetry/batch| G[JWT & Tenant Guard]
        G --> H[Idempotence Filter via Redis X-Batch-Id]
        H --> I[Queue BullMQ: gps-ingestion-queue]
    end

    subgraph Workers_Engine ["Async Workers & Processing Engine"]
        I --> J[GPS Ingestion Worker]
        J --> K[(PostgreSQL + PostGIS DB)]
        J --> L[Geofence Engine Check]
        J --> M[Driver Safety Score Calculator]
        L -- "Infraction" --> N[Alert Service]
        M -- "Mise à jour score" --> K
        N --> O[WebSocket Server / Socket.IO]
    end

    subgraph Web_Dashboard ["Frontend Web Next.js (Gestionnaire de Flotte)"]
        O -->|Realtime Update| P[Live Map & Dashboard]
        P -->|API Requests| G
        P -->|Gemini Prompts| Q[Fleet Intelligence Hub]
    end
`,

  // 4. PRISMA SCHEMA INITIAL
  prismaSchemaText: `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserRole {
  SUPER_ADMIN
  ORGANIZATION_ADMIN
  FLEET_MANAGER
  SAFETY_OFFICER
  MAINTENANCE_TECH
  DRIVER
}

enum VehicleStatus {
  ACTIVE
  MAINTENANCE
  IDLE
  OUT_OF_SERVICE
}

enum VehicleType {
  HEAVY_TRUCK
  MEDIUM_TRUCK
  VAN
  PICKUP
  BUS
  CONTAINER_CARRIER
}

model Organization {
  id            String   @id @default(uuid())
  name          String
  code          String   @unique
  country       String
  currency      String   @default("XOF")
  timezone      String   @default("Africa/Abidjan")
  maxVehicles   Int      @default(50)
  createdAt     DateTime @default(now())

  users         User[]
  vehicles      Vehicle[]
  drivers       Driver[]
  geofences     Geofence[]
  scoreConfigs  DriverScoreConfig[]
  auditLogs     AuditLog[]

  @@map("organizations")
}

model User {
  id             String       @id @default(uuid())
  organizationId String
  email          String       @unique
  passwordHash   String
  fullName       String
  phone          String
  role           UserRole
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  auditLogs      AuditLog[]

  @@index([organizationId])
  @@map("users")
}

model Vehicle {
  id                        String        @id @default(uuid())
  organizationId            String
  immatriculation           String        @unique
  vin                       String?
  make                      String
  model                     String
  year                      Int
  type                      VehicleType
  fuelType                  String        @default("DIESEL")
  tankCapacityLiters        Float         @default(300)
  expectedConsumptionL100km Float         @default(32.0)
  currentOdometerKm         Float         @default(0)
  status                    VehicleStatus @default(ACTIVE)
  createdAt                 DateTime      @default(now())

  organization              Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  drivers                   Driver[]
  telemetry                 GpsTelemetry[]
  safetyEvents              SafetyEvent[]
  maintenanceLogs           MaintenanceLog[]
  fuelLogs                  FuelLog[]

  @@index([organizationId])
  @@map("vehicles")
}

model Driver {
  id                  String       @id @default(uuid())
  organizationId      String
  fullName            String
  phone               String
  licenseNumber       String
  licenseCategory     String
  licenseExpiryDate   DateTime
  currentSafetyScore  Float        @default(100.0)
  totalKmDriven       Float        @default(0)
  status              String       @default("AVAILABLE")
  assignedVehicleId   String?
  createdAt           DateTime     @default(now())

  organization        Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignedVehicle     Vehicle?     @relation(fields: [assignedVehicleId], references: [id], onDelete: SetNull)
  safetyEvents        SafetyEvent[]
  dailyScores         DriverDailyScore[]
  fuelLogs            FuelLog[]

  @@index([organizationId])
  @@map("drivers")
}

model GpsTelemetry {
  id              String   @id @default(uuid())
  organizationId  String
  vehicleId       String
  driverId        String
  latitude        Float
  longitude       Float
  altitude        Float?
  speedKmH        Float
  headingDegree   Float
  accuracyMeters  Float
  ignitionOn      Boolean
  batteryLevelPct Float
  networkType     String
  recordedAt      DateTime
  createdAt       DateTime @default(now())

  vehicle         Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([organizationId, vehicleId, recordedAt])
  @@map("gps_telemetry")
}

model SafetyEvent {
  id                    String   @id @default(uuid())
  organizationId        String
  vehicleId             String
  driverId              String
  eventType             String   // OVER_SPEED, HARSH_BRAKING, etc.
  severity              String   // LOW, MEDIUM, HIGH, CRITICAL
  speedKmH              Float
  speedLimitKmH         Float?
  latitude              Float
  longitude             Float
  recordedAt            DateTime
  penaltyPointsDeducted Float

  vehicle               Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  driver                Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)

  @@index([organizationId, driverId, recordedAt])
  @@map("safety_events")
}

model DriverScoreConfig {
  id                        String   @id @default(uuid())
  organizationId            String
  version                   Int      @default(1)
  overspeedWeight           Float    @default(0.35)
  harshBrakingWeight        Float    @default(0.25)
  rapidAccelWeight          Float    @default(0.15)
  fatigueNightWeight        Float    @default(0.15)
  geofenceBreachWeight      Float    @default(0.10)
  normalizationDistanceKm   Float    @default(100.0)
  updatedAt                 DateTime @updatedAt

  organization              Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("driver_score_configs")
}

model DriverDailyScore {
  id                    String   @id @default(uuid())
  organizationId        String
  driverId              String
  date                  DateTime
  distanceDrivenKm      Float
  score                 Float
  overspeedCount        Int      @default(0)
  harshBrakingCount     Int      @default(0)
  rapidAccelCount       Int      @default(0)
  nightKmDriven         Float    @default(0)
  geofenceBreachesCount Int      @default(0)

  driver                Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)

  @@unique([driverId, date])
  @@index([organizationId, date])
  @@map("driver_daily_scores")
}

model Geofence {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  type            String   // WAREHOUSE, PORT, BORDER_POST, RESTRICTED_ZONE
  geometryType    String   // CIRCLE, POLYGON
  centerLat       Float?
  centerLng       Float?
  radiusMeters    Float?
  coordinatesJson String?  // Stringified GeoJSON coordinates
  speedLimitKmH   Float?
  createdAt       DateTime @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("geofences")
}

model MaintenanceLog {
  id                  String   @id @default(uuid())
  organizationId      String
  vehicleId           String
  type                String   // PREVENTATIVE, CORRECTIVE, TIRE_REPLACEMENT
  description         String
  odometerKmAtService Float
  cost                Float
  currency            String   @default("XOF")
  serviceProvider     String
  performedAt         DateTime
  nextServiceKmDue    Float?
  status              String   @default("COMPLETED")

  vehicle             Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([organizationId, vehicleId])
  @@map("maintenance_logs")
}

model FuelLog {
  id                  String   @id @default(uuid())
  organizationId      String
  vehicleId           String
  driverId            String
  litersAdded         Float
  totalCost           Float
  currency            String   @default("XOF")
  pricePerLiter       Float
  odometerKm          Float
  stationName         String
  receiptNumber       String
  calculatedL100km    Float?
  suspectedFuelTheft  Boolean  @default(false)
  loggedAt            DateTime @default(now())

  vehicle             Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  driver              Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)

  @@index([organizationId, vehicleId])
  @@map("fuel_logs")
}

model AuditLog {
  id             String       @id @default(uuid())
  organizationId String
  userId         String
  action         String
  resource       String
  ipAddress      String
  timestamp      DateTime     @default(now())
  detailsJson    String?

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([organizationId, timestamp])
  @@map("audit_logs")
}
`,

  // 5. ROLE & PERMISSION MATRIX
  rbacMatrix: [
    {
      permission: 'Créer / Modifier Organisation',
      superAdmin: true,
      orgAdmin: false,
      fleetMgr: false,
      safetyOfficer: false,
      tech: false,
      driver: false,
    },
    {
      permission: 'Gérer Utilisateurs & Rôles Tenant',
      superAdmin: true,
      orgAdmin: true,
      fleetMgr: false,
      safetyOfficer: false,
      tech: false,
      driver: false,
    },
    {
      permission: 'Créer / Modifier Véhicules & Affectations',
      superAdmin: true,
      orgAdmin: true,
      fleetMgr: true,
      safetyOfficer: false,
      tech: false,
      driver: false,
    },
    {
      permission: 'Consulter Carte Temps Réel & Trajets',
      superAdmin: true,
      orgAdmin: true,
      fleetMgr: true,
      safetyOfficer: true,
      tech: true,
      driver: false,
    },
    {
      permission: 'Configurer Pondération Driver Score',
      superAdmin: true,
      orgAdmin: true,
      fleetMgr: true,
      safetyOfficer: true,
      tech: false,
      driver: false,
    },
    {
      permission: "Saisir Maintenance / Carnet d'Entretien",
      superAdmin: true,
      orgAdmin: true,
      fleetMgr: true,
      safetyOfficer: false,
      tech: true,
      driver: false,
    },
    {
      permission: 'Saisir Plein Carburant',
      superAdmin: true,
      orgAdmin: true,
      fleetMgr: true,
      safetyOfficer: false,
      tech: false,
      driver: true,
    },
    {
      permission: 'Envoyer Télémétrie GPS (App Mobile)',
      superAdmin: false,
      orgAdmin: false,
      fleetMgr: false,
      safetyOfficer: false,
      tech: false,
      driver: true,
    },
    {
      permission: 'Consulter Fleet Intelligence AI Hub',
      superAdmin: true,
      orgAdmin: true,
      fleetMgr: true,
      safetyOfficer: true,
      tech: false,
      driver: false,
    },
  ],

  // 6. API CONTRACTS
  apiContracts: [
    {
      endpoint: 'POST /api/v1/auth/login',
      description: 'Authentification utilisateur et émission des JWT Access Token & Refresh Token',
      request: {
        email: 'gestionnaire@transafrik.bj',
        password: '••••••••••••',
      },
      response: {
        statusCode: 200,
        data: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'd7a82b91-4e20-4121-8219-...',
          user: {
            id: 'usr_9921',
            fullName: 'Koffi Mensah',
            email: 'gestionnaire@transafrik.bj',
            role: 'FLEET_MANAGER',
            organizationId: 'org_transafrik_cotonou',
          },
        },
      },
    },
    {
      endpoint: 'POST /api/v1/tracking/telemetry/batch',
      description: "Ingestion par lot de points GPS depuis l'application mobile Android",
      request: {
        batchId: 'batch_20260731_98124',
        vehicleId: 'veh_actros_01',
        driverId: 'drv_moussa_04',
        deviceId: 'imei_864291048291048',
        points: [
          {
            latitude: 6.3654,
            longitude: 2.4183,
            speedKmH: 78.5,
            headingDegree: 142.0,
            timestamp: '2026-07-31T09:14:00.000Z',
            accuracyMeters: 4.2,
            ignitionOn: true,
            batteryLevelPct: 88,
            networkType: '3G',
          },
          {
            latitude: 6.3712,
            longitude: 2.4221,
            speedKmH: 94.2, // Excès de vitesse
            headingDegree: 144.0,
            timestamp: '2026-07-31T09:14:15.000Z',
            accuracyMeters: 3.8,
            ignitionOn: true,
            batteryLevelPct: 88,
            networkType: '3G',
            eventFlags: ['OVER_SPEED'],
          },
        ],
      },
      response: {
        statusCode: 202,
        data: {
          accepted: true,
          processedPoints: 2,
          batchId: 'batch_20260731_98124',
          idempotentDuplicate: false,
          safetyEventsGenerated: 1,
        },
      },
    },
    {
      endpoint: 'GET /api/v1/scoring/drivers/:id',
      description: "Obtention du Driver Safety Score détaillé et explicable d'un chauffeur",
      request: null,
      response: {
        statusCode: 200,
        data: {
          driverId: 'drv_moussa_04',
          fullName: 'Moussa Diop',
          currentSafetyScore: 84.5,
          totalKmDrivenPeriod: 1420.0,
          scoreBreakdown: {
            overspeedPenalty: -8.0,
            harshBrakingPenalty: -4.5,
            rapidAccelPenalty: -3.0,
            fatigueNightPenalty: -0.0,
            geofenceBreachPenalty: -0.0,
          },
          penaltiesExplanations: [
            {
              category: 'EXCÈS_DE_VITESSE',
              pointsLost: 8.0,
              reason: "4 pointements enregistrés au-dessus de 90 km/h sur l'axe Cotonou-Parakou.",
            },
            {
              category: 'FREINAGE_BRUSQUE',
              pointsLost: 4.5,
              reason: '2 décélérations supérieures à 0.4g détectées par accéléromètre.',
            },
          ],
        },
      },
    },
  ],

  // 7. GPS PROTOCOL & OFFLINE SYNC
  gpsProtocolSpec: `
### Protocole d'Ingestion GPS & Synchronisation Hors Ligne

1. **Cycle de Vie du Point GPS en Mobilité :**
   - L'application Android natif capte la position via \`FusedLocationProviderClient\`.
   - L'accéléromètre mesure les g-forces (\`a_x, a_y, a_z\`). Si la décélération dépasse \`-3.8 m/s²\`, un flag \`HARSH_BRAKE\` est adossé au point.
   - Le point est sauvegardé immédiatement dans la BDD locale **Room (SQLite)** dans l'état \`status = PENDING\`.

2. **Garantie d'Idempotence (\`X-Batch-Id\`) :**
   - Chaque paquet envoyé contient un identifiant unique universel (\`batchId\`).
   - Le backend enregistre immédiatement le \`batchId\` dans **Redis** avec un TTL de 48h.
   - En cas de double envoi suite à un sous-réseau instable (ACK non reçu par le mobile mais requête exécutée sur le serveur), le serveur détecte le \`batchId\` existant dans Redis et renvoie un \`HTTP 202\` instantané sans réinsérer les points.

3. **Stratégie de Résilience & Compression :**
   - **Taille Max du Batch** : 50 points GPS par requête HTTP.
   - **Algorithme d'envoi** : Backoff exponentiel (1s, 2s, 4s, 8s, max 60s).
   - **Purge Locale** : Une fois le retour \`HTTP 202 (accepted)\` validé par le serveur, la table Room locale supprime les points archivés pour préserver l'espace de stockage du téléphone.
`,

  // 8. SCREEN MOCKUPS
  screenMockups: [
    {
      screen: 'Tableau de Bord Global (Multi-Tenant)',
      layoutText:
        '[Header: Logo FleetGuard Africa | Sélecteur Tenant: TransAfrik Logistics | Currency: FCFA | Timezone: GMT+1]\n[KPi Cards: 42 Véhicules Actifs | 92.4% Taux de Disponibilité | Score Moyen Chauffeurs: 87/100 | Alerte Carburant: 2 vols suspectés]\n[Section Carte Live Map: Visualisation interactive MapLibre des axes Cotonou-Parakou, Dakar-Touba, Nairobi-Mombasa]\n[Sidebar Gauche: Carte Live | Flotte & Véhicules | Chauffeurs & Scoring | Maintenance & Carburant | Conformité CEDEAO | Intelligence Hub IA]',
    },
    {
      screen: 'Carte Temps Réel & Ingestion GPS Live',
      layoutText:
        "[Top Controls: Filtre par statut (En Route, Arrêté, En Alerte) | Recherche par immatriculation]\n[Carte Centrée sur l'Afrique de l'Ouest/Est avec marqueurs de couleur (Vert: Normal, Orange: Vitesse, Rouge: Alerte/Panne)]\n[Panneau de Détail Véhicule Glissant: Vitesse instantanée (84 km/h), Niveau Batterie Tracker (92%), Chauffeur Assigné, Trajet En Cours, Statut Réseau (3G/4G)]",
    },
    {
      screen: 'Driver Safety Score Expliqué (100 pts)',
      layoutText:
        "[Profil Chauffeur: Moussa Diop | Permis Catégorie CE | Score: 85.5/100]\n[Jauge Circulaire de Score de Sécurité couleur dégradée Vert-Jaune]\n[Tableau Explicatif des Pénalités: Catégorie | Fréquence sur 100 km | Points Déduits | Explication Détaillée]\n[Graphique Recharts: Évolution du Score de Sécurité sur les 30 derniers jours par rapport à la moyenne de l'entreprise]",
    },
    {
      screen: 'Fleet Intelligence Hub (Assistant IA Gemini)',
      layoutText:
        "[Zone de Dialogue IA]: 'Analysez la consommation de carburant de la flotte TransAfrik ce mois-ci.'\n[Réponse Structurée Gemini]: Analyse des écarts entre consommation estimée (32L/100km) et réelle (41L/100km) sur le camion RB-4592-A, détection de 2 baisses soudaines de niveau de réservoir à Parakou (vol suspecté), et recommandations d'entretien préventif sur les injecteurs.",
    },
  ],

  // 9. TEST PLAN
  testPlan: {
    title: "9. Plan de Tests et Critères d'Acceptation",
    content: `
### Stratégie de Test Exhaustive
1. **Tests Unitaires (Moteur de Scoring & Ingestion)** :
   - Vérification du calcul explicable du Driver Safety Score sur 100.
   - Validation des limites d'excès de vitesse selon le type de zone (urbaine 50 km/h, nationale 90 km/h).

2. **Tests de Sécurité Multi-Tenant (Isolation des Données)** :
   - Vérification stricte qu'un utilisateur de \`org_transafrik\` reçevant un \`HTTP 403 / 404\` s'il tente d'accéder à un \`vehicleId\` appartenant à \`org_sahel_express\`.
   - Test automatisé sur tous les endpoints \`/api/v1/*\` filtrés par \`organizationId\`.

3. **Tests de Résilience GPS & Idempotence** :
   - Simulation de réémission 5 fois du même \`batchId\` GPS. Résultat attendu : 1 seule écriture en base, 5 réponses \`HTTP 202\`.
   - Simulation d'un paquet contenant 200 points GPS hors ligne. Résultat attendu : découpage propre en batchs de 50.
`,
  },

  // 10. ROADMAP
  sprintsRoadmap: [
    {
      sprint: 'Sprint 0',
      focus: 'Architecture, PRD technique, Schéma Prisma, API Contracts, Design System & Maquettes',
      status: 'Terminé (En Cours de Révision)',
    },
    {
      sprint: 'Sprint 1',
      focus: 'Auth JWT/Refresh, Multi-Tenant Isolation, Gestion Organisations, Véhicules & Chauffeurs',
      status: 'A Venir',
    },
    {
      sprint: 'Sprint 2',
      focus: 'App Mobile Native Kotlin, Ingestion GPS Batch, Live Map MapLibre, Trajets & Géofencing',
      status: 'A Venir',
    },
    {
      sprint: 'Sprint 3',
      focus: "Détection Événements de Conduite, Driver Safety Score sur 100, Moteur d'Alertes",
      status: 'A Venir',
    },
    {
      sprint: 'Sprint 4',
      focus: 'Maintenance Préventive, Suivi Carburant (Vol), Conformité CEDEAO, Rapports PDF/Excel',
      status: 'A Venir',
    },
    {
      sprint: 'Sprint 5',
      focus: 'Fleet Intelligence Hub (Gemini AI Agent), Anomaly Detection & Tableaux de Bord Avancés',
      status: 'A Venir',
    },
  ],
};
