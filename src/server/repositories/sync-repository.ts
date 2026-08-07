import { createHash } from 'node:crypto';
import type { $Enums } from '../../generated/prisma/client.js';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';

type Currency = $Enums.CurrencyCode;

/**
 * Application des saisies faites hors ligne.
 *
 * Un chauffeur qui note un plein à Malanville, sans réseau, doit retrouver sa
 * saisie au bureau. Tant que rien n'était écrit, la file locale était acquittée
 * et l'écran annonçait « transmise au serveur central » : le geste était perdu
 * et personne ne s'en apercevait.
 *
 * Deux exigences gouvernent ce module :
 *
 *   - **Ne jamais acquitter ce qui n'a pas été écrit.** Un élément refusé
 *     revient marqué en échec, avec son motif, et reste dans la file du
 *     terrain.
 *   - **Un rejeu ne doit pas dupliquer.** Le réseau tombe au mauvais moment,
 *     l'appareil renvoie le lot ; l'identifiant produit hors ligne sert de clé
 *     et le second passage ne fait rien.
 */

/**
 * UUID déterministe dérivé de l'identifiant produit hors ligne.
 *
 * C'est lui qui rend le rejeu inoffensif : le réseau tombe au mauvais moment,
 * l'appareil renvoie le lot, et la deuxième écriture retombe sur la même ligne
 * au lieu d'en créer une seconde. L'identifiant du terrain n'étant pas un UUID,
 * il est transformé plutôt que stocké dans un champ métier détourné.
 */
