# FleetGuard Africa — Plan de mise en production

_Dernière mise à jour : 5 août 2026 — Sprint 1 livré_

Ce document est la référence d'engagement de l'équipe technique. Il décrit
l'écart entre l'état actuel et une plateforme exploitable par des clients
payants, et l'ordre dans lequel cet écart se comble.

---

## 1. Point de départ

Le produit livré par Google AI Studio était une maquette haute-fidélité :
27 composants React aboutis, un modèle de domaine sérieux et pensé pour
l'Afrique, un moteur de scoring explicable — mais aucune base de données,
aucune authentification, et un backend qui filtrait des tableaux en mémoire.

Constats mesurés à l'audit initial :

| Constat                       | Détail                                                   |
| ----------------------------- | -------------------------------------------------------- |
| 18 composants sur 27          | importaient directement le jeu de démonstration          |
| 4 appels réseau               | dans tout le front                                       |
| Tenant = paramètre de requête | n'importe qui pouvait lire n'importe quel client         |
| Ingestion GPS                 | répondait `202` sans rien persister                      |
| IA sans clé                   | renvoyait une analyse **fabriquée** avec un statut `200` |
| Dépôt                         | pas versionné, doublon complet, archive de 1 Mo          |

---

## 2. Ce qui est fait

### Socle de développement

- Dépôt Git initialisé, historique propre, dépôt GitHub privé.
- TypeScript strict — a révélé trois bugs réels : filtre de conformité inopérant
  (la carte brune CEDEAO était inatteignable), téléphone chauffeur toujours
  affiché avec la même valeur en dur, plantage possible d'une infobulle.
- ESLint, Prettier, Vitest ; 184 imports morts supprimés.
- CI GitHub Actions : types, lint, formatage, tests, build, image Docker, audit.

### API

- Serveur monolithique découpé en modules (`src/server/`), prêt pour Prisma.
- Configuration validée au démarrage — `PORT` vient de l'environnement, ce qui
  débloque tout déploiement cloud.
- Helmet + CSP, CORS par liste blanche, rate limiting à trois niveaux dont un
  dédié à l'IA facturée au token.
- Validation Zod de toutes les entrées : points GPS bornés, lots plafonnés,
  invites limitées.
- **Fuite inter-tenants corrigée** : `/scoring/drivers/:id` cherchait le
  chauffeur dans l'ensemble des organisations.
- **Idempotence de l'ingestion** : un rejeu de zone blanche ne fausse plus le
  score du chauffeur, donc plus sa prime.
- **Honnêteté des réponses** : plus aucune analyse fabriquée. Erreur explicite,
  ou exemple marqué `isSimulated` et signalé dans l'interface.
- Logs structurés, arrêt gracieux, sondes de vivacité et de disponibilité.

### Front

- Client HTTP unique, avec délai maximal et messages d'erreur du serveur.
- Leaflet empaqueté au lieu d'un CDN tiers.
- Découpage par écran : **385 → 168 Ko compressés** sur l'écran d'accueil.
- Frontière d'erreur par module.

### Base de données

- Schéma Prisma de 24 modèles, PostGIS, partitionnement mensuel prévu.
- **Row-Level Security vérifié sur une base réelle** : sans tenant, aucune ligne
  visible ; chaque tenant ne voit que son parc ; écriture au nom d'un tiers
  refusée. Script `999_verify_rls.sql` rejouable après chaque déploiement.
- Seed idempotent depuis le jeu de démonstration.

### Tests

38 tests : moteur de scoring (déterminisme, bornes, explicabilité), sécurité de
l'API (isolation, idempotence, validation, garde-fous IA), intégrité
référentielle du jeu de démonstration.

---

## 3. Ce qui reste — par phase

### Phase 1 — Identité et persistance — **livrée** ✅

- ✅ Authentification JWT (accès 15 min, rafraîchissement rotatif de 30 jours),
  scrypt, verrouillage après 5 échecs, limiteur dédié à la connexion.
