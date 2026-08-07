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