function stableId(offlineId: string): string {
  const hash = createHash('sha256').update(`offline:${offlineId}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}

export interface AppliedItem {
  id: string;
  type: string;
  status: 'SUCCESS' | 'FAILED';
  message: string;
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Le terrain désigne un véhicule par sa plaque, pas par un identifiant. */
async function findVehicleByPlate(tx: Tx, immatriculation: string) {
  return tx.vehicle.findFirst({
    where: { immatriculation, deletedAt: null },
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function applyFuelLog(
  tx: Tx,
  organizationId: string,
  currency: Currency,
  itemId: string,
  payload: Record<string, unknown>,
): Promise<AppliedItem> {
  const plate = asString(payload.vehicleRegistration);
  const liters = asNumber(payload.litersAdded);

  if (!plate || liters === undefined) {
    return {
      id: itemId,
      type: 'FUEL_LOG',
      status: 'FAILED',
      message: 'Plaque ou volume manquant.',
    };
  }

  const vehicle = await findVehicleByPlate(tx, plate);
  if (!vehicle) {
    return {
      id: itemId,
      type: 'FUEL_LOG',
      status: 'FAILED',
      message: `Aucun véhicule ${plate} dans cette organisation.`,
    };
  }

  /**
   * Un plein ne peut pas dépasser la contenance du réservoir.
   *
   * C'est le garde-fou contre la faute de frappe la plus courante du terrain —
   * 180 au lieu de 18,0. Accepter ce volume fausserait durablement la
   * consommation calculée, donc la détection de siphonnage et la prime du
   * chauffeur. La saisie revient au terrain avec son motif plutôt que d'être
   * enregistrée puis contestée des semaines plus tard.
   */
  const tankCapacity = Number(vehicle.tankCapacityLiters);
  if (tankCapacity > 0 && liters > tankCapacity) {
    return {
      id: itemId,
      type: 'FUEL_LOG',
      status: 'FAILED',
      message: `Volume de ${liters} L supérieur à la contenance du réservoir de ${plate} (${tankCapacity} L).`,
    };
  }

  const pricePerLiter = asNumber(payload.pricePerLiter) ?? 0;
  const totalCost = asNumber(payload.totalCost) ?? liters * pricePerLiter;
  const id = stableId(itemId);

  const existing = await tx.fuelLog.findFirst({ where: { id } });
  if (existing) {
    return {
      id: itemId,
      type: 'FUEL_LOG',
      status: 'SUCCESS',
      message: 'Plein déjà enregistré — rejeu ignoré.',
    };
  }

  await tx.fuelLog.create({
    data: {
      id,
      organizationId,
      vehicleId: vehicle.id,
      litersAdded: liters,
      pricePerLiter,
      totalCost,
      currency,
      // L'odomètre connu fait foi à défaut de relevé : il vaut mieux une valeur
      // cohérente avec l'historique qu'un zéro qui fausserait la consommation.
      odometerKm: asNumber(payload.odometerKm) ?? vehicle.currentOdometerKm,
      stationName: asString(payload.stationName) ?? 'Station non précisée',
      receiptNumber: asString(payload.receiptNumber) ?? itemId,
      loggedAt: new Date(asString(payload.loggedAt) ?? Date.now()),
    },
  });

  return {
    id: itemId,
    type: 'FUEL_LOG',
    status: 'SUCCESS',
    message: `Plein de ${liters} L enregistré pour ${plate}.`,
  };
}

async function applyOdometerUpdate(
  tx: Tx,
  itemId: string,
  payload: Record<string, unknown>,
): Promise<AppliedItem> {
  const plate = asString(payload.vehicleRegistration);
  const newOdometerKm = asNumber(payload.newOdometerKm);

  if (!plate || newOdometerKm === undefined) {
    return {
      id: itemId,
      type: 'ODOMETER_UPDATE',
      status: 'FAILED',
      message: 'Plaque ou relevé manquant.',
    };
  }

  const vehicle = await findVehicleByPlate(tx, plate);
  if (!vehicle) {
    return {
      id: itemId,
      type: 'ODOMETER_UPDATE',
      status: 'FAILED',
      message: `Aucun véhicule ${plate} dans cette organisation.`,
    };
  }

  // Un odomètre ne recule pas. Un relevé inférieur trahit une faute de frappe
  // ou un lot arrivé dans le désordre après une coupure ; l'appliquer
  // fausserait les échéances d'entretien et le calcul de consommation.
  if (newOdometerKm < vehicle.currentOdometerKm) {
    return {
      id: itemId,
      type: 'ODOMETER_UPDATE',
      status: 'FAILED',
      message: `Relevé (${newOdometerKm} km) inférieur au compteur connu (${vehicle.currentOdometerKm} km).`,
    };
  }

  await tx.vehicle.updateMany({
    where: { id: vehicle.id },
    data: { currentOdometerKm: Math.round(newOdometerKm) },
  });

  return {
    id: itemId,
    type: 'ODOMETER_UPDATE',
    status: 'SUCCESS',
    message: `Compteur de ${plate} porté à ${Math.round(newOdometerKm)} km.`,
  };
}

async function applyMaintenanceRecord(
  tx: Tx,
  organizationId: string,
  currency: Currency,
  itemId: string,
  payload: Record<string, unknown>,
): Promise<AppliedItem> {
  const plate = asString(payload.vehicleRegistration);
  if (!plate) {
    return {
      id: itemId,
      type: 'MAINTENANCE_RECORD',
      status: 'FAILED',
      message: 'Plaque manquante.',
    };
  }

  const vehicle = await findVehicleByPlate(tx, plate);
  if (!vehicle) {
    return {
      id: itemId,
      type: 'MAINTENANCE_RECORD',
      status: 'FAILED',
      message: `Aucun véhicule ${plate} dans cette organisation.`,
    };
  }

  const id = stableId(itemId);
  const existing = await tx.maintenanceLog.findFirst({ where: { id } });
  if (existing) {
    return {
      id: itemId,
      type: 'MAINTENANCE_RECORD',
      status: 'SUCCESS',
      message: 'Intervention déjà enregistrée — rejeu ignoré.',
    };
  }

  await tx.maintenanceLog.create({
    data: {
      id,
      organizationId,
      vehicleId: vehicle.id,
      type: 'PREVENTATIVE',
      status: 'COMPLETED',
      description: asString(payload.type) ?? 'Intervention saisie hors ligne',
      odometerKmAtService: vehicle.currentOdometerKm,
      cost: asNumber(payload.cost) ?? 0,
      currency,
      serviceProvider: asString(payload.garageName) ?? 'Atelier non précisé',
      performedAt: new Date(),
    },
  });

  return {
    id: itemId,
    type: 'MAINTENANCE_RECORD',
    status: 'SUCCESS',
    message: `Intervention enregistrée pour ${plate}.`,
  };
}

export interface OfflineItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Applique un lot de saisies hors ligne.
 *
 * Chaque élément est traité séparément : un plein refusé ne doit pas empêcher
 * l'enregistrement du relevé de compteur qui le suit dans la file.
 */
export async function applyOfflineBatch(
  organizationId: string,
  items: OfflineItem[],
): Promise<AppliedItem[]> {
  if (!isDatabaseEnabled()) {
    return items.map(item => ({
      id: item.id,
      type: item.type,
      status: 'FAILED' as const,
      message: 'Mode démonstration : la saisie serait perdue, elle reste dans la file.',
    }));
  }

  return withTenant(organizationId, async tx => {
    // La devise vient de l'organisation : inscrire des francs CFA sur le plein
    // d'un transporteur nigérian donnerait un coût faux.
    const organization = await tx.organization.findFirst({ where: { id: organizationId } });
    const currency: Currency = organization?.currency ?? 'XOF';

    const results: AppliedItem[] = [];

    for (const item of items) {
      switch (item.type) {
        case 'FUEL_LOG':
          results.push(await applyFuelLog(tx, organizationId, currency, item.id, item.payload));
          break;
        case 'ODOMETER_UPDATE':
          results.push(await applyOdometerUpdate(tx, item.id, item.payload));
          break;
        case 'MAINTENANCE_RECORD':
          results.push(await applyMaintenanceRecord(tx, organizationId, currency, item.id, item.payload));
          break;
        case 'GPS_TELEMETRY':
          // La télémétrie a sa propre route, idempotente et validée point par
          // point. La faire transiter par la file la priverait de ces contrôles.
          results.push({
            id: item.id,
            type: item.type,
            status: 'FAILED',
            message: 'La télémétrie passe par /tracking/telemetry/batch.',
          });
          break;
        default:
          // Dire non plutôt qu'acquitter en silence : l'élément reste dans la
          // file du terrain, où il pourra être repris.
          results.push({
            id: item.id,
            type: item.type,
            status: 'FAILED',
            message: `Type "${item.type}" pas encore pris en charge par le serveur.`,
          });
      }
    }

    return results;
  });
}
