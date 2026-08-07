import type { $Enums } from '../../generated/prisma/client.js';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { toNumber } from './mappers.js';

/**
 * Réseau de ravitaillement conventionné.
 *
 * Chaque transporteur négocie ses accords : une carte carburant ne fonctionne
 * que dans son réseau. Proposer à un chauffeur une station hors convention lui
 * imposerait d'avancer l'argent du plein — les stations sont donc rattachées à
 * l'organisation, et cloisonnées comme le reste.
 */

export interface StationRecord {
  id: string;
  name: string;
  brand: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  is24h: boolean;
  hasAdBlue: boolean;
  hasHeavyTruckParking: boolean;
  hasRestArea: boolean;
  hasMechanic: boolean;
  dieselPrice?: number;
  adbluePrice?: number;
  gasolinePrice?: number;
  currency?: string;
  /** Date du relevé : un tarif sans date ne permet aucune prévision de coût. */
  priceObservedAt?: string;
  contactPhone?: string;
}

export async function listStations(organizationId: string): Promise<StationRecord[]> {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const rows = await tx.fuelStation.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      address: row.address,
      city: row.city,
      country: row.country,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      is24h: row.is24h,
      hasAdBlue: row.hasAdBlue,
      hasHeavyTruckParking: row.hasHeavyTruckParking,
      hasRestArea: row.hasRestArea,
      hasMechanic: row.hasMechanic,
      dieselPrice: row.dieselPrice ? toNumber(row.dieselPrice) : undefined,
      adbluePrice: row.adbluePrice ? toNumber(row.adbluePrice) : undefined,
      gasolinePrice: row.gasolinePrice ? toNumber(row.gasolinePrice) : undefined,
      currency: row.currency ?? undefined,
      priceObservedAt: row.priceObservedAt?.toISOString(),
      contactPhone: row.contactPhone ?? undefined,
    }));
  });
}

export class StationNotFound extends Error {}

export interface StationInput {
  name: string;
  brand: $Enums.FuelBrand;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  is24h: boolean;
  hasAdBlue: boolean;
  hasHeavyTruckParking: boolean;
  hasRestArea: boolean;
  hasMechanic: boolean;
  contactPhone?: string;
}

export async function createStation(organizationId: string, input: StationInput): Promise<{ id: string }> {
  return withTenant(organizationId, async tx => {
    const station = await tx.fuelStation.create({
      data: { organizationId, ...input },
      select: { id: true },
    });
    return station;
  });
}

export async function updateStation(
  organizationId: string,
  stationId: string,
  input: Partial<StationInput>,
): Promise<void> {
  await withTenant(organizationId, async tx => {
    // `updateMany` filtré plutôt qu'`update` par identifiant : la clause reste
    // vraie même si le Row-Level Security venait à être contourné.
    const { count } = await tx.fuelStation.updateMany({
      where: { id: stationId, deletedAt: null },
      data: input,
    });
    if (count === 0) throw new StationNotFound();
  });
}

/**
 * Relevé de prix.
 *
 * C'est l'opération courante — bien plus fréquente que la création d'une
 * station. Un exploitant apprend qu'un tarif a bougé et doit le noter en
 * quelques secondes, sans rouvrir toute la fiche.
 *
 * La date du relevé est posée par le serveur. Un prix dont on ignore l'âge ne
 * permet aucune prévision de coût de mission, et une date choisie par
 * l'appelant n'aurait aucune valeur.
 */
export async function updateStationPrices(
  organizationId: string,
  stationId: string,
  prices: { dieselPrice?: number; adbluePrice?: number; gasolinePrice?: number },
  currency: $Enums.CurrencyCode,
): Promise<void> {
  await withTenant(organizationId, async tx => {
    const { count } = await tx.fuelStation.updateMany({
      where: { id: stationId, deletedAt: null },
      data: { ...prices, currency, priceObservedAt: new Date() },
    });
    if (count === 0) throw new StationNotFound();
  });
}

/**
 * Retrait d'une station du réseau.
 *
 * Effacement logique : les pleins déjà enregistrés y font référence, et
 * supprimer la ligne priverait l'historique de carburant de son contexte.
 */
export async function removeStation(organizationId: string, stationId: string): Promise<void> {
  await withTenant(organizationId, async tx => {
    const { count } = await tx.fuelStation.updateMany({
      where: { id: stationId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (count === 0) throw new StationNotFound();
  });
}
