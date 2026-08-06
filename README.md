# FleetGuard Africa

Plateforme SaaS B2B multi-tenant de gestion de flotte, conçue pour les corridors
routiers africains : suivi GPS, score de sécurité chauffeur explicable, détection
d'anomalies carburant, maintenance, conformité réglementaire et travail hors ligne.

**Démonstration en ligne :** https://fleetguard-africa-production.up.railway.app

> **État actuel : Sprint 1 livré, écrans branchés sur les données réelles.**
> Authentification, RBAC sur 6 rôles, isolation garantie par PostgreSQL, et
> saisie de la flotte (création, modification, archivage). Les écrans affichent
> les données de l'organisation connectée — connectez-vous avec deux comptes
> différents pour le constater.
>
> La télémétrie GPS est désormais **persistée** : les points sont enregistrés,
> les infractions détectées côté serveur, et le score de sécurité calculé sur la
> distance réellement parcourue puis historisé.
>
> L'instance publique ne contient que des données fictives.
>
> Feuille de route détaillée : [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md).

### Comptes de démonstration

| Compte                    | Rôle                   | Organisation            |
| ------------------------- | ---------------------- | ----------------------- |
| `admin@transafrik.bj`     | Administrateur         | TransAfrik (Bénin)      |
| `manager@transafrik.bj`   | Gestionnaire de flotte | TransAfrik (Bénin)      |
| `securite@transafrik.bj`  | Responsable sécurité   | TransAfrik (Bénin)      |
| `atelier@transafrik.bj`   | Technicien maintenance | TransAfrik (Bénin)      |
| `manager@sahelexpress.sn` | Gestionnaire de flotte | Sahel Express (Sénégal) |

Mot de passe commun : `FleetGuard2026!Demo`

Connectez-vous avec deux organisations différentes pour constater l'isolation :
chacune ne voit que son propre parc.

---

## Démarrage rapide

**Prérequis** : Node.js ≥ 20.11, Docker (pour la base de données).

```bash
npm install
cp .env.example .env      # adapter les ports si 5432/6379 sont déjà pris
npm run dev               # http://localhost:3000
```

L'application démarre sans base de données : elle utilise alors le jeu de
démonstration en mémoire. Les routes d'IA répondent `503` tant que
`GEMINI_API_KEY` n'est pas renseignée — c'est volontaire, voir plus bas.

### Avec la base de données

```bash
npm run infra:up          # PostgreSQL + PostGIS, Redis, MinIO
npm run db:migrate        # applique le schéma
npm run db:seed           # peuple avec le jeu de démonstration
```

Puis appliquer l'isolation multi-tenant, qui ne fait pas partie des migrations
Prisma :

```bash
docker exec -i fleetguard-postgres psql -U fleetguard -d fleetguard_db \
  -v ON_ERROR_STOP=1 < prisma/sql/001_rls_policies.sql
docker exec -i fleetguard-postgres psql -U fleetguard -d fleetguard_db \
  -v ON_ERROR_STOP=1 < prisma/sql/002_postgis_and_partitions.sql
docker exec -i fleetguard-postgres psql -U fleetguard -d fleetguard_db \
  -v ON_ERROR_STOP=1 < prisma/sql/999_verify_rls.sql   # doit afficher « Isolation vérifiée »
```

---

## Commandes

| Commande                          | Rôle                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                     | Serveur de développement (API + Vite)                                   |
| `npm run build`                   | Compile le front et le serveur                                          |
| `npm start`                       | Démarre la version compilée                                             |
| `npm run verify`                  | Types + lint + tests — à lancer avant chaque commit                     |
| `npm run verify:all`              | Chaîne complète : types, lint, format, tests, build, fumée, isolation   |
| `npm test`                        | Tests unitaires et d'intégration                                        |
| `npm run test:coverage`           | Tests avec couverture                                                   |
| `npm run test:smoke <url>`        | Charge la page dans un navigateur et échoue sur toute erreur JavaScript |
| `npm run test:isolation-ui <url>` | Connecte deux clients et vérifie qu'ils voient des flottes distinctes   |
| `npm run db:migrate`              | Applique les migrations (développement)                                 |
| `npm run db:deploy`               | Applique les migrations (production)                                    |
| `npm run db:seed`                 | Peuple le jeu de démonstration                                          |
| `npm run db:studio`               | Explorateur de base Prisma                                              |
| `npm run infra:up` / `infra:down` | Services Docker locaux                                                  |

