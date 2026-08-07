/**
 * Peuplement de la base de développement.
 *
 * Reprend le jeu de démonstration de `src/data/mock-data.ts` — celui qui sert
 * déjà aux présentations commerciales — et le convertit en véritables lignes
 * PostgreSQL. Les démonstrations restent donc identiques après la bascule.
 *
 * Idempotent : relançable sans dupliquer. Les identifiants du jeu de
 * démonstration (`org_transafrik_cotonou`…) ne sont pas des UUID ; ils sont
 * transformés en UUID déterministes afin qu'une relance retombe sur les mêmes
 * lignes, et que les liens entre entités restent valides.
 *
 * Usage : npm run db:seed
 */
import { createHash } from 'node:crypto';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MOCK_COMPLIANCE_DOCS,
  MOCK_DIGITAL_BADGES,
  MOCK_DRIVERS,
  MOCK_FUEL_LOGS,
  MOCK_FUEL_STATIONS,
  MOCK_GEOFENCES,
  MOCK_MAINTENANCE_LOGS,
  MOCK_ORGANIZATIONS,
  MOCK_SAFETY_EVENTS,
  MOCK_SCORE_CONFIG,
  MOCK_VEHICLES,
} from '../src/data/mock-data.js';
import type { GpsPoint } from '../src/types/index.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/server/services/password.js';
import { segmentTrips } from '../src/server/services/trip-builder.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL est absent. Lancez `npm run infra:up`, puis copiez .env.example vers .env.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * UUID v5-like déterministe : la même chaîne d'entrée donne toujours le même
 * UUID. C'est ce qui rend le seed rejouable sans casser les relations.
 */
function stableUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    // Version 4 et variant RFC 4122 : l'UUID reste conforme au type PostgreSQL.
    `4${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

const toDate = (value: string) => new Date(value);

/** Le domaine utilise '4G'/'3G'/'2G' ; l'enum SQL n'accepte pas d'initiale numérique. */
/**
 * Trace GPS de démonstration sur le corridor Cotonou — Parakou.
 *
 * Sans positions, l'écran des trajets reste vide et la fonction ne se montre
 * pas. Plutôt que d'écrire des trajets tout faits, on pose une trace
 * plausible et on la laisse traverser le même découpage que les données
 * réelles : ce qui s'affiche est donc bien le produit de l'algorithme, pas une
 * mise en scène.
 *
 * Le parcours comporte une pause de vingt minutes au poste de péage de Bohicon
 * — assez pour être comptée comme arrêt, trop courte pour rompre la mission.
 */
const CORRIDOR = [
  { lat: 6.3703, lng: 2.3912 }, // Cotonou, port autonome
  { lat: 6.6, lng: 2.35 },
  { lat: 6.9, lng: 2.28 },
  { lat: 7.1782, lng: 2.0667 }, // Bohicon
  { lat: 7.6, lng: 2.06 },
  { lat: 8.1, lng: 2.2 },
  { lat: 8.7, lng: 2.35 },
  { lat: 9.3372, lng: 2.6303 }, // Parakou
];

/** Interpole la trace en points espacés d'une minute, vitesse réaliste. */
function buildCorridorTrace(startedAt: Date): GpsPoint[] {
  const points: GpsPoint[] = [];
  let clock = startedAt.getTime();

  for (let leg = 0; leg < CORRIDOR.length - 1; leg++) {
    const from = CORRIDOR[leg]!;
    const to = CORRIDOR[leg + 1]!;

    // Un point par minute à ~75 km/h : l'échantillonnage d'un boîtier réel.
    const legKm = Math.hypot((to.lat - from.lat) * 111, (to.lng - from.lng) * 110);
    const steps = Math.max(2, Math.round((legKm / 75) * 60));

    for (let step = 0; step < steps; step++) {
      const ratio = step / steps;
      // Vitesse variable : la pointe reste sous la limite de 90 km/h.
      const speedKmH = 68 + ((leg * 7 + step * 13) % 20);

      points.push({
        latitude: from.lat + (to.lat - from.lat) * ratio,
        longitude: from.lng + (to.lng - from.lng) * ratio,
        speedKmH,
        headingDegree: 20,
        timestamp: new Date(clock).toISOString(),
        accuracyMeters: 6,
        ignitionOn: true,
        batteryLevelPct: 95,
        networkType: legKm > 60 ? '2G' : '3G',
      });
      clock += 60_000;
    }

    // Arrêt au péage de Bohicon.
    if (leg === 2) {
      for (let minute = 0; minute < 20; minute += 5) {
        points.push({
          latitude: to.lat,
          longitude: to.lng,
          speedKmH: 0,
          headingDegree: 20,
          timestamp: new Date(clock).toISOString(),
          accuracyMeters: 6,
          ignitionOn: true,
          batteryLevelPct: 95,
          networkType: '3G',
        });
        clock += 5 * 60_000;
      }
    }
  }

  return points;
}

const NETWORK_MAP = { '4G': 'FOURG', '3G': 'THREEG', '2G': 'TWOG', NONE: 'NONE' } as const;

async function main() {
  console.log('Peuplement de la base de démonstration…\n');

  // --- Organisations -------------------------------------------------------
  for (const org of MOCK_ORGANIZATIONS) {
    const id = stableUuid(org.id);
    await prisma.organization.upsert({
      where: { id },
      update: { name: org.name, country: org.country, maxVehicles: org.maxVehicles },
      create: {
        id,
        name: org.name,
        code: org.code,
        country: org.country,
        currency: org.currency,
        timezone: org.timezone,
        maxVehicles: org.maxVehicles,
        contactEmail: org.contactEmail,
        contactPhone: org.contactPhone,
        createdAt: toDate(org.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_ORGANIZATIONS.length} organisations`);

  // --- Configuration de scoring -------------------------------------------
  // Une configuration active par organisation : sans elle, aucun score ne peut
  // être calculé ni justifié.
  for (const org of MOCK_ORGANIZATIONS) {
    const orgId = stableUuid(org.id);
    const configId = stableUuid(`${org.id}:score-config:1`);
    await prisma.driverScoreConfig.upsert({
      where: { id: configId },
      update: {},
      create: {
        id: configId,
        organizationId: orgId,
        version: 1,
        overspeedWeight: MOCK_SCORE_CONFIG.weights.overspeedWeight,
        harshBrakingWeight: MOCK_SCORE_CONFIG.weights.harshBrakingWeight,
        rapidAccelWeight: MOCK_SCORE_CONFIG.weights.rapidAccelWeight,
        fatigueNightWeight: MOCK_SCORE_CONFIG.weights.fatigueNightWeight,
        geofenceBreachWeight: MOCK_SCORE_CONFIG.weights.geofenceBreachWeight,
        normalizationDistanceKm: MOCK_SCORE_CONFIG.normalizationDistanceKm,
        isActive: true,
      },
    });
  }
  console.log(`  ${MOCK_ORGANIZATIONS.length} configurations de scoring`);

  // --- Véhicules -----------------------------------------------------------
  for (const vehicle of MOCK_VEHICLES) {
    const id = stableUuid(vehicle.id);
    await prisma.vehicle.upsert({
      where: { id },
      update: { currentOdometerKm: vehicle.currentOdometerKm, status: vehicle.status },
      create: {
        id,
        organizationId: stableUuid(vehicle.organizationId),
        immatriculation: vehicle.immatriculation,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        type: vehicle.type,
        fuelType: vehicle.fuelType,
        tankCapacityLiters: vehicle.tankCapacityLiters,
        expectedConsumptionL100km: vehicle.expectedConsumptionL100km,
        currentOdometerKm: vehicle.currentOdometerKm,
        status: vehicle.status,
        speedGovernorId: vehicle.speedGovernorId,
        gpsTrackerImei: vehicle.gpsTrackerImei,
        lastServiceDate: vehicle.lastServiceDate ? toDate(vehicle.lastServiceDate) : null,
        nextServiceKm: vehicle.nextServiceKm,
        createdAt: toDate(vehicle.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_VEHICLES.length} véhicules`);

  // --- Chauffeurs ----------------------------------------------------------
  for (const driver of MOCK_DRIVERS) {
    const id = stableUuid(driver.id);
    await prisma.driver.upsert({
      where: { id },
      update: { currentSafetyScore: driver.currentSafetyScore, status: driver.status },
      create: {
        id,
        organizationId: stableUuid(driver.organizationId),
        fullName: driver.fullName,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        licenseCategory: driver.licenseCategory,
        licenseExpiryDate: toDate(driver.licenseExpiryDate),
        assignedVehicleId: driver.assignedVehicleId ? stableUuid(driver.assignedVehicleId) : null,
        currentSafetyScore: driver.currentSafetyScore,
        totalKmDriven: driver.totalKmDriven,
        status: driver.status,
        createdAt: toDate(driver.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_DRIVERS.length} chauffeurs`);

  // --- Geofences -----------------------------------------------------------
  // La géométrie PostGIS est dérivée par trigger (voir 002_postgis_and_partitions.sql).
  for (const fence of MOCK_GEOFENCES) {
    const id = stableUuid(fence.id);
    await prisma.geofence.upsert({
      where: { id },
      update: { isActive: fence.isActive ?? true },
      create: {
        id,
        organizationId: stableUuid(fence.organizationId),
        name: fence.name,
        type: fence.type,
        centerLat: fence.centerLat,
        centerLng: fence.centerLng,
        radiusMeters: fence.radiusMeters,
        speedLimitKmH: fence.speedLimitKmH,
        maxDwellTimeMinutes: fence.maxDwellTimeMinutes,
        notifyOnEntry: fence.notifyOnEntry ?? false,
        notifyOnExit: fence.notifyOnExit ?? false,
        notifyOnSpeeding: fence.notifyOnSpeeding ?? false,
        notifyOnProlongedStay: fence.notifyOnProlongedStay ?? false,
        notificationChannels: fence.notificationChannels ?? [],
        assignedVehicleIds: (fence.assignedVehicleIds ?? []).map(stableUuid),
        severity: fence.severity ?? 'MEDIUM',
        isActive: fence.isActive ?? true,
        createdAt: toDate(fence.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_GEOFENCES.length} geofences`);

  // --- Événements de sécurité ---------------------------------------------
  for (const event of MOCK_SAFETY_EVENTS) {
    const id = stableUuid(event.id);
    await prisma.safetyEvent.upsert({
      where: { id },
      update: {},
      create: {
        id,
        organizationId: stableUuid(event.organizationId),
        vehicleId: stableUuid(event.vehicleId),
        driverId: stableUuid(event.driverId),
        eventType: event.eventType,
        severity: event.severity,
        recordedAt: toDate(event.recordedAt),
        latitude: event.latitude,
        longitude: event.longitude,
        speedKmH: event.speedKmH,
        speedLimitKmH: event.speedLimitKmH,
        durationSeconds: event.durationSeconds,
        description: event.description,
        penaltyPointsDeducted: event.penaltyPointsDeducted,
      },
    });
  }
  console.log(`  ${MOCK_SAFETY_EVENTS.length} événements de sécurité`);

  // --- Maintenance ---------------------------------------------------------
  for (const log of MOCK_MAINTENANCE_LOGS) {
    const id = stableUuid(log.id);
    await prisma.maintenanceLog.upsert({
      where: { id },
      update: { status: log.status },
      create: {
        id,
        organizationId: stableUuid(log.organizationId),
        vehicleId: stableUuid(log.vehicleId),
        type: log.type,
        description: log.description,
        odometerKmAtService: log.odometerKmAtService,
        cost: log.cost,
        currency: log.currency,
        serviceProvider: log.serviceProvider,
        technicianName: log.technicianName,
        technicianNotes: log.technicianNotes,
        performedAt: toDate(log.performedAt),
        nextServiceKmDue: log.nextServiceKmDue,
        status: log.status,
        partsReplaced: log.partsReplaced ?? undefined,
      },
    });
  }
  console.log(`  ${MOCK_MAINTENANCE_LOGS.length} interventions de maintenance`);

  // --- Carburant -----------------------------------------------------------
  for (const log of MOCK_FUEL_LOGS) {
    const id = stableUuid(log.id);
    await prisma.fuelLog.upsert({
      where: { id },
      update: { suspectedFuelTheft: log.suspectedFuelTheft },
      create: {
        id,
        organizationId: stableUuid(log.organizationId),
        vehicleId: stableUuid(log.vehicleId),
        driverId: log.driverId ? stableUuid(log.driverId) : null,
        litersAdded: log.litersAdded,
        totalCost: log.totalCost,
        pricePerLiter: log.pricePerLiter,
        currency: log.currency,
        odometerKm: log.odometerKm,
        stationName: log.stationName,
        receiptNumber: log.receiptNumber,
        calculatedL100km: log.calculatedL100km,
        suspectedFuelTheft: log.suspectedFuelTheft,
        loggedAt: toDate(log.loggedAt),
      },
    });
  }
  console.log(`  ${MOCK_FUEL_LOGS.length} pleins de carburant`);

  // --- Conformité ----------------------------------------------------------
  for (const doc of MOCK_COMPLIANCE_DOCS) {
    const id = stableUuid(doc.id);
    await prisma.complianceDoc.upsert({
      where: { id },
      update: { status: doc.status },
      create: {
        id,
        organizationId: stableUuid(doc.organizationId),
        vehicleId: doc.vehicleId ? stableUuid(doc.vehicleId) : null,
        driverId: doc.driverId ? stableUuid(doc.driverId) : null,
        title: doc.title,
        docType: doc.docType,
        docNumber: doc.docNumber,
        issuedDate: toDate(doc.issuedDate),
        expiryDate: toDate(doc.expiryDate),
        status: doc.status,
        fileUrl: doc.fileUrl,
      },
    });
  }
  console.log(`  ${MOCK_COMPLIANCE_DOCS.length} documents de conformité`);

  // --- Comptes utilisateurs ------------------------------------------------
  // Un compte par rôle sur l'organisation principale, plus un compte sur une
  // seconde organisation : c'est ce second compte qui permet de vérifier
  // l'isolation multi-tenant sur des données réelles.
  //
  // Le mot de passe de démonstration est volontairement lisible ici : ces
  // comptes n'existent que dans un environnement de développement. La
  // configuration refuse de démarrer en production sans base ni secret JWT.
  const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const accounts = [
    {
      email: 'admin@transafrik.bj',
      fullName: 'Aïcha Sanogo',
      role: 'ORGANIZATION_ADMIN' as const,
      org: 'org_transafrik_cotonou',
      phone: '+229 97 00 11 22',
    },
    {
      email: 'manager@transafrik.bj',
      fullName: 'Djibril Bakayoko',
      role: 'FLEET_MANAGER' as const,
      org: 'org_transafrik_cotonou',
      phone: '+229 97 00 11 23',
    },
    {
      email: 'securite@transafrik.bj',
      fullName: 'Fatou Kponou',
      role: 'SAFETY_OFFICER' as const,
      org: 'org_transafrik_cotonou',
      phone: '+229 97 00 11 24',
    },
    {
      email: 'atelier@transafrik.bj',
      fullName: 'Koffi Mensah',
      role: 'MAINTENANCE_TECH' as const,
      org: 'org_transafrik_cotonou',
      phone: '+229 97 00 11 25',
    },
    {
      // Le compte chauffeur est ce qui rend la console de bord utilisable :
      // c'est lui qui émet la télémétrie depuis le téléphone du conducteur.
      email: 'chauffeur@transafrik.bj',
      fullName: 'Koffi Mensah',
      role: 'DRIVER' as const,
      org: 'org_transafrik_cotonou',
      phone: '+229 97 00 11 26',
      linkToDriver: 'drv_koffi_01',
    },
    {
      email: 'chauffeur@sahelexpress.sn',
      fullName: 'Mamadou Diallo',
      role: 'DRIVER' as const,
      org: 'org_sahel_express',
      phone: '+221 77 00 11 26',
      linkToDriver: 'drv_mamadou_08',
    },
    {
      email: 'manager@sahelexpress.sn',
      fullName: 'Ousmane Ndiaye',
      role: 'FLEET_MANAGER' as const,
      org: 'org_sahel_express',
      phone: '+221 77 123 45 67',
    },
  ];

  for (const account of accounts) {
    const id = stableUuid(`user:${account.email}`);
    await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, role: account.role, isActive: true },
      create: {
        id,
        organizationId: stableUuid(account.org),
        email: account.email,
        fullName: account.fullName,
        phone: account.phone,
        role: account.role,
        passwordHash,
        isActive: true,
      },
    });

    /**
     * Rattachement du compte à la fiche chauffeur.
     *
     * Sans ce lien, la console de bord ne saurait pas pour quel chauffeur ni
     * quel véhicule émettre : les positions arriveraient orphelines, et ni le
     * score ni les trajets ne pourraient leur être attribués.
     */
    const linked = (account as { linkToDriver?: string }).linkToDriver;
    if (linked) {
      await prisma.driver.updateMany({
        where: { id: stableUuid(linked) },
        data: { userId: id },
      });
    }
  }
  console.log(`  ${accounts.length} comptes utilisateurs`);

  // --- Catalogue des distinctions ------------------------------------------
  // Il est commun à toutes les organisations : un « zéro excès sur 30 jours »
  // a le même sens à Cotonou et à Dakar. Les profils de prime, eux, sont
  // calculés à partir des données réelles de chaque flotte.
  for (const badge of MOCK_DIGITAL_BADGES) {
    await prisma.digitalBadge.upsert({
      where: { code: badge.code },
      update: {
        title: badge.title,
        description: badge.description,
        criterion: badge.criterion,
        expBonusPoints: badge.expBonusPoints,
        fuelBonusMultiplier: badge.fuelBonusMultiplier,
      },
      create: {
        id: stableUuid(badge.id),
        code: badge.code,
        title: badge.title,
        description: badge.description,
        category: badge.category,
        rarity: badge.rarity,
        iconName: badge.iconName,
        expBonusPoints: badge.expBonusPoints,
        fuelBonusMultiplier: badge.fuelBonusMultiplier,
        criterion: badge.criterion,
      },
    });
  }
  console.log(`  ${MOCK_DIGITAL_BADGES.length} distinctions au catalogue`);

  // --- Réseau de ravitaillement --------------------------------------------
  // Le réseau appartient à chaque transporteur : ce sont les stations où ses
  // cartes carburant fonctionnent. Le jeu de démonstration attribue le corridor
  // béninois à TransAfrik ; Sahel Express ouvrira le sien, et n'a donc aucune
  // raison de voir celles de son concurrent.
  const stationOrg = stableUuid(MOCK_ORGANIZATIONS[0]!.id);
  for (const station of MOCK_FUEL_STATIONS) {
    await prisma.fuelStation.upsert({
      where: { organizationId_name: { organizationId: stationOrg, name: station.name } },
      update: {
        dieselPrice: station.dieselPrice,
        adbluePrice: station.adbluePrice,
        gasolinePrice: station.gasolinePrice,
        // Le relevé est daté du peuplement : un prix sans date ne permettrait
        // aucune prévision de coût de mission.
        priceObservedAt: new Date(),
      },
      create: {
        id: stableUuid(station.id),
        organizationId: stationOrg,
        name: station.name,
        brand: station.brand,
        address: station.address,
        city: station.city,
        country: station.country,
        latitude: station.latitude,
        longitude: station.longitude,
        is24h: station.is24h,
        hasAdBlue: station.hasAdBlue,
        hasHeavyTruckParking: station.hasHeavyTruckParking,
        hasRestArea: station.hasRestArea,
        hasMechanic: station.hasMechanic,
        dieselPrice: station.dieselPrice,
        adbluePrice: station.adbluePrice,
        gasolinePrice: station.gasolinePrice,
        currency: 'XOF',
        priceObservedAt: new Date(),
        contactPhone: station.contactPhone,
      },
    });
  }
  console.log(`  ${MOCK_FUEL_STATIONS.length} stations conventionnées`);

  // Le chauffeur le mieux noté porte la trace : la démonstration doit montrer
  // le cas nominal du partage de gain, où la conduite économe se traduit
  // réellement en prime. Les autres profils, eux, exposent chacun un motif
  // d'inéligibilité — c'est aussi ce qu'un transporteur doit voir.
  /**
   * Les pleins de démonstration des exécutions précédentes sont retirés.
   *
   * Le peuplement a produit, au fil des versions, des jeux différents : un plein
   * isolé, puis une paire. Sans ce nettoyage, les anciens subsistent entre les
   * nouveaux et faussent la mesure de consommation, qui se fait d'un plein à
   * l'autre — c'est ce qui rendait un chauffeur inéligible en production alors
   * qu'il l'était en local.
   *
   * Seules les lignes que le peuplement a lui-même créées sont visées, par leur
   * numéro de reçu. Les saisies venues du terrain ne sont jamais touchées.
   */
  await prisma.fuelLog.deleteMany({
    where: { OR: [{ receiptNumber: { startsWith: 'BASE-' } }, { receiptNumber: { startsWith: 'DEMO-' } }] },
  });

  const traceDriver = [...MOCK_DRIVERS].sort((a, b) => b.currentSafetyScore - a.currentSafetyScore)[0];
  const traceVehicle = MOCK_VEHICLES.find(v => v.id === traceDriver?.assignedVehicleId);

  // --- Deux pleins cohérents par véhicule -----------------------------------
  /**
   * La consommation se mesure d'un plein à l'autre : chaque véhicule en reçoit
   * donc deux, espacés d'une distance que son réservoir permet réellement de
   * couvrir. Un plein isolé ne permettrait rien, et deux pleins mal espacés
   * produiraient une consommation absurde — c'est exactement ce qui faisait
   * apparaître un semi-remorque à 14 L/100 km.
   *
   * Le volume du second plein est celui effectivement brûlé sur la distance :
   * les chiffres se recalculent à la main, ce qui est la seule façon de les
   * défendre devant un exploitant.
   */
  for (const vehicle of MOCK_VEHICLES) {
    const capacity = Number(vehicle.tankCapacityLiters);
    const consumption = Number(vehicle.expectedConsumptionL100km);
    if (!capacity || !consumption) continue;

    // Le plein appartient au chauffeur affecté : le calcul de prime raisonne
    // par chauffeur, un plein sans conducteur ne compterait pour personne.
    const assigned = MOCK_DRIVERS.find(d => d.assignedVehicleId === vehicle.id);

    // Distance qu'un réservoir aux quatre cinquièmes permet de couvrir.
    const spanKm = Math.round(((capacity * 0.8) / consumption) * 100);

    /**
     * Le meilleur chauffeur conduit économe : c'est le cas nominal du partage
     * de gain, celui qu'une démonstration doit montrer. Les autres restent à la
     * référence, et n'ouvrent donc aucun droit — ce qui est aussi instructif.
     */
    const economical = assigned?.id === traceDriver?.id;
    const actualConsumption = economical ? consumption * 0.82 : consumption;
    const burnt = Math.round((actualConsumption * spanKm) / 100);

    const fills = [
      {
        suffix: 'a',
        odometer: vehicle.currentOdometerKm - spanKm,
        liters: Math.round(capacity * 0.8),
        daysAgo: 12,
      },
      { suffix: 'b', odometer: vehicle.currentOdometerKm, liters: burnt, daysAgo: 2 },
    ];

    for (const [index, fill] of fills.entries()) {
      await prisma.fuelLog.upsert({
        where: { id: stableUuid(`fuel-base-${vehicle.id}-${fill.suffix}`) },
        update: { litersAdded: fill.liters, odometerKm: Math.max(0, fill.odometer) },
        create: {
          id: stableUuid(`fuel-base-${vehicle.id}-${fill.suffix}`),
          organizationId: stableUuid(vehicle.organizationId),
          vehicleId: stableUuid(vehicle.id),
          driverId: assigned ? stableUuid(assigned.id) : null,
          litersAdded: fill.liters,
          pricePerLiter: 700,
          totalCost: fill.liters * 700,
          currency: 'XOF',
          odometerKm: Math.max(0, fill.odometer),
          stationName: 'TotalEnergies Bohicon Carrefour RNIE2',
          receiptNumber: `BASE-${vehicle.immatriculation}-${fill.suffix}`,
          // Seul le second plein porte une consommation : le premier n'a pas
          // de référence antérieure.
          calculatedL100km: index === 1 ? Math.round(actualConsumption * 10) / 10 : null,
          loggedAt: new Date(Date.now() - fill.daysAgo * 86_400_000),
        },
      });
    }
  }
  console.log(`  ${MOCK_VEHICLES.length * 2} pleins de référence`);

  // --- Trace GPS et trajets reconstruits ------------------------------------
  // Deux missions sur les jours précédents, pour que l'historique ne soit pas
  // vide à la première ouverture.

  if (traceVehicle && traceDriver) {
    const vehicleId = stableUuid(traceVehicle.id);
    const driverId = stableUuid(traceDriver.id);
    const organizationId = stableUuid(traceVehicle.organizationId);

    let pointCount = 0;
    let tripCount = 0;

    for (const daysAgo of [1, 3]) {
      const departure = new Date(Date.now() - daysAgo * 86_400_000);
      departure.setUTCHours(6, 0, 0, 0);

      const trace = buildCorridorTrace(departure);
      pointCount += trace.length;

      // Rejouable : on efface la trace de cette journée avant de la réécrire.
      const dayEnd = new Date(departure.getTime() + 86_400_000);
      await prisma.gpsPoint.deleteMany({
        where: { vehicleId, recordedAt: { gte: departure, lt: dayEnd } },
      });

      await prisma.gpsPoint.createMany({
        data: trace.map(point => ({
          organizationId,
          vehicleId,
          driverId,
          recordedAt: new Date(point.timestamp),
          latitude: point.latitude,
          longitude: point.longitude,
          speedKmH: point.speedKmH,
          headingDegree: point.headingDegree,
          accuracyMeters: point.accuracyMeters,
          ignitionOn: point.ignitionOn,
          batteryLevelPct: point.batteryLevelPct,
          networkType: NETWORK_MAP[point.networkType],
          eventFlags: [],
        })),
      });

      // Le découpage est celui de la production : la démonstration montre le
      // comportement réel de l'algorithme, pas des trajets écrits à la main.
      for (const trip of segmentTrips(trace)) {
        await prisma.trip.upsert({
          where: { vehicleId_startedAt: { vehicleId, startedAt: new Date(trip.startedAt) } },
          update: {},
          create: {
            organizationId,
            vehicleId,
            driverId,
            startedAt: new Date(trip.startedAt),
            endedAt: new Date(trip.endedAt),
            distanceKm: trip.distanceKm,
            durationSeconds: trip.durationSeconds,
            stopCount: trip.stopCount,
            stopSeconds: trip.stopSeconds,
            maxSpeedKmH: trip.maxSpeedKmH,
            avgSpeedKmH: trip.avgSpeedKmH,
            startLatitude: trip.startLatitude,
            startLongitude: trip.startLongitude,
            endLatitude: trip.endLatitude,
            endLongitude: trip.endLongitude,
            pointCount: trip.pointCount,
          },
        });
        tripCount++;
      }
    }

    console.log(`  ${pointCount} positions GPS, ${tripCount} trajet(s) reconstruit(s)`);
  }

  // --- Une consigne de demonstration ---------------------------------------
  /**
   * Elle est enregistree sans aucun horodatage de reception, et c'est tout
   * l'interet : l'ecran affichera « En attente de la releve du chauffeur ».
   *
   * La tentation serait de peupler un accusé signé pour que la demonstration
   * paraisse plus vivante. Ce serait reproduire exactement le defaut corrige —
   * un accusé de reception que personne n'a donne. La consigne se confirme
   * depuis la console de bord, avec le compte chauffeur, et pas autrement.
   */
  const instructionRecipient = MOCK_DRIVERS.find(d => d.id === 'drv_koffi_01') ?? MOCK_DRIVERS[0];

  if (instructionRecipient) {
    const recipientId = stableUuid(instructionRecipient.id);
    const existing = await prisma.driverMessage.findFirst({
      where: { driverId: recipientId, senderName: 'Direction d’exploitation' },
    });

    if (!existing) {
      await prisma.driverMessage.create({
        data: {
          organizationId: stableUuid(instructionRecipient.organizationId),
          driverId: recipientId,
          senderName: 'Direction d’exploitation',
          category: 'SAFETY_REMINDER',
          priority: 'URGENT',
          body:
            'Fortes pluies annoncées sur le corridor cette nuit. Allumez les feux, ' +
            'réduisez à 60 km/h et confirmez la prise en compte avant le départ.',
          ackRequired: true,
        },
      });
      console.log('  1 consigne en attente de relève');
    }
  }

  console.log('\nPeuplement terminé.');
  console.log('\nComptes de démonstration :');
  for (const account of accounts) {
    console.log(`  ${account.email.padEnd(30)} ${account.role}`);
  }
  console.log(`  Mot de passe : ${DEMO_PASSWORD}`);
  console.log(`Réseau (référence enum) : ${Object.values(NETWORK_MAP).join(', ')}`);
}

main()
  .catch(err => {
    console.error('Échec du peuplement :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
