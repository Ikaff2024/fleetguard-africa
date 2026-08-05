# 2. Structure Complète du Monorepo

```
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
```