---

## Architecture

```
src/
├── server/              API (Express, modulaire)
│   ├── env.ts           validation fail-fast de la configuration
│   ├── app.ts           assemblage HTTP
│   ├── http/            sécurité, erreurs, résolution du tenant
│   ├── routes/          flotte, scoring, télémétrie, sync, IA
│   ├── services/        moteur d'analyse, idempotence, invites
│   └── repositories/    accès aux données (bascule Prisma en Phase 1)
├── components/          interface React par domaine métier
├── data/                jeu de démonstration + moteur de scoring
├── lib/api-client.ts    client HTTP unique du front
└── types/               modèle de domaine — source de vérité
prisma/
├── schema.prisma        schéma PostgreSQL
├── sql/                 RLS, PostGIS, partitionnement, vérification
└── seed.ts              peuplement
```

### Trois principes structurants

**L'isolation entre clients ne repose pas que sur le code applicatif.**
Filtrer par `organizationId` dans les requêtes fonctionne — jusqu'à la première
clause `where` oubliée. Le Row-Level Security PostgreSQL place la garantie dans
la base : une requête sans filtre ne renvoie rien. Le code devient la deuxième
ligne de défense, plus la seule. L'application doit donc se connecter avec le
rôle `fleetguard_app` (`NOBYPASSRLS`), jamais avec le propriétaire des tables.

**Une donnée inventée ne doit jamais ressembler à une donnée réelle.**
Sans clé d'API, les routes d'analyse renvoient une erreur explicite. En mode
démonstration (`AI_DEMO_MODE=true`, interdit en production), les réponses
portent `isSimulated: true` et l'interface les signale par un bandeau. Un
gestionnaire ne doit jamais sanctionner un chauffeur sur une analyse fabriquée.

**Le réseau est une contrainte de conception, pas un détail.**
Les écrans sont chargés à la demande, les dépendances lourdes isolées, et la CI
échoue si l'écran d'accueil dépasse 260 Ko compressés. Sur une 3G de corridor,
chaque centaine de kilo-octets se paie en secondes d'attente.

---

## Ce qui n'est pas encore en place

À lire avant toute mise en service :

- **Synchronisation hors ligne non persistée.** La file IndexedDB est validée
  et dédoublonnée, mais son contenu n'est pas encore écrit (`persisted: false`
  dans les réponses, volontairement explicite).
- **Trajets et alertes traçables** : pas de reconstruction de trajet (début,
  fin, arrêts) ni de table d'alertes ; les alertes affichées sont calculées à
  l'écran et leur acquittement n'est pas conservé.
- **Pas d'application mobile chauffeur** : la télémétrie s'ingère par l'API,
  mais rien ne l'émet encore depuis le terrain.
- **Modules hors périmètre du cahier des charges** (primes, fatigue,
  optimisation d'itinéraires) : conservés, mais alimentés par un jeu de
  démonstration — l'API ne les expose pas encore.
- **Pas encore une application installable hors ligne.** La file IndexedDB
  existe, mais sans service worker l'application ne s'ouvre pas sans réseau.
- **Tuiles cartographiques** : les serveurs OpenStreetMap publics sont interdits
  en usage commercial. Prévoir un fournisseur dédié avant le premier client.
- **Primes en monnaie électronique** : verser du cash via Orange Money, MTN MoMo
  ou Wave relève de la réglementation BCEAO et suppose un agrégateur agréé. Le
  MVP doit s'en tenir aux bons carburant.

---

## Contribution

`npm run verify` doit passer avant tout commit, et `npm run verify:all`
reproduit en local l'intégralité de ce que contrôle l'intégration continue —
utile avant une livraison, ou quand la CI est indisponible.

Avec une base configurée (`DATABASE_APP_URL` et `JWT_SECRET`), `verify:all`
exécute en plus les contrôles d'isolation, y compris celui qui connecte deux
clients et vérifie qu'ils voient des flottes différentes à l'écran. Sans base,
ces contrôles sont **ignorés et signalés comme tels** : un contrôle sauté doit
se voir.

Les avertissements de lint sont plafonnés à leur niveau actuel : la dette ne
peut plus augmenter, et le plafond est abaissé à mesure qu'elle est résorbée.