- ✅ RBAC sur les 6 rôles, matrice centralisée en un seul fichier.
- ✅ Le tenant provient du jeton signé ; `X-Organization-Id` n'a plus d'effet
  (un test le vérifie explicitement).
- ✅ Chaque transaction pose `SET LOCAL app.current_organization_id`, et
  l'application se connecte avec `fleetguard_app` (`NOBYPASSRLS`).
- ✅ Contrôle au démarrage : le service refuse de démarrer en production si sa
  connexion contourne le RLS.
- ✅ Repositories sur Prisma, avec repli sur le jeu de démonstration hors
  production.
- ✅ Écran de connexion, renouvellement silencieux, états de chargement.
- ✅ Journal d'audit sur la consultation des dossiers nominatifs.
- ✅ Déploiement autonome : le conteneur applique extensions, migrations,
  politiques RLS et peuplement à son démarrage.
- ✅ 15 écrans branchés sur l'API : le cloisonnement est **visible à l'écran**,
  vérifié en production par un contrôle qui connecte deux clients et compare
  les flottes affichées.
- ✅ Saisie de la flotte : création, modification et archivage des véhicules et
  chauffeurs, plafond de formule vérifié côté serveur, écritures journalisées.
- ⏳ **Reste** : modules hors cahier des charges (primes, fatigue, itinéraires)
  encore alimentés par le jeu de démonstration.

**Vérifié sur base réelle et en production** : TransAfrik voit 6 véhicules,
Sahel Express 1 ; un identifiant de chauffeur connu d'un tenant reste
inaccessible à l'autre ; un technicien maintenance est refusé sur la liste des
chauffeurs. 11 tests d'isolation tournent en intégration continue contre une
base PostGIS.

### Phase 2 — Télémétrie réelle — **partiellement livrée**

- ✅ Points GPS persistés, géométrie PostGIS alimentée par trigger.
- ✅ Idempotence par contrainte d'unicité en base : un rejeu après
  redéploiement, ou vers une autre instance, ne recompte plus les infractions.
- ✅ Détection serveur des événements : excès regroupés en épisodes, tolérance
  et durée minimale, limites de zone via `ST_Contains`, freinages issus de
  l'accéléromètre, conduite nocturne comptée une fois par période.
- ✅ Score calculé sur la distance réelle (PostGIS) et historisé avec la
  version de configuration qui l'a produit. `basedOnRealTelemetry` signale un
  score sans valeur probante.
- ✅ Odomètre et kilométrage chauffeur incrémentés du trajet réel.
- ⏳ **Reste** : reconstruction des trajets (début, fin, arrêts), table
  `Alert` avec acquittement traçable, partitionnement effectif de
  `gps_points`, file BullMQ, WebSocket temps réel, alertes SMS.

**Critère de sortie atteint en partie** : une infraction réelle fait
effectivement varier un score réel — vérifié en production. La reconstruction
de trajet reste à faire.

### Phase 3 — Terrain et réseau dégradé (4 semaines, en parallèle)

- Service worker et application installable — sans quoi la file hors ligne reste
  décorative.
- Fournisseur de tuiles sous licence commerciale.
- Boîtiers Teltonika (protocole Codec8) ; application Kotlin (Room +
  WorkManager) ensuite.

### Phase 4 — IA maîtrisée (2 semaines)

- Quota par organisation, cache des analyses, plafond de dépense.
- Traçabilité « analyse générée le … par le modèle … » sur chaque rapport.

### Phase 5 — Durcissement et pilote (3 semaines)

- Secrets en coffre-fort, jamais dans un fichier.
- **Restauration de sauvegarde testée en conditions réelles** — une sauvegarde
  non restaurée n'existe pas.
- Test de charge à trois fois la charge cible, Sentry, tableaux de bord, runbook.
- Pilote : 1 client, 10 véhicules, 3 semaines, avant toute ouverture commerciale.

---

## 4. Conformité — à traiter en Phase 1

