import type {
  AlertRecord,
  ComplianceDoc,
  Driver,
  DriverScoreConfig,
  FuelLog,
  FatigueReport,
  FuelStation,
  Geofence,
  LegalDrivingFrameworkConfig,
  MaintenanceLog,
  DigitalBadge,
  GpsPoint,
  Organization,
  RewardProfileRecord,
  Trip,
  Vehicle,
} from '../types';
import { useApiResource } from './useApiResource';

/**
 * Accès aux données de flotte.
 *
 * Chaque écran passe par ces fonctions plutôt que d'importer le jeu de
 * démonstration : c'est ce qui rend l'isolation entre organisations visible à
 * l'écran, et non plus seulement garantie au niveau de l'API.
 *
 * Le serveur borne déjà chaque réponse à l'organisation de la session ; aucun
 * filtre côté client n'est donc nécessaire — ni souhaitable, puisqu'il
 * laisserait croire que la sécurité dépend du navigateur.
 */

export const useOrganization = () => useApiResource<Organization>('/organizations/me');

export const useVehicles = () => useApiResource<Vehicle[]>('/vehicles');

export const useDrivers = () => useApiResource<Driver[]>('/drivers');

export const useMaintenanceLogs = () => useApiResource<MaintenanceLog[]>('/maintenance');

export const useFuelLogs = () => useApiResource<FuelLog[]>('/fuel');

export const useGeofences = () => useApiResource<Geofence[]>('/geofences');

export const useComplianceDocs = () => useApiResource<ComplianceDoc[]>('/compliance');

/** Pondérations en vigueur — nécessaires pour expliquer un score à un chauffeur. */
export const useScoreConfig = () => useApiResource<DriverScoreConfig>('/scoring/config');

/**
 * Trajets reconstruits.
 *
 * Le filtre par véhicule est passé au serveur plutôt qu'appliqué après coup :
 * un parc de cinquante camions produit des milliers de trajets, et les
 * transférer tous pour n'en afficher qu'une poignée coûterait cher sur une
 * liaison de corridor.
 */
export const useTrips = (filters: { vehicleId?: string; limit?: number } = {}) => {
  const query = new URLSearchParams();
  if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
  if (filters.limit) query.set('limit', String(filters.limit));
  const suffix = query.toString();

  return useApiResource<Trip[]>(`/tracking/trips${suffix ? `?${suffix}` : ''}`);
};

/**
 * Alertes opérationnelles.
 *
 * Le serveur les dérive des faits enregistrés à chaque appel ; l'interface ne
 * fabrique rien et n'a rien à recalculer.
 */
export const useAlerts = () => useApiResource<AlertRecord[]>('/alerts');

/**
 * Primes de conduite économe.
 *
 * Le serveur calcule les montants sur les pleins et les distances réellement
 * enregistrés ; l'écran n'estime rien.
 */
export const useRewardProfiles = () => useApiResource<RewardProfileRecord[]>('/rewards/profiles');

export const useRewardBadges = () => useApiResource<DigitalBadge[]>('/rewards/badges');

export const useBonusRules = () =>
  useApiResource<{
    fuelPricePerLiter: number;
    sharedSavingsPercentage: number;
    minSafetyScoreForBonus: number;
    maxMonthlyBonusCap: number;
    baseTierBonus: number;
    bonusPayoutCycle: 'WEEKLY' | 'MONTHLY';
  }>('/rewards/rules');

/**
 * Trace récente d'un véhicule.
 *
 * Les positions viennent du terrain, jamais d'une génération locale : la carte
 * est l'écran sur lequel un régulateur décide d'appeler un chauffeur ou de
 * prévenir un client d'un retard.
 */
export const useVehicleTrack = (vehicleId: string | undefined, limit = 500) =>
  useApiResource<GpsPoint[]>(vehicleId ? `/tracking/vehicles/${vehicleId}/points?limit=${limit}` : null, {
    enabled: Boolean(vehicleId),
  });

/**
 * Réseau de ravitaillement de l'organisation.
 *
 * Ce sont les stations conventionnées, où les cartes carburant de l'entreprise
 * fonctionnent — pas des points d'intérêt génériques.
 */
export const useFuelStations = () => useApiResource<FuelStation[]>('/fuel-stations');

/**
 * Charge de travail et fatigue.
 *
 * Les heures viennent des trajets reconstruits : ce qui a été fait, pas ce qui
 * avait été prévu. C'est la seule des deux mesures qui permette de dire à un
 * exploitant que son chauffeur ne doit pas repartir.
 */
export const useFatigue = (region?: string) =>
  useApiResource<FatigueReport>(`/fatigue${region ? `?region=${region}` : ''}`);

/** Cadres réglementaires applicables — références documentées côté serveur. */
export const useFatigueFrameworks = () =>
  useApiResource<LegalDrivingFrameworkConfig[]>('/fatigue/frameworks');
