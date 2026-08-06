import type {
  ComplianceDoc,
  Driver,
  DriverScoreConfig,
  FuelLog,
  Geofence,
  MaintenanceLog,
  Organization,
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