La géolocalisation continue d'un chauffeur est une donnée personnelle dans
toutes les juridictions cibles : APDP (Bénin), ARTCI (Côte d'Ivoire), CDP
(Sénégal), NDPR (Nigeria), DPA 2019 (Kenya).

Avant le premier client :

- Déclaration auprès de l'autorité du pays d'exploitation.
- Consentement écrit du chauffeur, avec finalité explicite (sécurité, pas
  surveillance disciplinaire arbitraire).
- Politique de rétention appliquée techniquement — le partitionnement mensuel
  rend la purge réellement exécutable.
- Clause de sous-traitance dans les conditions B2B.

**Primes en monnaie électronique** : Orange Money, MTN MoMo et Wave relèvent de
la réglementation BCEAO et supposent un agrégateur agréé (CinetPay, PayDunya,
Wave Business) sous contrat. Tant que ce partenariat n'est pas signé, le MVP
s'en tient aux **bons carburant** : même valeur perçue par le chauffeur, aucune
friction réglementaire.

---

## 5. Hébergement

**Recommandation : Scaleway ou OVH, région Paris, derrière Cloudflare.**

- Latence : depuis Abidjan ou Cotonou, Paris est à ~50 ms via les câbles
  ACE/2Africa, contre ~180 ms pour une région sud-africaine.
- Facturation en euros, alors que le XOF est arrimé à l'euro à parité fixe
  (655,957) : aucune exposition au risque de change, contrairement à une facture
  libellée en dollars.

| Poste                       | Pilote                       | 500 véhicules                |
| --------------------------- | ---------------------------- | ---------------------------- |
| PostgreSQL managé + PostGIS | 60 €/m                       | 250 €/m                      |
| Compute API + workers       | 40 €/m                       | 180 €/m                      |
| Redis, stockage objet, CDN  | 25 €/m                       | 80 €/m                       |
| Tuiles cartographiques      | 0                            | 100 €/m                      |
| IA + SMS                    | 30 €/m                       | 200 €/m                      |
| **Total**                   | **~155 €/m** (≈ 102 000 XOF) | **~810 €/m** (≈ 531 000 XOF) |

Ajouter ~35 €/véhicule de boîtier GPS en investissement, amortissable sur
l'abonnement.

---

## 6. Dette technique suivie

| Sujet                             | Volume | Décision                                                                                           |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Avertissements ESLint             | 85     | Plafonnés à leur niveau actuel ; le plafond baisse à chaque résorption, il ne remonte jamais       |
| `react-hooks/static-components`   | 5      | Composants recréés au rendu dans le tableau de bord carburant — refonte ciblée                     |
| `react-hooks/set-state-in-effect` | 3      | Chargements initiaux à réécrire lors de la migration vers le client API                            |
| `react-hooks/purity`              | 1      | `Date.now()` pendant le rendu du modal d'impression                                                |
| `any` explicites                  | ~59    | À typer au fil de la bascule Prisma                                                                |
| Distance de scoring               | 1      | Constante `850 km` héritée du jeu de démonstration — à remplacer par la distance réelle en Phase 2 |

---

## 7. Décision de mise en service

Ne pas ouvrir à un client tant que les points suivants ne sont pas tous vrais :

- [x] Authentification et RBAC en place, tenant issu du jeton signé
- [x] Application connectée avec le rôle `fleetguard_app`, `999_verify_rls.sql` au vert
- [ ] Données télémétriques persistées ; plus aucune réponse `persisted: false`
- [ ] Restauration de sauvegarde testée de bout en bout
- [ ] Secrets en coffre-fort, `AI_DEMO_MODE=false`
- [ ] Journal d'audit alimenté et consultable
- [ ] Formalités de protection des données accomplies dans le pays d'exploitation
- [ ] Fournisseur de tuiles sous licence commerciale
- [ ] Test de charge à 3× la charge cible
- [ ] Pilote de 3 semaines terminé, incidents traités
